import { AppError } from '../../shared/errors/app-error.js';
import { RateLimiter } from '../../shared/http/rate-limiter.js';
import type {
  NewUserInput,
  UserCredentials,
  UserRecord,
  UserSecurityUpdate,
  UserStatus,
} from '../../shared/persistence/postgres-user-repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { signAccessToken, type SignedAccessToken } from './jwt.js';

// Estrutura mínima que o AuthService precisa do repositório de usuários. Tanto o
// PostgresUserRepository quanto o OracleUserRepository (que o estende) a satisfazem.
export type AuthUserRepository = {
  getCredentialsByEmail(email: string): Promise<UserCredentials | undefined>;
  getById(id: string): Promise<UserRecord | undefined>;
  getByEmail(email: string): Promise<UserRecord | undefined>;
  getByExternalId(externalId: string): Promise<UserRecord | undefined>;
  create(input: NewUserInput): Promise<UserRecord>;
  updateSecurity(id: string, update: UserSecurityUpdate): Promise<UserRecord | undefined>;
  list(): Promise<UserRecord[]>;
  delete(id: string): Promise<boolean>;
};

export type AuthServiceOptions = {
  /** Segredo HS256; ausente = autenticação não configurada (login responde 503). */
  jwtSecret?: string;
  accessTokenTtlSeconds: number;
};

export type LoginResult = SignedAccessToken & { user: UserRecord };

