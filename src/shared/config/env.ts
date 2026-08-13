import type { DatabasePoolConfig, DatabaseProvider } from '../persistence/database-client.js';

export type PostgresConfig = {
  provider: 'postgres';
  url: string;
  pool: DatabasePoolConfig;
};

export type OracleConfig = {
  provider: 'oracle';
  connectString: string;
  user: string;
  password: string;
  pool: DatabasePoolConfig;
  /**
   * Prefix prepended to every database object (tables, indexes, constraints). The corporate Oracle
   * instance hosts DEV/HML/PRD in a single schema, so environments are distinguished by this prefix
   * (`NEXUS_DEV_`, `NEXUS_HML_`, `NEXUS_PRD_`, `NEXUS_TEST_`). Validated to end with `_`.
   */
  objectPrefix: string;
};

export type AppDatabaseConfig = PostgresConfig | OracleConfig;

export type GeonetConfig = {
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  companyId?: string;
  scope: string;
  timeoutMs: number;
};

export type AppConfig = {
  appName: string;
  authEnabled: boolean;
  authToken: string;
  authJwtAudience?: string;
  authJwtIssuer?: string;
  authJwtSecret?: string;
  authJwksJson?: string;
  authJwksUrl?: string;
  /** Admin semente criado no bootstrap do runtime (idempotente). */
  adminEmail?: string;
  adminPassword?: string;
  /** TTL do access token emitido pelo IdP local, em horas (default 12). */
  authAccessTokenTtlHours?: number;
  geonet?: GeonetConfig;
  databaseUrl: string;
  /** Resolved by loadConfig; optional only for legacy programmatic test fixtures. */
  database?: AppDatabaseConfig;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
};

export const databaseConfigOf = (config: AppConfig): AppDatabaseConfig =>
  config.database ?? {
    provider: 'postgres',
    url: config.databaseUrl,
    pool: {
      min: 2,
      max: 10,
      increment: 1,
      queueTimeoutMs: 2_000,
      connectionTimeoutMs: 15_000,
    },
  };

const validLogLevels = new Set(['debug', 'info', 'warn', 'error'] as const);
const validEnvs = new Set(['development', 'test', 'production'] as const);

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const nodeEnv = normalizeEnum(env.NODE_ENV, validEnvs, 'development');
  const logLevel = normalizeEnum(env.LOG_LEVEL, validLogLevels, 'info');
  const database = resolveDatabaseConfig(env, nodeEnv);
  const geonet = geonetConfigOf(env);

  if (nodeEnv === 'production' && env.DATABASE_AUTO_SCHEMA === 'true') {
    throw new Error('DATABASE_AUTO_SCHEMA=true is not allowed in production.');
  }

  return {
    appName: env.APP_NAME ?? 'v-tal-nexus',
    authEnabled: normalizeBoolean(env.AUTH_ENABLED, true),
    authToken: env.AUTH_TOKEN ?? 'change-me',
    ...(env.AUTH_JWT_AUDIENCE ? { authJwtAudience: env.AUTH_JWT_AUDIENCE } : {}),
    ...(env.AUTH_JWT_ISSUER ? { authJwtIssuer: env.AUTH_JWT_ISSUER } : {}),
    ...(env.AUTH_JWT_SECRET ? { authJwtSecret: env.AUTH_JWT_SECRET } : {}),
    ...(env.AUTH_JWKS_JSON ? { authJwksJson: env.AUTH_JWKS_JSON } : {}),
    ...(env.AUTH_JWKS_URL ? { authJwksUrl: env.AUTH_JWKS_URL } : {}),
    ...(env.ADMIN_EMAIL ? { adminEmail: env.ADMIN_EMAIL } : {}),
    ...(env.ADMIN_PASSWORD ? { adminPassword: env.ADMIN_PASSWORD } : {}),
    authAccessTokenTtlHours: normalizePositiveInteger(env.AUTH_ACCESS_TOKEN_TTL_HOURS, 12),
    ...(geonet ? { geonet } : {}),
    databaseUrl: database.provider === 'postgres' ? database.url : database.connectString,
    database,
    logLevel,
    nodeEnv,
    port: normalizePort(env.PORT, 4001),
  };
};

