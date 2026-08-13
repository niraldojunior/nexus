import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { databaseConfigOf, type AppConfig } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import {
  buildRequestContext,
  ensureAuthorized as ensureRequestAuthorized,
  requireRoles,
  type RequestContext,
} from './request-context.js';
import type { Logger } from '../logging/logger.js';
import { InMemoryEntityRepository } from '../persistence/in-memory-entity-repository.js';
import type { DatabaseClient } from '../persistence/database-client.js';
import { createDatabaseClient } from '../persistence/database-factory.js';
import { createCanonicalId } from '../utils/canonical-id.js';
import { ChatGPTProvider } from '../../modules/search/chatgpt-provider.js';
import { GeminiProvider } from '../../modules/search/gemini-provider.js';
import { LocalKnowledgeProvider } from '../../modules/search/local-knowledge-provider.js';
import {
  resolveDefaultModel,
  resolveResearchProvider,
} from '../../modules/search/provider-router.js';
import { prependNexusCopilotContext } from '../../modules/search/nexus-copilot-context.js';
import { SearchService } from '../../modules/search/service.js';
import { createNexusMcpModule } from '../../modules/mcp/index.js';
import type { GeoService } from '../../modules/geo/service.js';
import type { GeoTreeService } from '../../modules/geo/tree-service.js';
import type { OrderService } from '../../modules/order/service.js';
import {
  createNexusRuntime,
  DEFAULT_RUNTIME_USER,
  type NexusRuntime,
  type NexusRuntimeOptions,
  type NexusRuntimeUser,
} from '../runtime/nexus-runtime.js';
import type { PartyService } from '../../modules/party/service.js';
import type { ResourceService } from '../../modules/resource/service.js';
import type { ServiceService } from '../../modules/service/service.js';
import type {
  AddMessageInput,
  LLMRequest,
  LLMResponse,
  ResearchMessage,
  ResearchSession,
} from '../../modules/search/domain.js';
import type { TmfEventQuery } from '../tmf/index.js';
import type { EventService } from '../tmf/index.js';
import type { Party, PartyQuery, PartyRoleQuery } from '../../modules/party/index.js';
import type {
  Resource,
  ResourceCategory,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceSpecification,
  ResourceSpecificationQuery,
  ResourceType,
} from '../../modules/resource/index.js';
import type {
  CustomerFacingService,
  ResourceFacingService,
  ServiceCandidate,
  ServiceCategory,
  ServiceQuery,
  ServiceSpecification,
  ServiceSpecificationQuery,
  ServiceCategoryQuery,
  ServiceCandidateQuery,
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


type AppDependencies = {
  config: AppConfig;
  logger: Logger;
};

export type HttpRequestHandlerDependencies = RouteDependencies;

type ResearchMessageRepository = {
  addMessage: (
    sessionId: string,
    message: AddMessageInput & { id: string },
  ) => Promise<ResearchMessage> | ResearchMessage;
};

type ResourceWorkspaceTab = 'PhysicalResource' | 'LogicalResource' | 'ResourceSpecification';

type ResourceWorkspaceSnapshot = {
  items: Resource[] | ResourceSpecification[];
  totalCount: number;
  resourceSpecificationOptions: ResourceSpecification[];
  resourceCategories: ResourceCategory[];
  resourceTypes: ResourceType[];
  manufacturerOptions: Party[];
};

const RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE = 100;

type ServiceWorkspaceTab =
  'CustomerFacingService' | 'ResourceFacingService' | 'ServiceSpecification';

// Ao contrário do Resource (uma aba = um `kind`, paginação por página faz sentido), o Inventário
// de Service mostra CFS+RFS juntos numa única visão — então aqui o corte que importa é a
// categoria (server-side, evita o full-scan global) e a paginação/filtro continuam no cliente
// sobre esse conjunto já bem menor, igual ao catálogo de specs sempre fez.
const SERVICE_CATEGORY_FETCH_CAP = 2000;

type ServiceWorkspaceSnapshot = {
  serviceSpecificationOptions: ServiceSpecification[];
  serviceCategories: ServiceCategory[];
  serviceCandidates: ServiceCandidate[];
  customerFacingServices: CustomerFacingService[];
  resourceFacingServices: ResourceFacingService[];
};

export const handleHttpRequest = async (
  dependencies: HttpRequestHandlerDependencies,
): Promise<void> => routeRequest(dependencies);

export const createApp = ({ config, logger }: AppDependencies) => {
  const repository = new InMemoryEntityRepository();
  const databaseConfig = databaseConfigOf(config);
  const db = createDatabaseClient(databaseConfig);
  const runtimeOptions = runtimeOptionsFromConfig(config);
  // The runtime builds every repository and runs their seeds, which over a Postgres/Neon
  // backend means dozens of network round-trips. Build it ONCE at startup and reuse it for
  // every request instead of rebuilding per request (which made each request take seconds).
  let runtimePromise: Promise<NexusRuntime> | null = null;

  const server = createServer((request, response) => {
    const activeRuntime =
      runtimePromise ?? (runtimePromise = createNexusRuntime(db, runtimeOptions));
    const startedAt = Date.now();
    void activeRuntime
      .then((runtime) =>
        routeRequest({
          request,
          response,
          config,
          logger,
          repository,
          db,
          runtime,
        }),
      )
      .catch((error: unknown) => handleHttpError({ error, logger, response }))
      .finally(() => {
        const durationMs = Date.now() - startedAt;
        if (durationMs >= 250) {
          logger.info(
            {
              method: request.method,
              path: request.url,
              durationMs,
              statusCode: response.statusCode,
            },
            'request completed',
          );
        }
      });
  });

  return {
    start: async (): Promise<number> => {
      await db.initialize();
      logger.info({ databaseProvider: databaseConfig.provider }, 'database initialized');
      const runtimeStartedAt = Date.now();
      runtimePromise = createNexusRuntime(db, runtimeOptions);
      const runtime = await runtimePromise;
      logger.info({ durationMs: Date.now() - runtimeStartedAt }, 'runtime initialized');

      if (runtime.defaultUser.externalId === DEFAULT_RUNTIME_USER.externalId) {
        logger.info(
          { userId: runtime.defaultUser.id, externalId: runtime.defaultUser.externalId },
          'default user ready',
        );
      }

      if (!config.authJwtSecret) {
        logger.warn(
          {},
          'AUTH_JWT_SECRET não definido: login de usuário indisponível (apenas token estático).',
        );
      } else if (!config.adminEmail || !config.adminPassword) {
        logger.warn(
          {},
          'ADMIN_EMAIL/ADMIN_PASSWORD não definidos: nenhum admin semente criado.',
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
      runtimePromise = null;
      // db.close() already removes just this instance from the static map. Calling
      // PostgresDatabase.resetForTesting() here would additionally tear down every other
      // instance still registered — including one from a test whose async teardown is
      // still in flight — leaving it with a null bridge ("Database not initialized").
      await db.close();
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
  db: DatabaseClient;
  runtime: NexusRuntime;
};

const routeRequest = async ({
  request,
  response,
  config,
  logger,
  repository,
  runtime,
}: RouteDependencies): Promise<void> => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const searchService = runtime.searchService;
  const defaultUser = runtime.defaultUser;
  const userRepository = runtime.userRepository;
  const authService = runtime.authService;
  const searchRepository = runtime.searchRepository;
  const researchRepository = runtime.researchRepository;
  const { geoService, eventService, partyService, resourceService, serviceService, orderService } =
    runtime;
  const apiKey = process.env.OPENAI_API_KEY;
  const apiEndpoint = process.env.API_ENDPOINT || 'https://api.openai.com/v1';
  const chatGptProvider = apiKey ? new ChatGPTProvider(apiKey, apiEndpoint) : null;
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiProvider = geminiKey
    ? new GeminiProvider(geminiKey, process.env.GEMINI_API_ENDPOINT)
    : null;
  const localKnowledgeProvider = new LocalKnowledgeProvider();
  const mcpModule = createNexusMcpModule(runtime);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      status: 'ok',
      appName: config.appName,
      timestamp: new Date().toISOString(),
      // Diagnóstico de deploy: identifica qual código está no ar e se ele enxerga as variáveis de
      // autenticação. Só o SHA e booleanos — nenhum valor de segredo. O Vercel injeta env vars no
      // deployment, então mudar uma variável sem redeploy não tem efeito; estes campos tornam essa
      // diferença visível de fora.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      auth: {
        jwtSecretConfigured: Boolean(config.authJwtSecret),
        adminSeedConfigured: Boolean(config.adminEmail && config.adminPassword),
      },
    });
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/app')) {
    sendHtml(response, buildLegacyUiNoticeHtml(config.appName));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/bootstrap') {
    await ensureAuthorized(request, config);
    const count = repository.count();
    sendJson(response, 200, { status: 'ready', entities: count });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/resource/workspace') {
    await ensureAuthorized(request, config);
    const tab = parseResourceWorkspaceTab(url.searchParams.get('tab'));
    const limit = parseOptionalNumber(url.searchParams.get('limit')) ?? 20;
    const offset = parseOptionalNumber(url.searchParams.get('offset')) ?? 0;
    const resourceSpecificationIdIn = url.searchParams.getAll('resourceSpecificationIdIn');
    const resourceTypeIn = url.searchParams.getAll('resourceTypeIn');
    const category = url.searchParams.get('category');
    const name = url.searchParams.get('name');
    const snapshot = await buildResourceWorkspaceSnapshot({
      tab,
      limit,
      offset,
      filter: {
        ...(resourceSpecificationIdIn.length > 0 ? { resourceSpecificationIdIn } : {}),
        ...(resourceTypeIn.length > 0 ? { resourceTypeIn } : {}),
        ...(category ? { category } : {}),
        ...(name ? { name } : {}),
      },
      resourceService: runtime.resourceService,
      partyService: runtime.partyService,
    });
    sendJson(response, 200, snapshot);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/service/workspace') {
    await ensureAuthorized(request, config);
    const tab = parseServiceWorkspaceTab(url.searchParams.get('tab'));
    const category = url.searchParams.get('category');
    const snapshot = await buildServiceWorkspaceSnapshot({
      tab,
      ...(category ? { category } : {}),
      serviceService: runtime.serviceService,
    });
    sendJson(response, 200, snapshot);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/bootstrap/entities') {
    await ensureAuthorized(request, config);
    const body = await readBody(request);
    const label = typeof body.label === 'string' ? body.label : 'untitled';
    const entity = repository.create({ label });
    logger.info({ entityId: entity.id }, 'bootstrap entity created');
    sendJson(response, 201, entity);
    return;
  }

  // POST /v1/chat/completions - Main assistant chat proxy
  if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await ensureAuthorized(request, config);

    const body = (await readBody(request)) as OpenAIChatRequestBody;
    const parsed = parseOpenAIChatRequest(body);
    if (!parsed) {
      throw new AppError('messages required', { code: 'INVALID_MESSAGE', statusCode: 400 });
    }

    const messages = prependNexusCopilotContext(parsed.messages);

    const chatProvider = resolveResearchProvider(parsed.model, { chatGptProvider, geminiProvider });
    if (!chatProvider) {
      logger.warn({ model: parsed.model }, 'No LLM provider configured; returning fallback completion');
      const fallbackCompletion = await localKnowledgeProvider.complete(messages, parsed.model);
      return sendFallbackChatCompletion(response, parsed.model, fallbackCompletion.content);
    }

    try {
      const completion = await chatProvider.complete(
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

  // Auth API — sessão local (login/JWT). /login é público (sem ensureAuthorized), protegido
  // por rate limit no AuthService. As demais rotas resolvem o usuário real (requireUser).
  if (request.method === 'POST' && url.pathname === '/v1/auth/login') {
    const body = await readBody(request);
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      throw new AppError('email and password required', {
        code: 'AUTH_MISSING_CREDENTIALS',
        statusCode: 400,
      });
    }
    const ip = sourceIpOf(request);
    const result = await authService.login(email, password, ip ? { ip } : {});
    logger.info({ userId: result.user.id }, 'user logged in');
    sendJson(response, 200, {
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/auth/me') {
    const context = await buildRequestContext(request, config);
    const user = await requireUser(runtime, context);
    sendJson(response, 200, user);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
    const context = await buildRequestContext(request, config);
    const user = await requireUser(runtime, context);
    await authService.revokeSessions(user.id);
    sendJson(response, 204, null);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/auth/password') {
    const context = await buildRequestContext(request, config);
    const user = await requireUser(runtime, context);
    const body = await readBody(request);
    await authService.changeOwnPassword(
      user.id,
      String(body.currentPassword ?? ''),
      String(body.newPassword ?? ''),
    );
    sendJson(response, 204, null);
    return;
  }

  // Users API — administração de contas, restrita a papéis de admin (RBAC). Uma sessão
  // autenticada não-admin recebe 403; o token estático (máquina) carrega os papéis admin
  // por padrão, preservando scripts e testes de integração.
  if (request.method === 'GET' && url.pathname === '/v1/users') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, USER_ADMIN_ROLES);
    const users = await userRepository.list();
    sendJson(response, 200, users);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/users') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, USER_ADMIN_ROLES);
    const body = await readBody(request);
    const email = body.email ? String(body.email) : undefined;
    const roles = Array.isArray(body.roles) ? body.roles.map(String) : undefined;
    const tenantId = body.tenantId ? String(body.tenantId) : undefined;
    // Com senha: fluxo novo (login habilitado, hash via AuthService). Sem senha: mantém o
    // cadastro legado por externalId (contas de máquina/seed que não fazem login).
    const password = body.password ? String(body.password) : undefined;
    const user = password
      ? await authService.createUser({
          email: email ?? '',
          name: String(body.name),
          password,
          ...(roles ? { roles } : {}),
          ...(tenantId ? { tenantId } : {}),
        })
      : await userRepository.create({
          externalId: String(body.externalId),
          name: String(body.name),
          ...(email ? { email } : {}),
          ...(roles ? { roles } : {}),
          ...(tenantId ? { tenantId } : {}),
        });
    logger.info({ userId: user.id, externalId: user.externalId }, 'user created');
    sendJson(response, 201, user);
    return;
  }

  const userPasswordMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/password$/);
  if (userPasswordMatch && userPasswordMatch[1] && request.method === 'POST') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, USER_ADMIN_ROLES);
    const body = await readBody(request);
    const user = await authService.resetPassword(userPasswordMatch[1], String(body.password ?? ''));
    logger.info({ userId: user.id }, 'user password reset');
    sendJson(response, 200, user);
    return;
  }

  const userStatusMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/status$/);
  if (userStatusMatch && userStatusMatch[1] && request.method === 'POST') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, USER_ADMIN_ROLES);
    const body = await readBody(request);
    const status = body.status === 'disabled' ? 'disabled' : 'active';
    const user = await authService.setStatus(userStatusMatch[1], status);
    logger.info({ userId: user.id, status }, 'user status changed');
    sendJson(response, 200, user);
    return;
  }

  const userRolesMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/roles$/);
  if (userRolesMatch && userRolesMatch[1] && request.method === 'POST') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, USER_ADMIN_ROLES);
    const body = await readBody(request);
    const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
    const user = await authService.setRoles(userRolesMatch[1], roles);
    logger.info({ userId: user.id }, 'user roles changed');
    sendJson(response, 200, user);
    return;
  }

  const userIdMatch = url.pathname.match(/^\/v1\/users\/([^/]+)$/);
  if (userIdMatch && userIdMatch[1]) {
    const userId = userIdMatch[1];
    if (request.method === 'GET') {
      const context = await buildRequestContext(request, config);
      requireRoles(context, USER_ADMIN_ROLES);
      const user = await userRepository.getById(userId);
      if (!user) {
        throw new AppError('user not found', { code: 'USER_NOT_FOUND', statusCode: 404 });
      }
      sendJson(response, 200, user);
      return;
    }

    if (request.method === 'PUT') {
      const context = await buildRequestContext(request, config);
      requireRoles(context, USER_ADMIN_ROLES);
      const body = await readBody(request);
      const email = body.email ? String(body.email) : undefined;
      const user = await userRepository.update(userId, {
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
      const context = await buildRequestContext(request, config);
      requireRoles(context, USER_ADMIN_ROLES);
      const deleted = await userRepository.delete(userId);
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
    await ensureAuthorized(request, config);
    const searches = await searchRepository.list();
    sendJson(response, 200, searches);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/searches/my') {
    await ensureAuthorized(request, config);
    const searches = await searchRepository.listByUserId(defaultUser.id);
    sendJson(response, 200, searches);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/searches') {
    await ensureAuthorized(request, config);
    const body = await readBody(request);
    const filters = body.filters ? (body.filters as Record<string, unknown>) : undefined;
    const results = body.results ? (body.results as Record<string, unknown>) : undefined;
    const search = await searchRepository.create({
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
      await ensureAuthorized(request, config);
      const search = await searchRepository.getById(searchId);
      if (!search) {
        throw new AppError('search not found', { code: 'SEARCH_NOT_FOUND', statusCode: 404 });
      }
      sendJson(response, 200, search);
      return;
    }

    if (request.method === 'PUT') {
      await ensureAuthorized(request, config);
      const body = await readBody(request);
      const filters = body.filters ? (body.filters as Record<string, unknown>) : undefined;
      const results = body.results ? (body.results as Record<string, unknown>) : undefined;
      const search = await searchRepository.update(searchId, {
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
      await ensureAuthorized(request, config);
      const deleted = await searchRepository.delete(searchId);
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
    url.pathname.startsWith(
      '/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification',
    ) ||
    url.pathname.startsWith('/tmf-api/resourceCatalogManagement/v4/resourceCategory') ||
    url.pathname.startsWith('/tmf-api/resourceCatalogManagement/v4/resourceType') ||
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

  if (
    url.pathname.startsWith('/tmf-api/partyManagement/v4/party') ||
    url.pathname.startsWith('/tmf-api/partyRoleManagement/v4/partyRole')
  ) {
    await routePartyRequest({ request, response, config, partyService, url });
    return;
  }

  if (url.pathname.startsWith('/v1/geo/') || url.pathname.startsWith('/tmf-api/')) {
    await routeGeoRequest({
      request,
      response,
      config,
      geoService,
      geoTreeService: runtime.geoTreeService,
      runtime,
      url,
    });
    return;
  }

  if (url.pathname.startsWith('/v1/research/')) {
    const llmToolCatalog = buildLlmToolCatalog(mcpModule);
    await routeResearchRequest({
      request,
      response,
      config,
      runtime,
      defaultUser,
      searchService,
      researchRepository,
      chatGptProvider,
      geminiProvider,
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
  geoTreeService,
  runtime,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  geoService: GeoService;
  geoTreeService: GeoTreeService;
  runtime: NexusRuntime;
  url: URL;
}): Promise<void> => {
  const geoContext = await buildRequestContext(request, config);

  // Histórico da barra de pesquisa da página Geo, por usuário. Exige uma sessão real
  // (requireUser) — o user_id vem da identidade, nunca do corpo da requisição.
  if (url.pathname === '/v1/geo/search-history') {
    const user = await requireUser(runtime, geoContext);
    if (request.method === 'GET') {
      const limit = parseOptionalNumber(url.searchParams.get('limit'));
      return sendJson(
        response,
        200,
        await runtime.geoSearchHistoryRepository.list(user.id, limit ?? 8),
      );
    }
    if (request.method === 'POST') {
      const body = await readBody(request);
      const kind = body.kind === 'node' ? 'node' : 'address';
      const entryKey = String(body.entryKey ?? '').trim();
      const label = String(body.label ?? '').trim();
      if (!entryKey || !label) {
        throw new AppError('entryKey and label required', {
          code: 'GEO_HISTORY_INVALID',
          statusCode: 400,
        });
      }
      await runtime.geoSearchHistoryRepository.record(user.id, {
        entryKey,
        kind,
        label,
        payload: body.payload ?? null,
      });
      return sendJson(response, 204, null);
    }
    if (request.method === 'DELETE') {
      await runtime.geoSearchHistoryRepository.clear(user.id);
      return sendJson(response, 204, null);
    }
  }

  const historyEntryMatch = url.pathname.match(/^\/v1\/geo\/search-history\/([^/]+)$/);
  if (historyEntryMatch && historyEntryMatch[1] && request.method === 'DELETE') {
    const user = await requireUser(runtime, geoContext);
    await runtime.geoSearchHistoryRepository.remove(
      user.id,
      decodeURIComponent(historyEntryMatch[1]),
    );
    return sendJson(response, 204, null);
  }

  // Árvore de navegação — um nível por chamada. Vem antes do roteador de
  // entidades porque `tree` não é uma entidade Geo, é uma projeção de leitura.
  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/roots') {
    return sendJson(response, 200, geoTreeService.roots());
  }

  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/children') {
    const nodeId = url.searchParams.get('nodeId');
    if (!nodeId) {
      throw new AppError('nodeId required', { code: 'GEO_TREE_NODE_REQUIRED', statusCode: 400 });
    }
    return sendJson(
      response,
      200,
      geoTreeService.children(nodeId, {
        ...(parseOptionalNumber(url.searchParams.get('limit')) !== undefined
          ? { limit: parseOptionalNumber(url.searchParams.get('limit')) as number }
          : {}),
        ...(parseOptionalNumber(url.searchParams.get('offset')) !== undefined
          ? { offset: parseOptionalNumber(url.searchParams.get('offset')) as number }
          : {}),
        // Default 'tree' (navegação, esconde item interno); painel de detalhe pede
        // 'all' explicitamente. Qualquer outro valor cai no default.
        scope: url.searchParams.get('scope') === 'all' ? 'all' : 'tree',
      }),
    );
  }

  // Caminho da raiz até um nó — usado para revelar na árvore um Site/Recurso
  // selecionado por fora dela (clique no mapa, resultado de busca), que pode nunca
  // ter passado por uma expansão manual (ver GeoTreeService.pathTo).
  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/path') {
    const nodeId = url.searchParams.get('nodeId');
    if (!nodeId) {
      throw new AppError('nodeId required', { code: 'GEO_TREE_NODE_REQUIRED', statusCode: 400 });
    }
    const path = await geoTreeService.pathTo(nodeId);
    return sendJson(response, 200, { nodeId, path });
  }

  // Infra passiva por região visível do mapa — fonte usada em escala de detalhe (≤ 200 m),
  // no lugar da expansão da árvore (ver GeoTreeService.resourcesInViewport).
  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/viewport') {
    const minLng = parseOptionalNumber(url.searchParams.get('minLng'));
    const minLat = parseOptionalNumber(url.searchParams.get('minLat'));
    const maxLng = parseOptionalNumber(url.searchParams.get('maxLng'));
    const maxLat = parseOptionalNumber(url.searchParams.get('maxLat'));
    if (
      minLng === undefined ||
      minLat === undefined ||
      maxLng === undefined ||
      maxLat === undefined
    ) {
      throw new AppError('minLng, minLat, maxLng and maxLat are required', {
        code: 'GEO_TREE_VIEWPORT_BOUNDS_REQUIRED',
        statusCode: 400,
      });
    }
    const limit = parseOptionalNumber(url.searchParams.get('limit'));
    return sendJson(
      response,
      200,
      geoTreeService.resourcesInViewport(
        { minLng, minLat, maxLng, maxLat },
        limit !== undefined ? { limit } : {},
      ),
    );
  }

  // Busca por nome para a barra de pesquisa unificada — Estações e Recursos (nunca
  // sub-locais/salas), devolvida como nó de árvore para reusar seleção/mapa/detalhe.
  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/search') {
    const term = url.searchParams.get('q') ?? '';
    const limit = parseOptionalNumber(url.searchParams.get('limit'));
    return sendJson(
      response,
      200,
      geoTreeService.search(term, limit !== undefined ? { limit } : {}),
    );
  }

  if (request.method === 'POST' && url.pathname === '/v1/geo/workspace/site-at-address') {
    const body = await readBody(request);
    return sendJson(
      response,
      201,
      geoService.createSiteAtAddress(
        body as Parameters<typeof geoService.createSiteAtAddress>[0],
        geoContext,
      ),
    );
  }

  if (request.method === 'POST' && url.pathname === '/v1/geo/site-specifications/bootstrap') {
    return sendJson(response, 200, geoService.ensureBootstrapSpecifications(geoContext));
  }

  if (request.method === 'POST' && url.pathname === '/v1/geo/relationship-types/bootstrap') {
    return sendJson(response, 200, geoService.ensureBootstrapRelationshipTypes(geoContext));
  }

  const eventsMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/events$/);
  if (eventsMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.listSiteEvents(decodeURIComponent(eventsMatch[1] ?? ''), geoContext),
    );
  }

  const historyMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/history$/);
  if (historyMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.listSiteHistory(decodeURIComponent(historyMatch[1] ?? ''), geoContext),
    );
  }

  const auditMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/audit$/);
  if (auditMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.listSiteAudit(decodeURIComponent(auditMatch[1] ?? ''), geoContext),
    );
  }

  const referencesMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/references$/);
  if (referencesMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.getSiteReferences(decodeURIComponent(referencesMatch[1] ?? ''), geoContext),
    );
  }

  const deactivationImpactMatch = url.pathname.match(
    /^\/v1\/geo\/sites\/([^/]+)\/deactivation-impact$/,
  );
  if (deactivationImpactMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.getSiteDeactivationImpact(
        decodeURIComponent(deactivationImpactMatch[1] ?? ''),
        geoContext,
      ),
    );
  }

  const descendantCountMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/descendant-count$/);
  if (descendantCountMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.countSiteDescendants(
        decodeURIComponent(descendantCountMatch[1] ?? ''),
        geoContext,
      ),
    );
  }

  const siteTreeMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/tree$/);
  if (siteTreeMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.getSiteTree(decodeURIComponent(siteTreeMatch[1] ?? ''), geoContext),
    );
  }

  const siteTransitionMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/transitions$/);
  if (siteTransitionMatch && request.method === 'POST') {
    const body = await readBody(request);
    return sendJson(
      response,
      200,
      geoService.transitionSite(
        decodeURIComponent(siteTransitionMatch[1] ?? ''),
        body as Parameters<typeof geoService.transitionSite>[1],
        geoContext,
      ),
    );
  }

  const relationshipMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/relationships$/);
  if (relationshipMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.listSiteRelationships(decodeURIComponent(relationshipMatch[1] ?? ''), geoContext),
    );
  }
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
        geoContext,
      ),
    );
  }

  if (relationshipMatch && request.method === 'DELETE') {
    const body = await readBody(request);
    const siteId = decodeURIComponent(relationshipMatch[1] ?? '');
    return sendJson(response, 200, {
      removed: geoService.removeSiteRelationship(
        siteId,
        String(body.relatedSiteId ?? body.id ?? ''),
        String(body.relationshipType ?? ''),
        geoContext,
      ),
    });
  }

  const relationshipTypeRoute = url.pathname.match(/^\/v1\/geo\/relationship-types(?:\/([^/]+))?$/);
  if (relationshipTypeRoute) {
    const code = relationshipTypeRoute[1]
      ? decodeURIComponent(relationshipTypeRoute[1])
      : undefined;
    if (!code && request.method === 'GET') {
      return sendJson(
        response,
        200,
        geoService.listRelationshipTypes(
          parseGeoRelationshipTypeListQuery(url.searchParams),
          geoContext,
        ),
      );
    }
    if (!code && request.method === 'POST') {
      return sendJson(
        response,
        201,
        geoService.createRelationshipType(
          (await readBody(request)) as Parameters<typeof geoService.createRelationshipType>[0],
          geoContext,
        ),
      );
    }
    if (code && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        geoService.getRelationshipType(code, geoContext),
        'GEO_RELATIONSHIP_TYPE_NOT_FOUND',
      );
    }
    if (code && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        geoService.updateRelationshipType(
          code,
          (await readBody(request)) as Parameters<typeof geoService.updateRelationshipType>[1],
          geoContext,
        ),
      );
    }
    if (code && request.method === 'DELETE') {
      return sendJson(response, 200, geoService.retireRelationshipType(code, geoContext));
    }
  }

  if (request.method === 'POST' && url.pathname === '/v1/geo/locations/intersections') {
    const body = await readBody(request);
    return sendJson(
      response,
      200,
      geoService.findLocationIntersections(
        (body.geometry ?? body) as Parameters<typeof geoService.findLocationIntersections>[0],
        geoContext,
      ),
    );
  }

  const locationReferencesMatch = url.pathname.match(/^\/v1\/geo\/locations\/([^/]+)\/references$/);
  if (locationReferencesMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.getLocationReferences(
        decodeURIComponent(locationReferencesMatch[1] ?? ''),
        geoContext,
      ),
    );
  }

  if (request.method === 'GET' && url.pathname === '/v1/geo/addresses/suggest') {
    return sendJson(
      response,
      200,
      geoService.suggestAddresses(url.searchParams.get('q') ?? '', geoContext),
    );
  }

  if (request.method === 'POST' && url.pathname === '/v1/geo/addresses/normalize') {
    return sendJson(
      response,
      200,
      geoService.normalizeAddress(await readBody(request), geoContext),
    );
  }

  const addressGeocodeMatch = url.pathname.match(/^\/v1\/geo\/addresses\/([^/]+)\/geocode$/);
  if (addressGeocodeMatch && request.method === 'POST') {
    return sendJson(
      response,
      200,
      geoService.geocodeAddress(decodeURIComponent(addressGeocodeMatch[1] ?? ''), geoContext),
    );
  }

  const addressVersionsMatch = url.pathname.match(/^\/v1\/geo\/addresses\/([^/]+)\/versions$/);
  if (addressVersionsMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.listAddressVersions(decodeURIComponent(addressVersionsMatch[1] ?? ''), geoContext),
    );
  }

  const addressReferencesMatch = url.pathname.match(/^\/v1\/geo\/addresses\/([^/]+)\/references$/);
  if (addressReferencesMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.getAddressReferences(
        decodeURIComponent(addressReferencesMatch[1] ?? ''),
        geoContext,
      ),
    );
  }

  const allowedChildrenMatch = url.pathname.match(
    /^\/(?:v1\/geo\/site-specifications|tmf-api\/geographicSiteManagement\/v4\/geographicSiteSpecification)\/([^/]+)\/allowedChildren$/,
  );
  if (allowedChildrenMatch && request.method === 'GET') {
    return sendJson(
      response,
      200,
      geoService.getAllowedChildren(decodeURIComponent(allowedChildrenMatch[1] ?? '')),
    );
  }

  const containmentImpactMatch = url.pathname.match(
    /^\/v1\/geo\/site-specifications\/([^/]+)\/containment-impact$/,
  );
  if (containmentImpactMatch && request.method === 'POST') {
    const body = await readBody(request);
    const impactInput: Parameters<typeof geoService.analyzeContainmentImpact>[1] = {};
    if (body.allowedParentSpec !== undefined) {
      impactInput.allowedParentSpec = body.allowedParentSpec as Exclude<
        Parameters<typeof geoService.analyzeContainmentImpact>[1]['allowedParentSpec'],
        undefined
      >;
    }
    if (body.allowedChildSpec !== undefined) {
      impactInput.allowedChildSpec = body.allowedChildSpec as Exclude<
        Parameters<typeof geoService.analyzeContainmentImpact>[1]['allowedChildSpec'],
        undefined
      >;
    }
    if (body.allowedParentSpecIds !== undefined) {
      impactInput.allowedParentSpecIds = body.allowedParentSpecIds as string[];
    }
    if (body.allowedChildSpecIds !== undefined) {
      impactInput.allowedChildSpecIds = body.allowedChildSpecIds as string[];
    }
    return sendJson(
      response,
      200,
      geoService.analyzeContainmentImpact(
        decodeURIComponent(containmentImpactMatch[1] ?? ''),
        impactInput,
      ),
    );
  }

  const route = resolveGeoEntityRoute(url.pathname);
  if (!route) throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });

  if (route.resource === 'locations') {
    if (!route.id && request.method === 'GET') {
      const spatialQuery = parseGeoLocationSpatialQuery(url.searchParams);
      const locations = await (spatialQuery
        ? geoService.listLocationsSpatial(spatialQuery, geoContext)
        : geoService.listLocations(parseGeoListQuery(url.searchParams), geoContext));
      if ((request.headers.accept ?? '').includes('application/geo+json')) {
        return sendJson(response, 200, geoService.locationsToFeatureCollection(locations));
      }
      return sendJson(response, 200, locations);
    }
    if (!route.id && request.method === 'POST')
      return sendJson(
        response,
        201,
        geoService.createLocation(
          (await readBody(request)) as Parameters<typeof geoService.createLocation>[0],
          geoContext,
        ),
      );
    if (route.id && request.method === 'GET')
      return sendJsonOrNotFound(
        response,
        geoService.getLocation(route.id, geoContext),
        'GEO_LOCATION_NOT_FOUND',
      );
    if (route.id && request.method === 'PATCH')
      return sendJson(
        response,
        200,
        geoService.updateLocation(
          route.id,
          (await readBody(request)) as Parameters<typeof geoService.updateLocation>[1],
          geoContext,
        ),
      );
    if (route.id && request.method === 'DELETE')
      return sendJson(response, 200, geoService.terminateLocation(route.id, geoContext));
  }

  if (route.resource === 'addresses') {
    if (!route.id && request.method === 'GET')
      return sendJson(
        response,
        200,
        geoService.listAddresses(parseGeoListQuery(url.searchParams), geoContext),
      );
    if (!route.id && request.method === 'POST')
      return sendJson(
        response,
        201,
        geoService.createAddress(
          (await readBody(request)) as Parameters<typeof geoService.createAddress>[0],
          geoContext,
        ),
      );
    if (route.id && request.method === 'GET')
      return sendJsonOrNotFound(
        response,
        geoService.getAddress(route.id, geoContext),
        'GEO_ADDRESS_NOT_FOUND',
      );
    if (route.id && request.method === 'PATCH')
      return sendJson(
        response,
        200,
        geoService.updateAddress(
          route.id,
          (await readBody(request)) as Parameters<typeof geoService.updateAddress>[1],
          geoContext,
        ),
      );
    if (route.id && request.method === 'DELETE')
      return sendJson(response, 200, geoService.terminateAddress(route.id, geoContext));
  }

  if (route.resource === 'site-specifications') {
    if (!route.id && request.method === 'GET')
      return sendJson(
        response,
        200,
        geoService.listSpecs(parseGeoSpecificationListQuery(url.searchParams), geoContext),
      );
    if (!route.id && request.method === 'POST')
      return sendJson(
        response,
        201,
        geoService.createSpec(
          (await readBody(request)) as Parameters<typeof geoService.createSpec>[0],
          geoContext,
        ),
      );
    if (route.id && request.method === 'GET')
      return sendJsonOrNotFound(
        response,
        geoService.getSpec(route.id, geoContext),
        'GEO_SPEC_NOT_FOUND',
      );
    if (route.id && request.method === 'PATCH')
      return sendJson(
        response,
        200,
        geoService.updateSpec(
          route.id,
          (await readBody(request)) as Parameters<typeof geoService.updateSpec>[1],
          geoContext,
        ),
      );
    if (route.id && request.method === 'DELETE')
      return sendJson(response, 200, geoService.retireSpec(route.id, geoContext));
  }

  if (route.resource === 'sites') {
    if (!route.id && request.method === 'GET')
      return sendJson(
        response,
        200,
        geoService.listSites(parseGeoListQuery(url.searchParams), geoContext),
      );
    if (!route.id && request.method === 'POST')
      return sendJson(
        response,
        201,
        geoService.createSite(
          (await readBody(request)) as Parameters<typeof geoService.createSite>[0],
          geoContext,
        ),
      );
    if (route.id && request.method === 'GET')
      return sendJsonOrNotFound(
        response,
        geoService.getSite(route.id, geoContext),
        'GEO_SITE_NOT_FOUND',
      );
    if (route.id && request.method === 'PATCH') {
      const body = (await readBody(request)) as Parameters<typeof geoService.updateSite>[1];
      if (
        body.status !== undefined &&
        Object.keys(body).every((key) => ['status', 'statusReason', 'statusDate'].includes(key))
      ) {
        return sendJson(
          response,
          200,
          geoService.transitionSite(
            route.id,
            body as Parameters<typeof geoService.transitionSite>[1],
            geoContext,
          ),
        );
      }
      return sendJson(response, 200, geoService.updateSite(route.id, body, geoContext));
    }
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
  await ensureAuthorized(request, config);

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
  await ensureAuthorized(request, config);

  const partyRoute = resolvePartyRoute(url.pathname);
  if (partyRoute) {
    if (!partyRoute.id && request.method === 'GET') {
      return sendJson(response, 200, partyService.listParties(parsePartyQuery(url.searchParams)));
    }

    if (!partyRoute.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        partyService.createParty(
          (await readBody(request)) as Parameters<typeof partyService.createParty>[0],
        ),
      );
    }

    if (partyRoute.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        partyService.getParty(partyRoute.id),
        'TMF_PARTY_NOT_FOUND',
      );
    }

    if (partyRoute.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        partyService.updateParty(
          partyRoute.id,
          (await readBody(request)) as Parameters<typeof partyService.updateParty>[1],
        ),
      );
    }

    if (partyRoute.id && request.method === 'DELETE') {
      return sendJson(response, 200, partyService.deleteParty(partyRoute.id));
    }
  }

  const roleRoute = resolvePartyRoleRoute(url.pathname);
  if (roleRoute) {
    if (!roleRoute.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        partyService.listPartyRoles(parsePartyRoleQuery(url.searchParams)),
      );
    }

    if (!roleRoute.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        partyService.createPartyRole(
          (await readBody(request)) as Parameters<typeof partyService.createPartyRole>[0],
        ),
      );
    }

    if (roleRoute.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        partyService.getPartyRole(roleRoute.id),
        'TMF_PARTY_ROLE_NOT_FOUND',
      );
    }

    if (roleRoute.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        partyService.updatePartyRole(
          roleRoute.id,
          (await readBody(request)) as Parameters<typeof partyService.updatePartyRole>[1],
        ),
      );
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
  await ensureAuthorized(request, config);

  const route = resolveResourceRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  if (
    route.id &&
    (url.pathname.endsWith('/relationships') || url.pathname.includes('/relationships/'))
  ) {
    if (request.method === 'GET' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 200, resourceService.listResourceRelationships(route.id));
    }

    if (request.method === 'POST' && url.pathname.endsWith('/relationships')) {
      return sendJson(
        response,
        201,
        resourceService.addResourceRelationship(
          route.id,
          (await readBody(request)) as Parameters<
            typeof resourceService.addResourceRelationship
          >[1],
        ),
      );
    }

    if (request.method === 'DELETE' && route.relationshipId) {
      return sendJson(
        response,
        200,
        resourceService.removeResourceRelationship(
          route.id,
          route.relationshipId,
          route.relationshipType ?? 'containsAsChild',
        ),
      );
    }
  }

  if (route.kind === 'resourceSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        resourceService.listResourceSpecifications(
          parseResourceSpecificationQuery(url.searchParams),
        ),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        resourceService.createResourceSpecification(
          (await readBody(request)) as Parameters<
            typeof resourceService.createResourceSpecification
          >[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResourceSpecification(route.id),
        'RESOURCE_SPEC_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        resourceService.updateResourceSpecification(
          route.id,
          (await readBody(request)) as Parameters<
            typeof resourceService.updateResourceSpecification
          >[1],
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, resourceService.deleteResourceSpecification(route.id));
    }
  }

  if (route.kind === 'resourceFunctionSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        resourceService.listResourceFunctionSpecifications(
          parseResourceFunctionSpecificationQuery(url.searchParams),
        ),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        resourceService.createResourceFunctionSpecification(
          (await readBody(request)) as Parameters<
            typeof resourceService.createResourceFunctionSpecification
          >[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResourceFunctionSpecification(route.id),
        'RESOURCE_FUNCTION_SPEC_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        resourceService.updateResourceFunctionSpecification(
          route.id,
          (await readBody(request)) as Parameters<
            typeof resourceService.updateResourceFunctionSpecification
          >[1],
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, resourceService.deleteResourceFunctionSpecification(route.id));
    }
  }

  if (route.kind === 'resourceCategory') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, resourceService.listResourceCategories());
    }
    if (route.id && request.method === 'GET') {
      const category = (await resourceService.listResourceCategories()).find(
        (item) => item.id === route.id || item.code === route.id,
      );
      return sendJsonOrNotFound(response, category, 'RESOURCE_CATEGORY_NOT_FOUND');
    }
  }

  if (route.kind === 'resourceType') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, resourceService.listResourceTypes());
    }
    if (route.id && request.method === 'GET') {
      const resourceType = (await resourceService.listResourceTypes()).find(
        (item) => item.id === route.id || item.code === route.id,
      );
      return sendJsonOrNotFound(response, resourceType, 'RESOURCE_TYPE_NOT_FOUND');
    }
  }

  if (route.kind === 'resource') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        resourceService.listResources(parseResourceQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      const body = await readBody(request);
      const resourceType =
        body['@type'] === 'LogicalResource' || body.supportingPhysicalResourceId
          ? 'LogicalResource'
          : 'PhysicalResource';
      return sendJson(
        response,
        201,
        resourceType === 'LogicalResource'
          ? resourceService.createLogicalResource(
              body as Parameters<typeof resourceService.createLogicalResource>[0],
            )
          : resourceService.createPhysicalResource(
              body as Parameters<typeof resourceService.createPhysicalResource>[0],
            ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResource(route.id),
        'RESOURCE_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      const body = await readBody(request);
      const current = await resourceService.getResource(route.id);
      if (!current)
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      return sendJson(
        response,
        200,
        current['@type'] === 'LogicalResource'
          ? resourceService.updateLogicalResource(
              route.id,
              body as Parameters<typeof resourceService.updateLogicalResource>[1],
            )
          : resourceService.updatePhysicalResource(
              route.id,
              body as Parameters<typeof resourceService.updatePhysicalResource>[1],
            ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      const current = await resourceService.getResource(route.id);
      if (!current)
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
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
      return sendJson(
        response,
        200,
        resourceService.activateResource(
          (await readBody(request)) as Parameters<typeof resourceService.activateResource>[0],
        ),
      );
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
  await ensureAuthorized(request, config);

  const route = resolveServiceRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  if (
    route.id &&
    (url.pathname.endsWith('/relationships') || url.pathname.includes('/relationships/'))
  ) {
    if (request.method === 'GET' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 200, serviceService.listServiceRelationships(route.id));
    }

    if (request.method === 'POST' && url.pathname.endsWith('/relationships')) {
      return sendJson(
        response,
        201,
        serviceService.addServiceRelationship(
          route.id,
          (await readBody(request)) as Parameters<typeof serviceService.addServiceRelationship>[1],
        ),
      );
    }

    if (request.method === 'DELETE' && route.relationshipId) {
      return sendJson(
        response,
        200,
        serviceService.removeServiceRelationship(
          route.id,
          route.relationshipId,
          route.relationshipType ?? 'dependsOn',
        ),
      );
    }
  }

  if (route.kind === 'serviceSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServiceSpecifications(parseServiceSpecificationQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        serviceService.createServiceSpecification(
          (await readBody(request)) as Parameters<
            typeof serviceService.createServiceSpecification
          >[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        serviceService.getServiceSpecification(route.id),
        'SERVICE_SPEC_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        serviceService.updateServiceSpecification(
          route.id,
          (await readBody(request)) as Parameters<
            typeof serviceService.updateServiceSpecification
          >[1],
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceSpecification(route.id));
    }
  }

  if (route.kind === 'serviceCategory') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServiceCategories(parseServiceCategoryQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        serviceService.createServiceCategory(
          (await readBody(request)) as Parameters<typeof serviceService.createServiceCategory>[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        serviceService.getServiceCategory(route.id),
        'SERVICE_CATEGORY_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        serviceService.updateServiceCategory(
          route.id,
          (await readBody(request)) as Parameters<typeof serviceService.updateServiceCategory>[1],
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceCategory(route.id));
    }
  }

  if (route.kind === 'serviceCandidate') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServiceCandidates(parseServiceCandidateQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        serviceService.createServiceCandidate(
          (await readBody(request)) as Parameters<typeof serviceService.createServiceCandidate>[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        serviceService.getServiceCandidate(route.id),
        'SERVICE_CANDIDATE_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        serviceService.updateServiceCandidate(
          route.id,
          (await readBody(request)) as Parameters<typeof serviceService.updateServiceCandidate>[1],
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceCandidate(route.id));
    }
  }

  if (route.kind === 'service') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServices(parseServiceQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        serviceService.createService(
          (await readBody(request)) as Parameters<typeof serviceService.createService>[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(response, serviceService.getService(route.id), 'SERVICE_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        serviceService.updateService(
          route.id,
          (await readBody(request)) as Parameters<typeof serviceService.updateService>[1],
        ),
      );
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
  await ensureAuthorized(request, config);

  const route = resolveOrderRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  if (route.kind === 'serviceQualification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        orderService.listServiceQualifications(parseServiceQualificationQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        orderService.createServiceQualification(
          (await readBody(request)) as Parameters<
            typeof orderService.createServiceQualification
          >[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        orderService.getServiceQualification(route.id),
        'SERVICE_QUALIFICATION_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        orderService.updateServiceQualification(
          route.id,
          (await readBody(request)) as Parameters<
            typeof orderService.updateServiceQualification
          >[1],
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.deleteServiceQualification(route.id));
    }
  }

  if (route.kind === 'serviceOrder') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        orderService.listServiceOrders(parseServiceOrderQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        orderService.createServiceOrder(
          (await readBody(request)) as Parameters<typeof orderService.createServiceOrder>[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        orderService.getServiceOrder(route.id),
        'SERVICE_ORDER_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        orderService.updateServiceOrder(
          route.id,
          (await readBody(request)) as Parameters<typeof orderService.updateServiceOrder>[1],
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.cancelServiceOrder(route.id));
    }
  }

  if (route.kind === 'resourceOrder') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        orderService.listResourceOrders(parseResourceOrderQuery(url.searchParams)),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        orderService.createResourceOrder(
          (await readBody(request)) as Parameters<typeof orderService.createResourceOrder>[0],
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        orderService.getResourceOrder(route.id),
        'RESOURCE_ORDER_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        orderService.updateResourceOrder(
          route.id,
          (await readBody(request)) as Parameters<typeof orderService.updateResourceOrder>[1],
        ),
      );
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
  kind:
    | 'resourceSpecification'
    | 'resourceFunctionSpecification'
    | 'resourceCategory'
    | 'resourceType'
    | 'resource'
    | 'resourceActivation';
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

// Sem limit/offset explícitos, mantém o comportamento histórico (lista completa) para não quebrar
// os consumidores que ainda dependem do catálogo inteiro — a paginação é opt-in por quem pede.
const parseGeoListQuery = (
  params: URLSearchParams,
): {
  name?: string;
  status?:
    | 'Planned'
    | 'InConstruction'
    | 'Active'
    | 'InDeactivation'
    | 'Retired'
    | 'planned'
    | 'active'
    | 'suspended'
    | 'terminated';
  siteSpecificationId?: string;
  parentSiteId?: string | null;
  descendantOfSiteId?: string;
  characteristicName?: string;
  characteristicValue?: string;
  limit?: number;
  offset?: number;
} => {
  const query: { name?: string; limit?: number; offset?: number } = {};
  const name = params.get('name');
  if (name) query.name = name;
  const status = params.get('status');
  if (
    status === 'Planned' ||
    status === 'InConstruction' ||
    status === 'Active' ||
    status === 'InDeactivation' ||
    status === 'Retired' ||
    status === 'planned' ||
    status === 'active' ||
    status === 'suspended' ||
    status === 'terminated'
  ) {
    (query as { status?: typeof status }).status = status;
  }
  const siteSpecificationId = params.get('siteSpecificationId');
  if (siteSpecificationId) {
    (query as { siteSpecificationId?: string }).siteSpecificationId = siteSpecificationId;
  }
  if (params.has('parentSiteId')) {
    const value = params.get('parentSiteId');
    (query as { parentSiteId?: string | null }).parentSiteId =
      value && value.trim().length > 0 ? value : null;
  }
  const descendantOfSiteId = params.get('descendantOfSiteId');
  if (descendantOfSiteId) {
    (query as { descendantOfSiteId?: string }).descendantOfSiteId = descendantOfSiteId;
  }
  const characteristicName = params.get('characteristicName');
  if (characteristicName) {
    (query as { characteristicName?: string }).characteristicName = characteristicName;
  }
  const characteristicValue = params.get('characteristicValue');
  if (characteristicValue !== null) {
    (query as { characteristicValue?: string }).characteristicValue = characteristicValue;
  }
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseGeoRelationshipTypeListQuery = (
  params: URLSearchParams,
): {
  code?: string;
  lifecycleStatus?: 'Active' | 'Retired';
  limit?: number;
  offset?: number;
} => {
  const query: {
    code?: string;
    lifecycleStatus?: 'Active' | 'Retired';
    limit?: number;
    offset?: number;
  } = {};
  const code = params.get('code');
  if (code) query.code = code;
  const lifecycleStatus = params.get('lifecycleStatus');
  if (lifecycleStatus === 'Active' || lifecycleStatus === 'Retired')
    query.lifecycleStatus = lifecycleStatus;
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseGeoLocationSpatialQuery = (
  params: URLSearchParams,
):
  | {
      bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
      near?: { lng: number; lat: number; radiusMeters: number };
      limit?: number;
      offset?: number;
    }
  | undefined => {
  const limit = parseOptionalNumber(params.get('limit'));
  const offset = parseOptionalNumber(params.get('offset'));
  const query: {
    bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
    near?: { lng: number; lat: number; radiusMeters: number };
    limit?: number;
    offset?: number;
  } = {};

  const bbox = params.get('bbox');
  if (bbox) {
    const values = bbox.split(',').map((item) => Number(item));
    if (values.length !== 4 || values.some((item) => !Number.isFinite(item))) {
      throw new AppError('bbox must be minLng,minLat,maxLng,maxLat', {
        code: 'GEO_LOCATION_BBOX_INVALID',
        statusCode: 400,
      });
    }
    const [minLng, minLat, maxLng, maxLat] = values as [number, number, number, number];
    query.bbox = { minLng, minLat, maxLng, maxLat };
  }

  const near = params.get('near');
  if (near) {
    const values = near.split(',').map((item) => Number(item));
    const radiusMeters =
      parseOptionalNumber(params.get('radius')) ?? parseOptionalNumber(params.get('radiusMeters'));
    if (
      values.length !== 2 ||
      values.some((item) => !Number.isFinite(item)) ||
      radiusMeters === undefined
    ) {
      throw new AppError('near must be lng,lat and radius must be provided', {
        code: 'GEO_LOCATION_NEAR_INVALID',
        statusCode: 400,
      });
    }
    const [lng, lat] = values as [number, number];
    query.near = { lng, lat, radiusMeters };
  }

  if (limit !== undefined) query.limit = limit;
  if (offset !== undefined) query.offset = offset;
  return query.bbox || query.near ? query : undefined;
};

const parseGeoSpecificationListQuery = (
  params: URLSearchParams,
): {
  name?: string;
  code?: string;
  category?: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
  lifecycleStatus?: 'Active' | 'Retired';
  limit?: number;
  offset?: number;
} => {
  const query: {
    name?: string;
    code?: string;
    category?: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
    lifecycleStatus?: 'Active' | 'Retired';
    limit?: number;
    offset?: number;
  } = {};
  const name = params.get('name');
  if (name) query.name = name;
  const code = params.get('code');
  if (code) query.code = code;
  const category = params.get('category');
  if (
    category === 'Region' ||
    category === 'FunctionalGroup' ||
    category === 'Site' ||
    category === 'SubSite'
  ) {
    query.category = category;
  }
  const lifecycleStatus = params.get('lifecycleStatus');
  if (lifecycleStatus === 'Active' || lifecycleStatus === 'Retired') {
    query.lifecycleStatus = lifecycleStatus;
  }
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
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
    if (id && !id.includes('/'))
      return { kind: 'resourceSpecification', id: decodeURIComponent(id) };
  }

  if (pathname === `${catalogBase}/resourceFunctionSpecification`)
    return { kind: 'resourceFunctionSpecification' };
  if (pathname.startsWith(`${catalogBase}/resourceFunctionSpecification/`)) {
    const id = pathname.slice(`${catalogBase}/resourceFunctionSpecification/`.length);
    if (id && !id.includes('/'))
      return { kind: 'resourceFunctionSpecification', id: decodeURIComponent(id) };
  }

  if (pathname === `${catalogBase}/resourceCategory`) return { kind: 'resourceCategory' };
  if (pathname.startsWith(`${catalogBase}/resourceCategory/`)) {
    const id = pathname.slice(`${catalogBase}/resourceCategory/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceCategory', id: decodeURIComponent(id) };
  }

  if (pathname === `${catalogBase}/resourceType`) return { kind: 'resourceType' };
  if (pathname.startsWith(`${catalogBase}/resourceType/`)) {
    const id = pathname.slice(`${catalogBase}/resourceType/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceType', id: decodeURIComponent(id) };
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
    if (id && !id.includes('/'))
      return { kind: 'serviceSpecification', id: decodeURIComponent(id) };
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
    if (id && !id.includes('/'))
      return { kind: 'serviceQualification', id: decodeURIComponent(id) };
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
  const includeEnded = params.get('includeEnded');
  if (includeEnded === 'true') {
    query.includeEnded = true;
  }
  const limit = parseOptionalNumber(params.get('limit'));
  if (limit !== undefined) query.limit = limit;
  const offset = parseOptionalNumber(params.get('offset'));
  if (offset !== undefined) query.offset = offset;
  return query;
};

const parseResourceWorkspaceTab = (value: string | null): ResourceWorkspaceTab => {
  if (value === 'LogicalResource' || value === 'ResourceSpecification') {
    return value;
  }
  return 'PhysicalResource';
};

const parseServiceWorkspaceTab = (value: string | null): ServiceWorkspaceTab => {
  if (value === 'ResourceFacingService' || value === 'ServiceSpecification') {
    return value;
  }
  return 'CustomerFacingService';
};

/**
 * Snapshot agregado do workspace de Serviços.
 *
 * O Inventário mostra CFS e RFS juntos (não uma aba por `kind`, ao contrário do Resource), então
 * aqui o corte que vale a pena empurrar pro servidor é a categoria — evita o full-scan global que
 * varria todo o inventário multi-tenant a cada carregamento de página. Dentro da categoria (um
 * recorte tipicamente ordens de grandeza menor), paginação e filtro de coluna continuam no
 * cliente, exatamente como o catálogo de specs sempre funcionou.
 */
const buildServiceWorkspaceSnapshot = async ({
  tab,
  category,
  serviceService,
}: {
  tab: ServiceWorkspaceTab;
  category?: string;
  serviceService: ServiceService;
}): Promise<ServiceWorkspaceSnapshot> => {
  const serviceSpecificationOptions = await loadAllServiceSpecifications(serviceService);
  const serviceCategories = await serviceService.listServiceCategories();
  const serviceCandidates = await serviceService.listServiceCandidates();

  const isCatalogTab = tab === 'ServiceSpecification';
  const categoryFilter = category ? { category } : {};
  const customerFacingServices = isCatalogTab
    ? []
    : ((await serviceService.listServices({
        type: 'CustomerFacingService',
        limit: SERVICE_CATEGORY_FETCH_CAP,
        ...categoryFilter,
      })) as CustomerFacingService[]);
  const resourceFacingServices = isCatalogTab
    ? []
    : ((await serviceService.listServices({
        type: 'ResourceFacingService',
        limit: SERVICE_CATEGORY_FETCH_CAP,
        ...categoryFilter,
      })) as ResourceFacingService[]);

  return {
    serviceSpecificationOptions,
    serviceCategories,
    serviceCandidates,
    customerFacingServices,
    resourceFacingServices,
  };
};

const loadAllServiceSpecifications = async (
  serviceService: ServiceService,
): Promise<ServiceSpecification[]> => {
  const collected: ServiceSpecification[] = [];
  for (let offset = 0; ; offset += RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) {
    const items = await serviceService.listServiceSpecifications({
      limit: RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE,
      offset,
    });
    collected.push(...items);
    if (items.length < RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) break;
  }
  return collected;
};

// `filter` carrega os critérios enviados pelo cliente (categoria já resolvida em
// resourceSpecificationIdIn, picklists de coluna em resourceTypeIn) — items e totalCount usam
// exatamente os mesmos critérios, para nunca divergir entre "página atual" e "total".
const buildResourceWorkspaceSnapshot = async ({
  tab,
  limit,
  offset,
  filter,
  resourceService,
  partyService,
}: {
  tab: ResourceWorkspaceTab;
  limit: number;
  offset: number;
  filter: Pick<ResourceQuery, 'resourceSpecificationIdIn' | 'resourceTypeIn' | 'category' | 'name'>;
  resourceService: ResourceService;
  partyService: PartyService;
}): Promise<ResourceWorkspaceSnapshot> => {
  const resourceSpecificationOptions = await loadAllResourceSpecifications(resourceService);
  const resourceCategories = await resourceService.listResourceCategories();
  const resourceTypes = await resourceService.listResourceTypes();
  const manufacturerOptions = await loadAllManufacturerOptions(partyService);

  const items = await getResourceWorkspaceItems(tab, limit, offset, filter, resourceService);
  const totalCount =
    tab === 'ResourceSpecification'
      ? resourceSpecificationOptions.length
      : await resourceService.countResources({ ...filter, kind: tab, status: 'active' });

  return {
    items,
    totalCount,
    resourceSpecificationOptions,
    resourceCategories,
    resourceTypes,
    manufacturerOptions,
  };
};

const getResourceWorkspaceItems = async (
  tab: ResourceWorkspaceTab,
  limit: number,
  offset: number,
  filter: Pick<ResourceQuery, 'resourceSpecificationIdIn' | 'resourceTypeIn' | 'category' | 'name'>,
  resourceService: ResourceService,
): Promise<Resource[] | ResourceSpecification[]> => {
  if (tab === 'ResourceSpecification') {
    return resourceService.listResourceSpecifications({ limit, offset });
  }

  return resourceService.listResources({ kind: tab, limit, offset, status: 'active', ...filter });
};

const loadAllResourceSpecifications = async (
  resourceService: ResourceService,
): Promise<ResourceSpecification[]> => {
  const collected: ResourceSpecification[] = [];
  for (let offset = 0; ; offset += RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) {
    const items = await resourceService.listResourceSpecifications({
      limit: RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE,
      offset,
    });
    collected.push(...items);
    if (items.length < RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) break;
  }
  return collected;
};

const loadAllManufacturerOptions = async (partyService: PartyService): Promise<Party[]> => {
  const collected: Party[] = [];
  for (let offset = 0; ; offset += RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) {
    const items = await partyService.listPartyRoles({
      limit: RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE,
      offset,
      status: 'active',
      name: 'manufacturer',
    });
    for (const role of items) {
      if (role.party['@referredType'] !== 'Organization') continue;
      collected.push({
        '@type': 'Organization',
        id: role.party.id,
        href: role.party.href ?? `/tmf-api/partyManagement/v4/party/${role.party.id}`,
        name: role.party.name ?? role.party.id,
        status: 'active',
        partyType: 'Organization',
        partyCharacteristic: [],
      });
    }
    if (items.length < RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) break;
  }

  return [...new Map(collected.map((party) => [party.id, party] as const)).values()].sort(
    (left, right) => left.name.localeCompare(right.name),
  );
};

const parseResourceFunctionSpecificationQuery = (
  params: URLSearchParams,
): ResourceFunctionSpecificationQuery => {
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
  if (
    status === 'active' ||
    status === 'inactive' ||
    status === 'suspended' ||
    status === 'terminated'
  ) {
    query.status = status;
  }
  const resourceSpecificationId = params.get('resourceSpecificationId');
  if (resourceSpecificationId) query.resourceSpecificationId = resourceSpecificationId;
  const resourceType = params.get('resourceType');
  if (resourceType) query.resourceType = resourceType;
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
  const v1Match = pathname.match(
    /^\/v1\/geo\/(locations|addresses|site-specifications|sites)(?:\/([^/]+))?$/,
  );
  if (v1Match) {
    return {
      resource: v1Match[1] as GeoEntityRoute['resource'],
      ...(v1Match[2] ? { id: decodeURIComponent(v1Match[2]) } : {}),
    };
  }

  const tmfRoutes: Array<{ path: string; resource: GeoEntityRoute['resource'] }> = [
    { path: '/tmf-api/geographicLocationManagement/v4/geographicLocation', resource: 'locations' },
    { path: '/tmf-api/geographicAddressManagement/v4/geographicAddress', resource: 'addresses' },
    {
      path: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification',
      resource: 'site-specifications',
    },
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

/**
 * Builds the ChatGPT-with-local-fallback provider callback shared by the buffered and
 * streaming "send message" routes. Streaming is opt-in per call via `llmRequest.onDelta`/
 * `llmRequest.signal`, which the service layer attaches to each request it builds.
 */
const createLlmProvider = (
  provider: ChatGPTProvider | null,
  localKnowledgeProvider: LocalKnowledgeProvider,
  llmToolCatalog: ReturnType<typeof buildLlmToolCatalog>,
  session: ResearchSession,
): ((llmRequest: LLMRequest) => Promise<LLMResponse>) =>
  provider
    ? async (llmRequest) => {
        try {
          const providerResponse = await provider.invoke(llmRequest);
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
          return localKnowledgeProvider
            .invoke({
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
    : async (llmRequest) =>
        localKnowledgeProvider.invoke({
          ...llmRequest,
          model: `fallback:${session.model ?? 'nexus-local-docs'}`,
        });

const routeResearchRequest = async ({
  request,
  response,
  config,
  runtime,
  defaultUser,
  searchService,
  researchRepository,
  chatGptProvider,
  geminiProvider,
  localKnowledgeProvider,
  mcpModule,
  llmToolCatalog,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  runtime: NexusRuntime;
  defaultUser: NexusRuntime['defaultUser'];
  searchService: SearchService;
  researchRepository: ResearchMessageRepository;
  chatGptProvider: ChatGPTProvider | null;
  geminiProvider: GeminiProvider | null;
  localKnowledgeProvider: LocalKnowledgeProvider;
  mcpModule: ReturnType<typeof createNexusMcpModule>;
  llmToolCatalog: ReturnType<typeof buildLlmToolCatalog>;
  url: URL;
}): Promise<void> => {
  await ensureAuthorized(request, config);

  // GET /v1/research/sessions - List user's sessions
  if (request.method === 'GET' && url.pathname === '/v1/research/sessions') {
    const sessions = await searchService.listUserSessions(defaultUser.id);
    return sendJson(response, 200, sessions);
  }

  // POST /v1/research/sessions - Create new session
  if (request.method === 'POST' && url.pathname === '/v1/research/sessions') {
    const body = await readBody(request);
    const sessionInput: Parameters<SearchService['createSession']>[1] = {
      title: (body.title || 'New Chat') as string,
      model: (body.model || resolveDefaultModel()) as string,
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

    const session = await searchService.createSession(defaultUser.id, sessionInput);
    return sendJson(response, 201, session);
  }

  // POST /v1/research/sessions/:id/confirmations - Confirm a pending MCP mutation
  if (request.method === 'POST' && url.pathname.includes('/confirmations')) {
    const sessionId = url.pathname.split('/')[4];
    if (!sessionId)
      throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });

    const body = await readBody(request);
    const confirmationToken = body.confirmationToken as string;
    if (!confirmationToken) {
      throw new AppError('confirmationToken required', {
        code: 'INVALID_CONFIRMATION_TOKEN',
        statusCode: 400,
      });
    }

    const session = await searchService.getSession(sessionId);
    if (!session) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });

    const pendingConfirmation = await mcpModule.confirmations.get(confirmationToken);
    if (!pendingConfirmation) {
      throw new AppError('confirmation token not found', {
        code: 'MCP_CONFIRMATION_NOT_FOUND',
        statusCode: 404,
      });
    }

    const pendingSessionId =
      typeof pendingConfirmation.context.sessionId === 'string'
        ? pendingConfirmation.context.sessionId
        : undefined;
    if (pendingSessionId !== sessionId) {
      throw new AppError('confirmation token does not belong to this session', {
        code: 'MCP_CONFIRMATION_SESSION_MISMATCH',
        statusCode: 409,
      });
    }

    const commitToolName = buildConfirmationCommitToolName(
      pendingConfirmation.domain,
      pendingConfirmation.operation,
    );
    const commitResult = await mcpModule.registry.executeTool(
      commitToolName,
      { confirmationToken },
      runtime.createToolContext({
        executionMode: 'internal-chat',
        sessionId,
      }),
    );
    const outcomeMessage = buildConfirmationOutcomeMessage(pendingConfirmation, commitResult);
    const assistantMessage = await researchRepository.addMessage(sessionId, {
      id: createCanonicalId(),
      role: 'assistant',
      content: outcomeMessage,
      metadata: {
        confirmation: {
          ok: commitResult.ok,
          domain: pendingConfirmation.domain,
          operation: pendingConfirmation.operation,
          confirmationToken,
          ...(typeof pendingConfirmation.summary === 'string'
            ? { summary: pendingConfirmation.summary }
            : {}),
          ...(typeof pendingConfirmation.expiresAt === 'string'
            ? { expiresAt: pendingConfirmation.expiresAt }
            : {}),
          ...(Array.isArray((pendingConfirmation as { items?: unknown[] }).items)
            ? { items: (pendingConfirmation as { items?: unknown[] }).items }
            : {}),
        },
      },
    });

    return sendJson(response, 200, {
      assistantMessage,
      confirmation: {
        ok: commitResult.ok,
        domain: pendingConfirmation.domain,
        operation: pendingConfirmation.operation,
        shouldRefreshResourceCatalog: commitResult.ok && pendingConfirmation.domain === 'resource',
      },
    });
  }

  // GET /v1/research/sessions/:id - Get session with messages
  if (request.method === 'GET' && url.pathname.startsWith('/v1/research/sessions/')) {
    const sessionId = url.pathname.split('/').pop();
    if (!sessionId)
      throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });
    const session = await searchService.getSession(sessionId);
    if (!session) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    return sendJson(response, 200, session);
  }

  // POST /v1/research/sessions/:id/messages/stream - Send message and stream the LLM response via SSE
  if (request.method === 'POST' && url.pathname.endsWith('/messages/stream')) {
    const sessionId = url.pathname.split('/')[4]; // /v1/research/sessions/{id}/messages/stream
    if (!sessionId)
      throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });

    const body = await readBody(request);
    const userMessage = body.message as string;
    if (!userMessage)
      throw new AppError('message required', { code: 'INVALID_MESSAGE', statusCode: 400 });

    const session = await searchService.getSession(sessionId);
    if (!session) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });

    const abortController = new AbortController();
    request.on('close', () => abortController.abort());

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: string, data: unknown): void => {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const activeProvider = resolveResearchProvider(session.model, {
      chatGptProvider,
      geminiProvider,
    });
    const llmProvider = createLlmProvider(
      activeProvider,
      localKnowledgeProvider,
      llmToolCatalog,
      session,
    );

    // Streaming responses must never throw past this point: headers are already sent, so any
    // failure has to be reported as an `error` SSE event instead of the normal AppError path.
    try {
      const { userMessage: userMsg, assistantMessage } =
        await searchService.addMessageAndGetResponse(sessionId, userMessage, llmProvider, {
          ...(activeProvider
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
            : {}),
          onDelta: (text) => sendEvent('delta', { text }),
          signal: abortController.signal,
        });
      sendEvent('done', { userMessage: userMsg, assistantMessage });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      sendEvent('error', { message: errorMsg });
    } finally {
      response.end();
    }
    return;
  }

  // POST /v1/research/sessions/:id/messages - Send message and get LLM response
  if (request.method === 'POST' && url.pathname.includes('/messages')) {
    const sessionId = url.pathname.split('/')[4]; // /v1/research/sessions/{id}/messages
    if (!sessionId)
      throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });

    const body = await readBody(request);
    const userMessage = body.message as string;
    if (!userMessage)
      throw new AppError('message required', { code: 'INVALID_MESSAGE', statusCode: 400 });

    const session = await searchService.getSession(sessionId);
    if (!session) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });

    const activeProvider = resolveResearchProvider(session.model, {
      chatGptProvider,
      geminiProvider,
    });
    const llmProvider = createLlmProvider(
      activeProvider,
      localKnowledgeProvider,
      llmToolCatalog,
      session,
    );

    const { userMessage: userMsg, assistantMessage } = await searchService.addMessageAndGetResponse(
      sessionId,
      userMessage,
      llmProvider,
      activeProvider
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
  if (
    request.method === 'PUT' &&
    url.pathname.startsWith('/v1/research/sessions/') &&
    !url.pathname.includes('/messages')
  ) {
    const sessionId = url.pathname.split('/').pop();
    if (!sessionId)
      throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });

    const body = await readBody(request);
    const updated = await searchService.updateSessionTitle(
      sessionId,
      (body.title || 'Untitled') as string,
    );
    if (!updated) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    return sendJson(response, 200, updated);
  }

  // DELETE /v1/research/sessions/:id - Archive session
  if (request.method === 'DELETE' && url.pathname.startsWith('/v1/research/sessions/')) {
    const sessionId = url.pathname.split('/').pop();
    if (!sessionId)
      throw new AppError('invalid session id', { code: 'INVALID_ID', statusCode: 400 });

    const archived = await searchService.archiveSession(sessionId);
    if (!archived) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    return sendJson(response, 200, archived);
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const ensureAuthorized = (request: IncomingMessage, config: AppConfig): Promise<void> =>
  ensureRequestAuthorized(request, config);

// Papéis que administram contas de usuário (ver docs/3-system-design/security.md §3).
const USER_ADMIN_ROLES = ['tenant.admin', 'platform.admin'] as const;

// Deriva as opções de autenticação do runtime a partir da AppConfig — o runtime não lê env
// direto (testabilidade), então a fronteira HTTP traduz config → options.
const runtimeOptionsFromConfig = (config: AppConfig): NexusRuntimeOptions => ({
  auth: {
    ...(config.authJwtSecret ? { jwtSecret: config.authJwtSecret } : {}),
    accessTokenTtlSeconds: (config.authAccessTokenTtlHours ?? 12) * 60 * 60,
    ...(config.adminEmail ? { adminEmail: config.adminEmail } : {}),
    ...(config.adminPassword ? { adminPassword: config.adminPassword } : {}),
  },
});

const sourceIpOf = (request: IncomingMessage): string | undefined => {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() ?? request.socket.remoteAddress ?? undefined;
};

// Resolve o usuário real por trás do contexto (claim `sub` = externalId) e impõe as
// invariantes de sessão: conta ativa e versão do token igual à do banco. É o que dá
// revogação de verdade (desativar conta / "sair de todos os dispositivos") mesmo com JWT
// stateless. O token estático (máquina) não corresponde a nenhum usuário, então rotas com
// requireUser exigem uma sessão de usuário real.
const requireUser = async (
  runtime: NexusRuntime,
  context: RequestContext,
): Promise<NexusRuntimeUser> => {
  const user = await runtime.userRepository.getByExternalId(context.actorSub);
  if (!user || user.status !== 'active') {
    throw new AppError('authentication required', { code: 'AUTH_REQUIRED', statusCode: 401 });
  }
  if (context.tokenVersion !== undefined && context.tokenVersion !== user.tokenVersion) {
    throw new AppError('session revoked', { code: 'AUTH_SESSION_REVOKED', statusCode: 401 });
  }
  return user;
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
    .filter(
      (message): message is OpenAIChatMessage => message !== null && message.content.length > 0,
    );

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

  return resolveDefaultModel();
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

const buildConfirmationCommitToolName = (domain: string, operation: string): string =>
  `${domain}.commit_${operation}`;

const buildConfirmationOperationLabel = (operation: string): string => {
  if (operation === 'create_equipment_model') return 'cadastro';
  if (operation === 'create_equipment_models') return 'cadastro em lote';
  if (operation === 'delete_equipment_model') return 'remocao';
  return 'operacao';
};

const buildConfirmationOutcomeMessage = (
  pendingConfirmation: {
    domain: string;
    operation: string;
    summary?: string;
  },
  commitResult: { ok: boolean; data: unknown; error?: { code?: string; message?: string } },
): string => {
  if (commitResult.ok) {
    if (
      pendingConfirmation.domain === 'resource' &&
      pendingConfirmation.operation === 'create_equipment_models'
    ) {
      const resource = commitResult.data as {
        items?: Array<{
          name?: string;
          relatedParty?: Array<{ name?: string; role?: string }>;
          resourceType?: string;
        }>;
      };
      const items = resource.items ?? [];
      const first = items[0];
      const manufacturer = first?.relatedParty?.find(
        (party) => party.role === 'manufacturer',
      )?.name;
      const modelCount = items.length || (pendingConfirmation.summary ? 1 : 0);
      if (manufacturer && modelCount > 0 && first?.resourceType) {
        return `${modelCount} modelos de ${first.resourceType} da ${manufacturer} cadastrados com sucesso.`;
      }
      if (modelCount > 0) {
        return `${modelCount} modelos cadastrados com sucesso.`;
      }
      return 'Cadastro em lote confirmado com sucesso.';
    }

    if (
      pendingConfirmation.domain === 'resource' &&
      pendingConfirmation.operation === 'create_equipment_model'
    ) {
      const resource = commitResult.data as {
        name?: string;
        relatedParty?: Array<{ name?: string; role?: string }>;
      };
      const manufacturer = resource.relatedParty?.find(
        (party) => party.role === 'manufacturer',
      )?.name;
      const modelName = resource.name ?? pendingConfirmation.summary ?? 'modelo de equipamento';
      return manufacturer
        ? `Modelo ${modelName} da ${manufacturer} cadastrado com sucesso.`
        : `Modelo ${modelName} cadastrado com sucesso.`;
    }

    if (
      pendingConfirmation.domain === 'resource' &&
      pendingConfirmation.operation === 'delete_equipment_model'
    ) {
      const resource = commitResult.data as {
        name?: string;
        relatedParty?: Array<{ name?: string; role?: string }>;
      };
      const manufacturer = resource.relatedParty?.find(
        (party) => party.role === 'manufacturer',
      )?.name;
      const modelName = resource.name ?? pendingConfirmation.summary ?? 'modelo de equipamento';
      return manufacturer
        ? `Modelo ${modelName} da ${manufacturer} removido do catalogo com sucesso.`
        : `Modelo ${modelName} removido do catalogo com sucesso.`;
    }

    if (pendingConfirmation.summary) {
      return `${pendingConfirmation.summary} Confirmado com sucesso.`;
    }

    return 'Cadastro confirmado com sucesso.';
  }

  const code = commitResult.error?.code;
  switch (code) {
    case 'MCP_CONFIRMATION_NOT_FOUND':
      return 'Nao consegui confirmar: o token de confirmacao nao foi encontrado.';
    case 'MCP_CONFIRMATION_ALREADY_CONSUMED':
      return 'Nao consegui confirmar: este token de confirmacao ja foi usado.';
    case 'MCP_CONFIRMATION_EXPIRED':
      return 'Nao consegui confirmar: este token de confirmacao expirou.';
    case 'MCP_CONFIRMATION_SESSION_MISMATCH':
      return 'Nao consegui confirmar: este token nao pertence a esta sessao.';
    case 'RESOURCE_MANUFACTURER_NOT_FOUND':
      return 'Nao consegui confirmar: nao encontrei o fabricante informado no catalogo.';
    case 'RESOURCE_MANUFACTURER_AMBIGUOUS':
      return 'Nao consegui confirmar: o fabricante informado e ambíguo no catalogo.';
    case 'RESOURCE_EQUIPMENT_MODEL_NOT_FOUND':
      return 'Nao consegui confirmar: nao encontrei um modelo ativo com esse nome e fabricante.';
    case 'RESOURCE_EQUIPMENT_MODEL_AMBIGUOUS':
      return 'Nao consegui confirmar: ha mais de um modelo ativo com esse nome e fabricante.';
    case 'RESOURCE_EQUIPMENT_MODEL_ALREADY_REMOVED':
      return 'Nao consegui confirmar: esse modelo ja estava removido do catalogo.';
    default:
      return commitResult.error?.message
        ? `Nao consegui confirmar a ${buildConfirmationOperationLabel(pendingConfirmation.operation)}: ${commitResult.error.message}.`
        : `Nao consegui confirmar a ${buildConfirmationOperationLabel(pendingConfirmation.operation)}.`;
  }
};

const sendJson = async (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): Promise<void> => {
  payload = await Promise.resolve(payload);
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const sendJsonOrNotFound = async (
  response: ServerResponse,
  payload: unknown,
  code: string,
): Promise<void> => {
  payload = await Promise.resolve(payload);
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
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

export const handleHttpError = ({
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
