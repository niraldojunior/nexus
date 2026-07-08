import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { forbiddenError, unauthorizedError } from '../errors/http-errors.js';
import type { Logger } from '../logging/logger.js';
import { InMemoryEntityRepository } from '../persistence/in-memory-entity-repository.js';
import { SqliteDatabase } from '../persistence/sqlite-database.js';
import { ChatGPTProvider } from '../../modules/search/chatgpt-provider.js';
import { LocalKnowledgeProvider } from '../../modules/search/local-knowledge-provider.js';
import { prependNexusCopilotContext } from '../../modules/search/nexus-copilot-context.js';
import { createNexusMcpModule } from '../../modules/mcp/index.js';
import type { GeoService } from '../../modules/geo/service.js';
import type { OrderService } from '../../modules/order/service.js';
import { createNexusRuntime, DEFAULT_RUNTIME_USER, type NexusRuntime } from '../runtime/nexus-runtime.js';
import type { PartyService } from '../../modules/party/service.js';
import type { ResourceService } from '../../modules/resource/service.js';
import type { ServiceService } from '../../modules/service/service.js';
import type { TmfEventQuery } from '../tmf/index.js';
import type { EventService } from '../tmf/index.js';
import type { PartyQuery, PartyRoleQuery } from '../../modules/party/index.js';
import type { ResourceQuery, ResourceSpecificationQuery, ResourceFunctionSpecificationQuery } from '../../modules/resource/index.js';
import type {
  ServiceQuery,
  ServiceSpecificationQuery,
  ServiceCategoryQuery,
  ServiceCandidateQuery,
  ServiceRelationship,
} from '../../modules/service/index.js';
import type {
  ResourceOrderQuery,
  ServiceOrderQuery,
  ServiceQualificationQuery,
} from '../../modules/order/index.js';

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenAIChatRequestBody = {
  messages?: Array<Partial<OpenAIChatMessage> & { content?: unknown }>;
  model?: unknown;
  temperature?: unknown;
  max_tokens?: unknown;
};

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

type AppDependencies = {
  config: AppConfig;
  logger: Logger;
};