export const geonetConfigOf = (env: NodeJS.ProcessEnv): GeonetConfig | undefined => {
  const apiBaseUrl = env.GEONET_API_BASE_URL?.trim();
  const tokenUrl = env.GEONET_TOKEN_URL?.trim();
  const clientId = env.GEONET_CLIENT_ID?.trim();
  const clientSecret = env.GEONET_CLIENT_SECRET?.trim();
  if (!apiBaseUrl || !tokenUrl || !clientId || !clientSecret) return undefined;
  return {
    apiBaseUrl,
    tokenUrl,
    clientId,
    clientSecret,
    ...(env.GEONET_COMPANY_ID?.trim() ? { companyId: env.GEONET_COMPANY_ID.trim() } : {}),
    scope: env.GEONET_SCOPE?.trim() || 'fttx',
    timeoutMs: normalizePositiveInteger(env.GEONET_TIMEOUT_MS, 5_000),
  };
};

export const resolveDatabaseConfig = (
  env: NodeJS.ProcessEnv,
  nodeEnv: AppConfig['nodeEnv'],
): AppDatabaseConfig => {
  const provider = normalizeDatabaseProvider(env.DATABASE_PROVIDER);
  if (provider === 'postgres') {
    return { provider, url: resolveDatabaseUrl(env, nodeEnv), pool: resolvePoolConfig(env) };
  }

  // The real instance ships `ORACLE_CONNECTION_STRING`; keep `ORACLE_CONNECT_STRING` as a fallback
  // so older .env files (and the migration script's own naming) keep working.
  const connectString = firstNonBlank(env.ORACLE_CONNECTION_STRING, env.ORACLE_CONNECT_STRING);
  return {
    provider,
    connectString: requireOracleValue(connectString, 'ORACLE_CONNECTION_STRING'),
    user: requireOracleValue(env.ORACLE_USER, 'ORACLE_USER'),
    password: requireOracleValue(env.ORACLE_PASSWORD, 'ORACLE_PASSWORD'),
    pool: resolveOraclePoolConfig(env),
    objectPrefix: resolveOracleObjectPrefix(env),
  };
};

// DEV/HML/PRD/TEST share one Oracle schema, so every object name carries this prefix. Validated to
// a leading letter, word chars, and a trailing `_` so it can be interpolated straight into SQL
// object names without escaping. Required whenever DATABASE_PROVIDER=oracle.
const resolveOracleObjectPrefix = (env: NodeJS.ProcessEnv): string => {
  const value = requireOracleValue(env.ORACLE_OBJECT_PREFIX, 'ORACLE_OBJECT_PREFIX').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*_$/.test(value)) {
    throw new Error(
      'ORACLE_OBJECT_PREFIX must match ^[A-Za-z][A-Za-z0-9_]*_$ (e.g. NEXUS_DEV_, NEXUS_TEST_).',
    );
  }
  return value;
};

// Oracle pool: ORACLE_POOL_* overrides the shared DATABASE_POOL_* defaults; timeouts arrive in
// seconds (oracledb convention) and are converted to the milliseconds the pool config carries.
const resolveOraclePoolConfig = (env: NodeJS.ProcessEnv): DatabasePoolConfig => {
  const min = normalizeNonNegativeInteger(
    firstNonBlank(env.ORACLE_POOL_MIN, env.DATABASE_POOL_MIN),
    1,
  );
  const max = normalizePositiveInteger(
    firstNonBlank(env.ORACLE_POOL_MAX, env.DATABASE_POOL_MAX),
    5,
  );
  if (max < min)
    throw new Error('ORACLE_POOL_MAX must be greater than or equal to ORACLE_POOL_MIN.');
  const timeoutSeconds = normalizePositiveInteger(env.ORACLE_POOL_TIMEOUT_SECONDS, 30);
  const timeoutMs = timeoutSeconds * 1_000;
  return {
    min,
    max,
    increment: normalizePositiveInteger(
      firstNonBlank(env.ORACLE_POOL_INCREMENT, env.DATABASE_POOL_INCREMENT),
      1,
    ),
    queueTimeoutMs: timeoutMs,
    connectionTimeoutMs: timeoutMs,
    pingIntervalSeconds: normalizeNonNegativeInteger(env.ORACLE_POOL_PING_INTERVAL_SECONDS, 30),
  };
};

