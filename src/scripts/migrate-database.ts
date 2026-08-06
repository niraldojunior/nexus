import { config as loadEnv } from 'dotenv';
import { databaseConfigOf, loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const client = createDatabaseClient(databaseConfigOf(config));

process.env.DATABASE_AUTO_SCHEMA = 'true';
try {
  await client.initialize();
  process.stdout.write(`Schema ${client.provider} atualizado com sucesso.\n`);
} finally {
  await client.close();
}
