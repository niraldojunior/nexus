import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const buildDevNeonRuntimeEnv = (baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...baseEnv,
  NODE_ENV: baseEnv.NODE_ENV || 'development',
  DATABASE_URL: requirePostgresDatabaseUrl(
    baseEnv.DATABASE_URL_DEV ||
    baseEnv.NEON_DATABASE_URL_DEV ||
    baseEnv.DATABASE_URL ||
    missingDevDatabaseUrl(),
  ),
});

export const ensureDevDataDir = (cwd: string): string => {
  const dataDir = resolve(cwd, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
};

const missingDevDatabaseUrl = (): never => {
  throw new Error('DATABASE_URL_DEV or NEON_DATABASE_URL_DEV must point to a Neon/Postgres database.');
};

const requirePostgresDatabaseUrl = (value: string): string => {
  if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a postgres:// or postgresql:// Neon connection string.');
  }
  return value;
};
