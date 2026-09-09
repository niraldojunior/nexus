import assert from 'node:assert/strict';
import { test } from 'vitest';
import { loadConfig, resolveDatabaseConfig } from '../src/shared/config/env.js';

const validOracleEnv = {
  ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
  ORACLE_USER: 'nexus_runtime',
  ORACLE_PASSWORD: 'secret-from-environment',
  ORACLE_OBJECT_PREFIX: 'NEXUS_DEV_',
};

test('loadConfig applies Nexus defaults', () => {
  const config = loadConfig(validOracleEnv);

  assert.equal(config.appName, 'v-tal-nexus');
  assert.equal(config.port, 4001);
  assert.equal(config.authEnabled, true);
});

test('loadConfig habilita Geonet somente com a configuração server-side completa', () => {
  const incomplete = loadConfig({
    ...validOracleEnv,
    GEONET_API_BASE_URL: 'https://api.example/geographicAddressManagement/v1',
  });
  assert.equal(incomplete.geonet, undefined);

  const configured = loadConfig({
    ...validOracleEnv,
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
    ...validOracleEnv,
    APP_NAME: 'nexus-test',
    AUTH_ENABLED: 'off',
    AUTH_TOKEN: 'token-abc',
    LOG_LEVEL: 'debug',
    NODE_ENV: 'production',
    AUTH_TOKEN_ROLES: undefined,
    PORT: '4100',
  });

  assert.equal(config.appName, 'nexus-test');
  assert.equal(config.authEnabled, false);
  assert.equal(config.authToken, 'token-abc');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.port, 4100);
});

test('loadConfig falls back for invalid values', () => {
  const config = loadConfig({
    ...validOracleEnv,
    AUTH_ENABLED: 'maybe',
    LOG_LEVEL: 'verbose',
    NODE_ENV: 'qa',
    PORT: '-1',
  });

  assert.equal(config.authEnabled, false);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.port, 4001);
});

test('loadConfig aplica AUTH_TOKEN_ROLES ao papel do token estático', () => {
  const withDefault = loadConfig(validOracleEnv);
  assert.deepEqual(withDefault.authTokenRoles, ['migration.job']);

  const withRoles = loadConfig({
    ...validOracleEnv,
    AUTH_TOKEN_ROLES: 'migration.job, catalog.admin',
  });
  assert.deepEqual(withRoles.authTokenRoles, ['migration.job', 'catalog.admin']);
});

test('loadConfig prohibits automatic schema changes in production', () => {
  assert.throws(
    () =>
      loadConfig({
        ...validOracleEnv,
        NODE_ENV: 'production',
        DATABASE_AUTO_SCHEMA: 'true',
      }),
    /not allowed in production/,
  );

  // Fora de produção, é permitido.
  const config = loadConfig({
    ...validOracleEnv,
    NODE_ENV: 'development',
    DATABASE_AUTO_SCHEMA: 'true',
  });
  assert.equal(config.nodeEnv, 'development');
});

test('loadConfig recusa o AUTH_TOKEN default (change-me) em produção', () => {
  assert.throws(
    () =>
      loadConfig({
        ...validOracleEnv,
        NODE_ENV: 'production',
        // AUTH_TOKEN ausente → cai no default 'change-me'.
      }),
    /AUTH_TOKEN must be set to a real secret in production/,
  );

  // Explícito 'change-me' também é recusado.
  assert.throws(
    () =>
      loadConfig({
        ...validOracleEnv,
        NODE_ENV: 'production',
        AUTH_TOKEN: 'change-me',
      }),
    /AUTH_TOKEN must be set to a real secret in production/,
  );

  // Um token real passa.
  const config = loadConfig({
    ...validOracleEnv,
    NODE_ENV: 'production',
    AUTH_TOKEN: 'a-real-production-secret',
  });
  assert.equal(config.authToken, 'a-real-production-secret');

  // Com AUTH_ENABLED=false o guarda não se aplica — auth está desligada de propósito.
  const authDisabled = loadConfig({
    ...validOracleEnv,
    NODE_ENV: 'production',
    AUTH_ENABLED: 'false',
  });
  assert.equal(authDisabled.authToken, 'change-me');
});

test('loadConfig monta o database Oracle a partir das variáveis ORACLE_*', () => {
  const config = loadConfig({
    ...validOracleEnv,
    ORACLE_POOL_MIN: '1',
    ORACLE_POOL_MAX: '8',
    ORACLE_POOL_TIMEOUT_SECONDS: '30',
    ORACLE_POOL_PING_INTERVAL_SECONDS: '45',
  });

  assert.equal(config.database.provider, 'oracle');
  assert.equal(config.database.connectString, 'oracle.example:1521/NEXUS');
  assert.equal(config.database.user, 'nexus_runtime');
  assert.equal(config.database.password, 'secret-from-environment');
  assert.equal(config.database.objectPrefix, 'NEXUS_DEV_');
  assert.equal(config.database.pool.min, 1);
  assert.equal(config.database.pool.max, 8);
  // Timeouts arrive in seconds and are stored as milliseconds.
  assert.equal(config.database.pool.queueTimeoutMs, 30_000);
  assert.equal(config.database.pool.pingIntervalSeconds, 45);
});

