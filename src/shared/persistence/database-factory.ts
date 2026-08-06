import type { AppDatabaseConfig } from '../config/env.js';
import type { DatabaseClient } from './database-client.js';
import { OracleDatabase } from './oracle-database.js';
import { PostgresDatabase } from './postgres-database.js';

export const createDatabaseClient = (config: AppDatabaseConfig): DatabaseClient => {
  if (config.provider === 'oracle') {
    return new OracleDatabase({
      connectString: config.connectString,
      user: config.user,
      password: config.password,
      pool: config.pool,
    });
  }
  return PostgresDatabase.getInstance(config.url, config.pool);
};
