import { randomBytes } from 'node:crypto';
import oracledb, { type Connection } from 'oracledb';
import type { OracleConfig } from '../config/env.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../modules/auth/password.js';
import { OraclePartyRepository } from '../../modules/party/oracle-repository.js';
import { OracleUserRepository } from './oracle-user-repository.js';
import { EnvironmentProfileRepository } from './environment-profile-repository.js';
import { createDatabaseClient } from './database-factory.js';
import type { DatabaseClient } from './database-client.js';
import {
  normalizeOracleObjectPrefix,
  PREFIXABLE_TABLE_NAMES,
  prefixed,
} from './oracle-object-names.js';
import { createCanonicalId } from '../utils/canonical-id.js';
import { buildHref } from '../tmf/href.js';

const ADMIN_EMAIL = 'admin@vtal.com';
const TENANT_ROLE_NAME = 'tenant';
const MIN_PARTIAL_TABLES = 2;

export const orderedTablesForDestruction = (tables: readonly string[]): string[] =>
  [...tables].sort((left, right) => {
    if (left === 'schema_migrations') return 1;
    if (right === 'schema_migrations') return -1;
    return PREFIXABLE_TABLE_NAMES.indexOf(right) - PREFIXABLE_TABLE_NAMES.indexOf(left);
  });

export const discoverOracleEnvironments = (physicalTableNames: readonly string[]): OracleEnvironment[] => {
  const grouped = new Map<string, Set<string>>();
  for (const physicalTableName of physicalTableNames) {
    for (const table of PREFIXABLE_TABLE_NAMES) {
      const prefix = candidatePrefix(physicalTableName, table);
      if (!prefix) continue;
      const tables = grouped.get(prefix) ?? new Set<string>();
      tables.add(table);
      grouped.set(prefix, tables);
    }
  }
  const environments: OracleEnvironment[] = [];
  for (const [prefix, tables] of grouped.entries()) {
    if (!tables.has('schema_migrations') && tables.size < MIN_PARTIAL_TABLES) continue;
    environments.push({
      prefix,
      tableCount: tables.size,
      managedTables: [...tables].sort(
        (left, right) => PREFIXABLE_TABLE_NAMES.indexOf(left) - PREFIXABLE_TABLE_NAMES.indexOf(right),
      ),
      status: tables.size === PREFIXABLE_TABLE_NAMES.length ? 'complete' : 'partial',
    });
  }
  return environments.sort((left, right) => left.prefix.localeCompare(right.prefix));
};

export type OracleEnvironment = {
  prefix: string;
  tableCount: number;
  managedTables: string[];
  status: 'complete' | 'partial';
};

export type CreatedOracleEnvironment = {
  prefix: string;
  tenantId: string;
  tenantName: string;
  adminEmail: string;
  temporaryPassword: string;
};

export type DestroyedOracleEnvironment = {
  prefix: string;
  droppedTables: string[];
  remainingTables: string[];
};


type TableRow = { table_name: string };

const physicalName = (prefix: string, table: string): string => prefixed(table, prefix).toUpperCase();

const tableOfPhysicalName = (name: string, prefix: string): string | undefined => {
  const upperName = name.toUpperCase();
  const upperPrefix = prefix.toUpperCase();
  if (!upperName.startsWith(upperPrefix)) return undefined;
  const table = upperName.slice(upperPrefix.length).toLowerCase();
  return PREFIXABLE_TABLE_NAMES.includes(table) ? table : undefined;
};

const candidatePrefix = (name: string, table: string): string | undefined => {
  const upperName = name.toUpperCase();
  const suffix = table.toUpperCase();
  if (!upperName.endsWith(suffix) || upperName.length === suffix.length) return undefined;
  const prefix = upperName.slice(0, -suffix.length);
  try {
    return normalizeOracleObjectPrefix(prefix);
  } catch {
    return undefined;
  }
};

