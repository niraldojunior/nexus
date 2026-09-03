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
  ORACLE_MIGRATION_BATCHES,
  ORACLE_SCHEMA_SQL,
  splitOracleStatements,
} from './oracle-schema.js';
import {
  prefixed,
  quoteOracleReservedColumns,
  rewriteDdlObjectNames,
  rewriteTableReferences,
} from './oracle-object-names.js';
import { replaceQuestionBinds } from './postgres-database.js';
import { checksumMigrationBatch, findColumnDrift, MIGRATION_BATCHES } from './schema.js';

export type OracleConnectionConfig = {
  connectString: string;
  user: string;
  password: string;
  pool: DatabasePoolConfig;
  /** Per-environment prefix prepended to every object name (see oracle-object-names.ts). */
  objectPrefix: string;
};

oracledb.fetchAsString = [oracledb.CLOB];

// Default fetchArraySize (100) forces a network round-trip every 100 rows — measured 7.5s→0.6s on
// a 62k-row SELECT just from raising this to 2000. Any result set beyond a handful of rows (tree
// navigation, project site lists, bulk loaders) pays this cost on every unpaginated query.
const QUERY_OPTIONS: ExecuteOptions = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchArraySize: 2000,
  prefetchRows: 2000,
};

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
      ...(this.config.pool.pingIntervalSeconds !== undefined
        ? { poolPingInterval: this.config.pool.pingIntervalSeconds }
        : {}),
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
      const result = await connection.execute(
        transformOracleQuery(sql, this.config.objectPrefix),
        toBinds(params),
        { autoCommit: true },
      );
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
        transformOracleQuery(sql, this.config.objectPrefix),
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
    const activeSession = this.transactionStorage.getStore();
    if (activeSession) return await work(activeSession);
    const connection = await this.getPool().getConnection();
    try {
      const session = new OracleSession(connection, this.config.objectPrefix);
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

  // Mirrors PostgresDatabase.applyMigrations() batch-by-batch — see the MIGRATION_BATCHES doc
  // comment in schema.ts (issue #188 §7.0). ORACLE_SCHEMA_SQL/ORACLE_JSON_CONSTRAINTS_SQL still
  // run unconditionally on every boot (they're pure CREATE-if-missing/constraint-if-missing DDL,
  // idempotent via executeOracleDdl's ORA-* allowlist); only the migration batches gained real
  // per-version tracking, since those are the ones a destructive DDL phase would otherwise undo.
  private async applyMigrations(connection: Connection): Promise<void> {
    const prefix = this.config.objectPrefix;
    const prefixDdl = (sql: string): string =>
      rewriteTableReferences(rewriteDdlObjectNames(sql, prefix), prefix);
    for (const statement of splitOracleStatements(ORACLE_SCHEMA_SQL)) {
      await executeOracleDdl(connection, prefixDdl(statement));
    }
    for (const statement of splitOracleStatements(ORACLE_JSON_CONSTRAINTS_SQL)) {
      await executeOracleDdl(connection, prefixDdl(statement));
    }
    const migrations = prefixed('schema_migrations', prefix);
    await executeOracleDdl(
      connection,
      `CREATE TABLE ${migrations} (
        version NUMBER(10) PRIMARY KEY,
        name VARCHAR2(255 CHAR) NOT NULL,
        checksum VARCHAR2(255 CHAR) NOT NULL,
        applied_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`,
    );
    const appliedResult = await connection.execute<{ version: number }>(
      `SELECT version AS "version" FROM ${migrations}`,
      [],
      QUERY_OPTIONS,
    );
    const applied = new Set((appliedResult.rows ?? []).map((row) => Number(row.version)));
    for (const batch of ORACLE_MIGRATION_BATCHES) {
      if (applied.has(batch.version)) continue;
      for (const statement of splitOracleStatements(batch.sql)) {
        await executeOracleDdl(connection, prefixDdl(statement));
      }
      await connection.execute(
        `MERGE INTO ${migrations} target
         USING (SELECT :1 version, :2 name, :3 checksum FROM DUAL) source
         ON (target.version = source.version)
         WHEN MATCHED THEN UPDATE SET target.checksum = source.checksum
         WHEN NOT MATCHED THEN INSERT (version, name, checksum)
         VALUES (source.version, source.name, source.checksum)`,
        [batch.version, `oracle-${batch.name}`, checksumMigrationBatch(batch.sql)],
        { autoCommit: true },
      );
    }
  }

  private async validateSchemaVersion(connection: Connection): Promise<void> {
    const highestBatchVersion = Math.max(...MIGRATION_BATCHES.map((batch) => batch.version));
    try {
      const result = await connection.execute<Record<string, unknown>>(
        `SELECT version AS "version" FROM ${prefixed('schema_migrations', this.config.objectPrefix)}
         ORDER BY version DESC FETCH FIRST 1 ROWS ONLY`,
        [],
        QUERY_OPTIONS,
      );
      const row = result.rows?.[0];
      if (!row || Number(row.version) < highestBatchVersion) throw new Error('outdated');
    } catch {
      throw new Error(
        'Database schema is missing or outdated. Run npm run db:migrate before starting Nexus.',
      );
    }
    await this.assertNoColumnDrift(connection);
  }

  // The baseline version alone (checked above) does not prove every ADD COLUMN migration landed —
  // DEV/HML/PRD/TEST share one Oracle schema under separate prefixes, and a migration can be applied
  // to Postgres/Neon (or one prefix) without ever reaching another. Diffing `DECLARED_COLUMNS`
  // (schema.ts) against `user_tab_columns` catches that drift at boot instead of a repository query
  // failing with ORA-00904 the first time a caller reaches the missing column (issue #166).
  private async assertNoColumnDrift(connection: Connection): Promise<void> {
    // Unquoted identifiers are uppercase-folded by Oracle, so both the LIKE bind and the
    // startsWith/slice below compare against the uppercased prefix, not `this.config.objectPrefix`
    // verbatim (which may be mixed case, e.g. `NEXUS_DEV_`).
    const prefix = this.config.objectPrefix.toUpperCase();
    const result = await connection.execute<{ table_name: string; column_name: string }>(
      `SELECT table_name AS "table_name", column_name AS "column_name" FROM user_tab_columns
       WHERE table_name LIKE :1`,
      [`${prefix}%`],
      QUERY_OPTIONS,
    );
    const actual = new Map<string, Set<string>>();
    for (const row of result.rows ?? []) {
      const tableName = String(row.table_name);
      if (!tableName.startsWith(prefix)) continue;
      const bareTable = tableName.slice(prefix.length).toLowerCase();
      const columns = actual.get(bareTable) ?? new Set<string>();
      columns.add(String(row.column_name));
      actual.set(bareTable, columns);
    }
    const missing = findColumnDrift(actual);
    if (missing.length > 0) {
      throw new Error(
        `Oracle schema desatualizado sob o prefixo ${prefix}; colunas declaradas ausentes: ` +
          `${missing.join(', ')}. Rode npm run db:migrate.`,
      );
    }
  }
}

