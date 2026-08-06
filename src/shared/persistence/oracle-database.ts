import oracledb, {
  type BindParameters,
  type Connection,
  type ExecuteOptions,
  type Pool,
} from 'oracledb';
import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  DatabaseClient,
  DatabaseHealth,
  DatabasePoolConfig,
  DatabaseRunResult,
  DatabaseSession,
} from './database-client.js';
import {
  ORACLE_JSON_CONSTRAINTS_SQL,
  ORACLE_MIGRATIONS_SQL,
  ORACLE_SCHEMA_SQL,
  splitOracleStatements,
} from './oracle-schema.js';
import { replaceQuestionBinds } from './postgres-database.js';

export type OracleConnectionConfig = {
  connectString: string;
  user: string;
  password: string;
  pool: DatabasePoolConfig;
};

oracledb.fetchAsString = [oracledb.CLOB];

const QUERY_OPTIONS: ExecuteOptions = { outFormat: oracledb.OUT_FORMAT_OBJECT };

export class OracleDatabase implements DatabaseClient {
  public readonly provider = 'oracle' as const;
  private pool: Pool | null = null;
  private initialized = false;
  private readonly transactionStorage = new AsyncLocalStorage<DatabaseSession>();

  public constructor(private readonly config: OracleConnectionConfig) {}

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.pool = await oracledb.createPool({
      connectString: this.config.connectString,
      user: this.config.user,
      password: this.config.password,
      poolMin: this.config.pool.min,
      poolMax: this.config.pool.max,
      poolIncrement: this.config.pool.increment,
      queueTimeout: this.config.pool.queueTimeoutMs,
      connectTimeout: Math.max(1, Math.ceil(this.config.pool.connectionTimeoutMs / 1_000)),
    });
    const connection = await this.pool.getConnection();
    try {
      await connection.execute('SELECT 1 AS "value" FROM DUAL');
      if (process.env.DATABASE_AUTO_SCHEMA === 'true') {
        await this.applyMigrations(connection);
      } else {
        await this.validateSchemaVersion(connection);
      }
      this.initialized = true;
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      if (this.pool) await connection.close();
    }
  }

  public async close(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.initialized = false;
    if (pool) await pool.close(10);
  }

  public async healthCheck(): Promise<DatabaseHealth> {
    try {
      const row = await this.queryOne<{ version: string }>(
        `SELECT version AS "version" FROM product_component_version
         WHERE product LIKE 'Oracle Database%' FETCH FIRST 1 ROWS ONLY`,
      );
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
    return this.withConnection(async (connection) => {
      const result = await connection.execute(transformOracleQuery(sql), toBinds(params), {
        autoCommit: true,
      });
      return { changes: Number(result.rowsAffected ?? 0) };
    });
  }

  public async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const session = this.transactionStorage.getStore();
    if (session) return session.queryOne<T>(sql, params);
    const rows = await this.queryMany<T>(sql, params);
    return rows[0];
  }

  public async queryMany<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const session = this.transactionStorage.getStore();
    if (session) return session.queryMany<T>(sql, params);
    return this.withConnection(async (connection) => {
      const result = await connection.execute<Record<string, unknown>>(
        transformOracleQuery(sql),
        toBinds(params),
        QUERY_OPTIONS,
      );
      return (result.rows ?? []).map((row) => normalizeOracleRow(row) as T);
    });
  }

  public async exec(sql: string): Promise<void> {
    const session = this.transactionStorage.getStore();
    if (session) return session.exec(sql);
    for (const statement of splitOracleStatements(sql)) await this.execute(statement);
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
    const connection = await this.getPool().getConnection();
    try {
      const session = new OracleSession(connection);
      const result = await this.transactionStorage.run(session, () => work(session));
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      await connection.close();
    }
  }

  private getPool(): Pool {
    if (!this.pool) throw new Error('Oracle database is not initialized.');
    return this.pool;
  }

  private async withConnection<T>(work: (connection: Connection) => Promise<T>): Promise<T> {
    const connection = await this.getPool().getConnection();
    try {
      return await work(connection);
    } finally {
      await connection.close();
    }
  }

  private async applyMigrations(connection: Connection): Promise<void> {
    for (const statement of splitOracleStatements(ORACLE_SCHEMA_SQL)) {
      await executeOracleDdl(connection, statement);
    }
    for (const statement of splitOracleStatements(ORACLE_MIGRATIONS_SQL)) {
      await executeOracleDdl(connection, statement);
    }
    for (const statement of splitOracleStatements(ORACLE_JSON_CONSTRAINTS_SQL)) {
      await executeOracleDdl(connection, statement);
    }
    await executeOracleDdl(
      connection,
      `CREATE TABLE schema_migrations (
        version NUMBER(10) PRIMARY KEY,
        name VARCHAR2(255 CHAR) NOT NULL,
        checksum VARCHAR2(255 CHAR) NOT NULL,
        applied_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`,
    );
    await connection.execute(
      `MERGE INTO schema_migrations target
       USING (SELECT 1 version, 'oracle-baseline' name, 'schema-v1' checksum FROM DUAL) source
       ON (target.version = source.version)
       WHEN MATCHED THEN UPDATE SET target.checksum = source.checksum
       WHEN NOT MATCHED THEN INSERT (version, name, checksum)
       VALUES (source.version, source.name, source.checksum)`,
      [],
      { autoCommit: true },
    );
  }

  private async validateSchemaVersion(connection: Connection): Promise<void> {
    try {
      const result = await connection.execute<Record<string, unknown>>(
        `SELECT version AS "version" FROM schema_migrations
         ORDER BY version DESC FETCH FIRST 1 ROWS ONLY`,
        [],
        QUERY_OPTIONS,
      );
      const row = result.rows?.[0];
      if (!row || Number(row.version) !== 1) throw new Error('outdated');
    } catch {
      throw new Error(
        'Database schema is missing or outdated. Run npm run db:migrate before starting Nexus.',
      );
    }
  }
}

