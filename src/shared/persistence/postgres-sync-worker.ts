import { neon, Pool, types } from '@neondatabase/serverless';
import { parentPort, workerData } from 'node:worker_threads';

// Postgres returns int8 (bigint) and numeric as strings by default. The repository layer was
// written against better-sqlite3, which yields JS numbers, so callers do strict numeric
// comparisons (e.g. `count() === 3`). Coerce these types back to numbers to preserve that
// contract. Values here (COUNT(*), tokens, temperatures) are well within Number's safe range.
types.setTypeParser(20, (value) => Number.parseInt(value, 10)); // int8 / bigint
types.setTypeParser(1700, (value) => Number.parseFloat(value)); // numeric

type WorkerInitData = {
  connectionString: string;
  controlBuffer: SharedArrayBuffer;
  dataBuffer: SharedArrayBuffer;
};

// Control buffer layout (Int32Array): [status, payloadByteLength]
const STATUS_INDEX = 0;
const LENGTH_INDEX = 1;
const STATUS_OK = 1;
const STATUS_ERROR = 2;
const STATUS_OVERFLOW = 3;

type WorkerRequest =
  | { id: string; request: { type: 'initialize' } }
  | { id: string; request: { type: 'close' } }
  | { id: string; request: { type: 'exec'; sql: string } }
  | { id: string; request: { type: 'query'; sql: string; params: unknown[]; mode: 'run' | 'get' | 'all'; txId?: string } }
  | { id: string; request: { type: 'begin-transaction'; txId: string } }
  | { id: string; request: { type: 'commit-transaction'; txId: string } }
  | { id: string; request: { type: 'rollback-transaction'; txId: string } };

type WorkerResponse = { id: string; ok: true; data?: unknown } | { id: string; ok: false; error: string };

type TransactionContext = {
  client: any;
};

const initData = workerData as WorkerInitData;
const { connectionString, schemaName } = parseConnectionString(initData.connectionString);
const controlView = new Int32Array(initData.controlBuffer);
const dataView = new Uint8Array(initData.dataBuffer);
const encoder = new TextEncoder();
const connectionTimeoutMs = Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 15_000);
// NOTE: the abort signal must be created per query, not once at module load. A single
// AbortSignal.timeout() shared across every request fires 15s after the worker starts and
// then aborts all subsequent queries permanently ("operation was aborted due to timeout").
const sqlClient = neon<false, true>(connectionString, {
  fullResults: true,
});
let pool: Pool | undefined;
const transactions = new Map<string, TransactionContext>();
let initialized = false;

if (!parentPort) {
  throw new Error('worker parent port not available');
}