export const generateTemporaryPassword = (): string => {
  // 24 bytes → 32 base64url chars; acrescenta grupos de caracteres para uma senha portátil e forte.
  const token = randomBytes(24).toString('base64url');
  return `Nx!${token}9a`;
};

export class OracleEnvironmentManager {
  public constructor(private readonly databaseConfig: Omit<OracleConfig, 'objectPrefix'>) {}

  public async discover(): Promise<OracleEnvironment[]> {
    return await this.withConnection(async (connection) => await this.discoverWithConnection(connection));
  }

  public async create(input: { prefix: string; tenantName: string }): Promise<CreatedOracleEnvironment> {
    const prefix = normalizeOracleObjectPrefix(input.prefix);
    const tenantName = input.tenantName.trim();
    if (!tenantName) throw new Error('O nome do Tenant é obrigatório.');

    await this.withConnection(async (connection) => {
      const existing = await this.environmentForPrefix(connection, prefix);
      if (existing) {
        throw new Error(
          `O prefixo ${prefix} já possui ${existing.tableCount} tabela(s) Nexus (${existing.status}).`,
        );
      }
    });

    const config: OracleConfig = { ...this.databaseConfig, provider: 'oracle', objectPrefix: prefix };
    const client = createDatabaseClient(config);
    const temporaryPassword = generateTemporaryPassword();
    const tenantId = createCanonicalId();
    try {
      const priorAutoSchema = process.env.DATABASE_AUTO_SCHEMA;
      process.env.DATABASE_AUTO_SCHEMA = 'true';
      try {
        await client.initialize();
      } finally {
        if (priorAutoSchema === undefined) delete process.env.DATABASE_AUTO_SCHEMA;
        else process.env.DATABASE_AUTO_SCHEMA = priorAutoSchema;
      }
      await this.bootstrapTenant(client, { tenantId, tenantName, temporaryPassword });
      await this.assertCreated(prefix, tenantId, client);
      return { prefix, tenantId, tenantName, adminEmail: ADMIN_EMAIL, temporaryPassword };
    } catch (error) {
      const remaining = await this.discover().catch(() => []);
      const partial = remaining.find((environment) => environment.prefix === prefix);
      const suffix = partial
        ? ` O ambiente pode estar parcial; restaram ${partial.tableCount} tabela(s) Nexus.`
        : '';
      throw new Error(`Não foi possível criar o ambiente ${prefix}.${suffix}`, { cause: error });
    } finally {
      await client.close();
    }
  }

  public async destroy(prefixInput: string): Promise<DestroyedOracleEnvironment> {
    const prefix = normalizeOracleObjectPrefix(prefixInput);
    return await this.withConnection(async (connection) => {
      const environment = await this.environmentForPrefix(connection, prefix);
      if (!environment) throw new Error(`Nenhum ambiente Nexus foi encontrado sob o prefixo ${prefix}.`);

      const physicalTables = orderedTablesForDestruction(environment.managedTables).map((table) => ({
        table,
        name: physicalName(prefix, table),
      }));
      const droppedTables: string[] = [];
      for (const table of physicalTables) {
        await connection.execute(`DROP TABLE ${table.name} CASCADE CONSTRAINTS PURGE`);
        droppedTables.push(table.table);
      }
      const remaining = await this.tablesForPrefix(connection, prefix);
      return { prefix, droppedTables, remainingTables: remaining };
    });
  }

