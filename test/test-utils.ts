import http from 'node:http';
import { config as loadEnv } from 'dotenv';
import { createApp } from '../src/shared/http/app.js';
import { isPostgresDatabaseUrl } from '../src/shared/config/env.js';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { TABLE_NAMES } from '../src/shared/persistence/schema.js';

loadEnv();

const reuseInstance = process.env.DATABASE_REUSE_TEST_INSTANCE === 'true';
// Every test file assigned to the same Vitest worker shares one schema, so the schema, its DDL and
// the DB connection are set up once per worker instead of once per test. VITEST_POOL_ID is the pool
// slot (1..maxThreads), stable for the worker's lifetime and unique across concurrent workers —
// unlike VITEST_WORKER_ID, which Vitest reassigns per file.
const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '1';

let workerDatabaseUrl: string | undefined;
// Flips true once a test in this worker has asked for the shared database, so the afterEach TRUNCATE
// stays a no-op for pure (non-DB) tests until then.
let schemaReady = false;

const resolvePostgresUrl = (): string | undefined =>
  process.env.DATABASE_URL_TEST ??
  process.env.NEON_DATABASE_URL_TEST ??
  process.env.DATABASE_URL_DEV ??
  process.env.NEON_DATABASE_URL_DEV ??
  process.env.DATABASE_URL;

// One statement covering every table: TRUNCATE ... CASCADE resets data (and identity sequences)
// between tests in a single round-trip, without dropping/recreating the schema.
const TRUNCATE_SQL = `TRUNCATE TABLE ${TABLE_NAMES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`;

// Called from the global afterEach (test/setup.ts). Wipes the shared schema's data so the next test
// starts clean. Best-effort: a test may have created the schema without yet running the DDL.
export const truncateTestSchema = (): void => {
  if (!reuseInstance || !schemaReady || !workerDatabaseUrl) return;
  try {
    PostgresDatabase.getInstance(workerDatabaseUrl).exec(TRUNCATE_SQL);
  } catch {
    // Ignore: schema/tables may not exist yet, or the instance was closed by an HTTP-app test.
  }
};

export const createTestLogger = () => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

export const createTestConfig = (port: number, databaseUrl: string) => ({
  appName: 'v-tal-nexus',
  authEnabled: true,
  authToken: 'secret',
  databaseUrl,
  logLevel: 'info' as const,
  nodeEnv: 'test' as const,
  port,
});

export const createTestDatabase = (prefix: string): { databaseUrl: string; cleanup: () => void } => {
  const postgresUrl = resolvePostgresUrl();

  if (!isPostgresDatabaseUrl(postgresUrl)) {
    throw new Error('DATABASE_URL_TEST, NEON_DATABASE_URL_TEST, DATABASE_URL_DEV or NEON_DATABASE_URL_DEV must point to Neon/Postgres for integration tests.');
  }

  process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';

  if (reuseInstance) {
    // Reuse mode: one stable schema per worker, created once and reused across every test. Data is
    // cleared by the global afterEach TRUNCATE; the schema is dropped once at end of run
    // (test/global-setup.ts). cleanup() is therefore a no-op kept for call-site compatibility.
    if (!workerDatabaseUrl) {
      // Deterministic (no random suffix) so re-runs reuse the same schema and global-setup can find
      // and drop it by the `nexus_test_%` prefix.
      const workerSchema = `nexus_test_w${workerId}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63);
      workerDatabaseUrl = appendSchema(postgresUrl, workerSchema);
    }
    schemaReady = true;
    return { databaseUrl: workerDatabaseUrl, cleanup: () => undefined };
  }

  // Legacy mode: a fresh unique schema per call, dropped on cleanup.
  const schema = createSchemaName(prefix);
  const databaseUrl = appendSchema(postgresUrl, schema);
  return {
    databaseUrl,
    cleanup: () => {
      const database = PostgresDatabase.getInstance(databaseUrl);
      try {
        database.exec(`DROP SCHEMA IF EXISTS "${schema.replace(/"/g, '""')}" CASCADE`);
      } finally {
        database.close();
        PostgresDatabase.resetForTesting();
      }
    },
  };
};

const createSchemaName = (prefix: string): string => {
  const normalizedPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'nexus_test';
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${normalizedPrefix}_${suffix}`.slice(0, 63);
};

const appendSchema = (databaseUrl: string, schema: string): string => {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
};

export const requestJson = async (
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ statusCode: number; body: unknown }> => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          authorization: 'Bearer secret',
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            body: text ? JSON.parse(text) : undefined,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

export const startHttpTestApp = async (prefix: string) => {
  const database = createTestDatabase(prefix);
  const server = createApp({ config: createTestConfig(0, database.databaseUrl), logger: createTestLogger() });
  const port = await server.start();

  return {
    port,
    requestJson: (method: string, path: string, body?: unknown) => requestJson(port, method, path, body),
    cleanup: async () => {
      await server.stop();
      database.cleanup();
    },
  };
};
