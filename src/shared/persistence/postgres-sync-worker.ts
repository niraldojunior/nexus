import { neon, Pool, types, type PoolClient } from '@neondatabase/serverless';
import { parentPort, workerData } from 'node:worker_threads';

// Postgres returns int8 (bigint) and numeric as strings by default. The repository layer was
// written against better-sqlite3, which yields JS numbers, so callers do strict numeric
// comparisons (e.g. `count() === 3`). Coerce these types back to numbers to preserve that
// contract. Values here (COUNT(*), tokens, temperatures) are well within Number's safe range.
types.setTypeParser(20, (value) => Number.parseInt(value, 10)); // int8 / bigint
types.setTypeParser(1700, (value) => Number.parseFloat(value)); // numeric

// The DDL is handed over by the bridge instead of imported here. This file is spawned as a raw
// worker entry point — under Vitest that means Node runs the .ts source directly, where a
// relative `./schema.js` specifier does not resolve to `schema.ts` and the resulting load failure
// is invisible (the main thread is parked in Atomics.wait and only sees the request time out).
// Keeping schema.ts as the single source of truth therefore has to happen on the main thread.
type WorkerInitData = {
  connectionString: string;
  controlBuffer: SharedArrayBuffer;
  dataBuffer: SharedArrayBuffer;
  schemaSql: string;
  migrationsSql: string;
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
  client: PoolClient;
};

const initData = workerData as WorkerInitData;
const { connectionString, schemaName } = parseConnectionString(initData.connectionString);
// Already rewritten to the Postgres dialect by the bridge.
const SCHEMA_SQL = initData.schemaSql;
const MIGRATIONS_SQL = initData.migrationsSql;
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
    post({ id: message.id, ok: false, error: toErrorMessage(error) });
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
      const client = await connectPooled();
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

// The neon serverless driver's Pool talks WebSocket under the hood; a dropped connection often
// rejects with a raw ErrorEvent/CloseEvent (not an Error), which stringifies to the useless
// "[object ErrorEvent]" unless we dig `.message`/`.error` out of it ourselves.
const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; error?: unknown; type?: unknown; errors?: unknown; code?: unknown };
    if (candidate.error instanceof Error && candidate.error.message.length > 0) return candidate.error.message;
    if (typeof candidate.message === 'string' && candidate.message.length > 0) return candidate.message;
    if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
      return candidate.errors.map((inner) => toErrorMessage(inner)).join('; ');
    }
    if (typeof candidate.type === 'string' && candidate.type.length > 0) {
      return `${Object.prototype.toString.call(error)} (type: ${candidate.type}${
        typeof candidate.code === 'string' ? `, code: ${candidate.code}` : ''
      })`;
    }
    if (error instanceof Error) {
      return `${Object.prototype.toString.call(error)} (empty message, name: ${error.name})`;
    }
  }
  return String(error);
};

const isTransientConnectionError = (error: unknown): boolean => {
  const message = toErrorMessage(error);
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|Connection terminated|connection closed|network|ErrorEvent|CloseEvent|empty message/i.test(
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
    await runSchemaBatch(`${SCHEMA_SQL}\n${MIGRATIONS_SQL}`);
    return;
  } catch {
    // Fall back to per-statement execution (tolerating idempotent errors) if the batch fails.
  }

  const statements = [...splitSqlStatements(SCHEMA_SQL), ...splitSqlStatements(MIGRATIONS_SQL)];

  for (const statement of statements) {
    try {
      await executeQuery(statement, [], 'run', undefined);
    } catch (error) {
      if (!isIgnorableSchemaError(statement, error)) {
        throw schemaError(statement, error);
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
        throw schemaError(statement, error);
      }
    }
  }
};

// Schema failures reach the caller as a bare Postgres message with no hint of which statement
// produced it, which makes them very hard to place in a ~120-statement schema.
const schemaError = (statement: string, error: unknown): Error =>
  new Error(`${toErrorMessage(error)} — while running: ${statement.replace(/\s+/g, ' ').slice(0, 200)}`);

const runSchemaBatch = async (sql: string): Promise<void> => {
  if (!schemaName) {
    await sqlClient.query(sql);
    return;
  }
  const client = await connectPooled();
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

// A `--` comment between two statements lands at the head of the *following* chunk once the SQL is
// split on ';'. Dropping the whole chunk would therefore silently swallow the statement after any
// comment, so only the leading comment lines are removed and the statement itself is kept.
const stripLeadingComments = (statement: string): string => {
  const lines = statement.split('\n');
  let index = 0;
  while (index < lines.length && (lines[index]!.trim().startsWith('--') || lines[index]!.trim() === '')) {
    index += 1;
  }
  return lines.slice(index).join('\n').trim();
};

const splitSqlStatements = (sql: string): string[] =>
  sql
    .split(';')
    .map((statement) => stripLeadingComments(statement))
    .filter((statement) => statement.length > 0);

const executeStatements = async (sql: string, params: unknown[] | undefined, txId: string | undefined): Promise<void> => {
  const statements = sql
    .split(';')
    .map((statement) => stripLeadingComments(statement))
    .filter((statement) => statement.length > 0);

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

// Checking out a connection hasn't sent any query yet, so retrying it on a transient
// WebSocket/network blip is always safe (unlike retrying a query that may have already landed).
const connectPooled = async (): Promise<PoolClient> => withRetry(() => getPool().connect());

const executePooledQuery = async (queryText: string, queryParams: unknown[]) => {
  const client = await connectPooled();
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
const beginSchemaScope = async (client: PoolClient): Promise<void> => {
  await client.query(`BEGIN; SET LOCAL search_path TO ${quoteIdentifier(schemaName as string)}, public`);
};

const setSearchPath = async (client: PoolClient): Promise<void> => {
  if (!schemaName) return;
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
};

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

