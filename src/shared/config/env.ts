export type AppConfig = {
  appName: string;
  authEnabled: boolean;
  authToken: string;
  databaseUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
};

const validLogLevels = new Set(['debug', 'info', 'warn', 'error'] as const);
const validEnvs = new Set(['development', 'test', 'production'] as const);

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const nodeEnv = normalizeEnum(env.NODE_ENV, validEnvs, 'development');
  const logLevel = normalizeEnum(env.LOG_LEVEL, validLogLevels, 'info');

  return {
    appName: env.APP_NAME ?? 'v-tal-nexus',
    authEnabled: normalizeBoolean(env.AUTH_ENABLED, true),
    authToken: env.AUTH_TOKEN ?? 'change-me',
    databaseUrl: resolveDatabaseUrl(env, nodeEnv),
    logLevel,
    nodeEnv,
    port: normalizePort(env.PORT, 4001),
  };
};

export const isPostgresDatabaseUrl = (value: string | undefined): value is string =>
  typeof value === 'string' && (value.startsWith('postgres://') || value.startsWith('postgresql://'));

export const resolveDatabaseUrl = (env: NodeJS.ProcessEnv, nodeEnv: AppConfig['nodeEnv']): string => {
  if (env.DATABASE_URL) {
    return assertPostgresUrl(env.DATABASE_URL, 'DATABASE_URL');
  }

  if (env.VERCEL_ENV === 'production') {
    return requirePostgresUrl(env.DATABASE_URL_PROD ?? env.NEON_DATABASE_URL_PROD, 'DATABASE_URL_PROD');
  }

  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') {
    return requirePostgresUrl(env.DATABASE_URL_DEV ?? env.NEON_DATABASE_URL_DEV, 'DATABASE_URL_DEV');
  }

  if (nodeEnv === 'production') {
    return requirePostgresUrl(env.DATABASE_URL_PROD ?? env.NEON_DATABASE_URL_PROD, 'DATABASE_URL_PROD');
  }

  return requirePostgresUrl(env.DATABASE_URL_TEST ?? env.NEON_DATABASE_URL_TEST ?? env.DATABASE_URL_DEV ?? env.NEON_DATABASE_URL_DEV, 'DATABASE_URL_DEV');
};

const requirePostgresUrl = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`${name} must be set to a postgres:// or postgresql:// Neon connection string.`);
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

const normalizeEnum = <T extends string>(
  value: string | undefined,
  accepted: Set<T>,
  fallback: T,
): T => {
  if (!value) return fallback;
  return accepted.has(value as T) ? (value as T) : fallback;
};