export const createApp = ({ config, logger }: AppDependencies) => {
  const repository = new InMemoryEntityRepository();
  const db = SqliteDatabase.getInstance(config.databaseUrl);

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
      await db.initialize();
      const runtime = createNexusRuntime(db);

      if (runtime.defaultUser.externalId === DEFAULT_RUNTIME_USER.externalId) {
        logger.info(
          { userId: runtime.defaultUser.id, externalId: runtime.defaultUser.externalId },
          'default user ready',
        );
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
  const runtime = createNexusRuntime(db);
  const {
    userRepository,
    searchRepository,
    geoService,
    eventService,
    partyService,
    resourceService,
    serviceService,
    orderService,
    defaultUser,
  } = runtime;
  const apiKey = process.env.OPENAI_API_KEY;
  const apiEndpoint = process.env.API_ENDPOINT || 'https://api.openai.com/v1';
  const chatGptProvider = apiKey ? new ChatGPTProvider(apiKey, apiEndpoint) : null;
  const localKnowledgeProvider = new LocalKnowledgeProvider();
  const mcpModule = createNexusMcpModule(runtime);

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

  // POST /v1/chat/completions - Main assistant chat proxy
  if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
    ensureAuthorized(request, config);

    const body = (await readBody(request)) as OpenAIChatRequestBody;
    const parsed = parseOpenAIChatRequest(body);
    if (!parsed) {
      throw new AppError('messages required', { code: 'INVALID_MESSAGE', statusCode: 400 });
    }

    const messages = prependNexusCopilotContext(parsed.messages);

    if (!chatGptProvider) {
      logger.warn({}, 'ChatGPT not configured; returning fallback completion');
      const fallbackCompletion = await localKnowledgeProvider.complete(messages, parsed.model);
      return sendFallbackChatCompletion(response, parsed.model, fallbackCompletion.content);
    }

    try {
      const completion = await chatGptProvider.complete(
        messages,
        parsed.model,
        parsed.temperature,
        parsed.maxTokens,
      );

      return sendJson(response, 200, {
        object: 'chat.completion',
        model: parsed.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: completion.content,
            },
            finish_reason: completion.metadata?.finish_reason ?? 'stop',
          },
        ],
        usage:
          completion.tokensUsed !== undefined
            ? {
                total_tokens: completion.tokensUsed,
              }
            : undefined,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'ChatGPT request failed; returning fallback completion');
      const fallbackCompletion = await localKnowledgeProvider.complete(messages, parsed.model);
      return sendFallbackChatCompletion(response, parsed.model, fallbackCompletion.content);
    }
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

  if (url.pathname.startsWith('/tmf-api/eventManagement/v4/event')) {
    await routeEventRequest({ request, response, config, eventService, url });
    return;
  }

  if (
    url.pathname.startsWith('/tmf-api/resourceCatalogManagement/v4/resourceSpecification') ||
    url.pathname.startsWith('/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification') ||
    url.pathname.startsWith('/tmf-api/resourceInventoryManagement/v4/resource') ||
    url.pathname.startsWith('/tmf-api/resourceFunctionActivation/v4/resourceFunction')
  ) {
    await routeResourceRequest({ request, response, config, resourceService, url });
    return;
  }

  if (
    url.pathname.startsWith('/tmf-api/serviceCatalogManagement/v4/serviceSpecification') ||
    url.pathname.startsWith('/tmf-api/serviceCatalogManagement/v4/serviceCategory') ||
    url.pathname.startsWith('/tmf-api/serviceCatalogManagement/v4/serviceCandidate') ||
    url.pathname.startsWith('/tmf-api/serviceInventoryManagement/v4/service')
  ) {
    await routeServiceRequest({ request, response, config, serviceService, url });
    return;
  }

  if (
    url.pathname.startsWith('/tmf-api/serviceQualificationManagement/v4/serviceQualification') ||
    url.pathname.startsWith('/tmf-api/serviceOrderingManagement/v4/serviceOrder') ||
    url.pathname.startsWith('/tmf-api/resourceOrderingManagement/v4/resourceOrder')
  ) {
    await routeOrderRequest({ request, response, config, orderService, url });
    return;
  }

  if (url.pathname.startsWith('/tmf-api/partyManagement/v4/party') || url.pathname.startsWith('/tmf-api/partyRoleManagement/v4/partyRole')) {
    await routePartyRequest({ request, response, config, partyService, url });
    return;
  }

  if (url.pathname.startsWith('/v1/geo/') || url.pathname.startsWith('/tmf-api/')) {
    await routeGeoRequest({ request, response, config, geoService, url });
    return;
  }

  if (url.pathname.startsWith('/v1/research/')) {
    const llmToolCatalog = buildLlmToolCatalog(mcpModule);
    await routeResearchRequest({ 
      request, 
      response, 
      config, 
      runtime,
      chatGptProvider,
      localKnowledgeProvider,
      mcpModule,
      llmToolCatalog,
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

const routeEventRequest = async ({
  request,
  response,
  config,
  eventService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  eventService: EventService;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);

  const route = resolveEventRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  if (!route.id && request.method === 'GET') {
    return sendJson(response, 200, eventService.listEvents(parseEventQuery(url.searchParams)));
  }

  if (route.id && request.method === 'GET') {
    return sendJsonOrNotFound(response, eventService.getEvent(route.id), 'TMF_EVENT_NOT_FOUND');
  }

  throw new AppError('method not allowed', { code: 'METHOD_NOT_ALLOWED', statusCode: 405 });
};

const routePartyRequest = async ({
  request,
  response,
  config,
  partyService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  partyService: PartyService;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);

  const partyRoute = resolvePartyRoute(url.pathname);
  if (partyRoute) {
    if (!partyRoute.id && request.method === 'GET') {
      return sendJson(response, 200, partyService.listParties(parsePartyQuery(url.searchParams)));
    }

    if (!partyRoute.id && request.method === 'POST') {
      return sendJson(response, 201, partyService.createParty((await readBody(request)) as any));
    }

    if (partyRoute.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, partyService.getParty(partyRoute.id), 'TMF_PARTY_NOT_FOUND');
    }

    if (partyRoute.id && request.method === 'PATCH') {
      return sendJson(response, 200, partyService.updateParty(partyRoute.id, (await readBody(request)) as any));
    }

    if (partyRoute.id && request.method === 'DELETE') {
      return sendJson(response, 200, partyService.deleteParty(partyRoute.id));
    }
  }

  const roleRoute = resolvePartyRoleRoute(url.pathname);
  if (roleRoute) {
    if (!roleRoute.id && request.method === 'GET') {
      return sendJson(response, 200, partyService.listPartyRoles(parsePartyRoleQuery(url.searchParams)));
    }

    if (!roleRoute.id && request.method === 'POST') {
      return sendJson(response, 201, partyService.createPartyRole((await readBody(request)) as any));
    }

    if (roleRoute.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, partyService.getPartyRole(roleRoute.id), 'TMF_PARTY_ROLE_NOT_FOUND');
    }

    if (roleRoute.id && request.method === 'PATCH') {
      return sendJson(response, 200, partyService.updatePartyRole(roleRoute.id, (await readBody(request)) as any));
    }

    if (roleRoute.id && request.method === 'DELETE') {
      return sendJson(response, 200, partyService.deletePartyRole(roleRoute.id));
    }
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const routeResourceRequest = async ({
  request,
  response,
  config,
  resourceService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  resourceService: ResourceService;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);

  const route = resolveResourceRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  if (route.id && (url.pathname.endsWith('/relationships') || url.pathname.includes('/relationships/'))) {
    if (request.method === 'GET' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 200, resourceService.listResourceRelationships(route.id));
    }

    if (request.method === 'POST' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 201, resourceService.addResourceRelationship(route.id, (await readBody(request)) as any));
    }

    if (request.method === 'DELETE' && route.relationshipId) {
      return sendJson(
        response,
        200,
        resourceService.removeResourceRelationship(route.id, route.relationshipId, route.relationshipType ?? 'containsAsChild'),
      );
    }
  }

  if (route.kind === 'resourceSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, resourceService.listResourceSpecifications(parseResourceSpecificationQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, resourceService.createResourceSpecification((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, resourceService.getResourceSpecification(route.id), 'RESOURCE_SPEC_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, resourceService.updateResourceSpecification(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, resourceService.deleteResourceSpecification(route.id));
    }
  }

  if (route.kind === 'resourceFunctionSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, resourceService.listResourceFunctionSpecifications(parseResourceFunctionSpecificationQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, resourceService.createResourceFunctionSpecification((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, resourceService.getResourceFunctionSpecification(route.id), 'RESOURCE_FUNCTION_SPEC_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, resourceService.updateResourceFunctionSpecification(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, resourceService.deleteResourceFunctionSpecification(route.id));
    }
  }

  if (route.kind === 'resource') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, resourceService.listResources(parseResourceQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      const body = await readBody(request);
      const resourceType = body['@type'] === 'LogicalResource' || body.supportingPhysicalResourceId ? 'LogicalResource' : 'PhysicalResource';
      return sendJson(
        response,
        201,
        resourceType === 'LogicalResource'
          ? resourceService.createLogicalResource(body as any)
          : resourceService.createPhysicalResource(body as any),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, resourceService.getResource(route.id), 'RESOURCE_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      const body = await readBody(request);
      const current = resourceService.getResource(route.id);
      if (!current) throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      return sendJson(
        response,
        200,
        current['@type'] === 'LogicalResource'
          ? resourceService.updateLogicalResource(route.id, body as any)
          : resourceService.updatePhysicalResource(route.id, body as any),
      );
    }
    if (route.id && request.method === 'DELETE') {
      const current = resourceService.getResource(route.id);
      if (!current) throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      return sendJson(
        response,
        200,
        current['@type'] === 'LogicalResource'
          ? resourceService.deleteLogicalResource(route.id)
          : resourceService.deletePhysicalResource(route.id),
      );
    }
  }

  if (route.kind === 'resourceActivation') {
    if (request.method === 'POST') {
      return sendJson(response, 200, resourceService.activateResource((await readBody(request)) as any));
    }
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const routeServiceRequest = async ({
  request,
  response,
  config,
  serviceService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  serviceService: ServiceService;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);

  const route = resolveServiceRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  if (route.id && (url.pathname.endsWith('/relationships') || url.pathname.includes('/relationships/'))) {
    if (request.method === 'GET' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 200, serviceService.listServiceRelationships(route.id));
    }

    if (request.method === 'POST' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 201, serviceService.addServiceRelationship(route.id, (await readBody(request)) as any));
    }

    if (request.method === 'DELETE' && route.relationshipId) {
      return sendJson(
        response,
        200,
        serviceService.removeServiceRelationship(route.id, route.relationshipId, route.relationshipType ?? 'dependsOn'),
      );
    }
  }

  if (route.kind === 'serviceSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, serviceService.listServiceSpecifications(parseServiceSpecificationQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, serviceService.createServiceSpecification((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, serviceService.getServiceSpecification(route.id), 'SERVICE_SPEC_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, serviceService.updateServiceSpecification(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceSpecification(route.id));
    }
  }

  if (route.kind === 'serviceCategory') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, serviceService.listServiceCategories(parseServiceCategoryQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, serviceService.createServiceCategory((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, serviceService.getServiceCategory(route.id), 'SERVICE_CATEGORY_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, serviceService.updateServiceCategory(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceCategory(route.id));
    }
  }

  if (route.kind === 'serviceCandidate') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, serviceService.listServiceCandidates(parseServiceCandidateQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, serviceService.createServiceCandidate((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, serviceService.getServiceCandidate(route.id), 'SERVICE_CANDIDATE_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, serviceService.updateServiceCandidate(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceCandidate(route.id));
    }
  }

  if (route.kind === 'service') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, serviceService.listServices(parseServiceQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, serviceService.createService((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, serviceService.getService(route.id), 'SERVICE_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, serviceService.updateService(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteService(route.id));
    }
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const routeOrderRequest = async ({
  request,
  response,
  config,
  orderService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  orderService: OrderService;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);

  const route = resolveOrderRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  if (route.kind === 'serviceQualification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, orderService.listServiceQualifications(parseServiceQualificationQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, orderService.createServiceQualification((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, orderService.getServiceQualification(route.id), 'SERVICE_QUALIFICATION_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, orderService.updateServiceQualification(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.deleteServiceQualification(route.id));
    }
  }

  if (route.kind === 'serviceOrder') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, orderService.listServiceOrders(parseServiceOrderQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, orderService.createServiceOrder((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, orderService.getServiceOrder(route.id), 'SERVICE_ORDER_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, orderService.updateServiceOrder(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.cancelServiceOrder(route.id));
    }
  }

  if (route.kind === 'resourceOrder') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, orderService.listResourceOrders(parseResourceOrderQuery(url.searchParams)));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(response, 201, orderService.createResourceOrder((await readBody(request)) as any));
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, orderService.getResourceOrder(route.id), 'RESOURCE_ORDER_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(response, 200, orderService.updateResourceOrder(route.id, (await readBody(request)) as any));
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.cancelResourceOrder(route.id));
    }
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

type GeoEntityRoute = {
  resource: 'locations' | 'addresses' | 'site-specifications' | 'sites';
  id?: string;
};

type EventRoute = {
  id?: string;
};

type PartyRoute = {
  id?: string;
};

type ResourceRoute = {
  kind: 'resourceSpecification' | 'resourceFunctionSpecification' | 'resource' | 'resourceActivation';
  id?: string;
  relationshipId?: string;
  relationshipType?: string;
};

type ServiceRoute = {
  kind: 'serviceSpecification' | 'serviceCategory' | 'serviceCandidate' | 'service';
  id?: string;
  relationshipId?: string;
  relationshipType?: string;
};

type OrderRoute = {
  kind: 'serviceQualification' | 'serviceOrder' | 'resourceOrder';
  id?: string;
};

const resolveEventRoute = (pathname: string): EventRoute | undefined => {
  const base = '/tmf-api/eventManagement/v4/event';
  if (pathname === base) return {};

  if (pathname.startsWith(`${base}/`)) {
    const id = pathname.slice(base.length + 1);
    if (id && !id.includes('/')) {
      return { id: decodeURIComponent(id) };
    }
  }

  return undefined;
};

const parseEventQuery = (params: URLSearchParams): TmfEventQuery => {
  const query: TmfEventQuery = {};

  const eventType = params.get('eventType');
  if (eventType) query.eventType = eventType;

  const source = params.get('source');
  if (source) query.source = source;

  const correlationId = params.get('correlationId');
  if (correlationId) query.correlationId = correlationId;

  const from = params.get('from');
  if (from) query.from = from;

  const to = params.get('to');
  if (to) query.to = to;

  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;

  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;

  return query;
};

const parseOptionalNumber = (value: string | null): number | undefined => {
  if (value === null || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const resolvePartyRoute = (pathname: string): PartyRoute | undefined => {
  const base = '/tmf-api/partyManagement/v4/party';
  if (pathname === base) return {};
  if (pathname.startsWith(`${base}/`)) {
    const id = pathname.slice(base.length + 1);
    if (id && !id.includes('/')) return { id: decodeURIComponent(id) };
  }
  return undefined;
};

const resolvePartyRoleRoute = (pathname: string): PartyRoute | undefined => {
  const base = '/tmf-api/partyRoleManagement/v4/partyRole';
  if (pathname === base) return {};
  if (pathname.startsWith(`${base}/`)) {
    const id = pathname.slice(base.length + 1);
    if (id && !id.includes('/')) return { id: decodeURIComponent(id) };
  }
  return undefined;
};

const parsePartyQuery = (params: URLSearchParams): PartyQuery => {
  const query: PartyQuery = {};

  const name = params.get('name');
  if (name) query.name = name;

  const document = params.get('document');
  if (document) query.document = document;

  const partyType = params.get('partyType');
  if (partyType === 'Individual' || partyType === 'Organization') {
    query.partyType = partyType;
  }

  const status = parsePartyStatus(params.get('status'));
  if (status) query.status = status;

  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;

  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;

  return query;
};

const parsePartyRoleQuery = (params: URLSearchParams): PartyRoleQuery => {
  const query: PartyRoleQuery = {};

  const partyId = params.get('partyId');
  if (partyId) query.partyId = partyId;

  const name = params.get('name');
  if (name) query.name = name;

  const status = parsePartyRoleStatus(params.get('status'));
  if (status) query.status = status;

  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;

  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;

  return query;
};

const parsePartyStatus = (value: string | null): PartyQuery['status'] | undefined => {
  if (value === 'inactive' || value === 'terminated' || value === 'active') return value;
  return undefined;
};

const parsePartyRoleStatus = (value: string | null): PartyRoleQuery['status'] | undefined => {
  if (value === 'inactive' || value === 'terminated' || value === 'active') return value;
  return undefined;
};

const resolveResourceRoute = (pathname: string): ResourceRoute | undefined => {
  const catalogBase = '/tmf-api/resourceCatalogManagement/v4';
  const inventoryBase = '/tmf-api/resourceInventoryManagement/v4/resource';
  const activationBase = '/tmf-api/resourceFunctionActivation/v4/resourceFunction';

  if (pathname === `${catalogBase}/resourceSpecification`) return { kind: 'resourceSpecification' };
  if (pathname.startsWith(`${catalogBase}/resourceSpecification/`)) {
    const id = pathname.slice(`${catalogBase}/resourceSpecification/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceSpecification', id: decodeURIComponent(id) };
  }

  if (pathname === `${catalogBase}/resourceFunctionSpecification`) return { kind: 'resourceFunctionSpecification' };
  if (pathname.startsWith(`${catalogBase}/resourceFunctionSpecification/`)) {
    const id = pathname.slice(`${catalogBase}/resourceFunctionSpecification/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceFunctionSpecification', id: decodeURIComponent(id) };
  }

  if (pathname === inventoryBase) return { kind: 'resource' };
  if (pathname.startsWith(`${inventoryBase}/`)) {
    const tail = pathname.slice(`${inventoryBase}/`.length);
    if (tail && !tail.includes('/')) return { kind: 'resource', id: decodeURIComponent(tail) };
    const relMatch = tail.match(/^([^/]+)\/relationships(?:\/([^/]+))?$/);
    if (relMatch && relMatch[1]) {
      return {
        kind: 'resource',
        id: decodeURIComponent(relMatch[1]),
        ...(relMatch[2] ? { relationshipId: decodeURIComponent(relMatch[2]) } : {}),
      };
    }
  }

  if (pathname === activationBase) return { kind: 'resourceActivation' };
  if (pathname.startsWith(`${activationBase}/`)) {
    const id = pathname.slice(`${activationBase}/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceActivation', id: decodeURIComponent(id) };
  }

  return undefined;
};

const resolveServiceRoute = (pathname: string): ServiceRoute | undefined => {
  const catalogBase = '/tmf-api/serviceCatalogManagement/v4';
  const inventoryBase = '/tmf-api/serviceInventoryManagement/v4/service';

  if (pathname === `${catalogBase}/serviceSpecification`) return { kind: 'serviceSpecification' };
  if (pathname.startsWith(`${catalogBase}/serviceSpecification/`)) {
    const id = pathname.slice(`${catalogBase}/serviceSpecification/`.length);
    if (id && !id.includes('/')) return { kind: 'serviceSpecification', id: decodeURIComponent(id) };
  }

  if (pathname === `${catalogBase}/serviceCategory`) return { kind: 'serviceCategory' };
  if (pathname.startsWith(`${catalogBase}/serviceCategory/`)) {
    const id = pathname.slice(`${catalogBase}/serviceCategory/`.length);
    if (id && !id.includes('/')) return { kind: 'serviceCategory', id: decodeURIComponent(id) };
  }

  if (pathname === `${catalogBase}/serviceCandidate`) return { kind: 'serviceCandidate' };
  if (pathname.startsWith(`${catalogBase}/serviceCandidate/`)) {
    const id = pathname.slice(`${catalogBase}/serviceCandidate/`.length);
    if (id && !id.includes('/')) return { kind: 'serviceCandidate', id: decodeURIComponent(id) };
  }

  if (pathname === inventoryBase) return { kind: 'service' };
  if (pathname.startsWith(`${inventoryBase}/`)) {
    const tail = pathname.slice(`${inventoryBase}/`.length);
    if (tail && !tail.includes('/')) return { kind: 'service', id: decodeURIComponent(tail) };
    const relMatch = tail.match(/^([^/]+)\/relationships(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if (relMatch && relMatch[1]) {
      return {
        kind: 'service',
        id: decodeURIComponent(relMatch[1]),
        ...(relMatch[2] ? { relationshipId: decodeURIComponent(relMatch[2]) } : {}),
        ...(relMatch[3] ? { relationshipType: decodeURIComponent(relMatch[3]) } : {}),
      };
    }
  }

  return undefined;
};

const resolveOrderRoute = (pathname: string): OrderRoute | undefined => {
  const qualificationBase = '/tmf-api/serviceQualificationManagement/v4/serviceQualification';
  const orderBase = '/tmf-api/serviceOrderingManagement/v4/serviceOrder';

  if (pathname === qualificationBase) return { kind: 'serviceQualification' };
  if (pathname.startsWith(`${qualificationBase}/`)) {
    const id = pathname.slice(`${qualificationBase}/`.length);
    if (id && !id.includes('/')) return { kind: 'serviceQualification', id: decodeURIComponent(id) };
  }

  if (pathname === orderBase) return { kind: 'serviceOrder' };
  if (pathname.startsWith(`${orderBase}/`)) {
    const id = pathname.slice(`${orderBase}/`.length);
    if (id && !id.includes('/')) return { kind: 'serviceOrder', id: decodeURIComponent(id) };
  }

  const resourceOrderBase = '/tmf-api/resourceOrderingManagement/v4/resourceOrder';
  if (pathname === resourceOrderBase) return { kind: 'resourceOrder' };
  if (pathname.startsWith(`${resourceOrderBase}/`)) {
    const id = pathname.slice(`${resourceOrderBase}/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceOrder', id: decodeURIComponent(id) };
  }

  return undefined;
};

const parseResourceSpecificationQuery = (params: URLSearchParams): ResourceSpecificationQuery => {
  const query: ResourceSpecificationQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const category = params.get('category');
  if (category) query.category = category;
  const resourceType = params.get('resourceType');
  if (resourceType) query.resourceType = resourceType;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseResourceFunctionSpecificationQuery = (params: URLSearchParams): ResourceFunctionSpecificationQuery => {
  const query: ResourceFunctionSpecificationQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseResourceQuery = (params: URLSearchParams): ResourceQuery => {
  const query: ResourceQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const status = params.get('status');
  if (status === 'active' || status === 'inactive' || status === 'suspended' || status === 'terminated') {
    query.status = status;
  }
  const resourceSpecificationId = params.get('resourceSpecificationId');
  if (resourceSpecificationId) query.resourceSpecificationId = resourceSpecificationId;
  const placeId = params.get('placeId');
  if (placeId) query.placeId = placeId;
  const relatedPartyId = params.get('relatedPartyId');
  if (relatedPartyId) query.relatedPartyId = relatedPartyId;
  const kind = params.get('kind');
  if (kind === 'PhysicalResource' || kind === 'LogicalResource') query.kind = kind;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseServiceSpecificationQuery = (params: URLSearchParams): ServiceSpecificationQuery => {
  const query: ServiceSpecificationQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const category = params.get('category');
  if (category) query.category = category;
  const serviceType = params.get('serviceType');
  if (serviceType === 'CFS' || serviceType === 'RFS' || serviceType === 'Other') {
    query.serviceType = serviceType;
  }
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseServiceCategoryQuery = (params: URLSearchParams): ServiceCategoryQuery => {
  const query: ServiceCategoryQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const parentCategoryId = params.get('parentCategoryId');
  if (parentCategoryId) query.parentCategoryId = parentCategoryId;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseServiceCandidateQuery = (params: URLSearchParams): ServiceCandidateQuery => {
  const query: ServiceCandidateQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const serviceSpecificationId = params.get('serviceSpecificationId');
  if (serviceSpecificationId) query.serviceSpecificationId = serviceSpecificationId;
  const serviceCategoryId = params.get('serviceCategoryId');
  if (serviceCategoryId) query.serviceCategoryId = serviceCategoryId;
  const status = params.get('status');
  if (status === 'active' || status === 'inactive' || status === 'terminated') {
    query.status = status;
  }
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseServiceQuery = (params: URLSearchParams): ServiceQuery => {
  const query: ServiceQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const state = params.get('state');
  if (
    state === 'feasibilityChecked' ||
    state === 'designed' ||
    state === 'reserved' ||
    state === 'inactive' ||
    state === 'active' ||
    state === 'terminated'
  ) {
    query.state = state;
  }
  const type = params.get('@type') ?? params.get('type');
  if (type === 'CustomerFacingService' || type === 'ResourceFacingService') {
    query.type = type;
  }
  const serviceSpecificationId = params.get('serviceSpecificationId');
  if (serviceSpecificationId) query.serviceSpecificationId = serviceSpecificationId;
  const subscriberId = params.get('subscriberId');
  if (subscriberId) query.subscriberId = subscriberId;
  const relatedPartyId = params.get('relatedPartyId');
  if (relatedPartyId) query.relatedPartyId = relatedPartyId;
  const placeId = params.get('placeId');
  if (placeId) query.placeId = placeId;
  const supportingResourceId = params.get('supportingResourceId');
  if (supportingResourceId) query.supportingResourceId = supportingResourceId;
  const supportingServiceId = params.get('supportingServiceId');
  if (supportingServiceId) query.supportingServiceId = supportingServiceId;
  const characteristicSubscriberId = params.get('characteristic.SubscriberID');
  if (characteristicSubscriberId) {
    query.characteristicName = 'SubscriberID';
    query.characteristicValue = characteristicSubscriberId;
  }
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseServiceQualificationQuery = (params: URLSearchParams): ServiceQualificationQuery => {
  const query: ServiceQualificationQuery = {};
  const state = params.get('state');
  if (state === 'done' || state === 'terminated') {
    query.state = state;
  }
  const placeId = params.get('placeId');
  if (placeId) query.placeId = placeId;
  const serviceSpecificationId = params.get('serviceSpecificationId');
  if (serviceSpecificationId) query.serviceSpecificationId = serviceSpecificationId;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseServiceOrderQuery = (params: URLSearchParams): ServiceOrderQuery => {
  const query: ServiceOrderQuery = {};
  const state = params.get('state');
  if (
    state === 'acknowledged' ||
    state === 'inProgress' ||
    state === 'completed' ||
    state === 'failed' ||
    state === 'cancelled'
  ) {
    query.state = state;
  }
  const relatedPartyId = params.get('relatedPartyId');
  if (relatedPartyId) query.relatedPartyId = relatedPartyId;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseResourceOrderQuery = (params: URLSearchParams): ResourceOrderQuery => {
  const query: ResourceOrderQuery = {};
  const state = params.get('state');
  if (
    state === 'acknowledged' ||
    state === 'inProgress' ||
    state === 'completed' ||
    state === 'failed' ||
    state === 'cancelled'
  ) {
    query.state = state;
  }
  const relatedPartyId = params.get('relatedPartyId');
  if (relatedPartyId) query.relatedPartyId = relatedPartyId;
  const resourceId = params.get('resourceId');
  if (resourceId) query.resourceId = resourceId;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
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
  runtime,
  chatGptProvider,
  localKnowledgeProvider,
  mcpModule,
  llmToolCatalog,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  runtime: NexusRuntime;
  chatGptProvider: ChatGPTProvider | null;
  localKnowledgeProvider: LocalKnowledgeProvider;
  mcpModule: ReturnType<typeof createNexusMcpModule>;
  llmToolCatalog: ReturnType<typeof buildLlmToolCatalog>;
  url: URL;
}): Promise<void> => {
  ensureAuthorized(request, config);
  const { defaultUser, searchService } = runtime;

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
      model: (body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini') as string,
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
    const sessionId = url.pathname.split('/')[4]; // /v1/research/sessions/{id}/messages
    if (!sessionId) throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });

    const body = await readBody(request);
    const userMessage = body.message as string;
    if (!userMessage) throw new AppError('message required', { code: 'INVALID_MESSAGE', statusCode: 400 });

    const session = searchService.getSession(sessionId);
    if (!session) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });

    const llmProvider = chatGptProvider
      ? async (llmRequest: any) => {
          try {
            const providerResponse = await chatGptProvider.invoke(llmRequest);
            if (!providerResponse.toolCalls) {
              return providerResponse;
            }
            return {
              ...providerResponse,
              toolCalls: providerResponse.toolCalls.map((toolCall) => ({
                ...toolCall,
                name: llmToolCatalog.aliasToToolName.get(toolCall.name) ?? toolCall.name,
              })),
            };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return localKnowledgeProvider.invoke({
              ...llmRequest,
              model: `fallback:${session.model ?? 'nexus-local-docs'}`,
            })
              .then((fallback) => ({
                ...fallback,
                metadata: {
                  ...(fallback.metadata ?? {}),
                  error: errorMsg,
                },
              }));
          }
        }
      : async (llmRequest: any) =>
          localKnowledgeProvider.invoke({
            ...llmRequest,
            model: `fallback:${session.model ?? 'nexus-local-docs'}`,
          });

    const { userMessage: userMsg, assistantMessage } = await searchService.addMessageAndGetResponse(
      sessionId,
      userMessage,
      llmProvider,
      chatGptProvider
        ? {
            tools: llmToolCatalog.tools,
            executeTool: async (toolName, input) =>
              await mcpModule.registry.executeTool(
                toolName,
                input,
                runtime.createToolContext({
                  executionMode: 'internal-chat',
                  sessionId,
                }),
              ),
            maxToolCalls: 4,
          }
        : undefined,
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

const parseOpenAIChatRequest = (
  body: OpenAIChatRequestBody,
): {
  messages: OpenAIChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
} | null => {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return null;
  }

  const messages = body.messages
    .map((message) => {
      const role = message?.role;
      if (role !== 'system' && role !== 'user' && role !== 'assistant') {
        return null;
      }

      return {
        role,
        content: String(message.content ?? ''),
      };
    })
    .filter((message): message is OpenAIChatMessage => message !== null && message.content.length > 0);

  if (messages.length === 0) {
    return null;
  }

  return {
    messages,
    model: normalizeOpenAIModel(body.model),
    temperature: normalizeNumber(body.temperature, 0.7),
    maxTokens: normalizeNumber(body.max_tokens, 2000),
  };
};

const normalizeOpenAIModel = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
};

const normalizeNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildLlmToolCatalog = (
  mcpModule: ReturnType<typeof createNexusMcpModule>,
): {
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  aliasToToolName: Map<string, string>;
} => {
  const aliasToToolName = new Map<string, string>();
  const tools = mcpModule.registry.listTools({ exposeToModelOnly: true }).map((tool) => {
    const alias = tool.name.replace(/\./g, '__');
    aliasToToolName.set(alias, tool.name);
    return {
      name: alias,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    };
  });

  return {
    tools,
    aliasToToolName,
  };
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

const sendFallbackChatCompletion = (
  response: ServerResponse,
  model: string,
  content: string,
): void => {
  sendJson(response, 200, {
    object: 'chat.completion',
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
  });
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