class OracleSession implements DatabaseSession {
  public readonly provider = 'oracle' as const;
  public constructor(
    private readonly connection: Connection,
    private readonly objectPrefix: string,
  ) {}

  public async execute(sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
    const result = await this.connection.execute(
      transformOracleQuery(sql, this.objectPrefix),
      toBinds(params),
    );
    return { changes: Number(result.rowsAffected ?? 0) };
  }

  public async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.queryMany<T>(sql, params);
    return rows[0];
  }

  public async queryMany<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.connection.execute<Record<string, unknown>>(
      transformOracleQuery(sql, this.objectPrefix),
      toBinds(params),
      QUERY_OPTIONS,
    );
    return (result.rows ?? []).map((row) => normalizeOracleRow(row) as T);
  }

  public async exec(sql: string): Promise<void> {
    for (const statement of splitOracleStatements(sql))
      await this.connection.execute(transformOracleQuery(statement, this.objectPrefix));
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

// Full ISO date-time (with a time component), e.g. `2026-08-11T10:57:21.573Z`. Date-only strings
// (`2026-08-11`) deliberately do not match — those stay text.
const ISO_DATETIME_BIND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

// The application emits ISO date-time strings (fine for Postgres timestamptz). Oracle cannot convert
// them to TIMESTAMP via the default NLS format (ORA-01843), so bind them as native Date objects,
// which oracledb maps straight to the TIMESTAMP column.
// Oracle's VARCHAR bind cap is ~32k bytes; longer strings (e.g. a big JSON-array bind for an inline
// id list) must bind as CLOB.
const MAX_VARCHAR_BIND_BYTES = 32_000;

const toBindValue = (value: unknown): unknown => {
  if (typeof value === 'string' && ISO_DATETIME_BIND.test(value)) return new Date(value);
  if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > MAX_VARCHAR_BIND_BYTES) {
    return { type: oracledb.DB_TYPE_CLOB, val: value };
  }
  return value ?? null;
};

