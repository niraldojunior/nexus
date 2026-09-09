import type { OracleConfig } from '../config/env.js';
import type { DatabaseClient } from './database-client.js';
import { OracleDatabase } from './oracle-database.js';

export const createDatabaseClient = (config: OracleConfig): DatabaseClient =>
  new OracleDatabase({
    connectString: config.connectString,
    user: config.user,
    password: config.password,
    pool: config.pool,
    objectPrefix: config.objectPrefix,
  });
