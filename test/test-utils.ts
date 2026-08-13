import http from 'node:http';
import { config as loadEnv } from 'dotenv';
import { createApp } from '../src/shared/http/app.js';
import {
  firstNonBlank,
  isPostgresDatabaseUrl,
  resolveDatabaseConfig,
} from '../src/shared/config/env.js';
import { createDatabaseClient } from '../src/shared/persistence/database-factory.js';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { TABLE_NAMES } from '../src/shared/persistence/schema.js';

loadEnv();

const reuseInstance = (): boolean => process.env.DATABASE_REUSE_TEST_INSTANCE === 'true';
// Every test file assigned to the same Vitest worker shares one schema, so the schema, its DDL and
// the DB connection are set up once per worker instead of once per test. VITEST_POOL_ID is the pool
// slot (1..maxThreads), stable for the worker's lifetime and unique across concurrent workers —
// unlike VITEST_WORKER_ID, which Vitest reassigns per file.
const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '1';

// The per-worker schema every DB test in this worker shares (see createTestDatabase). Computed once
// here so TRUNCATE_SQL can be schema-qualified — see the safety note on TRUNCATE_SQL below.
const workerSchema = `nexus_test_w${workerId}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63);

let workerDatabaseUrl: string | undefined;
// Flips true once a test in this worker has asked for the shared database, so the afterEach TRUNCATE
// stays a no-op for pure (non-DB) tests until then.
let schemaReady = false;

const resolvePostgresUrl = (): string | undefined =>
  firstNonBlank(
    process.env.DATABASE_URL_TEST,
    process.env.NEON_DATABASE_URL_TEST,
    process.env.DATABASE_URL_DEV,
    process.env.NEON_DATABASE_URL_DEV,
    process.env.DATABASE_URL,
  );

// Identity of a Postgres URL for comparison: host + database only, ignoring credentials and query
// params (e.g. ?schema=). Two URLs that differ only by user/password/schema are the same database.
const dbIdentity = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
};

// Refuses to let the test suite run against production. The suite TRUNCATEs every table between
// tests, so a DATABASE_URL_TEST/DEV secret accidentally pointing at the prod database wipes prod.
// This turns that mistake into a loud, immediate failure instead of silent data loss.
export const assertNotProductionUrl = (url: string): void => {
  const target = dbIdentity(url);
  const isProd = [process.env.DATABASE_URL_PROD, process.env.NEON_DATABASE_URL_PROD]
    .filter((value): value is string => Boolean(value))
    .some((prod) => dbIdentity(prod) === target);
  if (isProd) {
    throw new Error(
      'Recusando rodar: o banco de teste resolveu para a produção (DATABASE_URL_PROD). ' +
        'A suíte faz TRUNCATE em todas as tabelas. Aponte DATABASE_URL_TEST/DATABASE_URL_DEV ' +
        'para um branch descartável do Neon.',
    );
  }
};

// One statement covering every table: TRUNCATE ... CASCADE resets data (and identity sequences)
// between tests in a single round-trip, without dropping/recreating the schema.
//
// SAFETY: table names are schema-qualified with workerSchema. The connection runs with
// search_path = "<workerSchema>, public"; with *unqualified* names, any table missing from the
// worker schema (e.g. when DATABASE_AUTO_SCHEMA is off, so the DDL never ran there) would resolve
// to public and TRUNCATE production data. Qualifying makes it physically impossible for this
// statement to touch the public schema.
export const TRUNCATE_SQL = `TRUNCATE TABLE ${TABLE_NAMES.map((table) => `"${workerSchema}"."${table}"`).join(', ')} RESTART IDENTITY CASCADE`;

// Called from the global afterEach (test/setup.ts). Wipes the shared schema's data so the next test
// starts clean. Best-effort: a test may have created the schema without yet running the DDL.
export const truncateTestSchema = async (): Promise<void> => {
  if (!reuseInstance() || !schemaReady || !workerDatabaseUrl) return;
  try {
    await PostgresDatabase.getInstance(workerDatabaseUrl).exec(TRUNCATE_SQL);
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

export const createTestDatabase = (
  prefix: string,
): { databaseUrl: string; cleanup: () => void } => {
  const postgresUrl = resolvePostgresUrl();

  if (!isPostgresDatabaseUrl(postgresUrl)) {
    throw new Error(
      'DATABASE_URL_TEST, NEON_DATABASE_URL_TEST, DATABASE_URL_DEV or NEON_DATABASE_URL_DEV must point to Neon/Postgres for integration tests.',
    );
  }

  assertNotProductionUrl(postgresUrl);

  process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';

  if (reuseInstance()) {
    // Reuse mode: one stable schema per worker, created once and reused across every test. Data is
    // cleared by the global afterEach TRUNCATE; the schema is dropped once at end of run
    // (test/global-setup.ts). cleanup() is therefore a no-op kept for call-site compatibility.
    if (!workerDatabaseUrl) {
      // Deterministic (no random suffix) so re-runs reuse the same schema and global-setup can find
      // and drop it by the `nexus_test_%` prefix. workerSchema is module-level so TRUNCATE_SQL can
      // qualify with the same name.
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
        // Only close this instance. PostgresDatabase.resetForTesting() would tear down
        // every instance in the static map, including ones from other tests whose
        // async teardown hasn't finished yet — that raced here and left the next
        // test's fresh instance with a null bridge ("Database not initialized").
        database.close();
      }
    },
  };
};

// --------------------------------------------------------------- Oracle ----
//
// The corporate Oracle instance hosts DEV/HML/PRD in ONE schema, distinguished by an object prefix,
// so there is no per-worker schema to isolate tests. The test suite instead runs under a dedicated
// NEXUS_TEST_ prefix and clears data with DELETE (Oracle's TRUNCATE cannot cross the FK graph). Run
// Oracle tests with a single worker — one prefix is one shared namespace.

export const TEST_ORACLE_PREFIX = process.env.ORACLE_TEST_OBJECT_PREFIX ?? 'NEXUS_TEST_';

// True when the environment carries enough to reach a real Oracle. Oracle-gated specs skip unless
// this holds, so the default (Postgres) suite never tries to connect.
export const isOracleTestConfigured = (): boolean =>
  Boolean(
    firstNonBlank(process.env.ORACLE_CONNECTION_STRING, process.env.ORACLE_CONNECT_STRING) &&
    process.env.ORACLE_USER &&
    process.env.ORACLE_PASSWORD,
  );

// Guard analogous to assertNotProductionUrl: because PRD lives in the same schema, the suite (which
// DELETEs every prefixed table) must refuse to run under anything but a test prefix.
export const assertOracleTestPrefix = (prefix: string): void => {
  if (!/_(TEST|TST)_$/i.test(prefix)) {
    throw new Error(
      `Recusando rodar testes Oracle sob o prefixo "${prefix}": use um prefixo de teste ` +
        `(ex.: NEXUS_TEST_). A suíte apaga todas as tabelas do prefixo — outro prefixo apagaria ` +
        `dados de DEV/HML/PRD no mesmo schema.`,
    );
  }
};

// One initialized Oracle client per run (Oracle tests are single-worker), built from the ambient
// ORACLE_* connection but pinned to the test prefix.
let oracleTestClient: Promise<DatabaseClient> | undefined;

export const getOracleTestClient = (): Promise<DatabaseClient> => {
  oracleTestClient ??= (async () => {
    const config = resolveDatabaseConfig(
      { ...process.env, DATABASE_PROVIDER: 'oracle', ORACLE_OBJECT_PREFIX: TEST_ORACLE_PREFIX },
      'test',
    );
    if (config.provider !== 'oracle') throw new Error('Expected an Oracle database configuration.');
    assertOracleTestPrefix(config.objectPrefix);
    const client = createDatabaseClient(config);
    await client.initialize();
    return client;
  })();
  return oracleTestClient;
};

// Clears every table's data for the test prefix. Reverse TABLE_NAMES order is child-before-parent
// (TABLE_NAMES is parent-first), so plain DELETE satisfies the FK graph without TRUNCATE ... CASCADE
// (which Oracle rejects under enabled foreign keys, ORA-02266).
export const cleanupOracleTables = async (client: DatabaseClient): Promise<void> => {
  for (const table of [...TABLE_NAMES].reverse()) {
    try {
      await client.exec(`DELETE FROM ${table}`);
    } catch {
      // Table may not exist yet (schema not fully applied); best-effort, like truncateTestSchema.
    }
  }
};

const createSchemaName = (prefix: string): string => {
  const normalizedPrefix =
    prefix.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'nexus_test';
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
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
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
  const server = createApp({
    config: createTestConfig(0, database.databaseUrl),
    logger: createTestLogger(),
  });
  const port = await server.start();

  return {
    port,
    requestJson: (method: string, path: string, body?: unknown) =>
      requestJson(port, method, path, body),
    cleanup: async () => {
      await server.stop();
      database.cleanup();
    },
  };
};
