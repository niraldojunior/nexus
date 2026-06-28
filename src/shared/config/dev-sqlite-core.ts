import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const buildDevSqliteRuntimeEnv = (baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...baseEnv,
  NODE_ENV: baseEnv.NODE_ENV || 'development',
  DATABASE_URL: baseEnv.DATABASE_URL || 'sqlite://./data/nexus.db',
});

export const ensureDevSqliteDataDir = (cwd: string): string => {
  const dataDir = resolve(cwd, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
};
