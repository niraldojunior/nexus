import http from 'node:http';
import { config as loadEnv } from 'dotenv';
import { createApp } from '../src/shared/http/app.js';
import { resolveDatabaseConfig, type AppConfig, type OracleConfig } from '../src/shared/config/env.js';
import { createDatabaseClient } from '../src/shared/persistence/database-factory.js';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';
import { TABLE_NAMES } from '../src/shared/persistence/schema.js';

loadEnv();
process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';

// --------------------------------------------------------------- Oracle ----
//
// The corporate Oracle instance hosts DEV/HML/PRD/TEST in ONE schema, distinguished by an object
// prefix, so there is no per-worker schema to isolate tests. The whole DB-backed suite instead runs
// under a dedicated NEXUS_TEST_ prefix and clears data with DELETE (Oracle's TRUNCATE cannot cross
// the FK graph under enabled constraints — ORA-02266). Run DB-backed specs with a single worker: one
// prefix is one shared namespace (see scripts/test-oracle.mjs).

export const TEST_ORACLE_PREFIX = process.env.ORACLE_TEST_OBJECT_PREFIX ?? 'NEXUS_TEST_';

// True when the environment carries enough to reach a real Oracle. DB-backed specs skip unless this
// holds, so a plain `npm run test:unit` (no ORACLE_* configured) never tries to connect.
export const isOracleTestConfigured = (): boolean =>
  Boolean(process.env.ORACLE_CONNECTION_STRING && process.env.ORACLE_USER && process.env.ORACLE_PASSWORD);

// Guard against the shared-schema hazard: DEV/HML/PRD live in the same Oracle schema as TEST, and
// the suite DELETEs every prefixed table between runs. Refusing anything but a `_TEST_`/`_TST_`
// prefix turns "wrong prefix" into a loud, immediate failure instead of silent data loss.
export const assertOracleTestPrefix = (prefix: string): void => {
  if (!/_(TEST|TST)_$/i.test(prefix)) {
    throw new Error(
      `Recusando rodar testes Oracle sob o prefixo "${prefix}": use um prefixo de teste ` +
        `(ex.: NEXUS_TEST_). A suíte apaga todas as tabelas do prefixo — outro prefixo apagaria ` +
        `dados de DEV/HML/PRD no mesmo schema.`,
    );
  }
};

const resolveTestOracleConfig = (): OracleConfig => {
  const config = resolveDatabaseConfig({ ...process.env, ORACLE_OBJECT_PREFIX: TEST_ORACLE_PREFIX });
  assertOracleTestPrefix(config.objectPrefix);
  return config;
};

// One initialized Oracle client per run (DB-backed specs run single-worker), built from the ambient
// ORACLE_* connection but pinned to the test prefix.
let oracleTestClient: Promise<DatabaseClient> | undefined;

export const getOracleTestClient = (): Promise<DatabaseClient> => {
  oracleTestClient ??= (async () => {
    const client = createDatabaseClient(resolveTestOracleConfig());
    await client.initialize();
    return client;
  })();
  return oracleTestClient;
};

// Clears every table's data for the test prefix. Reverse TABLE_NAMES order is child-before-parent
// (TABLE_NAMES is parent-first), so plain DELETE satisfies the FK graph without TRUNCATE ... CASCADE.
export const cleanupOracleTables = async (client: DatabaseClient): Promise<void> => {
  for (const table of [...TABLE_NAMES].reverse()) {
    try {
      await client.exec(`DELETE FROM ${table}`);
    } catch {
      // Table may not exist yet (schema not fully applied); best-effort.
    }
  }
};

export const createTestLogger = () => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

// AppConfig for a test HTTP app. Every DB-backed test shares the same Oracle test client/prefix, so
// there is no per-call database identity to pass in — just the port the app should bind.
export const createTestConfig = (port: number): AppConfig => ({
  appName: 'v-tal-nexus',
  authEnabled: true,
  authToken: 'secret',
  authTokenRoles: ['migration.job'],
  authAccessTokenTtlHours: 12,
  database: resolveTestOracleConfig(),
  logLevel: 'info',
  nodeEnv: 'test',
  port,
});

export const requestJson = async (
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
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
          // Fora de produção o token estático aceita `x-actor-sub` para testabilidade (ver
          // request-context.ts). Rotas com `requireUser` (ex.: sessões de pesquisa) exigem uma
          // conta real — sem isso todo teste que as toca voltaria 401. VT158145 é o usuário
          // semente (DEFAULT_RUNTIME_USER) criado no bootstrap do runtime.
          'x-actor-sub': 'VT158145',
          ...headers,
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

export const startHttpTestApp = async () => {
  const server = createApp({
    config: createTestConfig(0),
    logger: createTestLogger(),
  });
  const port = await server.start();

  return {
    port,
    requestJson: (
      method: string,
      path: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => requestJson(port, method, path, body, headers),
    cleanup: async () => {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    },
  };
};