const normalizeDatabaseProvider = (value: string | undefined): DatabaseProvider => {
  if (!value) return 'postgres';
  if (value === 'postgres' || value === 'oracle') return value;
  throw new Error('DATABASE_PROVIDER must be either postgres or oracle.');
};

const requireOracleValue = (value: string | undefined, name: string): string => {
  if (!value?.trim()) throw new Error(`${name} must be set when DATABASE_PROVIDER=oracle.`);
  return value;
};

const resolvePoolConfig = (env: NodeJS.ProcessEnv): DatabasePoolConfig => {
  const min = normalizeNonNegativeInteger(env.DATABASE_POOL_MIN, 2);
  const max = normalizePositiveInteger(env.DATABASE_POOL_MAX, 10);
  if (max < min)
    throw new Error('DATABASE_POOL_MAX must be greater than or equal to DATABASE_POOL_MIN.');
  return {
    min,
    max,
    increment: normalizePositiveInteger(env.DATABASE_POOL_INCREMENT, 1),
    queueTimeoutMs: normalizePositiveInteger(env.DATABASE_QUEUE_TIMEOUT_MS, 2_000),
    connectionTimeoutMs: normalizePositiveInteger(env.DATABASE_CONNECTION_TIMEOUT_MS, 15_000),
  };
};

export const isPostgresDatabaseUrl = (value: string | undefined): value is string =>
  typeof value === 'string' &&
  (value.startsWith('postgres://') || value.startsWith('postgresql://'));

export const firstNonBlank = (...values: Array<string | undefined>): string | undefined =>
  values.find((value) => value !== undefined && value.trim().length > 0);

export const resolveDatabaseUrl = (
  env: NodeJS.ProcessEnv,
  nodeEnv: AppConfig['nodeEnv'],
): string => {
  if (env.DATABASE_URL) {
    return assertPostgresUrl(env.DATABASE_URL, 'DATABASE_URL');
  }

  if (env.VERCEL_ENV === 'production') {
    return requirePostgresUrl(
      firstNonBlank(env.DATABASE_URL_PROD, env.NEON_DATABASE_URL_PROD),
      'DATABASE_URL_PROD',
    );
  }

  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') {
    return requirePostgresUrl(
      firstNonBlank(env.DATABASE_URL_DEV, env.NEON_DATABASE_URL_DEV),
      'DATABASE_URL_DEV',
    );
  }

  if (nodeEnv === 'production') {
    return requirePostgresUrl(
      firstNonBlank(env.DATABASE_URL_PROD, env.NEON_DATABASE_URL_PROD),
      'DATABASE_URL_PROD',
    );
  }

  return requirePostgresUrl(
    firstNonBlank(
      env.DATABASE_URL_TEST,
      env.NEON_DATABASE_URL_TEST,
      env.DATABASE_URL_DEV,
      env.NEON_DATABASE_URL_DEV,
    ),
    'DATABASE_URL_DEV',
  );
};

const requirePostgresUrl = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(
      `${name} must be set to a postgres:// or postgresql:// Neon connection string.`,
    );
  }
  return assertPostgresUrl(value, name);
};

const assertPostgresUrl = (value: string, name: string): string => {
  if (!isPostgresDatabaseUrl(value)) {
    throw new Error(`${name} must be a postgres:// or postgresql:// Neon connection string.`);
  }
  return value;
};

const normalizeBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const normalizePort = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`Expected a positive integer, received ${value}.`);
  return parsed;
};

const normalizeNonNegativeInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`Expected a non-negative integer, received ${value}.`);
  return parsed;
};

const normalizeEnum = <T extends string>(
  value: string | undefined,
  accepted: Set<T>,
  fallback: T,
): T => {
  if (!value) return fallback;
  return accepted.has(value as T) ? (value as T) : fallback;
};