class OracleSession implements DatabaseSession {
  public readonly provider = 'oracle' as const;
  public constructor(private readonly connection: Connection) {}

  public async execute(sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
    const result = await this.connection.execute(transformOracleQuery(sql), toBinds(params));
    return { changes: Number(result.rowsAffected ?? 0) };
  }

  public async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.queryMany<T>(sql, params);
    return rows[0];
  }

  public async queryMany<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.connection.execute<Record<string, unknown>>(
      transformOracleQuery(sql),
      toBinds(params),
      QUERY_OPTIONS,
    );
    return (result.rows ?? []).map((row) => normalizeOracleRow(row) as T);
  }

  public async exec(sql: string): Promise<void> {
    for (const statement of splitOracleStatements(sql))
      await this.connection.execute(transformOracleQuery(statement));
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

const toBinds = (params: unknown[]): BindParameters => params.map((value) => value ?? null);

const transformOracleQuery = (sql: string): string => {
  let bindIndex = 1;
  let output = replaceQuestionBinds(sql, () => `:${bindIndex++}`);
  output = transformUpsertToMerge(output);
  output = output.replace(
    /\bLIMIT\s+:([0-9]+)\s+OFFSET\s+:([0-9]+)/gi,
    'OFFSET :$2 ROWS FETCH NEXT :$1 ROWS ONLY',
  );
  output = output.replace(/\bLIMIT\s+:([0-9]+)/gi, 'FETCH FIRST :$1 ROWS ONLY');
  output = output.replace(/\bLIMIT\s+-1\s+OFFSET\s+:([0-9]+)/gi, 'OFFSET :$1 ROWS');
  output = output.replace(/\bWITH\s+RECURSIVE\b/gi, 'WITH');
  output = output.replace(
    /([A-Za-z_][A-Za-z0-9_.]*)\s+IS\s+DISTINCT\s+FROM\s+('[^']*')/gi,
    '($1 <> $2 OR $1 IS NULL)',
  );
  output = output.replace(
    /\(([A-Za-z_][A-Za-z0-9_.]*)::jsonb->'coordinates'->>0\)::float8/gi,
    "JSON_VALUE($1, '$.coordinates[0]' RETURNING NUMBER)",
  );
  output = output.replace(
    /\(([A-Za-z_][A-Za-z0-9_.]*)::jsonb->'coordinates'->>1\)::float8/gi,
    "JSON_VALUE($1, '$.coordinates[1]' RETURNING NUMBER)",
  );
  output = output.replace(
    /jsonb_array_elements\(([A-Za-z_][A-Za-z0-9_.]*)::jsonb->'coordinates'\)\s+AS\s+v/gi,
    "JSON_TABLE($1, '$.coordinates[*]' COLUMNS (lng NUMBER PATH '$[0]', lat NUMBER PATH '$[1]')) v",
  );
  output = output.replace(/\(v->>0\)::float8/gi, 'v.lng');
  output = output.replace(/\(v->>1\)::float8/gi, 'v.lat');
  output = output.replace(
    /jsonb_array_elements\(([A-Za-z_][A-Za-z0-9_.]*)::jsonb\)\s+AS\s+c/gi,
    "JSON_TABLE($1, '$[*]' COLUMNS (name VARCHAR2(255) PATH '$.name', value VARCHAR2(4000) PATH '$.value')) c",
  );
  output = output.replace(/c->>'name'/gi, 'c.name');
  output = output.replace(/c->>'value'/gi, 'c.value');
  output = output.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*[a-z][A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"');
  output = output.replace(/\bCAST\((:[0-9]+)\s+AS\s+text\)/gi, 'CAST($1 AS VARCHAR2(36 CHAR))');
  return output;
};

const transformUpsertToMerge = (sql: string): string => {
  const match = sql.match(
    /^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s+([\s\S]+?)\s*$/i,
  );
  if (!match) return sql;
  const [, table, rawColumns, rawValues, rawKeys, rawUpdates] = match;
  if (!table || !rawColumns || !rawValues || !rawKeys || !rawUpdates) return sql;
  const columns = rawColumns.split(',').map((value) => value.trim());
  const values = rawValues.split(',').map((value) => value.trim());
  const keys = rawKeys.split(',').map((value) => value.trim());
  if (columns.length !== values.length) return sql;
  const projection = columns.map((column, index) => `${values[index]} AS ${column}`).join(', ');
  const on = keys.map((column) => `target.${column} = source.${column}`).join(' AND ');
  const updates = rawUpdates
    .replace(/\bexcluded\.([A-Za-z_][A-Za-z0-9_]*)/gi, 'source.$1')
    .replace(/(^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/g, '$1 target.$2 =');
  return `MERGE INTO ${table} target
    USING (SELECT ${projection} FROM DUAL) source
    ON (${on})
    WHEN MATCHED THEN UPDATE SET ${updates}
    WHEN NOT MATCHED THEN INSERT (${columns.join(', ')})
    VALUES (${columns.map((column) => `source.${column}`).join(', ')})`;
};

const normalizeOracleRow = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key === key.toUpperCase() ? key.toLowerCase() : key,
      normalizeOracleValue(value),
    ]),
  );

const normalizeOracleValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  return value;
};

const executeOracleDdl = async (connection: Connection, sql: string): Promise<void> => {
  try {
    await connection.execute(sql, [], { autoCommit: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ORA-00955|ORA-01430|ORA-02260|ORA-02261|ORA-02264|ORA-02443|ORA-00942/.test(message))
      throw error;
  }
};