parentPort.on('message', (message: WorkerRequest) => {
  void handle(message).catch((error: unknown) => {
    post({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  });
});

const handle = async (message: WorkerRequest): Promise<void> => {
  switch (message.request.type) {
    case 'initialize':
      if (!initialized) {
        // Initialize is idempotent (CREATE ... IF NOT EXISTS), so retry it through transient
        // network blips — Neon HTTP over the corporate proxy occasionally drops the first connect.
        if (schemaName) {
          await withRetry(() => sqlClient.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`));
        }
        if (process.env.DATABASE_AUTO_SCHEMA === 'true') {
          await withRetry(() => initializeSchema());
        } else {
          await withRetry(() => executeQuery('SELECT 1', [], 'get', undefined));
          await withRetry(() => runPendingMigrations());
        }
        initialized = true;
      }
      post({ id: message.id, ok: true });
      return;
    case 'close':
      await pool?.end();
      post({ id: message.id, ok: true });
      return;
    case 'exec':
      await executeStatements(message.request.sql, undefined, undefined);
      post({ id: message.id, ok: true });
      return;
    case 'begin-transaction': {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        await setSearchPath(client);
      } catch (error) {
        // Never leak a checked-out connection stuck mid-transaction: it would hold locks and
        // deadlock the schema teardown in cleanup. Roll back best-effort and return it to the pool.
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore rollback failures during error propagation.
        }
        client.release();
        throw error;
      }
      transactions.set(message.request.txId, { client });
      post({ id: message.id, ok: true });
      return;
    }
    case 'commit-transaction': {
      const context = transactions.get(message.request.txId);
      if (!context) throw new Error('transaction not found');
      try {
        await context.client.query('COMMIT');
      } finally {
        context.client.release();
        transactions.delete(message.request.txId);
      }
      post({ id: message.id, ok: true });
      return;
    }
    case 'rollback-transaction': {
      const context = transactions.get(message.request.txId);
      if (!context) throw new Error('transaction not found');
      try {
        await context.client.query('ROLLBACK');
      } finally {
        context.client.release();
        transactions.delete(message.request.txId);
      }
      post({ id: message.id, ok: true });
      return;
    }
    case 'query': {
      const result = await executeQuery(message.request.sql, message.request.params, message.request.mode, message.request.txId);
      post({ id: message.id, ok: true, data: result });
      return;
    }
    default:
      throw new Error(`unsupported request ${(message.request as { type?: string }).type ?? 'unknown'}`);
  }
};

const isTransientConnectionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|Connection terminated|connection closed|network/i.test(
    message,
  );
};

// Retry idempotent operations through transient network failures (Neon HTTP over the proxy).
const withRetry = async <T>(operation: () => Promise<T>, attempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
};

const initializeSchema = async (): Promise<void> => {
  // Fast path: send the whole (idempotent) schema as a single simple-query batch — one HTTP
  // round-trip instead of ~60. This is what keeps test setup from timing out through the proxy.
  try {
    await runSchemaBatch(`${transformSchemaSql(SCHEMA_SQL)}\n${MIGRATIONS_SQL}`);
    return;
  } catch {
    // Fall back to per-statement execution (tolerating idempotent errors) if the batch fails.
  }

  const statements = [...splitSqlStatements(transformSchemaSql(SCHEMA_SQL)), ...splitSqlStatements(MIGRATIONS_SQL)];

  for (const statement of statements) {
    try {
      await executeQuery(statement, [], 'run', undefined);
    } catch (error) {
      if (!isIgnorableSchemaError(statement, error)) {
        throw error;
      }
    }
  }
};

const runPendingMigrations = async (): Promise<void> => {
  for (const statement of splitSqlStatements(MIGRATIONS_SQL)) {
    try {
      await executeQuery(statement, [], 'run', undefined);
    } catch (error) {
      if (!isIgnorableSchemaError(statement, error)) {
        throw error;
      }
    }
  }
};

const runSchemaBatch = async (sql: string): Promise<void> => {
  if (!schemaName) {
    await sqlClient.query(sql);
    return;
  }
  const client = await getPool().connect();
  try {
    // Same transaction-pooling caveat as executePooledQuery: without pinning the backend the DDL
    // would run with search_path = public and create the tables in the wrong schema.
    await beginSchemaScope(client);
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failures during error propagation.
      }
      throw error;
    }
  } finally {
    client.release();
  }
};

const splitSqlStatements = (sql: string): string[] =>
  sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('--'));

const executeStatements = async (sql: string, params: unknown[] | undefined, txId: string | undefined): Promise<void> => {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('--'));

  for (const statement of statements) {
    await executeQuery(statement, params ?? [], 'run', txId);
  }
};

const executeQuery = async (
  sql: string,
  params: unknown[],
  mode: 'run' | 'get' | 'all',
  txId?: string,
): Promise<unknown> => {
  const client = txId ? transactions.get(txId)?.client : undefined;
  const queryText = transformQuerySql(sql);
  const queryParams = params ?? [];
  const result = client
    ? await client.query(queryText, queryParams)
    : schemaName
      ? await executePooledQuery(queryText, queryParams)
      : await sqlClient.query(queryText, queryParams, {
          fetchOptions: { signal: AbortSignal.timeout(connectionTimeoutMs) },
        });

  if (mode === 'run') {
    return {
      changes: Number(result.rowCount ?? 0),
    };
  }

  if (mode === 'get') {
    return result.rows[0];
  }

  return result.rows;
};

const getPool = (): Pool => {
  pool ??= new Pool({
    connectionString,
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 15_000),
  });
  return pool;
};

const executePooledQuery = async (queryText: string, queryParams: unknown[]) => {
  const client = await getPool().connect();
  try {
    // Neon's connection uses the `-pooler` endpoint (PgBouncer, transaction pooling), which does
    // NOT preserve a session-level `SET search_path` across separate statements — the follow-up
    // query can land on a different backend where search_path is `public`, silently reading/writing
    // the wrong schema. Pin the backend with an explicit transaction and scope search_path with
    // SET LOCAL so it is guaranteed to apply to this query.
    if (!schemaName) {
      return await client.query(queryText, queryParams);
    }
    await beginSchemaScope(client);
    try {
      const result = await client.query(queryText, queryParams);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failures during error propagation.
      }
      throw error;
    }
  } finally {
    client.release();
  }
};

// Opens a transaction (pinning the pooled backend) with search_path scoped to the test schema.
// `BEGIN; SET LOCAL ...` is one round-trip via the simple-query protocol (no parameters).
const beginSchemaScope = async (client: any): Promise<void> => {
  await client.query(`BEGIN; SET LOCAL search_path TO ${quoteIdentifier(schemaName as string)}, public`);
};

const setSearchPath = async (client: any): Promise<void> => {
  if (!schemaName) return;
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
};

const transformSchemaSql = (sql: string): string =>
  sql
    .replace(/\bDATETIME\b/g, 'TIMESTAMPTZ')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    .replace(/CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event\(json_extract\(event_data, '\$\.(.+?)'\)\);/g, (
      _match,
      path: string,
    ) => `CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event (((event_data)::jsonb->>'${path}'));`)
    .replace(/--.*$/gm, '');

const transformQuerySql = (sql: string): string => {
  let output = sql.replace(/json_extract\(([^,]+),\s*'\$\.(.+?)'\)/g, (_match, column: string, path: string) => {
    const escapedPath = path.replace(/'/g, "''");
    return `(${column.trim()}::jsonb->>'${escapedPath}')`;
  });
  output = output.replace(/\bLIMIT\s+-1\b/gi, 'LIMIT ALL');
  output = quoteCamelCaseAliases(output);
  output = replacePositionalParameters(output);
  return output;
};

// SQLite preserves the case of unquoted column aliases; Postgres folds them to lower case, so
// `SELECT user_id AS userId` yields a column named `userid` and repository code that reads
// `row.userId` gets undefined. Quote any camelCase alias to force Postgres to keep its case.
// better-sqlite3 also accepts double-quoted aliases, so this stays compatible with both.
const quoteCamelCaseAliases = (sql: string): string =>
  sql.replace(/\bAS\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi, (match, quote: string, identifier: string) => {
    if (quote) return match; // already quoted
    if (!/[a-z][A-Z]/.test(identifier)) return match; // not camelCase (SQL types, all-lowercase)
    return `AS "${identifier}"`;
  });

const replacePositionalParameters = (sql: string): string => {
  let index = 1;
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += char;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      continue;
    }
    if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      result += `$${index}`;
      index += 1;
      continue;
    }
    result += char;
  }
  return result;
};

const isIgnorableSchemaError = (statement: string, error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    statement.includes('json_extract(event_data') ||
    message.includes('already exists') ||
    message.includes('duplicate key') ||
    message.includes('does not exist')
  );
};

function parseConnectionString(rawConnectionString: string): { connectionString: string; schemaName?: string } {
  const url = new URL(rawConnectionString);
  const rawSchema = url.searchParams.get('schema') ?? undefined;
  url.searchParams.delete('schema');
  return {
    connectionString: url.toString(),
    ...(rawSchema ? { schemaName: sanitizeSchemaName(rawSchema) } : {}),
  };
}

function sanitizeSchemaName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  if (!normalized) throw new Error('schema query parameter cannot be empty');
  return normalized.length > 63 ? normalized.slice(0, 63) : normalized;
}

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const post = (response: WorkerResponse): void => {
  // The main thread is blocked in Atomics.wait, so its event loop is frozen and it
  // cannot receive postMessage responses. Signal completion through the shared buffer
  // instead: write the serialized payload, then flip the status flag and notify.
  const { id: _id, ...rest } = response;
  const bytes = encoder.encode(JSON.stringify(rest));

  if (bytes.byteLength > dataView.byteLength) {
    Atomics.store(controlView, LENGTH_INDEX, bytes.byteLength);
    Atomics.store(controlView, STATUS_INDEX, STATUS_OVERFLOW);
    Atomics.notify(controlView, STATUS_INDEX);
    return;
  }

  dataView.set(bytes, 0);
  Atomics.store(controlView, LENGTH_INDEX, bytes.byteLength);
  Atomics.store(controlView, STATUS_INDEX, rest.ok ? STATUS_OK : STATUS_ERROR);
  Atomics.notify(controlView, STATUS_INDEX);
};

// Column migrations that mirror SqliteDatabase.ensureColumn(...). These columns are added
// after the base schema so that databases created before the columns existed get upgraded.
// Postgres supports ADD COLUMN IF NOT EXISTS natively, so this is idempotent.
const MIGRATIONS_SQL = `
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS place_id TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS place_type TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS administrative_state TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS operational_state TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS usage_state TEXT;
  ALTER TABLE tmf_resource_specification ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS place_id TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS place_type TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS administrative_state TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS operational_state TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS usage_state TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_type TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS start_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS end_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS is_service_enabled INTEGER;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS has_started INTEGER;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS supporting_services TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_relationships TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_type TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS start_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS end_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS is_service_enabled INTEGER;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS has_started INTEGER;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS supporting_resources TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS supporting_services TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_relationships TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS service_characteristic TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS service_qualification_item TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS service_order_item TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS note TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS resource_order_item TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS note TEXT;
`;

const SCHEMA_SQL = `
      -- ========== PLATFORM TABLES (Non-TMF) ==========
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        query TEXT NOT NULL,
        filters TEXT,
        results TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_searches_user_id ON searches(user_id);

      -- ========== MODULE 1: GEOGRAPHIC (TMF673/674/675) ==========
      
      -- TMF675: Geographic Location (geoespacial pura: Point, LineString, Polygon)
      CREATE TABLE IF NOT EXISTS tmf_geographic_location (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        geometry_type TEXT NOT NULL CHECK(geometry_type IN ('Point', 'LineString', 'Polygon')),
        geometry TEXT NOT NULL,
        spatial_ref TEXT DEFAULT 'EPSG:4326',
        accuracy TEXT,
        reference_point TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_location_valid_for ON tmf_geographic_location(valid_for_start, valid_for_end);

      -- TMF673: Geographic Address (endereço postal estruturado)
      CREATE TABLE IF NOT EXISTS tmf_geographic_address (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        street_type TEXT,
        street_name TEXT NOT NULL,
        street_nr TEXT,
        locality TEXT,
        city TEXT,
        state_or_province TEXT,
        country TEXT DEFAULT 'BR',
        postcode TEXT,
        geographic_location_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_location ON tmf_geographic_address(geographic_location_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_city_postcode ON tmf_geographic_address(city, postcode);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_address_street_name ON tmf_geographic_address(street_name);

      -- TMF674: Geographic Site Specification (catálogo de tipos de site)
      CREATE TABLE IF NOT EXISTS tmf_geographic_site_specification (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        allowed_parent_spec_ids TEXT,
        allowed_child_spec_ids TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_specification_name_category ON tmf_geographic_site_specification(name, category);

      -- TMF674: Geographic Site (entidade central: Centro, POP, Sala, Armário, etc.)
      CREATE TABLE IF NOT EXISTS tmf_geographic_site (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        site_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'active', 'suspended', 'terminated')),
        geographic_location_id TEXT,
        geographic_address_id TEXT,
        parent_site_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        related_party TEXT,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_specification_id) REFERENCES tmf_geographic_site_specification(id),
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id),
        FOREIGN KEY (geographic_address_id) REFERENCES tmf_geographic_address(id),
        FOREIGN KEY (parent_site_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_spec ON tmf_geographic_site(site_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_location ON tmf_geographic_site(geographic_location_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_address ON tmf_geographic_site(geographic_address_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_parent ON tmf_geographic_site(parent_site_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_status ON tmf_geographic_site(status);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_name ON tmf_geographic_site(name);

      -- Geographic Site Relationship (topologia A→Z)
      CREATE TABLE IF NOT EXISTS tmf_geographic_site_relationship (
        site_from_id TEXT NOT NULL,
        site_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (site_from_id, site_to_id, relationship_type),
        FOREIGN KEY (site_from_id) REFERENCES tmf_geographic_site(id),
        FOREIGN KEY (site_to_id) REFERENCES tmf_geographic_site(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_relationship ON tmf_geographic_site_relationship(site_from_id, site_to_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_geographic_site_relationship_reverse ON tmf_geographic_site_relationship(site_to_id, site_from_id);

      -- ========== MODULE 2: RESOURCE (TMF634/639) ==========

      -- TMF634: Resource Specification (catálogo de tipos de recurso)
      CREATE TABLE IF NOT EXISTS tmf_resource_specification (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        description TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        related_party TEXT,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_specification_category_type ON tmf_resource_specification(category, resource_type);

      -- TMF634: Resource Function Specification (template funcional reutilizável)
      CREATE TABLE IF NOT EXISTS tmf_resource_category (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        parent_category_code TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_category_parent ON tmf_resource_category(parent_category_code);
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_category_status ON tmf_resource_category(status);

      CREATE TABLE IF NOT EXISTS tmf_resource_type (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category_code TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_code) REFERENCES tmf_resource_category(code)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_type_category ON tmf_resource_type(category_code);
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_type_status ON tmf_resource_type(status);

      CREATE TABLE IF NOT EXISTS tmf_resource_function_specification (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- TMF639: Physical Resource (instância de recurso físico: OLT, cabo, poste, ONT, etc.)
      CREATE TABLE IF NOT EXISTS tmf_physical_resource (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        resource_specification_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        geographic_location_id TEXT,
        manufacturer TEXT,
        model TEXT,
        serial_number TEXT UNIQUE,
        part_number TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        related_party TEXT,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_specification_id) REFERENCES tmf_resource_specification(id),
        FOREIGN KEY (geographic_location_id) REFERENCES tmf_geographic_location(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_spec ON tmf_physical_resource(resource_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_location ON tmf_physical_resource(geographic_location_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_status ON tmf_physical_resource(status);
      CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_serial ON tmf_physical_resource(serial_number);

      -- TMF639: Logical Resource (instância de recurso lógico: IP, VLAN, VRF, etc.)
      CREATE TABLE IF NOT EXISTS tmf_logical_resource (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        resource_specification_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        supporting_physical_resource_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_specification_id) REFERENCES tmf_resource_specification(id),
        FOREIGN KEY (supporting_physical_resource_id) REFERENCES tmf_physical_resource(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_spec ON tmf_logical_resource(resource_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_supporting ON tmf_logical_resource(supporting_physical_resource_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_logical_resource_status ON tmf_logical_resource(status);

      -- Resource Relationship (containment, dependency entre recursos)
      CREATE TABLE IF NOT EXISTS tmf_resource_relationship (
        resource_from_id TEXT NOT NULL,
        resource_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (resource_from_id, resource_to_id, relationship_type),
        FOREIGN KEY (resource_from_id) REFERENCES tmf_physical_resource(id),
        FOREIGN KEY (resource_to_id) REFERENCES tmf_physical_resource(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_relationship ON tmf_resource_relationship(resource_from_id, resource_to_id);

      CREATE TABLE IF NOT EXISTS tmf_resource_relationship_generic (
        resource_from_id TEXT NOT NULL,
        resource_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (resource_from_id, resource_to_id, relationship_type)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_relationship_generic ON tmf_resource_relationship_generic(resource_from_id, resource_to_id);

      -- ========== MODULE 3: SERVICE (TMF633/638) ==========

      -- TMF633: Service Specification (catálogo de tipos de serviço)
      CREATE TABLE IF NOT EXISTS tmf_service_specification (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        service_type TEXT NOT NULL CHECK(service_type IN ('CFS', 'RFS', 'Other')),
        description TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_specification_category_type ON tmf_service_specification(category, service_type);

      CREATE TABLE IF NOT EXISTS tmf_service_category (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        parent_category_id TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_category_id) REFERENCES tmf_service_category(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_category_parent ON tmf_service_category(parent_category_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_service_category_name ON tmf_service_category(name);

      CREATE TABLE IF NOT EXISTS tmf_service_candidate (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        service_specification_id TEXT NOT NULL,
        service_category_id TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id),
        FOREIGN KEY (service_category_id) REFERENCES tmf_service_category(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_candidate_spec ON tmf_service_candidate(service_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_service_candidate_category ON tmf_service_candidate(service_category_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_service_candidate_status ON tmf_service_candidate(status);

      -- TMF638: Resource Facing Service (serviço técnico, realização da rede)
      -- NOTE: defined before Customer Facing Service because the CFS foreign key references it.
      -- SQLite tolerates forward FK references; Postgres resolves the referenced table at CREATE
      -- TABLE time, so the referenced table must already exist.
      CREATE TABLE IF NOT EXISTS tmf_resource_facing_service (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT,
        service_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        state TEXT,
        service_type TEXT,
        category TEXT,
        service_date TEXT,
        start_date TEXT,
        end_date TEXT,
        is_service_enabled INTEGER,
        has_started INTEGER,
        supporting_resource_id TEXT NOT NULL,
        place TEXT,
        related_party TEXT,
        supporting_resources TEXT,
        supporting_services TEXT,
        service_relationships TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_facing_service_spec ON tmf_resource_facing_service(service_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_facing_service_resource ON tmf_resource_facing_service(supporting_resource_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_facing_service_status ON tmf_resource_facing_service(status);

      -- TMF638: Customer Facing Service (serviço comercial ao cliente/ISP)
      CREATE TABLE IF NOT EXISTS tmf_customer_facing_service (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        service_specification_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'terminated')),
        state TEXT,
        service_type TEXT,
        category TEXT,
        service_date TEXT,
        start_date TEXT,
        end_date TEXT,
        is_service_enabled INTEGER,
        has_started INTEGER,
        subscriber_id TEXT NOT NULL,
        supporting_resource_facing_service_id TEXT,
        place TEXT,
        related_party TEXT,
        supporting_services TEXT,
        service_relationships TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_specification_id) REFERENCES tmf_service_specification(id),
        FOREIGN KEY (supporting_resource_facing_service_id) REFERENCES tmf_resource_facing_service(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_customer_facing_service_spec ON tmf_customer_facing_service(service_specification_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_customer_facing_service_subscriber ON tmf_customer_facing_service(subscriber_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_customer_facing_service_status ON tmf_customer_facing_service(status);

      -- Service Relationship (suporta, depende de)
      CREATE TABLE IF NOT EXISTS tmf_service_relationship (
        service_from_id TEXT NOT NULL,
        service_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (service_from_id, service_to_id, relationship_type),
        FOREIGN KEY (service_from_id) REFERENCES tmf_customer_facing_service(id),
        FOREIGN KEY (service_to_id) REFERENCES tmf_resource_facing_service(id)
      );

      -- TMF645: Service Qualification
      CREATE TABLE IF NOT EXISTS tmf_service_qualification (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'done' CHECK(state IN ('done', 'terminated')),
        place TEXT,
        related_party TEXT,
        service_characteristic TEXT,
        service_qualification_item TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_qualification_state ON tmf_service_qualification(state);

      -- TMF641: Service Order
      CREATE TABLE IF NOT EXISTS tmf_service_order (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'acknowledged' CHECK(state IN ('acknowledged', 'inProgress', 'completed', 'failed', 'cancelled')),
        description TEXT,
        related_party TEXT,
        service_order_item TEXT NOT NULL,
        note TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_service_order_state ON tmf_service_order(state);

      -- TMF652: Resource Order
      CREATE TABLE IF NOT EXISTS tmf_resource_order (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'acknowledged' CHECK(state IN ('acknowledged', 'inProgress', 'completed', 'failed', 'cancelled')),
        description TEXT,
        related_party TEXT,
        resource_order_item TEXT NOT NULL,
        note TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_resource_order_state ON tmf_resource_order(state);

      -- ========== MODULE 6: PARTY & TENANT (TMF632/669) ==========

      CREATE TABLE IF NOT EXISTS tmf_party (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        party_type TEXT NOT NULL CHECK(party_type IN ('Organization', 'Individual')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_party_name ON tmf_party(name);
      CREATE INDEX IF NOT EXISTS idx_tmf_party_type_status ON tmf_party(party_type, status);

      CREATE TABLE IF NOT EXISTS tmf_party_role (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        name TEXT NOT NULL,
        party_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES tmf_party(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_party_role_party ON tmf_party_role(party_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_party_role_name ON tmf_party_role(name);
      CREATE INDEX IF NOT EXISTS idx_tmf_party_role_status ON tmf_party_role(status);

      CREATE TABLE IF NOT EXISTS tmf_party_relationship (
        party_from_id TEXT NOT NULL,
        party_to_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        PRIMARY KEY (party_from_id, party_to_id, relationship_type),
        FOREIGN KEY (party_from_id) REFERENCES tmf_party(id),
        FOREIGN KEY (party_to_id) REFERENCES tmf_party(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_party_relationship ON tmf_party_relationship(party_from_id, party_to_id);

      -- ========== TRANSVERSAL: EVENTS (TMF688) ==========

      -- TMF688: Event Store (auditoria e event sourcing)
      CREATE TABLE IF NOT EXISTS tmf_event (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        event_time DATETIME NOT NULL,
        source TEXT NOT NULL,
        event_data TEXT NOT NULL,
        correlation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tmf_event_type_time ON tmf_event(event_type, event_time DESC);
      CREATE INDEX IF NOT EXISTS idx_tmf_event_source ON tmf_event(source);
      CREATE INDEX IF NOT EXISTS idx_tmf_event_correlation ON tmf_event(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event(json_extract(event_data, '$.entityId'));

      -- ========== SEARCH/CHAT MODULE ==========

      -- Research Session (similar to ChatGPT conversation)
      CREATE TABLE IF NOT EXISTS research_session (
        id TEXT PRIMARY KEY,
        href TEXT NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        context TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
        model TEXT,
        temperature REAL DEFAULT 0.7,
        max_tokens INTEGER DEFAULT 2000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_research_session_user ON research_session(user_id);
      CREATE INDEX IF NOT EXISTS idx_research_session_created ON research_session(created_at);
      CREATE INDEX IF NOT EXISTS idx_research_session_status ON research_session(status);

      -- Research Message (turn-by-turn conversation)
      CREATE TABLE IF NOT EXISTS research_message (
        id TEXT PRIMARY KEY,
        research_session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tokens_used INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (research_session_id) REFERENCES research_session(id)
      );
      CREATE INDEX IF NOT EXISTS idx_research_message_session ON research_message(research_session_id);
      CREATE INDEX IF NOT EXISTS idx_research_message_role ON research_message(role);
      CREATE INDEX IF NOT EXISTS idx_research_message_created ON research_message(created_at);

      -- MCP two-phase confirmation tokens
      CREATE TABLE IF NOT EXISTS mcp_confirmation (
        token TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        summary TEXT NOT NULL,
        warnings TEXT NOT NULL,
        context TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_confirmation_operation ON mcp_confirmation(domain, operation);
      CREATE INDEX IF NOT EXISTS idx_mcp_confirmation_expires ON mcp_confirmation(expires_at);

      -- ========== CATALOGS: Extensible ==========

      -- Catalog: Relationship Types (reutilizável)
      CREATE TABLE IF NOT EXISTS tmf_relationship_type_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        applicable_to_entity_types TEXT,
        valid_for_start DATETIME,
        valid_for_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Catalog: Characteristic Groups (reutilizável)
      CREATE TABLE IF NOT EXISTS tmf_characteristic_group_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        applicable_to_entity_types TEXT,
        allowed_characteristics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
`;