test('resolveDatabaseConfig exige ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD', () => {
  assert.throws(
    () =>
      resolveDatabaseConfig({
        ORACLE_USER: 'nexus_runtime',
        ORACLE_PASSWORD: 'secret',
        ORACLE_OBJECT_PREFIX: 'NEXUS_DEV_',
      }),
    /ORACLE_CONNECTION_STRING must be set/,
  );
  assert.throws(
    () =>
      resolveDatabaseConfig({
        ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
        ORACLE_PASSWORD: 'secret',
        ORACLE_OBJECT_PREFIX: 'NEXUS_DEV_',
      }),
    /ORACLE_USER must be set/,
  );
  assert.throws(
    () =>
      resolveDatabaseConfig({
        ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
        ORACLE_USER: 'nexus_runtime',
        ORACLE_OBJECT_PREFIX: 'NEXUS_DEV_',
      }),
    /ORACLE_PASSWORD must be set/,
  );
});

test('resolveDatabaseConfig retorna o shape esperado com todas as variáveis presentes', () => {
  const config = resolveDatabaseConfig(validOracleEnv);

  assert.deepEqual(config, {
    provider: 'oracle',
    connectString: 'oracle.example:1521/NEXUS',
    user: 'nexus_runtime',
    password: 'secret-from-environment',
    objectPrefix: 'NEXUS_DEV_',
    pool: {
      min: 1,
      max: 5,
      increment: 1,
      queueTimeoutMs: 30_000,
      connectionTimeoutMs: 30_000,
      pingIntervalSeconds: 30,
    },
  });
});

test('resolveDatabaseConfig exige ORACLE_OBJECT_PREFIX e valida o formato', () => {
  assert.throws(
    () =>
      resolveDatabaseConfig({
        ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
        ORACLE_USER: 'nexus_runtime',
        ORACLE_PASSWORD: 'secret',
      }),
    /ORACLE_OBJECT_PREFIX must be set/,
  );

  // Sem underscore final.
  assert.throws(
    () =>
      resolveDatabaseConfig({
        ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
        ORACLE_USER: 'nexus_runtime',
        ORACLE_PASSWORD: 'secret',
        ORACLE_OBJECT_PREFIX: 'NEXUS_DEV',
      }),
    /ORACLE_OBJECT_PREFIX must match/,
  );

  // Começando com dígito.
  assert.throws(
    () =>
      resolveDatabaseConfig({
        ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
        ORACLE_USER: 'nexus_runtime',
        ORACLE_PASSWORD: 'secret',
        ORACLE_OBJECT_PREFIX: '1NEXUS_',
      }),
    /ORACLE_OBJECT_PREFIX must match/,
  );

  // Prefixo válido passa.
  const config = resolveDatabaseConfig({
    ORACLE_CONNECTION_STRING: 'oracle.example:1521/NEXUS',
    ORACLE_USER: 'nexus_runtime',
    ORACLE_PASSWORD: 'secret',
    ORACLE_OBJECT_PREFIX: 'NEXUS_TEST_',
  });
  assert.equal(config.objectPrefix, 'NEXUS_TEST_');
});

test('resolveDatabaseConfig aceita DATABASE_POOL_* como fallback de ORACLE_POOL_*', () => {
  const config = resolveDatabaseConfig({
    ...validOracleEnv,
    DATABASE_POOL_MIN: '2',
    DATABASE_POOL_MAX: '9',
    DATABASE_POOL_INCREMENT: '3',
  });

  assert.equal(config.pool.min, 2);
  assert.equal(config.pool.max, 9);
  assert.equal(config.pool.increment, 3);
});

test('resolveDatabaseConfig prioriza ORACLE_POOL_* sobre DATABASE_POOL_*', () => {
  const config = resolveDatabaseConfig({
    ...validOracleEnv,
    ORACLE_POOL_MIN: '4',
    DATABASE_POOL_MIN: '2',
  });

  assert.equal(config.pool.min, 4);
});

test('resolveDatabaseConfig rejeita ORACLE_POOL_MAX menor que ORACLE_POOL_MIN', () => {
  assert.throws(
    () =>
      resolveDatabaseConfig({
        ...validOracleEnv,
        ORACLE_POOL_MIN: '5',
        ORACLE_POOL_MAX: '2',
      }),
    /ORACLE_POOL_MAX must be greater than or equal to ORACLE_POOL_MIN/,
  );
});
