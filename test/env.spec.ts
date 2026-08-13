import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isPostgresDatabaseUrl, loadConfig } from '../src/shared/config/env.js';

test('loadConfig applies Nexus defaults', () => {
  const config = loadConfig({ DATABASE_URL_DEV: 'postgresql://dev.example' });

  assert.equal(config.appName, 'v-tal-nexus');
  assert.equal(config.port, 4001);
  assert.equal(config.authEnabled, true);
});

test('loadConfig habilita Geonet somente com a configuração server-side completa', () => {
  const incomplete = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    GEONET_API_BASE_URL: 'https://api.example/geographicAddressManagement/v1',
  });
  assert.equal(incomplete.geonet, undefined);

  const configured = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    GEONET_API_BASE_URL: 'https://api.example/geographicAddressManagement/v1',
    GEONET_TOKEN_URL: 'https://api.example/auth/oauth/v2/token',
    GEONET_CLIENT_ID: 'client',
    GEONET_CLIENT_SECRET: 'secret',
  });
  assert.deepEqual(configured.geonet, {
    apiBaseUrl: 'https://api.example/geographicAddressManagement/v1',
    tokenUrl: 'https://api.example/auth/oauth/v2/token',
    clientId: 'client',
    clientSecret: 'secret',
    scope: 'fttx',
    timeoutMs: 5_000,
  });
});

test('loadConfig normalizes explicit environment values', () => {
  const config = loadConfig({
    APP_NAME: 'nexus-test',
    AUTH_ENABLED: 'off',
    AUTH_TOKEN: 'token-abc',
    DATABASE_URL_PROD: 'postgresql://prod.example',
    DATABASE_URL_DEV: 'postgresql://dev.example',
    LOG_LEVEL: 'debug',
    NODE_ENV: 'production',
    PORT: '4100',
  });

  assert.equal(config.appName, 'nexus-test');
  assert.equal(config.authEnabled, false);
  assert.equal(config.authToken, 'token-abc');
  assert.equal(config.databaseUrl, 'postgresql://prod.example');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.port, 4100);
});

test('loadConfig prefers the dev Neon database outside production when DATABASE_URL is absent', () => {
  const config = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    NODE_ENV: 'development',
  });

  assert.equal(config.databaseUrl, 'postgresql://dev.example');
});

test('loadConfig ignores empty test database variables and falls back to dev', () => {
  const config = loadConfig({
    DATABASE_URL_TEST: '',
    NEON_DATABASE_URL_TEST: '   ',
    DATABASE_URL_DEV: 'postgresql://dev.example',
    NODE_ENV: 'test',
  });

  assert.equal(config.databaseUrl, 'postgresql://dev.example');
});

test('loadConfig uses the preview Neon database in Vercel preview deployments', () => {
  const config = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    DATABASE_URL_PROD: 'postgresql://prod.example',
    VERCEL_ENV: 'preview',
  });

  assert.equal(config.databaseUrl, 'postgresql://dev.example');
});

test('loadConfig uses the production Neon database in Vercel production deployments', () => {
  const config = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    DATABASE_URL_PROD: 'postgresql://prod.example',
    VERCEL_ENV: 'production',
  });

  assert.equal(config.databaseUrl, 'postgresql://prod.example');
});

test('loadConfig falls back for invalid values', () => {
  const config = loadConfig({
    AUTH_ENABLED: 'maybe',
    DATABASE_URL_DEV: 'postgresql://dev.example',
    LOG_LEVEL: 'verbose',
    NODE_ENV: 'qa',
    PORT: '-1',
  });

  assert.equal(config.authEnabled, false);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.port, 4001);
});

test('loadConfig requires a Neon/Postgres database url', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL_DEV/);
  assert.throws(() => loadConfig({ DATABASE_URL_DEV: 'sqlite://./data/nexus.db' }), /postgres/);
});

test('database url helpers identify Neon and reject sqlite as the default stack', () => {
  assert.equal(isPostgresDatabaseUrl('postgresql://example'), true);
  assert.equal(isPostgresDatabaseUrl('postgres://example'), true);
  assert.equal(isPostgresDatabaseUrl('sqlite://./data/nexus.db'), false);
});

test('loadConfig selects Oracle without consulting PostgreSQL variables', () => {
  const config = loadConfig({
    DATABASE_PROVIDER: 'oracle',
    ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
    ORACLE_USER: 'nexus_runtime',
    ORACLE_PASSWORD: 'secret-from-environment',
    ORACLE_OBJECT_PREFIX: 'NEXUS_DEV_',
    ORACLE_POOL_MIN: '1',
    ORACLE_POOL_MAX: '8',
    ORACLE_POOL_TIMEOUT_SECONDS: '30',
    ORACLE_POOL_PING_INTERVAL_SECONDS: '45',
  });

  assert.equal(config.database?.provider, 'oracle');
  if (config.database?.provider !== 'oracle') throw new Error('Oracle config expected');
  assert.equal(config.database.connectString, 'oracle.example:1521/NEXUS');
  assert.equal(config.database.objectPrefix, 'NEXUS_DEV_');
  assert.equal(config.database.pool.min, 1);
  assert.equal(config.database.pool.max, 8);
  // Timeouts arrive in seconds and are stored as milliseconds.
  assert.equal(config.database.pool.queueTimeoutMs, 30_000);
  assert.equal(config.database.pool.pingIntervalSeconds, 45);
});

test('loadConfig accepts the legacy ORACLE_CONNECT_STRING and DATABASE_POOL_* fallbacks', () => {
  const config = loadConfig({
    DATABASE_PROVIDER: 'oracle',
    ORACLE_CONNECT_STRING: 'legacy.example:1521/NEXUS',
    ORACLE_USER: 'nexus_runtime',
    ORACLE_PASSWORD: 'secret',
    ORACLE_OBJECT_PREFIX: 'NEXUS_HML_',
    DATABASE_POOL_MIN: '2',
    DATABASE_POOL_MAX: '9',
  });

  assert.equal(config.database?.provider, 'oracle');
  if (config.database?.provider !== 'oracle') throw new Error('Oracle config expected');
  assert.equal(config.database.connectString, 'legacy.example:1521/NEXUS');
  assert.equal(config.database.pool.min, 2);
  assert.equal(config.database.pool.max, 9);
});

test('loadConfig rejects incomplete Oracle configuration and invalid providers', () => {
  assert.throws(
    () => loadConfig({ DATABASE_PROVIDER: 'oracle', ORACLE_USER: 'nexus_runtime' }),
    /ORACLE_CONNECTION_STRING/,
  );
  assert.throws(
    () =>
      loadConfig({
        DATABASE_PROVIDER: 'oracle',
        ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
        ORACLE_USER: 'nexus_runtime',
        ORACLE_PASSWORD: 'secret',
      }),
    /ORACLE_OBJECT_PREFIX/,
  );
  assert.throws(
    () =>
      loadConfig({
        DATABASE_PROVIDER: 'oracle',
        ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
        ORACLE_USER: 'nexus_runtime',
        ORACLE_PASSWORD: 'secret',
        ORACLE_OBJECT_PREFIX: 'nexus-dev',
      }),
    /ORACLE_OBJECT_PREFIX must match/,
  );
  assert.throws(
    () => loadConfig({ DATABASE_PROVIDER: 'mysql', DATABASE_URL: 'postgresql://dev.example' }),
    /DATABASE_PROVIDER/,
  );
});

test('loadConfig prohibits automatic schema changes in production', () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_AUTO_SCHEMA: 'true',
        DATABASE_URL_PROD: 'postgresql://prod.example',
      }),
    /not allowed in production/,
  );
});
