import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../src/shared/config/env.js';
import { handleHttpError, handleHttpRequest } from '../src/shared/http/app.js';
import { createLogger } from '../src/shared/logging/logger.js';
import { InMemoryEntityRepository } from '../src/shared/persistence/in-memory-entity-repository.js';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const appConfig = loadConfig(process.env);
const logger = createLogger(appConfig.logLevel);
const repository = new InMemoryEntityRepository();
const db = SqliteDatabase.getInstance(appConfig.databaseUrl);
const initialized = db.initialize();

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
}

export const normalizeRequestUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl, 'http://localhost');
  const pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return `${pathname}${url.search}`;
};
