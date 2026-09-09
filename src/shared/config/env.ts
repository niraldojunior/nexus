import type { DatabasePoolConfig } from '../persistence/database-client.js';

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
  /** Papéis do token estático de máquina (AUTH_TOKEN). Default (quando ausente): só
   *  `migration.job` — não `platform.admin`. Configurável via AUTH_TOKEN_ROLES para scripts/MCP
   *  que precisem de mais. Opcional só para não quebrar fixtures de teste que montam AppConfig
   *  na mão; `staticTokenRoles` em request-context.ts aplica o default. */
  authTokenRoles?: string[];
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
  /** Limite de requisições ao proxy do LLM por ator (default 20 por minuto). Configurável só
   *  para permitir um teste de integração exercitar o 429 sem depender de 20 round-trips reais. */
  llmRateLimitMax?: number;
  llmRateLimitWindowMs?: number;
  geonet?: GeonetConfig;
  /** Base URL pública prefixada em `href` das entidades TMF (ver src/shared/tmf/href.ts). Vazio por
   *  default: href fica relativo (`/tmf-api/...`), comportamento histórico. Configurar quando o
   *  Nexus é servido atrás de um gateway (Apigee) cujo host público difere do host interno. */
  tmfPublicBaseUrl?: string;
  database: OracleConfig;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
};


const validLogLevels = new Set(['debug', 'info', 'warn', 'error'] as const);
const validEnvs = new Set(['development', 'test', 'production'] as const);

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const nodeEnv = normalizeEnum(env.NODE_ENV, validEnvs, 'development');
  const logLevel = normalizeEnum(env.LOG_LEVEL, validLogLevels, 'info');
  const database = resolveDatabaseConfig(env);
  const geonet = geonetConfigOf(env);

  if (nodeEnv === 'production' && env.DATABASE_AUTO_SCHEMA === 'true') {
    throw new Error('DATABASE_AUTO_SCHEMA=true is not allowed in production.');
  }

  const authEnabled = normalizeBoolean(env.AUTH_ENABLED, true);
  const authToken = env.AUTH_TOKEN ?? 'change-me';
  if (nodeEnv === 'production' && authEnabled && authToken === 'change-me') {
    throw new Error('AUTH_TOKEN must be set to a real secret in production.');
  }

  return {
    appName: env.APP_NAME ?? 'v-tal-nexus',
    authEnabled,
    authToken,
    authTokenRoles: parseRoleList(env.AUTH_TOKEN_ROLES) ?? ['migration.job'],
    ...(env.AUTH_JWT_AUDIENCE ? { authJwtAudience: env.AUTH_JWT_AUDIENCE } : {}),
    ...(env.AUTH_JWT_ISSUER ? { authJwtIssuer: env.AUTH_JWT_ISSUER } : {}),
    ...(env.AUTH_JWT_SECRET ? { authJwtSecret: env.AUTH_JWT_SECRET } : {}),
    ...(env.AUTH_JWKS_JSON ? { authJwksJson: env.AUTH_JWKS_JSON } : {}),
    ...(env.AUTH_JWKS_URL ? { authJwksUrl: env.AUTH_JWKS_URL } : {}),
    ...(env.ADMIN_EMAIL ? { adminEmail: env.ADMIN_EMAIL } : {}),
    ...(env.ADMIN_PASSWORD ? { adminPassword: env.ADMIN_PASSWORD } : {}),
    authAccessTokenTtlHours: normalizePositiveInteger(env.AUTH_ACCESS_TOKEN_TTL_HOURS, 12),
    ...(geonet ? { geonet } : {}),
    ...(env.TMF_PUBLIC_BASE_URL?.trim()
      ? { tmfPublicBaseUrl: env.TMF_PUBLIC_BASE_URL.trim() }
      : {}),
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

export const resolveDatabaseConfig = (env: NodeJS.ProcessEnv): OracleConfig => ({
  provider: 'oracle',
  connectString: requireOracleValue(env.ORACLE_CONNECTION_STRING, 'ORACLE_CONNECTION_STRING'),
  user: requireOracleValue(env.ORACLE_USER, 'ORACLE_USER'),
  password: requireOracleValue(env.ORACLE_PASSWORD, 'ORACLE_PASSWORD'),
  pool: resolveOraclePoolConfig(env),
  objectPrefix: resolveOracleObjectPrefix(env),
});

// DEV/HML/PRD/TEST share one Oracle schema, so every object name carries this prefix. Validated to
// a leading letter, word chars, and a trailing `_` so it can be interpolated straight into SQL
// object names without escaping.
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

const requireOracleValue = (value: string | undefined, name: string): string => {
  if (!value?.trim()) throw new Error(`${name} must be set.`);
  return value;
};

const firstNonBlank = (...values: Array<string | undefined>): string | undefined =>
  values.find((value) => value !== undefined && value.trim().length > 0);

const parseRoleList = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const roles = value
    .split(/[,\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return roles.length > 0 ? [...new Set(roles)] : undefined;
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
