import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../config/env.js';
import { handleHttpError, handleHttpRequest } from './app.js';
import { createLogger } from '../logging/logger.js';
import { InMemoryEntityRepository } from '../persistence/in-memory-entity-repository.js';
import { SqliteDatabase } from '../persistence/sqlite-database.js';
import { createNexusRuntime, type NexusRuntime } from '../runtime/nexus-runtime.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const appConfig = loadConfig(process.env);
const logger = createLogger(appConfig.logLevel);
const repository = new InMemoryEntityRepository();
const db = SqliteDatabase.getInstance(appConfig.databaseUrl);
const initialized = db.initialize();
// Build the runtime once per cold start and reuse it; building it per request runs the
// repository seeds (many DB round-trips) on every invocation.
let runtime: NexusRuntime | null = null;

export const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  await initialized;
  runtime ??= createNexusRuntime(db);
  request.url = normalizeRequestUrl(request.url ?? '/');

  try {
    await handleHttpRequest({
      request,
      response,
      config: appConfig,
      logger,
      repository,
      db,
      runtime,
    });
  } catch (error) {
    handleHttpError({ error, logger, response });
  }
};

export const normalizeRequestUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl, 'http://localhost');
  const routedPath = url.searchParams.get('__nexusPath');
  if (routedPath) {
    const routedUrl = new URL(routedPath, 'http://localhost');
    return `${routedUrl.pathname}${routedUrl.search}`;
  }

  const pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return `${pathname}${url.search}`;
};
