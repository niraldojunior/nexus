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
    databaseUrl: env.DATABASE_URL ?? 'sqlite://./data/nexus.db',
    logLevel,
    nodeEnv,
    port: normalizePort(env.PORT, 3000),
  };
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
