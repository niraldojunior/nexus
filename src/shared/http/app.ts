import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { forbiddenError, unauthorizedError } from '../errors/http-errors.js';
import type { Logger } from '../logging/logger.js';
import { InMemoryEntityRepository } from '../persistence/in-memory-entity-repository.js';
import { SqliteDatabase } from '../persistence/sqlite-database.js';
import { SqliteUserRepository } from '../persistence/sqlite-user-repository.js';
import { SqliteSearchRepository } from '../persistence/sqlite-search-repository.js';
import { GeoService } from '../../modules/geo/service.js';
import { SqliteGeoRepository } from '../../modules/geo/sqlite-repository.js';
import { SearchService } from '../../modules/search/service.js';
import { SqliteSearchRepository as SqliteResearchRepository } from '../../modules/search/sqlite-repository.js';
import { ChatGPTProvider } from '../../modules/search/chatgpt-provider.js';

type AppDependencies = {
  config: AppConfig;
  logger: Logger;
};

export const createApp = ({ config, logger }: AppDependencies) => {
  const repository = new InMemoryEntityRepository();
  const db = SqliteDatabase.getInstance();

  const server = createServer((request, response) => {
    void routeRequest({ 
      request, 
      response, 
      config, 
      logger, 
      repository, 
      db,
    }).catch((error: unknown) =>
      handleError({ error, logger, response }),
    );
  });

  return {
    start: async (): Promise<number> => {
      // Initialize database and create default user
      await db.initialize();
      const userRepository = new SqliteUserRepository(db);
      const searchRepository = new SqliteSearchRepository(db);
      
      // Create or get default user
      let defaultUser = userRepository.getByExternalId('VT158145');
      if (!defaultUser) {
        defaultUser = userRepository.create({
          externalId: 'VT158145',
          name: 'NIRALDO ROCHA GRANADO JUNIOR',
        });
        logger.info({ userId: defaultUser.id, externalId: defaultUser.externalId }, 'default user created');
      }

      const port = await new Promise<number>((resolve) => {
        server.listen(config.port, () => {
          const address = server.address();
          const resolvedPort = typeof address === 'object' && address ? address.port : config.port;
          logger.info({ port: config.port, appName: config.appName }, 'server started');
          resolve(resolvedPort);
        });
      });
      return port;
    },
    stop: async (): Promise<void> => {
      db.close();
      SqliteDatabase.resetForTesting();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

type RouteDependencies = AppDependencies & {
  request: IncomingMessage;
  response: ServerResponse;
  repository: InMemoryEntityRepository;
  db: SqliteDatabase;
};

const routeRequest = async ({
  request,
  response,
  config,
  logger,
  repository,
  db,
}: RouteDependencies): Promise<void> => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  // Create repositories (they depend on db being initialized)
  const userRepository = new SqliteUserRepository(db);
  const searchRepository = new SqliteSearchRepository(db);
  const geoRepository = new SqliteGeoRepository(db);
  const geoService = new GeoService(geoRepository);

  // Get or create default user for the session
  let defaultUser = userRepository.getByExternalId('VT158145');
  if (!defaultUser) {
    defaultUser = userRepository.create({
      externalId: 'VT158145',
      name: 'NIRALDO ROCHA GRANADO JUNIOR',
    });
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      status: 'ok',
      appName: config.appName,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/app')) {
    sendHtml(response, buildLegacyUiNoticeHtml(config.appName));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/bootstrap') {
    ensureAuthorized(request, config);
    const count = repository.count();
    sendJson(response, 200, { status: 'ready', entities: count });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/bootstrap/entities') {
    ensureAuthorized(request, config);
    const body = await readBody(request);
    const label = typeof body.label === 'string' ? body.label : 'untitled';
    const entity = repository.create({ label });
    logger.info({ entityId: entity.id }, 'bootstrap entity created');
    sendJson(response, 201, entity);
    return;
  }

  // Users API
  if (request.method === 'GET' && url.pathname === '/v1/users') {
    ensureAuthorized(request, config);
    const users = userRepository.list();
    sendJson(response, 200, users);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/users') {
    ensureAuthorized(request, config);
    const body = await readBody(request);
    const email = body.email ? String(body.email) : undefined;
    const user = userRepository.create({
      externalId: String(body.externalId),
      name: String(body.name),
      ...(email ? { email } : {}),
    });
    logger.info({ userId: user.id, externalId: user.externalId }, 'user created');
    sendJson(response, 201, user);
    return;
  }

  const userIdMatch = url.pathname.match(/^\/v1\/users\/([^/]+)$/);
  if (userIdMatch && userIdMatch[1]) {
    const userId = userIdMatch[1];
    if (request.method === 'GET') {
      ensureAuthorized(request, config);
      const user = userRepository.getById(userId);
      if (!user) {
        throw new AppError('user not found', { code: 'USER_NOT_FOUND', statusCode: 404 });
      }
      sendJson(response, 200, user);
      return;
    }

    if (request.method === 'PUT') {
      ensureAuthorized(request, config);
      const body = await readBody(request);
      const email = body.email ? String(body.email) : undefined;
      const user = userRepository.update(userId, {
        ...(body.name ? { name: String(body.name) } : {}),
        ...(email ? { email } : {}),
      });
      if (!user) {
        throw new AppError('user not found', { code: 'USER_NOT_FOUND', statusCode: 404 });
      }
      logger.info({ userId: user.id }, 'user updated');
      sendJson(response, 200, user);
      return;
    }

    if (request.method === 'DELETE') {
      ensureAuthorized(request, config);
      const deleted = userRepository.delete(userId);
      if (!deleted) {
        throw new AppError('user not found', { code: 'USER_NOT_FOUND', statusCode: 404 });
      }
      logger.info({ userId }, 'user deleted');
      sendJson(response, 204, null);
      return;
    }
  }

  // Searches API
  if (request.method === 'GET' && url.pathname === '/v1/searches') {
    ensureAuthorized(request, config);
    const searches = searchRepository.list();
    sendJson(response, 200, searches);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/searches/my') {
    ensureAuthorized(request, config);
    const searches = searchRepository.listByUserId(defaultUser.id);
    sendJson(response, 200, searches);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/searches') {
    ensureAuthorized(request, config);
    const body = await readBody(request);
    const filters = body.filters ? (body.filters as Record<string, any>) : undefined;
    const results = body.results ? (body.results as Record<string, any>) : undefined;
    const search = searchRepository.create({
      userId: defaultUser.id,
      query: String(body.query),
      ...(filters ? { filters } : {}),
      ...(results ? { results } : {}),
    });
    logger.info({ searchId: search.id, userId: defaultUser.id }, 'search created');
    sendJson(response, 201, search);
    return;
  }

  const searchIdMatch = url.pathname.match(/^\/v1\/searches\/([^/]+)$/);
  if (searchIdMatch && searchIdMatch[1]) {
    const searchId = searchIdMatch[1];
    if (request.method === 'GET') {
      ensureAuthorized(request, config);
      const search = searchRepository.getById(searchId);
      if (!search) {
        throw new AppError('search not found', { code: 'SEARCH_NOT_FOUND', statusCode: 404 });
      }
      sendJson(response, 200, search);
      return;
    }

    if (request.method === 'PUT') {
      ensureAuthorized(request, config);
      const body = await readBody(request);
      const filters = body.filters ? (body.filters as Record<string, any>) : undefined;
      const results = body.results ? (body.results as Record<string, any>) : undefined;
      const search = searchRepository.update(searchId, {
        userId: defaultUser.id,
        ...(body.query ? { query: String(body.query) } : {}),
        ...(filters ? { filters } : {}),
        ...(results ? { results } : {}),
      });
      if (!search) {
        throw new AppError('search not found', { code: 'SEARCH_NOT_FOUND', statusCode: 404 });
      }
      logger.info({ searchId: search.id }, 'search updated');
      sendJson(response, 200, search);
      return;
    }

    if (request.method === 'DELETE') {
      ensureAuthorized(request, config);
      const deleted = searchRepository.delete(searchId);
      if (!deleted) {
        throw new AppError('search not found', { code: 'SEARCH_NOT_FOUND', statusCode: 404 });
      }
      logger.info({ searchId }, 'search deleted');
      sendJson(response, 204, null);
      return;
    }
  }

  if (url.pathname.startsWith('/v1/geo/') || url.pathname.startsWith('/tmf-api/')) {
    await routeGeoRequest({ request, response, config, geoService, url });
    return;
  }

  if (url.pathname.startsWith('/v1/research/')) {
    await routeResearchRequest({ 
      request, 
      response, 
      config, 
      defaultUser,
      url,
    });
    return;
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const routeGeoRequest = async ({
  request,
  response,
  config,
  geoService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  geoService: GeoService;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);

  if (request.method === 'POST' && url.pathname === '/v1/geo/workspace/site-at-address') {
    const body = await readBody(request);
    return sendJson(response, 201, geoService.createSiteAtAddress(body as any));
  }

  const eventsMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/events$/);
  if (eventsMatch && request.method === 'GET') {
    return sendJson(response, 200, geoService.listSiteEvents(decodeURIComponent(eventsMatch[1] ?? '')));
  }

  const relationshipMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/relationships$/);
  if (relationshipMatch && request.method === 'POST') {
    const body = await readBody(request);
    const siteId = decodeURIComponent(relationshipMatch[1] ?? '');
    return sendJson(
      response,
      201,
      geoService.addSiteRelationship(
        siteId,
        String(body.relatedSiteId ?? body.id ?? ''),
        String(body.relationshipType ?? ''),
        body.validFor as { startDateTime?: string; endDateTime?: string } | undefined,
      ),
    );
  }

  const route = resolveGeoEntityRoute(url.pathname);
  if (!route) throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });

  if (route.resource === 'locations') {
    if (!route.id && request.method === 'GET') return sendJson(response, 200, geoService.listLocations());
    if (!route.id && request.method === 'POST') return sendJson(response, 201, geoService.createLocation(await readBody(request) as any));
    if (route.id && request.method === 'GET') return sendJsonOrNotFound(response, geoService.getLocation(route.id), 'GEO_LOCATION_NOT_FOUND');
    if (route.id && request.method === 'PATCH') return sendJson(response, 200, geoService.updateLocation(route.id, await readBody(request) as any));
  }

  if (route.resource === 'addresses') {
    if (!route.id && request.method === 'GET') return sendJson(response, 200, geoService.listAddresses());
    if (!route.id && request.method === 'POST') return sendJson(response, 201, geoService.createAddress(await readBody(request) as any));
    if (route.id && request.method === 'GET') return sendJsonOrNotFound(response, geoService.getAddress(route.id), 'GEO_ADDRESS_NOT_FOUND');
    if (route.id && request.method === 'PATCH') return sendJson(response, 200, geoService.updateAddress(route.id, await readBody(request) as any));
  }

  if (route.resource === 'site-specifications') {
    if (!route.id && request.method === 'GET') return sendJson(response, 200, geoService.listSpecs());
    if (!route.id && request.method === 'POST') return sendJson(response, 201, geoService.createSpec(await readBody(request) as any));
    if (route.id && request.method === 'GET') return sendJsonOrNotFound(response, geoService.getSpec(route.id), 'GEO_SPEC_NOT_FOUND');
    if (route.id && request.method === 'PATCH') return sendJson(response, 200, geoService.updateSpec(route.id, await readBody(request) as any));
  }

  if (route.resource === 'sites') {
    if (!route.id && request.method === 'GET') return sendJson(response, 200, geoService.listSites());
    if (!route.id && request.method === 'POST') return sendJson(response, 201, geoService.createSite(await readBody(request) as any));
    if (route.id && request.method === 'GET') return sendJsonOrNotFound(response, geoService.getSite(route.id), 'GEO_SITE_NOT_FOUND');
    if (route.id && request.method === 'PATCH') return sendJson(response, 200, geoService.updateSite(route.id, await readBody(request) as any));
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

type GeoEntityRoute = {
  resource: 'locations' | 'addresses' | 'site-specifications' | 'sites';
  id?: string;
};

const resolveGeoEntityRoute = (pathname: string): GeoEntityRoute | undefined => {
  const v1Match = pathname.match(/^\/v1\/geo\/(locations|addresses|site-specifications|sites)(?:\/([^/]+))?$/);
  if (v1Match) {
    return {
      resource: v1Match[1] as GeoEntityRoute['resource'],
      ...(v1Match[2] ? { id: decodeURIComponent(v1Match[2]) } : {}),
    };
  }

  const tmfRoutes: Array<{ path: string; resource: GeoEntityRoute['resource'] }> = [
    { path: '/tmf-api/geographicLocationManagement/v4/geographicLocation', resource: 'locations' },
    { path: '/tmf-api/geographicAddressManagement/v4/geographicAddress', resource: 'addresses' },
    { path: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification', resource: 'site-specifications' },
    { path: '/tmf-api/geographicSiteManagement/v4/geographicSite', resource: 'sites' },
  ];

  for (const route of tmfRoutes) {
    if (pathname === route.path) return { resource: route.resource };
    if (pathname.startsWith(`${route.path}/`)) {
      const id = pathname.slice(route.path.length + 1);
      if (id && !id.includes('/')) return { resource: route.resource, id: decodeURIComponent(id) };
    }
  }

  return undefined;
};

const routeResearchRequest = async ({
  request,
  response,
  config,
  defaultUser,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  defaultUser: any;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);
  
  const db = SqliteDatabase.getInstance();
  const researchRepository = new SqliteResearchRepository(db);
  const searchService = new SearchService(researchRepository);
  
  // Initialize ChatGPT provider
  const apiKey = process.env.OPENAI_API_KEY;
  const chatGptProvider = apiKey ? new ChatGPTProvider(apiKey) : null;

  // GET /v1/research/sessions - List user's sessions
  if (request.method === 'GET' && url.pathname === '/v1/research/sessions') {
    const sessions = searchService.listUserSessions(defaultUser.id);
    return sendJson(response, 200, sessions);
  }

  // POST /v1/research/sessions - Create new session
  if (request.method === 'POST' && url.pathname === '/v1/research/sessions') {
    const body = await readBody(request);
    const sessionInput: any = {
      title: (body.title || 'New Chat') as string,
      model: (body.model || 'gpt-4') as string,
    };

    if (body.description !== undefined) {
      sessionInput.description = body.description as string;
    }
    if (body.context !== undefined) {
      sessionInput.context = body.context as string;
    }
    if (body.temperature !== undefined) {
      sessionInput.temperature = Number(body.temperature);
    }
    if (body.maxTokens !== undefined) {
      sessionInput.maxTokens = Number(body.maxTokens);
    }

    const session = searchService.createSession(defaultUser.id, sessionInput);
    return sendJson(response, 201, session);
  }

  // GET /v1/research/sessions/:id - Get session with messages
  if (request.method === 'GET' && url.pathname.startsWith('/v1/research/sessions/')) {
    const sessionId = url.pathname.split('/').pop();
    if (!sessionId) throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });
    const session = searchService.getSession(sessionId);
    if (!session) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    return sendJson(response, 200, session);
  }

  // POST /v1/research/sessions/:id/messages - Send message and get LLM response
  if (request.method === 'POST' && url.pathname.includes('/messages')) {
    if (!chatGptProvider) {
      throw new AppError('ChatGPT not configured', { code: 'OPENAI_NOT_CONFIGURED', statusCode: 503 });
    }

    const sessionId = url.pathname.split('/')[4]; // /v1/research/sessions/{id}/messages
    if (!sessionId) throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });

    const body = await readBody(request);
    const userMessage = body.message as string;
    if (!userMessage) throw new AppError('message required', { code: 'INVALID_MESSAGE', statusCode: 400 });

    const session = searchService.getSession(sessionId);
    if (!session) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });

    const { userMessage: userMsg, assistantMessage } = await searchService.addMessageAndGetResponse(
      sessionId,
      userMessage,
      (context, messages, userMsg) =>
        chatGptProvider.call(
          context,
          messages,
          userMsg,
          session.model,
          session.temperature,
          session.maxTokens,
        ),
    );

    return sendJson(response, 201, {
      userMessage: userMsg,
      assistantMessage,
    });
  }

  // PUT /v1/research/sessions/:id - Update session title
  if (request.method === 'PUT' && url.pathname.startsWith('/v1/research/sessions/') && !url.pathname.includes('/messages')) {
    const sessionId = url.pathname.split('/').pop();
    if (!sessionId) throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });
    
    const body = await readBody(request);
    const updated = searchService.updateSessionTitle(sessionId, (body.title || 'Untitled') as string);
    if (!updated) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    return sendJson(response, 200, updated);
  }

  // DELETE /v1/research/sessions/:id - Archive session
  if (request.method === 'DELETE' && url.pathname.startsWith('/v1/research/sessions/')) {
    const sessionId = url.pathname.split('/').pop();
    if (!sessionId) throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });
    
    const archived = searchService.archiveSession(sessionId);
    if (!archived) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    return sendJson(response, 200, archived);
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const ensureAuthorized = (request: IncomingMessage, config: AppConfig): void => {
  if (!config.authEnabled) return;
  const header = request.headers.authorization;
  if (!header) throw unauthorizedError();
  if (header !== `Bearer ${config.authToken}`) throw forbiddenError();
};

const readBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AppError('invalid JSON payload', { code: 'INVALID_JSON', statusCode: 400 });
  }
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const sendJsonOrNotFound = (
  response: ServerResponse,
  payload: unknown,
  code: string,
): void => {
  if (!payload) {
    throw new AppError('entity not found', { code, statusCode: 404 });
  }
  sendJson(response, 200, payload);
};

const sendHtml = (response: ServerResponse, html: string): void => {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(html);
};

const buildLegacyUiNoticeHtml = (appName: string): string => `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(appName)} - Nexus</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #e5e7eb; color: #1f2328; }
      main { max-width: 720px; margin: 10vh auto; background: #fff; border: 1px solid #d8dce2; border-radius: 18px; padding: 32px; box-shadow: 0 1px 2px rgba(24,25,25,.08),0 6px 18px rgba(24,25,25,.06); }
      h1 { margin-top: 0; font-size: 32px; }
      a { color: #0f766e; font-weight: 700; }
      p { line-height: 1.6; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Interface migrada para Vite</h1>
      <p>A interface grÃ¡fica principal agora vive em <code>web/</code>.</p>
      <p>Use <code>npm run start</code> para abrir a nova camada web ou <code>npm run web:dev</code> para desenvolvimento.</p>
      <p>O backend continua disponÃ­vel para APIs e rotas de negÃ³cio. A UI antiga foi descontinuada nesta entrada.</p>
      <p><a href="/">Recarregar</a></p>
    </main>
  </body>
</html>`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

const handleError = ({
  error,
  logger,
  response,
}: {
  error: unknown;
  logger: Logger;
  response: ServerResponse;
}): void => {
  if (error instanceof AppError) {
    logger.warn({ code: error.code, message: error.message }, 'request rejected');
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
    });
    return;
  }

  logger.error({ error }, 'unexpected error');
  sendJson(response, 500, {
    error: 'INTERNAL_SERVER_ERROR',
    message: 'unexpected error',
  });
};
