import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isPostgresDatabaseUrl } from '../config/env.js';
import type {
  DatabaseClient,
  DatabaseExecutor,
  DatabaseHealth,
  DatabasePoolConfig,
  DatabaseRunResult,
  DatabaseSession,
} from './database-client.js';
import {
  checksumMigrationBatch,
  findColumnDrift,
  MIGRATION_BATCHES,
  SCHEMA_SQL,
  transformSchemaSql,
} from './schema.js';

types.setTypeParser(20, (value) => Number.parseInt(value, 10));
types.setTypeParser(1700, (value) => Number.parseFloat(value));

const DEFAULT_POOL: DatabasePoolConfig = {
  min: 2,
  max: 10,
  increment: 1,
  queueTimeoutMs: 2_000,
  connectionTimeoutMs: 15_000,
};

// Transient connection failures worth retrying (Neon cold-start drops, resets, DNS/connect timeouts).
// Auth failures, bad credentials and similar permanent errors do not match and are rethrown at once.
export const TRANSIENT_CONNECT_ERROR =
  /Connection terminated|connection timeout|timeout expired|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|ECONNREFUSED|socket hang up/i;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn`, retrying only while it throws an error deemed transient by `isTransient`, waiting
 * `backoffsMs[attempt]` before each retry. Stops (and rethrows the last error) once the backoff list
 * is exhausted; rethrows a non-transient error immediately. `sleepFor` is injectable for tests.
 */
export async function retryOnTransient<T>(
  fn: () => Promise<T>,
  isTransient: (message: string) => boolean,
  backoffsMs: readonly number[],
  sleepFor: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= backoffsMs.length || !isTransient(message)) throw error;
      await sleepFor(backoffsMs[attempt]!);
    }
  }
}

export class PostgresDatabase implements DatabaseClient {
  public readonly provider = 'postgres' as const;
  private static instances = new Map<string, PostgresDatabase>();
  private pool: Pool | null = null;
  private initialized = false;
  private readonly transactionStorage = new AsyncLocalStorage<DatabaseSession>();
  private readonly connectionString: string;
  private readonly schemaName: string | undefined;

  private constructor(
    private readonly dbPath: string,
    private readonly poolConfig: DatabasePoolConfig = DEFAULT_POOL,
  ) {
    if (!isPostgresDatabaseUrl(dbPath)) {
      throw new Error(
        'PostgresDatabase requires a postgres:// or postgresql:// connection string.',
      );
    }
    const parsed = parseConnectionString(dbPath);
    this.connectionString = parsed.connectionString;
    this.schemaName = parsed.schemaName;
  }

  public static getInstance(
    dbPath?: string,
    poolConfig: DatabasePoolConfig = DEFAULT_POOL,
  ): PostgresDatabase {
    if (!dbPath) throw new Error('A postgres:// or postgresql:// connection string is required.');
    const existing = PostgresDatabase.instances.get(dbPath);
    if (existing) return existing;
    const instance = new PostgresDatabase(dbPath, poolConfig);
    PostgresDatabase.instances.set(dbPath, instance);
    return instance;
  }

  public static resetForTesting(): void {
    if (process.env.DATABASE_REUSE_TEST_INSTANCE === 'true') return;
    for (const instance of PostgresDatabase.instances.values()) void instance.close();
    PostgresDatabase.instances.clear();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    const client = await this.connectWithRetry();
    let transactionStarted = false;
    try {
      if (this.schemaName) {
        await client.query('BEGIN');
        transactionStarted = true;
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(this.schemaName)}`);
        await this.setSearchPath(client);
      }
      if (process.env.DATABASE_AUTO_SCHEMA === 'true') {
        await client.query(transformSchemaSql(SCHEMA_SQL));
        await this.applyMigrations(client);
      } else {
        await client.query('SELECT 1');
        await this.validateSchemaVersion(client);
      }
      if (transactionStarted) await client.query('COMMIT');
      this.initialized = true;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the initialization error.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.initialized = false;
    PostgresDatabase.instances.delete(this.dbPath);
    if (pool) await pool.end();
  }

  public async healthCheck(): Promise<DatabaseHealth> {
    try {
      const row = await this.queryOne<{ version: string }>('SELECT version() AS version');
      return {
        provider: this.provider,
        healthy: true,
        ...(row?.version ? { serverVersion: row.version } : {}),
      };
    } catch {
      return { provider: this.provider, healthy: false };
    }
  }

  public async execute(sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
    const session = this.transactionStorage.getStore();
    if (session) return session.execute(sql, params);
    const result = await this.query(sql, params);
    return { changes: Number(result.rowCount ?? 0) };
  }

  public async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const session = this.transactionStorage.getStore();
    if (session) return session.queryOne<T>(sql, params);
    const result = await this.query(sql, params);
    return result.rows[0] as T | undefined;
  }

  public async queryMany<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const session = this.transactionStorage.getStore();
    if (session) return session.queryMany<T>(sql, params);
    const result = await this.query(sql, params);
    return result.rows as T[];
  }

  public async exec(sql: string): Promise<void> {
    const session = this.transactionStorage.getStore();
    if (session) return session.exec(sql);
    const statements = splitSqlStatements(sql);
    for (const statement of statements) await this.query(statement, []);
  }

  public run(sql: string, params?: unknown[]): Promise<DatabaseRunResult> {
    return this.execute(sql, params);
  }

  public get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.queryOne<T>(sql, params);
  }

  public all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.queryMany<T>(sql, params);
  }

  public async transaction<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T> {
    const activeSession = this.transactionStorage.getStore();
    if (activeSession) return await work(activeSession);
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      await this.setSearchPath(client);
      const session = new PostgresSession(client);
      const result = await this.transactionStorage.run(session, () => work(session));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private getPool(): Pool {
    this.pool ??= new Pool({
      connectionString: this.connectionString,
      connectionTimeoutMillis: this.poolConfig.connectionTimeoutMs,
      max: this.poolConfig.max,
      min: this.poolConfig.min,
    });
    return this.pool;
  }

  // Neon auto-suspends idle computes; the first connection after idle is often dropped fast
  // (`Connection terminated unexpectedly`) while the compute wakes. These failures return in
  // ~milliseconds, not after the full connect timeout, so a few short backoff retries let the cold
  // start self-heal without risking the serverless function's time budget. Permanent errors (auth,
  // bad host) are not transient and are rethrown on the first attempt.
  private connectWithRetry(): Promise<PoolClient> {
    const pool = this.getPool();
    return retryOnTransient(
      () => pool.connect(),
      (message) => TRANSIENT_CONNECT_ERROR.test(message),
      [250, 500, 1000, 2000],
    );
  }

  private async query(sql: string, params: unknown[]): Promise<QueryResult<QueryResultRow>> {
    const client = await this.getPool().connect();
    try {
      if (this.schemaName) {
        await client.query('BEGIN');
        await this.setSearchPath(client);
      }
      const result = await client.query(transformPostgresQuery(sql), params);
      if (this.schemaName) await client.query('COMMIT');
      return result as QueryResult<Record<string, unknown>>;
    } catch (error) {
      if (this.schemaName) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original query error.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async setSearchPath(client: PoolClient): Promise<void> {
    if (this.schemaName) {
      await client.query(`SET LOCAL search_path TO ${quoteIdentifier(this.schemaName)}, public`);
    }
  }

  // Applies each MIGRATION_BATCHES entry that isn't already recorded in schema_migrations, in
  // version order, and stamps a row per batch actually applied. Before this, the whole
  // MIGRATIONS_SQL block re-ran on every boot and a single hardcoded version=1 row was always
  // (re)written — see the MIGRATION_BATCHES doc comment in schema.ts (issue #188 §7.0). Batches
  // already applied are skipped entirely, so a future destructive-DDL batch is never at risk of
  // being silently re-created by an additive batch's still-idempotent statements.
  private async applyMigrations(client: PoolClient): Promise<void> {
    const migrationTable = this.schemaName
      ? `${quoteIdentifier(this.schemaName)}.schema_migrations`
      : 'schema_migrations';
    await client.query(`CREATE TABLE IF NOT EXISTS ${migrationTable} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const appliedResult = await client.query<{ version: number }>(
      `SELECT version FROM ${migrationTable}`,
    );
    const applied = new Set(appliedResult.rows.map((row) => Number(row.version)));
    for (const batch of MIGRATION_BATCHES) {
      if (applied.has(batch.version)) continue;
      for (const statement of splitSqlStatements(batch.sql)) {
        try {
          await client.query(transformPostgresQuery(statement));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/already exists|duplicate column|does not exist/i.test(message)) throw error;
        }
      }
      await client.query(
        `INSERT INTO ${migrationTable}(version, name, checksum)
         VALUES ($1, $2, $3)
         ON CONFLICT(version) DO UPDATE SET checksum = EXCLUDED.checksum`,
        [batch.version, `postgres-${batch.name}`, checksumMigrationBatch(batch.sql)],
      );
    }
  }

  private async validateSchemaVersion(client: PoolClient): Promise<void> {
    const migrationTable = this.schemaName
      ? `${quoteIdentifier(this.schemaName)}.schema_migrations`
      : 'schema_migrations';
    const result = await client
      .query(`SELECT version FROM ${migrationTable} ORDER BY version DESC LIMIT 1`)
      .catch(() => undefined);
    const highestBatchVersion = Math.max(...MIGRATION_BATCHES.map((batch) => batch.version));
    const latestApplied = result?.rows[0]?.version;
    if (typeof latestApplied !== 'number' || latestApplied < highestBatchVersion) {
      throw new Error(
        'Database schema is missing or outdated. Run npm run db:migrate before starting Nexus.',
      );
    }
    await this.assertNoColumnDrift(client);
  }

  // The baseline version alone (checked above) does not prove every ADD COLUMN migration landed —
  // see the identical rationale on OracleDatabase.assertNoColumnDrift (issue #166). Kept as a
  // Postgres-side check too so a migration is never assumed complete just because one provider ran
  // it (C10: Oracle and Postgres are both first-class).
  private async assertNoColumnDrift(client: PoolClient): Promise<void> {
    const result = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`,
    );
    const actual = new Map<string, Set<string>>();
    for (const row of result.rows) {
      const columns = actual.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      actual.set(row.table_name, columns);
    }
    const missing = findColumnDrift(actual);
    if (missing.length > 0) {
      throw new Error(
        `Postgres schema desatualizado; colunas declaradas ausentes: ${missing.join(', ')}. Rode npm run db:migrate.`,
      );
    }
  }
}

class PostgresSession implements DatabaseSession {
  public readonly provider = 'postgres' as const;
  public constructor(private readonly client: PoolClient) {}

  public async execute(sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
    const result = await this.client.query(transformPostgresQuery(sql), params);
    return { changes: Number(result.rowCount ?? 0) };
  }

  public async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.client.query(transformPostgresQuery(sql), params);
    return result.rows[0] as T | undefined;
  }

  public async queryMany<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.query(transformPostgresQuery(sql), params);
    return result.rows as T[];
  }

  public async exec(sql: string): Promise<void> {
    for (const statement of splitSqlStatements(sql))
      await this.client.query(transformPostgresQuery(statement));
  }

  public run(sql: string, params?: unknown[]): Promise<DatabaseRunResult> {
    return this.execute(sql, params);
  }
  public get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.queryOne<T>(sql, params);
  }
  public all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.queryMany<T>(sql, params);
  }
}

