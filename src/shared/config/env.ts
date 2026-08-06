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
};

export type AppDatabaseConfig = PostgresConfig | OracleConfig;

export type AppConfig = {
  appName: string;
  authEnabled: boolean;
  authToken: string;
  authJwtAudience?: string;
  authJwtIssuer?: string;
  authJwtSecret?: string;
  authJwksJson?: string;
  authJwksUrl?: string;
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
    databaseUrl: database.provider === 'postgres' ? database.url : database.connectString,
    database,
    logLevel,
    nodeEnv,
    port: normalizePort(env.PORT, 4001),
  };
};

export const resolveDatabaseConfig = (
  env: NodeJS.ProcessEnv,
  nodeEnv: AppConfig['nodeEnv'],
): AppDatabaseConfig => {
  const provider = normalizeDatabaseProvider(env.DATABASE_PROVIDER);
  const pool = resolvePoolConfig(env);
  if (provider === 'postgres') {
    return { provider, url: resolveDatabaseUrl(env, nodeEnv), pool };
  }

  return {
    provider,
    connectString: requireOracleValue(env.ORACLE_CONNECT_STRING, 'ORACLE_CONNECT_STRING'),
    user: requireOracleValue(env.ORACLE_USER, 'ORACLE_USER'),
    password: requireOracleValue(env.ORACLE_PASSWORD, 'ORACLE_PASSWORD'),
    pool,
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

export const resolveDatabaseUrl = (
  env: NodeJS.ProcessEnv,
  nodeEnv: AppConfig['nodeEnv'],
): string => {
  if (env.DATABASE_URL) {
    return assertPostgresUrl(env.DATABASE_URL, 'DATABASE_URL');
  }

  if (env.VERCEL_ENV === 'production') {
    return requirePostgresUrl(
      env.DATABASE_URL_PROD ?? env.NEON_DATABASE_URL_PROD,
      'DATABASE_URL_PROD',
    );
  }

  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') {
    return requirePostgresUrl(
      env.DATABASE_URL_DEV ?? env.NEON_DATABASE_URL_DEV,
      'DATABASE_URL_DEV',
    );
  }

  if (nodeEnv === 'production') {
    return requirePostgresUrl(
      env.DATABASE_URL_PROD ?? env.NEON_DATABASE_URL_PROD,
      'DATABASE_URL_PROD',
    );
  }

  return requirePostgresUrl(
    env.DATABASE_URL_TEST ??
      env.NEON_DATABASE_URL_TEST ??
      env.DATABASE_URL_DEV ??
      env.NEON_DATABASE_URL_DEV,
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
