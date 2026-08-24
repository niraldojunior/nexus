import type { DatabaseClient } from './database-client.js';
import { randomUUID } from 'node:crypto';

// Linha crua de `users`. As consultas usam alias (`external_id AS externalId`),
// entao os nomes ja chegam em camelCase; `email` e a unica coluna anulavel do nucleo,
// mas as colunas de seguranca (roles/status/...) podem ser nulas em linhas antigas.
type UserRow = {
  id: string;
  externalId: string;
  name: string;
  email: string | null;
  status: string | null;
  roles: string | null;
  tenantId: string | null;
  tokenVersion: number | null;
  lastLoginAt: string | null;
  passwordHash?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserStatus = 'active' | 'disabled';

export type UserRecord = {
  id: string;
  externalId: string;
  name: string;
  email?: string;
  status: UserStatus;
  roles: string[];
  tenantId: string;
  tokenVersion: number;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
};

// Igual ao UserRecord, mas carrega o digest da senha. NUNCA sai da camada de
// persistencia/servico de autenticacao — os handlers HTTP devolvem UserRecord.
export type UserCredentials = UserRecord & { passwordHash?: string };

export type NewUserInput = {
  externalId: string;
  name: string;
  email?: string;
  status?: UserStatus;
  roles?: string[];
  tenantId?: string;
  passwordHash?: string;
};

// Campos de seguranca alteraveis apos a criacao. Todos opcionais: o chamador seta so o
// que muda (trocar senha, promover papel, desativar conta, registrar login, revogar).
export type UserSecurityUpdate = {
  passwordHash?: string;
  status?: UserStatus;
  roles?: string[];
  tenantId?: string;
  tokenVersion?: number;
  lastLoginAt?: string;
};

const CORE_COLUMNS =
  'id, external_id AS externalId, name, email, status, roles, tenant_id AS tenantId, ' +
  'token_version AS tokenVersion, last_login_at AS lastLoginAt, ' +
  'created_at AS createdAt, updated_at AS updatedAt';

const parseRoles = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

const toRecord = (row: UserRow): UserRecord => {
  const record: UserRecord = {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    status: row.status === 'disabled' ? 'disabled' : 'active',
    roles: parseRoles(row.roles),
    tenantId: row.tenantId ?? 'default',
    tokenVersion: row.tokenVersion ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  // email e last_login_at sao anulaveis no banco, mas opcionais no dominio: devolver a
  // linha crua vazaria `null` para campos tipados `?: string`.
  if (row.email) record.email = row.email;
  if (row.lastLoginAt) record.lastLoginAt = row.lastLoginAt;
  return record;
};

export class PostgresUserRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: NewUserInput): Promise<UserRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO users
         (id, external_id, name, email, status, roles, tenant_id, token_version,
          password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        id,
        input.externalId,
        input.name,
        input.email || null,
        input.status ?? 'active',
        JSON.stringify(input.roles ?? []),
        input.tenantId ?? 'default',
        input.passwordHash || null,
        now,
        now,
      ],
    );

    const record: UserRecord = {
      id,
      externalId: input.externalId,
      name: input.name,
      status: input.status ?? 'active',
      roles: input.roles ?? [],
      tenantId: input.tenantId ?? 'default',
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (input.email) record.email = input.email;
    return record;
  }

  async getById(id: string): Promise<UserRecord | undefined> {
    const row = await this.db.get<UserRow>(`SELECT ${CORE_COLUMNS} FROM users WHERE id = ?`, [id]);
    return row ? toRecord(row) : undefined;
  }

  async getByExternalId(externalId: string): Promise<UserRecord | undefined> {
    const row = await this.db.get<UserRow>(
      `SELECT ${CORE_COLUMNS} FROM users WHERE external_id = ?`,
      [externalId],
    );
    return row ? toRecord(row) : undefined;
  }

  async getByEmail(email: string): Promise<UserRecord | undefined> {
    const row = await this.db.get<UserRow>(`SELECT ${CORE_COLUMNS} FROM users WHERE email = ?`, [
      email,
    ]);
    return row ? toRecord(row) : undefined;
  }

  // Login: unica leitura que traz o digest da senha. Mantida separada de getByEmail para
  // que o hash nunca escape por engano num handler que so precisa do perfil publico.
  async getCredentialsByEmail(email: string): Promise<UserCredentials | undefined> {
    const row = await this.db.get<UserRow>(
      `SELECT ${CORE_COLUMNS}, password_hash AS passwordHash FROM users WHERE email = ?`,
      [email],
    );
    if (!row) return undefined;
    const credentials: UserCredentials = toRecord(row);
    if (row.passwordHash) credentials.passwordHash = row.passwordHash;
    return credentials;
  }

  async list(): Promise<UserRecord[]> {
    const rows = await this.db.all<UserRow>(
      `SELECT ${CORE_COLUMNS} FROM users ORDER BY created_at DESC`,
    );
    return rows.map(toRecord);
  }

  async update(id: string, input: Partial<NewUserInput>): Promise<UserRecord | undefined> {
    const existing = await this.getById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    await this.db.run(`UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?`, [
      input.name || existing.name,
      input.email || existing.email || null,
      now,
      id,
    ]);

    return await this.getById(id);
  }

  // Escrita transversal de seguranca: so toca as colunas presentes em `update`. O SET e
  // montado dinamicamente (sem COALESCE) para nunca ligar um bind nulo a uma coluna — o
  // adaptador Oracle infere o tipo do bind nulo e colidia com a coluna (ORA-00932). Sem nulos,
  // cada bind carrega o tipo do proprio valor. Incrementar token_version invalida todo JWT
  // ja emitido.
  async updateSecurity(id: string, update: UserSecurityUpdate): Promise<UserRecord | undefined> {
    const existing = await this.getById(id);
    if (!existing) return undefined;

    const assignments: string[] = [];
    const params: unknown[] = [];
    if (update.passwordHash !== undefined) {
      assignments.push('password_hash = ?');
      params.push(update.passwordHash);
    }
    if (update.status !== undefined) {
      assignments.push('status = ?');
      params.push(update.status);
    }
    if (update.roles !== undefined) {
      assignments.push('roles = ?');
      params.push(JSON.stringify(update.roles));
    }
    if (update.tenantId !== undefined) {
      assignments.push('tenant_id = ?');
      params.push(update.tenantId);
    }
    if (update.tokenVersion !== undefined) {
      assignments.push('token_version = ?');
      params.push(update.tokenVersion);
    }
    if (update.lastLoginAt !== undefined) {
      assignments.push('last_login_at = ?');
      params.push(update.lastLoginAt);
    }
    assignments.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.db.run(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, params);

    return await this.getById(id);
  }

  // `searches` e `geo_search_history` referenciam users(id) sem ON DELETE CASCADE — excluir a
  // conta sem limpar essas linhas primeiro derruba a FK e a API responde 500 (era o caso de
  // qualquer usuário que já tivesse feito uma busca). Conta é a única entidade com exclusão
  // física de verdade no produto (C6 cobre inventário, não credenciais de acesso).
  async delete(id: string): Promise<boolean> {
    await this.db.run(`DELETE FROM geo_search_history WHERE user_id = ?`, [id]);
    await this.db.run(`DELETE FROM searches WHERE user_id = ?`, [id]);
    const result = await this.db.run(`DELETE FROM users WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  async count(): Promise<number> {
    const result = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM users`);
    return result?.count || 0;
  }
}