const GENERIC_LOGIN_ERROR = new AppError('credenciais inválidas', {
  code: 'AUTH_INVALID_CREDENTIALS',
  statusCode: 401,
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const publicUser = (record: UserRecord): UserRecord => {
  // Defesa extra: nunca deixar `passwordHash` escapar mesmo que um chamador passe um
  // UserCredentials adiante.
  const { ...safe } = record as UserRecord & { passwordHash?: string };
  delete (safe as { passwordHash?: string }).passwordHash;
  return safe;
};

export class AuthService {
  // 5 tentativas por 15 min, por e-mail+IP — evita força-bruta num único processo.
  private rateLimiter = new RateLimiter(
    5,
    15 * 60 * 1000,
    'muitas tentativas de login; tente novamente em instantes',
    'AUTH_RATE_LIMITED',
  );
  // Hash descartável usado quando o e-mail não existe, para o custo de verificação (e,
  // portanto, o tempo de resposta) não denunciar se a conta existe ou não.
  private dummyHashPromise: Promise<string> | null = null;

  constructor(
    private users: AuthUserRepository,
    private options: AuthServiceOptions,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.options.jwtSecret);
  }

  private dummyHash(): Promise<string> {
    return (this.dummyHashPromise ??= hashPassword('nexus-invalid-account-placeholder'));
  }

  async login(email: string, password: string, meta: { ip?: string } = {}): Promise<LoginResult> {
    if (!this.options.jwtSecret) {
      throw new AppError('autenticação não configurada (defina AUTH_JWT_SECRET)', {
        code: 'AUTH_NOT_CONFIGURED',
        statusCode: 503,
      });
    }
    const normalized = normalizeEmail(email);
    const rateKey = `${normalized}|${meta.ip ?? 'unknown'}`;
    this.rateLimiter.check(rateKey);

    const credentials = await this.users.getCredentialsByEmail(normalized);
    // Verifica sempre — contra o hash real ou o descartável — para igualar o tempo de
    // resposta entre "conta não existe" e "senha errada".
    const hash = credentials?.passwordHash ?? (await this.dummyHash());
    const passwordOk = await verifyPassword(password, hash);

    if (
      !credentials ||
      credentials.status !== 'active' ||
      !credentials.passwordHash ||
      !passwordOk
    ) {
      this.rateLimiter.record(rateKey);
      throw GENERIC_LOGIN_ERROR;
    }

    this.rateLimiter.clear(rateKey);
    await this.users.updateSecurity(credentials.id, { lastLoginAt: new Date().toISOString() });

    const signed = signAccessToken(
      {
        sub: credentials.externalId,
        tenantId: credentials.tenantId,
        roles: credentials.roles,
        tokenVersion: credentials.tokenVersion,
      },
      this.options.jwtSecret,
      this.options.accessTokenTtlSeconds,
    );
    return { ...signed, user: publicUser(credentials) };
  }

  async createUser(input: {
    email: string;
    name: string;
    password: string;
    roles?: string[];
    tenantId?: string;
    externalId?: string;
  }): Promise<UserRecord> {
    const email = normalizeEmail(input.email);
    if (await this.users.getByEmail(email)) {
      throw new AppError('já existe um usuário com este e-mail', {
        code: 'AUTH_EMAIL_TAKEN',
        statusCode: 409,
      });
    }
    const passwordHash = await hashPassword(input.password);
    return this.users.create({
      // Sem SSO, o e-mail é o identificador estável e único do usuário criado pelo admin.
      externalId: input.externalId ?? email,
      name: input.name,
      email,
      status: 'active',
      roles: input.roles ?? [],
      tenantId: input.tenantId ?? 'default',
      passwordHash,
    });
  }

  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const credentials = await this.credentialsById(userId);
    const ok = credentials.passwordHash
      ? await verifyPassword(currentPassword, credentials.passwordHash)
      : false;
    if (!ok) {
      throw new AppError('senha atual incorreta', {
        code: 'AUTH_INVALID_CREDENTIALS',
        statusCode: 400,
      });
    }
    await this.users.updateSecurity(userId, { passwordHash: await hashPassword(newPassword) });
  }

  // Admin redefine a senha de outro usuário: além de trocar o hash, revoga as sessões dele
  // (bump de token_version) para que a senha antiga vazada não continue valendo.
  async resetPassword(userId: string, newPassword: string): Promise<UserRecord> {
    const current = await this.requireUserById(userId);
    const updated = await this.users.updateSecurity(userId, {
      passwordHash: await hashPassword(newPassword),
      tokenVersion: current.tokenVersion + 1,
    });
    return publicUser(updated ?? current);
  }

  async setRoles(userId: string, roles: string[]): Promise<UserRecord> {
    await this.requireUserById(userId);
    const updated = await this.users.updateSecurity(userId, { roles });
    return publicUser(updated as UserRecord);
  }

  async setStatus(userId: string, status: UserStatus): Promise<UserRecord> {
    const current = await this.requireUserById(userId);
    // Desativar revoga as sessões na hora (o requireUser já barra status !== active, mas o
    // bump garante que nenhum token sobreviva a uma reativação futura).
    const update: UserSecurityUpdate = { status };
    if (status === 'disabled') update.tokenVersion = current.tokenVersion + 1;
    const updated = await this.users.updateSecurity(userId, update);
    return publicUser(updated ?? current);
  }

  // "Sair de todos os dispositivos" / logout: invalida todo JWT emitido para o usuário.
  async revokeSessions(userId: string): Promise<void> {
    const current = await this.requireUserById(userId);
    await this.users.updateSecurity(userId, { tokenVersion: current.tokenVersion + 1 });
  }

  // Semente idempotente do primeiro admin a partir do ambiente. Só define a senha quando a
  // conta ainda não tem uma, para não sobrescrever uma senha trocada a cada reinício.
  async ensureAdmin(email: string, password: string): Promise<UserRecord> {
    const normalized = normalizeEmail(email);
    const existing = await this.users.getCredentialsByEmail(normalized);
    if (!existing) {
      const passwordHash = await hashPassword(password);
      return this.users.create({
        externalId: normalized,
        name: 'Administrador',
        email: normalized,
        status: 'active',
        roles: ['platform.admin'],
        tenantId: 'default',
        passwordHash,
      });
    }
    const update: UserSecurityUpdate = {};
    if (!existing.passwordHash) update.passwordHash = await hashPassword(password);
    if (!existing.roles.includes('platform.admin')) {
      update.roles = [...new Set([...existing.roles, 'platform.admin'])];
    }
    if (existing.status !== 'active') update.status = 'active';
    if (Object.keys(update).length === 0) return publicUser(existing);
    const updated = await this.users.updateSecurity(existing.id, update);
    return publicUser(updated ?? existing);
  }

  private async requireUserById(userId: string): Promise<UserRecord> {
    const user = await this.users.getById(userId);
    if (!user) {
      throw new AppError('usuário não encontrado', { code: 'USER_NOT_FOUND', statusCode: 404 });
    }
    return user;
  }

  private async credentialsById(userId: string): Promise<UserCredentials> {
    const user = await this.requireUserById(userId);
    if (!user.email) {
      throw new AppError('usuário sem e-mail não pode alterar senha', {
        code: 'AUTH_NO_EMAIL',
        statusCode: 400,
      });
    }
    const credentials = await this.users.getCredentialsByEmail(user.email);
    if (!credentials) {
      throw new AppError('usuário não encontrado', { code: 'USER_NOT_FOUND', statusCode: 404 });
    }
    return credentials;
  }
}