  private async bootstrapTenant(
    db: DatabaseClient,
    input: { tenantId: string; tenantName: string; temporaryPassword: string },
  ): Promise<void> {
    const partyRepository = new OraclePartyRepository(db);
    const userRepository = new OracleUserRepository(db);
    const environmentProfileRepository = new EnvironmentProfileRepository(db);
    const passwordHash = await hashPassword(input.temporaryPassword);
    const now = new Date().toISOString();
    await db.transaction(async () => {
      await partyRepository.upsertParty({
        '@type': 'Organization',
        id: input.tenantId,
        href: buildHref('party', input.tenantId),
        name: input.tenantName,
        partyType: 'Organization',
        status: 'active',
        partyCharacteristic: [],
        tenantId: input.tenantId,
        validFor: { startDateTime: now },
      });
      const partyRoleId = createCanonicalId();
      await partyRepository.upsertPartyRole({
        '@type': 'PartyRole',
        id: partyRoleId,
        href: buildHref('partyRole', partyRoleId),
        name: TENANT_ROLE_NAME,
        status: 'active',
        partyId: input.tenantId,
        party: {
          id: input.tenantId,
          '@referredType': 'Organization',
          href: buildHref('party', input.tenantId),
          name: input.tenantName,
        },
        partyRoleCharacteristic: [],
        tenantId: input.tenantId,
        validFor: { startDateTime: now },
      });
      await userRepository.create({
        externalId: ADMIN_EMAIL,
        name: 'Administrador',
        email: ADMIN_EMAIL,
        status: 'active',
        roles: ['platform.admin'],
        tenantId: input.tenantId,
        passwordHash,
      });
      await environmentProfileRepository.createEmpty(input.tenantId);
    });
  }

  private async assertCreated(prefix: string, tenantId: string, db: DatabaseClient): Promise<void> {
    const environment = await this.discover().then((items) => items.find((item) => item.prefix === prefix));
    if (!environment || environment.managedTables.length !== PREFIXABLE_TABLE_NAMES.length) {
      throw new Error(`O schema criado sob ${prefix} está incompleto.`);
    }
    const user = await new OracleUserRepository(db).getByEmail(ADMIN_EMAIL);
    const party = await new OraclePartyRepository(db).getParty(tenantId);
    const profile = await new EnvironmentProfileRepository(db).get();
    if (
      !user ||
      user.tenantId !== tenantId ||
      !user.roles.includes('platform.admin') ||
      !party ||
      profile.bootstrapMode !== 'empty' ||
      profile.initialTenantId !== tenantId
    ) {
      throw new Error('A validação do Tenant e do administrador inicial falhou.');
    }
  }

  private async discoverWithConnection(connection: Connection): Promise<OracleEnvironment[]> {
    const result = await connection.execute<TableRow>(
      'SELECT table_name AS "table_name" FROM user_tables',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return discoverOracleEnvironments((result.rows ?? []).map((row) => String(row.table_name)));
  }

  private async environmentForPrefix(
    connection: Connection,
    prefix: string,
  ): Promise<OracleEnvironment | undefined> {
    // A criação precisa ser ainda mais conservadora que a lista interativa: mesmo uma única tabela
    // gerenciada é evidência suficiente para impedir que o CLI sobrescreva um namespace interrompido.
    const managedTables = await this.tablesForPrefix(connection, prefix);
    if (managedTables.length === 0) return undefined;
    return {
      prefix,
      tableCount: managedTables.length,
      managedTables: managedTables.sort(
        (left, right) => PREFIXABLE_TABLE_NAMES.indexOf(left) - PREFIXABLE_TABLE_NAMES.indexOf(right),
      ),
      status: managedTables.length === PREFIXABLE_TABLE_NAMES.length ? 'complete' : 'partial',
    };
  }

  private async tablesForPrefix(connection: Connection, prefix: string): Promise<string[]> {
    const result = await connection.execute<TableRow>(
      'SELECT table_name AS "table_name" FROM user_tables',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (result.rows ?? [])
      .map((row) => tableOfPhysicalName(String(row.table_name), prefix))
      .filter((table): table is string => Boolean(table));
  }

  private async withConnection<T>(work: (connection: Connection) => Promise<T>): Promise<T> {
    const connection = await oracledb.getConnection({
      connectString: this.databaseConfig.connectString,
      user: this.databaseConfig.user,
      password: this.databaseConfig.password,
    });
    try {
      return await work(connection);
    } finally {
      await connection.close();
    }
  }
}

export const isTemporaryPasswordStrong = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
