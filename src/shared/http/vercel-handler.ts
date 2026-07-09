import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../config/env.js';
import { handleHttpError, handleHttpRequest } from './app.js';
import { createLogger } from '../logging/logger.js';
import { InMemoryEntityRepository } from '../persistence/in-memory-entity-repository.js';
import { SqliteDatabase } from '../persistence/sqlite-database.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const appConfig = loadConfig(process.env);
const logger = createLogger(appConfig.logLevel);
const repository = new InMemoryEntityRepository();
const db = SqliteDatabase.getInstance(appConfig.databaseUrl);
const initialized = db.initialize();

export const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  await initialized;
  request.url = normalizeRequestUrl(request.url ?? '/');

  try {
    await handleHttpRequest({
      request,
      response,
      config: appConfig,
      logger,
      repository,
      db,
    });
  } catch (error) {
    handleHttpError({ error, logger, response });
  }
};

export const normalizeRequestUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl, 'http://localhost');
  const pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return `${pathname}${url.search}`;
};
