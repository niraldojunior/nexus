import type { IncomingMessage, ServerResponse } from 'node:http';
import { databaseConfigOf, loadConfig } from '../config/env.js';
import { handleHttpError, handleHttpRequest, runtimeOptionsFromConfig } from './app.js';
import { createLogger } from '../logging/logger.js';
import { InMemoryEntityRepository } from '../persistence/in-memory-entity-repository.js';
import { createDatabaseClient } from '../persistence/database-factory.js';
import { createNexusRuntime, type NexusRuntime } from '../runtime/nexus-runtime.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const appConfig = loadConfig(process.env);
const logger = createLogger(appConfig.logLevel);
const repository = new InMemoryEntityRepository();
const db = createDatabaseClient(databaseConfigOf(appConfig));
const initialized = db.initialize();
// Build the runtime once per cold start and reuse it; building it per request runs the
// repository seeds (many DB round-trips) on every invocation.
let runtimePromise: Promise<NexusRuntime> | null = null;

export const handler = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  await initialized;
  // As opções de auth precisam vir da config: sem elas o AuthService do runtime fica sem
  // jwtSecret (todo login vira 503 AUTH_NOT_CONFIGURED) e o admin semente nunca é criado.
  runtimePromise ??= createNexusRuntime(db, runtimeOptionsFromConfig(appConfig));
  const runtime = await runtimePromise;
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
    const forwardedParams = new URLSearchParams(routedUrl.search);
    for (const [key, value] of url.searchParams) {
      if (key !== '__nexusPath') forwardedParams.append(key, value);
    }
    const forwardedSearch = forwardedParams.toString();
    return `${routedUrl.pathname}${forwardedSearch ? `?${forwardedSearch}` : ''}`;
  }

  const pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return `${pathname}${url.search}`;
};