// Bind por NOME, não por posição. `transformOracleQuery` numera os `?` como :1,:2,… em ordem de
// aparição, mas depois REORDENA e REUSA placeholders (LIMIT :a OFFSET :b → OFFSET :b … FETCH NEXT :a;
// chunking de IN-list repete o mesmo :n em vários grupos). O node-oracledb liga um ARRAY pela ordem
// de aparição dos placeholders, ignorando o número — então, após o reordenamento, OFFSET acabava
// recebendo o valor de LIMIT (e a query voltava vazia). Devolvendo um objeto `{ '1': v0, '2': v1, … }`
// o driver liga cada `:n` ao seu valor 1-based, imune a qualquer reordenamento/reuso.
export const toBinds = (params: unknown[]): BindParameters => {
  const binds: Record<string, unknown> = {};
  params.forEach((value, index) => {
    binds[String(index + 1)] = toBindValue(value);
  });
  return binds as BindParameters;
};

// Oracle caps an IN-list at 1000 expressions (ORA-01795); Postgres has no such limit. Split any
// bound IN-list longer than that into OR-joined groups (NOT IN → AND-joined). The bind array is
// unchanged — the same :n placeholders are just regrouped.
const MAX_IN_LIST = 1000;
const chunkOracleInLists = (sql: string): string =>
  sql.replace(
    /([A-Za-z_][A-Za-z0-9_."]*)\s+(NOT\s+)?IN\s*\(\s*(:[0-9]+(?:\s*,\s*:[0-9]+)*)\s*\)/gi,
    (match, column: string, notKeyword: string | undefined, list: string) => {
      const binds = list.split(',').map((bind) => bind.trim());
      if (binds.length <= MAX_IN_LIST) return match;
      const operator = notKeyword ? 'NOT IN' : 'IN';
      const groups: string[] = [];
      for (let index = 0; index < binds.length; index += MAX_IN_LIST) {
        groups.push(
          `${column} ${operator} (${binds.slice(index, index + MAX_IN_LIST).join(', ')})`,
        );
      }
      return `(${groups.join(notKeyword ? ' AND ' : ' OR ')})`;
    },
  );

export const transformOracleQuery = (sql: string, objectPrefix: string): string => {
  let bindIndex = 1;
  let output = replaceQuestionBinds(sql, () => `:${bindIndex++}`);
  output = chunkOracleInLists(output);
  output = transformUpsertToMerge(output);
  // json_extract survives in a few runtime queries (e.g. the event lookup by entityId). The Postgres
  // worker rewrites it to `->>`; here it becomes JSON_VALUE (default VARCHAR2 return is fine for the
  // equality comparisons that use it).
  output = output.replace(
    /json_extract\(([^,]+),\s*'\$\.(.+?)'\)/gi,
    (_match, column: string, path: string) =>
      `JSON_VALUE(${column.trim()}, '$.${path.replace(/'/g, "''")}')`,
  );
  output = output.replace(
    /\bLIMIT\s+:([0-9]+)\s+OFFSET\s+:([0-9]+)/gi,
    'OFFSET :$2 ROWS FETCH NEXT :$1 ROWS ONLY',
  );
  output = output.replace(/\bLIMIT\s+:([0-9]+)/gi, 'FETCH FIRST :$1 ROWS ONLY');
  output = output.replace(/\bLIMIT\s+-1\s+OFFSET\s+:([0-9]+)/gi, 'OFFSET :$1 ROWS');
  // Literal `LIMIT n` (no OFFSET) — used by scalar subqueries and single-row lookups. `LIMIT -1`
  // never reaches here bare (it is always paired with OFFSET, handled just above).
  output = output.replace(/\bLIMIT\s+([0-9]+)\b/gi, 'FETCH FIRST $1 ROWS ONLY');
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
  // Scalar characteristic lookup (substatus, source system): scans the characteristics JSON array
  // for the element matching a name (+ optional group) and returns its value. NULLIF is a no-op in
  // Oracle (''=NULL) but is kept in the source for Postgres; JSON_TABLE columns avoid the reserved
  // words NAME/VALUE/GROUP by using nm/val/grp.
  output = output.replace(
    /jsonb_array_elements\(NULLIF\(([A-Za-z_][A-Za-z0-9_.]*),\s*''\)::jsonb\)\s+AS\s+ce/gi,
    "JSON_TABLE($1, '$[*]' COLUMNS (nm VARCHAR2(255) PATH '$.name', val VARCHAR2(4000) PATH '$.value', grp VARCHAR2(255) PATH '$.group')) ce",
  );
  output = output.replace(/ce->>'name'/gi, 'ce.nm');
  output = output.replace(/ce->>'value'/gi, 'ce.val');
  output = output.replace(/ce->>'group'/gi, 'ce.grp');
  output = output.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*[a-z][A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"');
  // Oracle rejects AS for a table/derived-table alias (ORA-00933). Dropping AS is legal for column
  // aliases too, so strip it after any closing paren followed by a bare lowercase alias. Quoted
  // (camelCase) aliases from the rule above are untouched, and no `CAST(func() AS type)` exists that
  // could be mis-hit (the only CAST is `CAST(:n AS text)`, handled next).
  output = output.replace(/\)\s+AS\s+([a-z_][a-z0-9_]*)/g, ') $1');
  output = output.replace(/\bCAST\((:[0-9]+)\s+AS\s+text\)/gi, 'CAST($1 AS VARCHAR2(36 CHAR))');
  // The recursive-CTE anchor in tree-service.ts (`SELECT CAST(? AS text), 0`) has no FROM —
  // legal Postgres (implicit one-row source), but Oracle's parser rejects it (ORA-00923). Tried
  // giving it a derived-table FROM instead of DUAL and Oracle's recursive-CTE parser rejected that
  // too (only FROM DUAL parses), so target the literal anchor shape rather than a generic
  // "SELECT with no FROM" detector.
  output = output.replace(
    /(CAST\(:[0-9]+ AS VARCHAR2\(36 CHAR\)\),\s*0)(\s*\n\s*UNION ALL)/i,
    '$1 FROM DUAL$2',
  );
  // Prefix managed table names last, once all structural transforms have run against the bare names.
  output = rewriteTableReferences(output, objectPrefix);
  // Quote Oracle reserved-word columns (e.g. `mode`) so queries agree with the quoted DDL.
  output = quoteOracleReservedColumns(output);
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
    // Swallow "already exists / already indexed / already (non-)nullable" so re-running the schema is
    // idempotent. ORA-01408 = column list already indexed (a UNIQUE constraint already covers it).
    // ORA-40664 = column already has an IS JSON constraint (idempotent re-run of the JSON checks).
    if (
      !/ORA-00955|ORA-01430|ORA-02260|ORA-02261|ORA-02264|ORA-02443|ORA-00942|ORA-01408|ORA-01442|ORA-01451|ORA-40664/.test(
        message,
      )
    )
      throw error;
  }
};