const transformPostgresQuery = (sql: string): string => {
  let output = sql.replace(
    /json_extract\(([^,]+),\s*'\$\.(.+?)'\)/g,
    (_match, column: string, path: string) =>
      `(${column.trim()}::jsonb->>'${path.replace(/'/g, "''")}')`,
  );
  output = output.replace(/\bLIMIT\s+-1\b/gi, 'LIMIT ALL');
  output = output.replace(
    /\bAS\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi,
    (match, quote: string, identifier: string) =>
      quote || !/[a-z][A-Z]/.test(identifier) ? match : `AS "${identifier}"`,
  );
  let index = 1;
  return replaceQuestionBinds(output, () => `$${index++}`);
};

export const replaceQuestionBinds = (sql: string, replacement: () => string): string => {
  let result = '';
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle) inDouble = !inDouble;
    result += char === '?' && !inSingle && !inDouble ? replacement() : char;
  }
  return result;
};

// Remove comentários de linha (`-- ...`) antes de dividir por `;` — sem isso, um comentário em
// prosa (pt-BR) que contenha um `;` (pontuação normal) parte a instrução SQL no meio do
// comentário, e o texto que sobra depois do `;` (sem o prefixo `--`) vaza como SQL literal na
// próxima instrução, quebrando a migração com "syntax error at or near ...". Não distingue `--`
// dentro de string literal — inofensivo aqui porque o schema não guarda `--` como dado.
const stripSqlLineComments = (sql: string): string =>
  sql
    .split('\n')
    .map((line) => {
      const commentIndex = line.indexOf('--');
      return commentIndex === -1 ? line : line.slice(0, commentIndex);
    })
    .join('\n');

const splitSqlStatements = (sql: string): string[] =>
  stripSqlLineComments(sql)
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

const parseConnectionString = (raw: string): { connectionString: string; schemaName?: string } => {
  const url = new URL(raw);
  const rawSchema = url.searchParams.get('schema') ?? undefined;
  url.searchParams.delete('schema');
  return {
    connectionString: url.toString(),
    ...(rawSchema ? { schemaName: rawSchema.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63) } : {}),
  };
};

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export type { DatabaseExecutor };
