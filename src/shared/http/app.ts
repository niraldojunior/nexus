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
import { RateLimiter } from './rate-limiter.js';
import {
  startOutboxRelay,
  createLoggingPublisher,
  type OutboxRelayHandle,
} from '../runtime/outbox-relay.js';
import { recordRequestMetric, renderPrometheusMetrics } from './metrics.js';
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
import type { CoverageLevel } from '../../modules/geo/coverage-service.js';
import { parseNodeId, type GeoTreeService } from '../../modules/geo/tree-service.js';
import { isMapDensityZoom, MAP_DENSITY_ZOOMS } from '../../modules/geo/map-density.js';
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
import type { StudioService } from '../../modules/studio/service.js';
import { isStudioDomain } from '../../modules/studio/domain.js';
import type {
  AddMessageInput,
  LLMRequest,
  LLMResponse,
  ResearchMessage,
  ResearchSession,
} from '../../modules/search/domain.js';
import type { TmfEventQuery } from '../tmf/index.js';
import type { EventService } from '../tmf/index.js';
import { buildHref, configureHrefBaseUrl } from '../tmf/index.js';
import type { Party, PartyQuery, PartyRoleQuery } from '../../modules/party/index.js';
import type {
  CreateResourceSpecificationInput,
  Resource,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceSpecification,
  ResourceSpecificationBulkItem,
  ResourceSpecificationQuery,
  ResourceType,
} from '../../modules/resource/index.js';
import type {
  CreateServiceSpecificationInput,
  CustomerFacingService,
  ResourceFacingService,
  ServiceCandidate,
  ServiceCategory,
  ServiceQuery,
  ServiceSpecification,
  ServiceSpecificationBulkItem,
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
  configureHrefBaseUrl(config.tmfPublicBaseUrl);
  const repository = new InMemoryEntityRepository();
  const databaseConfig = databaseConfigOf(config);
  const db = createDatabaseClient(databaseConfig);
  const runtimeOptions = runtimeOptionsFromConfig(config);
  // The runtime builds every repository and runs their seeds, which over a Postgres/Neon
  // backend means dozens of network round-trips. Build it ONCE at startup and reuse it for
  // every request instead of rebuilding per request (which made each request take seconds).
  let runtimePromise: Promise<NexusRuntime> | null = null;
  // Uma instância por app (não módulo): o LLM custa dinheiro por chamada, então limita por ator
  // — 20 requisições/minuto por default. Estado por instância, igual ao rate limit de login
  // (não é garantia sob múltiplas réplicas; o Apigee assume isso quando entrar).
  let outboxRelayHandle: OutboxRelayHandle | null = null;
  const llmRateLimiter = new RateLimiter(
    config.llmRateLimitMax ?? 20,
    config.llmRateLimitWindowMs ?? 60_000,
    'muitas requisições ao assistente; aguarde um instante',
    'LLM_RATE_LIMITED',
  );

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
          llmRateLimiter,
        }),
      )
      .catch((error: unknown) => handleHttpError({ error, logger, response }))
      .finally(() => {
        const durationMs = Date.now() - startedAt;
        const pathname = (request.url ?? '/').split('?')[0] ?? '/';
        recordRequestMetric(request.method, pathname, response.statusCode, durationMs);
        if (durationMs >= 250) {
          // traceId correlaciona com o do chamador (Apigee) quando ele manda x-trace-id/
          // x-request-id — sem esses headers, cada camada geraria um id próprio e o log
          // ficaria com uma correlação falsa, então preferimos omitir a não sintetizar aqui.
          const traceId =
            firstHeaderValue(request, 'x-trace-id') ?? firstHeaderValue(request, 'x-request-id');
          logger.info(
            {
              method: request.method,
              path: request.url,
              durationMs,
              statusCode: response.statusCode,
              ...(traceId ? { traceId } : {}),
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
        logger.warn({}, 'ADMIN_EMAIL/ADMIN_PASSWORD não definidos: nenhum admin semente criado.');
      }

      const port = await new Promise<number>((resolve) => {
        server.listen(config.port, () => {
          const address = server.address();
          const resolvedPort = typeof address === 'object' && address ? address.port : config.port;
          logger.info({ port: config.port, appName: config.appName }, 'server started');
          resolve(resolvedPort);
        });
      });

      // C7: publica o que os módulos gravam em tmf_outbox (ver shared/persistence/audit-outbox.ts).
      // Sink de log no laboratório — troca só o publisher quando o Kafka entrar.
      outboxRelayHandle = startOutboxRelay(db, createLoggingPublisher(logger), { logger });

      return port;
    },
    stop: async (): Promise<void> => {
      outboxRelayHandle?.stop();
      outboxRelayHandle = null;
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
  llmRateLimiter: RateLimiter;
};

const routeRequest = async ({
  request,
  response,
  config,
  logger,
  repository,
  runtime,
  llmRateLimiter,
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

  // Público como /health (readiness do OpenShift/Prometheus não deve exigir bearer token).
  if (request.method === 'GET' && url.pathname === '/metrics') {
    sendText(response, renderPrometheusMetrics());
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
    const workspaceContext = await buildRequestContext(request, config);
    requireRoles(workspaceContext, INVENTORY_READ_ROLES);
    const tab = parseResourceWorkspaceTab(url.searchParams.get('tab'));
    const limit = parseOptionalNumber(url.searchParams.get('limit')) ?? 20;
    const offset = parseOptionalNumber(url.searchParams.get('offset')) ?? 0;
    const resourceSpecificationIdIn = url.searchParams.getAll('resourceSpecificationIdIn');
    const resourceTypeIn = url.searchParams.getAll('resourceTypeIn');
    const name = url.searchParams.get('name');
    const snapshot = await buildResourceWorkspaceSnapshot({
      tab,
      limit,
      offset,
      filter: {
        ...(resourceSpecificationIdIn.length > 0 ? { resourceSpecificationIdIn } : {}),
        ...(resourceTypeIn.length > 0 ? { resourceTypeIn } : {}),
        ...(name ? { name } : {}),
      },
      resourceService: runtime.resourceService,
      partyService: runtime.partyService,
      context: workspaceContext,
    });
    sendJson(response, 200, snapshot);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/resource/specifications/bulk-import') {
    const bulkImportContext = await buildRequestContext(request, config);
    requireRoles(bulkImportContext, CATALOG_ADMIN_ROLES);
    const body = await readBody(request);
    const items = parseResourceSpecificationBulkImportItems(body);
    const result = await runtime.resourceService.bulkCreateResourceSpecifications(
      items,
      bulkImportContext,
    );
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/service/specifications/bulk-import') {
    const serviceBulkImportContext = await buildRequestContext(request, config);
    requireRoles(serviceBulkImportContext, CATALOG_ADMIN_ROLES);
    const body = await readBody(request);
    const items = parseServiceSpecificationBulkImportItems(body);
    const result = await runtime.serviceService.bulkCreateServiceSpecifications(
      items,
      serviceBulkImportContext,
    );
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/service/workspace') {
    const serviceWorkspaceContext = await buildRequestContext(request, config);
    requireRoles(serviceWorkspaceContext, INVENTORY_READ_ROLES);
    const tab = parseServiceWorkspaceTab(url.searchParams.get('tab'));
    const category = url.searchParams.get('category');
    const snapshot = await buildServiceWorkspaceSnapshot({
      tab,
      ...(category ? { category } : {}),
      serviceService: runtime.serviceService,
      context: serviceWorkspaceContext,
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
    const chatContext = await buildRequestContext(request, config);
    llmRateLimiter.check(`${chatContext.actorSub}|${chatContext.sourceIp ?? 'unknown'}`);
    llmRateLimiter.record(`${chatContext.actorSub}|${chatContext.sourceIp ?? 'unknown'}`);

    const body = (await readBody(request)) as OpenAIChatRequestBody;
    const parsed = parseOpenAIChatRequest(body);
    if (!parsed) {
      throw new AppError('messages required', { code: 'INVALID_MESSAGE', statusCode: 400 });
    }

    const messages = prependNexusCopilotContext(parsed.messages);

    const chatProvider = resolveResearchProvider(parsed.model, { chatGptProvider, geminiProvider });
    if (!chatProvider) {
      logger.warn(
        { model: parsed.model },
        'No LLM provider configured; returning fallback completion',
      );
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
      const tenantId = body.tenantId ? String(body.tenantId) : undefined;
      const user = await userRepository.update(userId, {
        ...(body.name ? { name: String(body.name) } : {}),
        ...(email ? { email } : {}),
        ...(tenantId ? { tenantId } : {}),
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
    url.pathname === '/v1/resource-catalogs' ||
    url.pathname.startsWith('/v1/resource-catalogs/') ||
    url.pathname === '/v1/resource-types' ||
    url.pathname.startsWith('/v1/resource-types/') ||
    url.pathname.startsWith('/v1/resources/') ||
    url.pathname === '/v1/resource-statuses' ||
    url.pathname.startsWith('/tmf-api/resourceCatalogManagement/v4/resourceCatalog') ||
    url.pathname.startsWith('/tmf-api/resourceCatalogManagement/v4/resourceSpecification') ||
    url.pathname.startsWith(
      '/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification',
    ) ||
    url.pathname.startsWith('/tmf-api/resourceCatalogManagement/v4/resourceType') ||
    url.pathname.startsWith('/tmf-api/resourceInventoryManagement/v4/resource') ||
    url.pathname.startsWith('/tmf-api/resourceFunctionActivation/v4/resourceFunction')
  ) {
    await routeResourceRequest({ request, response, config, resourceService, serviceService, url });
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

  if (url.pathname.startsWith('/v1/studio/')) {
    await routeStudioRequest({ request, response, config, studioService: runtime.studioService, url });
    return;
  }

  if (url.pathname.startsWith('/v1/research/')) {
    const llmToolCatalog = buildLlmToolCatalog(mcpModule);
    await routeResearchRequest({
      request,
      response,
      config,
      runtime,
      searchService,
      researchRepository,
      chatGptProvider,
      geminiProvider,
      localKnowledgeProvider,
      mcpModule,
      llmToolCatalog,
      llmRateLimiter,
      url,
    });
    return;
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

// Rotas comuns do Nexus Studio (D-ARQ-005) — status/draft/validate/publish/discard/versions/audit
// são idênticas para todo domínio; a diferença fica no adapter registrado em StudioService, não
// aqui. `/v1/studio/{domain}/{ação}` — domínio validado por isStudioDomain antes de qualquer
// leitura de banco, para não vazar um 500 por domínio inexistente.
const readIfMatch = (request: IncomingMessage): string | undefined => {
  const header = request.headers['if-match'];
  return Array.isArray(header) ? header[0] : header;
};

const routeStudioRequest = async ({
  request,
  response,
  config,
  studioService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  studioService: StudioService;
  url: URL;
}): Promise<void> => {
  const segments = url.pathname.split('/').filter(Boolean); // ['v1', 'studio', domain, action?]
  const domainParam = segments[2];
  const action = segments[3];
  if (!domainParam || !isStudioDomain(domainParam)) {
    throw new AppError('unknown studio domain', { code: 'STUDIO_DOMAIN_UNKNOWN', statusCode: 404 });
  }
  const domain = domainParam;

  if (request.method === 'GET' && action === 'status') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, STUDIO_READ_ROLES);
    sendJson(response, 200, await studioService.getStatus(domain, context));
    return;
  }

  if (request.method === 'GET' && action === 'versions') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, STUDIO_READ_ROLES);
    const limit = parseOptionalNumber(url.searchParams.get('limit'));
    const offset = parseOptionalNumber(url.searchParams.get('offset'));
    sendJson(
      response,
      200,
      await studioService.listVersions(domain, context, {
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      }),
    );
    return;
  }

  if (request.method === 'GET' && action === 'audit') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, STUDIO_READ_ROLES);
    const limit = parseOptionalNumber(url.searchParams.get('limit'));
    const offset = parseOptionalNumber(url.searchParams.get('offset'));
    sendJson(
      response,
      200,
      await studioService.listAudit(domain, context, {
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      }),
    );
    return;
  }

  if (request.method === 'PUT' && action === 'draft') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, STUDIO_EDIT_ROLES);
    const body = (await readBody(request)) as { snapshot?: unknown };
    if (!body.snapshot || Array.isArray(body.snapshot) || typeof body.snapshot !== 'object') {
      throw new AppError('snapshot is required', { code: 'STUDIO_SNAPSHOT_REQUIRED', statusCode: 400 });
    }
    const version = await studioService.saveDraft(
      domain,
      body.snapshot as Record<string, unknown>,
      context,
      readIfMatch(request),
    );
    response.setHeader('ETag', version.checksum);
    sendJson(response, 200, version);
    return;
  }

  if (request.method === 'POST' && action === 'validate') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, STUDIO_EDIT_ROLES);
    sendJson(response, 200, await studioService.validateDraft(domain, context));
    return;
  }

  if (request.method === 'POST' && action === 'publish') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, STUDIO_ADMIN_ROLES);
    const ifMatch = readIfMatch(request);
    if (!ifMatch) {
      throw new AppError('If-Match precondition required', {
        code: 'STUDIO_PRECONDITION_REQUIRED',
        statusCode: 428,
      });
    }
    const version = await studioService.publish(domain, context, ifMatch);
    response.setHeader('ETag', version.checksum);
    sendJson(response, 200, version);
    return;
  }

  if (request.method === 'POST' && action === 'discard') {
    const context = await buildRequestContext(request, config);
    requireRoles(context, STUDIO_ADMIN_ROLES);
    const ifMatch = readIfMatch(request);
    if (!ifMatch) {
      throw new AppError('If-Match precondition required', {
        code: 'STUDIO_PRECONDITION_REQUIRED',
        statusCode: 428,
      });
    }
    sendJson(response, 200, await studioService.discardDraft(domain, context, ifMatch));
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

  // Consulta comparativa de endereço: o modelo externo é normalizado pelo gateway Geonet
  // e nunca exposto diretamente à UI. É leitura transitória, sem criar GeographicAddress no Nexus.
  if (request.method === 'GET' && url.pathname === '/v1/geo/address-sources/geonet') {
    const address = (url.searchParams.get('address') ?? '').trim();
    const number = (url.searchParams.get('number') ?? '').trim();
    if (!address) {
      throw new AppError('address required', { code: 'GEONET_ADDRESS_REQUIRED', statusCode: 400 });
    }
    if (!runtime.geonetAddressGateway) {
      return sendJson(response, 200, { status: 'not_configured', candidates: [] });
    }
    return sendJson(response, 200, {
      status: 'ready',
      candidates: await runtime.geonetAddressGateway.search(address, number || undefined),
    });
  }

  const geonetDetailMatch = url.pathname.match(/^\/v1\/geo\/address-sources\/geonet\/([^/]+)$/);
  if (geonetDetailMatch && request.method === 'GET') {
    if (!runtime.geonetAddressGateway) {
      return sendJson(response, 200, { status: 'not_configured', address: null });
    }
    return sendJson(response, 200, {
      status: 'ready',
      address: await runtime.geonetAddressGateway.detail(
        decodeURIComponent(geonetDetailMatch[1] ?? ''),
      ),
    });
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

  // Projetos de trabalho da página Locais (REQ-MOD01-015, estilo "Salvos" do Google Maps):
  // coleções de locais compartilhadas por todo o tenant (C8), não por usuário — por isso
  // `requireRoles`, não `requireUser`. Projeto em si não é entidade TMF (GeoProjectRepository
  // fala com o banco direto, como o histórico de busca), mas cada local do projeto é um
  // GeographicSite (TMF674) real, sempre criado/soft-terminado através do GeoService — nunca
  // um DELETE físico (C6). A exclusão da Hierarquia é feita no próprio GeoTreeService
  // (PROJECT_SITE_EXCLUSION_SQL).
  if (url.pathname === '/v1/geo/project-statuses') {
    requireRoles(geoContext, USER_ADMIN_ROLES);
    if (request.method === 'GET') {
      return sendJson(
        response,
        200,
        await runtime.geoProjectRepository.listStatusCatalog(geoContext.tenantId),
      );
    }
    if (request.method === 'POST') {
      const body = await readBody(request);
      const name = String(body.name ?? '').trim();
      const behavior = parseGeoProjectStatusBehavior(body.behavior);
      if (!name || !behavior) {
        throw new AppError('project status name and behavior are required', {
          code: 'GEO_PROJECT_STATUS_CATALOG_INVALID',
          statusCode: 400,
        });
      }
      if (behavior === 'close-release') {
        throw new AppError('only status code 17 can close a project', {
          code: 'GEO_PROJECT_STATUS_TERMINAL_RESERVED',
          statusCode: 409,
        });
      }
      return sendJson(
        response,
        201,
        await runtime.geoProjectRepository.createStatusCatalogItem(geoContext.tenantId, {
          name,
          sortOrder: Number(body.sortOrder ?? 1000),
          active: body.active !== false,
          behavior,
        }),
      );
    }
  }

  const projectStatusCatalogMatch = url.pathname.match(/^\/v1\/geo\/project-statuses\/([^/]+)$/);
  if (projectStatusCatalogMatch?.[1]) {
    requireRoles(geoContext, USER_ADMIN_ROLES);
    const code = decodeURIComponent(projectStatusCatalogMatch[1]);
    if (request.method === 'PATCH' || request.method === 'DELETE') {
      const body = request.method === 'PATCH' ? await readBody(request) : {};
      const behavior =
        body.behavior === undefined ? undefined : parseGeoProjectStatusBehavior(body.behavior);
      if (code === '1' && body.active === false) {
        throw new AppError('default project status cannot be deactivated', {
          code: 'GEO_PROJECT_STATUS_DEFAULT_PROTECTED',
          statusCode: 409,
        });
      }
      if (
        code === '17' &&
        ((behavior !== undefined && behavior !== 'close-release') || body.active === false)
      ) {
        throw new AppError('project closing status is protected', {
          code: 'GEO_PROJECT_STATUS_TERMINAL_PROTECTED',
          statusCode: 409,
        });
      }
      if (code !== '17' && behavior === 'close-release') {
        throw new AppError('only status code 17 can close a project', {
          code: 'GEO_PROJECT_STATUS_TERMINAL_RESERVED',
          statusCode: 409,
        });
      }
      const updated = await runtime.geoProjectRepository.updateStatusCatalogItem(
        geoContext.tenantId,
        code,
        request.method === 'DELETE'
          ? { active: false }
          : {
              ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
              ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
              ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
              ...(behavior !== undefined ? { behavior } : {}),
            },
      );
      if (!updated)
        throw new AppError('project status not found', {
          code: 'GEO_PROJECT_STATUS_NOT_FOUND',
          statusCode: 404,
        });
      return sendJson(response, 200, updated);
    }
  }

  if (url.pathname === '/v1/geo/projects') {
    if (request.method === 'GET') {
      requireRoles(geoContext, GEO_PROJECT_READ_ROLES);
      return sendJson(response, 200, await runtime.geoProjectRepository.list(geoContext.tenantId));
    }
    if (request.method === 'POST') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const body = await readBody(request);
      assertProjectIconSize(body.iconDataUrl);
      const requestedStatusCode =
        body.statusCode === undefined ? undefined : String(body.statusCode);
      const requestedCatalogStatus = await resolveProjectStatus(
        runtime.geoProjectRepository,
        geoContext.tenantId,
        requestedStatusCode,
      );
      const project = await runtime.geoProjectRepository.create(
        geoContext.tenantId,
        geoContext.actorSub,
        {
          name: String(body.name ?? '').trim() || 'Projeto sem título',
          description: body.description ? String(body.description) : null,
          iconDataUrl: body.iconDataUrl ? String(body.iconDataUrl) : null,
          status:
            projectStatusOperationalStatus(requestedCatalogStatus) ??
            parseGeoProjectStatus(body.status) ??
            'planned',
          statusCode: requestedStatusCode ?? '1',
        },
      );
      return sendJson(response, 201, project);
    }
  }

  const projectMatch = url.pathname.match(/^\/v1\/geo\/projects\/([^/]+)$/);
  if (projectMatch?.[1]) {
    const projectId = decodeURIComponent(projectMatch[1]);
    if (request.method === 'PATCH') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const body = await readBody(request);
      assertProjectIconSize(body.iconDataUrl);
      const current = await runtime.geoProjectRepository.get(geoContext.tenantId, projectId);
      if (!current) {
        throw new AppError('project not found', { code: 'GEO_PROJECT_NOT_FOUND', statusCode: 404 });
      }
      const requestedStatusCode =
        body.statusCode === undefined ? undefined : String(body.statusCode);
      const requestedCatalogStatus = await resolveProjectStatus(
        runtime.geoProjectRepository,
        geoContext.tenantId,
        requestedStatusCode,
      );
      const nextStatus = requestedCatalogStatus
        ? projectStatusOperationalStatus(requestedCatalogStatus)
        : parseGeoProjectStatus(body.status);
      // Projeto terminado não volta: terminar é o fim do ciclo de vida do projeto, não um
      // estado como os demais — os locais já ganharam vida própria (ver cascata abaixo) e o
      // projeto passa a ser só um registro histórico (Origem no painel de Local).
      if (
        (current.status === 'terminated' || current.status === 'cancelled') &&
        nextStatus !== undefined &&
        nextStatus !== 'terminated'
      ) {
        throw new AppError('terminated project status is immutable', {
          code: 'GEO_PROJECT_TERMINATED_IMMUTABLE',
          statusCode: 409,
        });
      }
      const updated = await runtime.geoProjectRepository.update(geoContext.tenantId, projectId, {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description ? String(body.description) : null }
          : {}),
        ...(body.iconDataUrl !== undefined
          ? { iconDataUrl: body.iconDataUrl ? String(body.iconDataUrl) : null }
          : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(requestedCatalogStatus ? { statusCode: requestedCatalogStatus.code } : {}),
      });
      if (!updated) {
        throw new AppError('project not found', { code: 'GEO_PROJECT_NOT_FOUND', statusCode: 404 });
      }
      // O projeto é a unidade de estado (REQ-MOD01-015 §20): quando o status muda,
      // cascateia para cada Site vinculado. Best-effort — uma transição que a máquina
      // canônica recusa (SITE_STATUS_TRANSITIONS em service.ts) não aborta as demais nem
      // o PATCH; o chamador só sabe quantas ficaram para trás (siteCascade). A cascata roda
      // em massa (transitionProjectSites), não um `transitionSite` por local — um projeto
      // com dezenas de milhares de locais (issue #58) nunca terminaria num laço um-a-um.
      //
      // 'terminated' é o único status que NÃO usa a tradução direta de GeoStatusAlias
      // (que mapearia para Retired): terminar o projeto libera os locais — eles viram
      // Active, com vida própria, e o projeto passa a ser só a Origem histórica deles
      // (ver PROJECT_SITE_EXCLUSION_SQL em tree-service.ts, que volta a mostrá-los na
      // Hierarquia/busca/mapa geral assim que o projeto termina).
      let siteCascade: { updated: number; skipped: number; blocked?: number } | undefined;
      let resourceCascade: { updated: number; skipped: number } | undefined;
      if (nextStatus !== undefined && nextStatus !== current.status) {
        const siteIds = await runtime.geoProjectRepository.listSiteIds(
          geoContext.tenantId,
          projectId,
        );
        const cascadeStatus =
          nextStatus === 'terminated'
            ? 'active'
            : nextStatus === 'cancelled'
              ? 'terminated'
              : nextStatus;
        const statusReason =
          nextStatus === 'terminated'
            ? 'Projeto de origem concluído — local liberado para o inventário'
            : nextStatus === 'cancelled'
              ? 'Projeto cancelado — local encerrado'
              : `Status do projeto alterado para ${nextStatus}`;
        const cascadeResult = await geoService.transitionProjectSites(
          projectId,
          siteIds,
          cascadeStatus,
          statusReason,
          geoContext,
        );
        siteCascade = {
          updated: cascadeResult.updated,
          skipped: cascadeResult.skipped,
          ...(cascadeResult.blocked.length > 0 ? { blocked: cascadeResult.blocked.length } : {}),
        };
        // Recursos seguem o mesmo estado do Projeto, mas permanecem entidades TMF
        // independentes. Terminar libera; cancelar encerra e bloqueia.
        const resourceLinks = await runtime.geoProjectRepository.listResourceLinks(
          geoContext.tenantId,
          projectId,
          { limit: 100000 },
        );
        let resourcesUpdated = 0;
        for (const link of resourceLinks) {
          const resource = await runtime.resourceService.getResource(link.resourceId, geoContext);
          if (!resource) continue;
          const resourcePatch =
            nextStatus === 'terminated'
              ? { status: 'active', administrativeState: 'unlocked', operationalState: 'enabled' }
              : nextStatus === 'cancelled'
                ? {
                    status: 'terminated',
                    administrativeState: 'locked',
                    operationalState: 'disabled',
                  }
                : nextStatus === 'active'
                  ? {
                      status: 'active',
                      administrativeState: 'unlocked',
                      operationalState: 'enabled',
                    }
                  : nextStatus === 'suspended'
                    ? {
                        status: 'suspended',
                        administrativeState: 'locked',
                        operationalState: 'disabled',
                      }
                    : {
                        status: 'inactive',
                        administrativeState: 'locked',
                        operationalState: 'disabled',
                      };
          if (resource['@type'] === 'LogicalResource') {
            await runtime.resourceService.updateLogicalResource(
              link.resourceId,
              resourcePatch as Parameters<typeof runtime.resourceService.updateLogicalResource>[1],
              geoContext,
            );
          } else {
            await runtime.resourceService.updatePhysicalResource(
              link.resourceId,
              resourcePatch as Parameters<typeof runtime.resourceService.updatePhysicalResource>[1],
              geoContext,
            );
          }
          resourcesUpdated += 1;
        }
        resourceCascade = {
          updated: resourcesUpdated,
          skipped: resourceLinks.length - resourcesUpdated,
        };
      }
      return sendJson(
        response,
        200,
        siteCascade ? { ...updated, siteCascade, resourceCascade } : updated,
      );
    }
    if (request.method === 'DELETE') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const current = await runtime.geoProjectRepository.get(geoContext.tenantId, projectId);
      if (!current) {
        throw new AppError('project not found', { code: 'GEO_PROJECT_NOT_FOUND', statusCode: 404 });
      }
      // Arquivamento é administrativo: preserva Sites, Resources e todos os vínculos
      // históricos. O ciclo de vida já deve ter chegado a um estado terminal.
      if (current.status !== 'terminated' && current.status !== 'cancelled') {
        throw new AppError('only terminal projects can be archived', {
          code: 'GEO_PROJECT_ARCHIVE_REQUIRES_TERMINAL_STATUS',
          statusCode: 409,
        });
      }
      const archived = await runtime.geoProjectRepository.archive(
        geoContext.tenantId,
        projectId,
        geoContext.actorSub,
      );
      return sendJson(response, 200, { archived: Boolean(archived), project: archived });
    }
  }

  // Manchas de concentração/dispersão do projeto (REQ-MOD01-017), geradas por
  // scripts/build-project-areas.mjs — não há geração pela API, só leitura do que o script já
  // gravou (mesmo modelo somente-leitura da cobertura GPON, GET /v1/geo/coverage).
  // Resources are kept as independent TMF entities; this endpoint exposes the explicit
  // platform association required by the Project workspace.
  const projectResourcesMatch = url.pathname.match(/^\/v1\/geo\/projects\/([^/]+)\/resources$/);
  if (projectResourcesMatch?.[1]) {
    const projectId = decodeURIComponent(projectResourcesMatch[1]);
    if (request.method === 'GET') {
      requireRoles(geoContext, GEO_PROJECT_READ_ROLES);
      const limit = Math.min(
        Math.max(parseOptionalNumber(url.searchParams.get('limit')) ?? 50, 1),
        100,
      );
      const offset = Math.max(parseOptionalNumber(url.searchParams.get('offset')) ?? 0, 0);
      const links = await runtime.geoProjectRepository.listResourceLinks(
        geoContext.tenantId,
        projectId,
        { limit, offset },
      );
      const nodes = await geoTreeService.resourcesByIds(links.map((link) => link.resourceId));
      const items =
        url.searchParams.get('view') === 'infrastructure'
          ? nodes.filter((node) =>
              ['Pole', 'Duct', 'Manhole', 'CTO', 'DIO', 'Splitter'].includes(
                node.resourceType ?? '',
              ),
            )
          : nodes;
      return sendJson(response, 200, { items, offset, limit, hasMore: links.length === limit });
    }
    if (request.method === 'POST') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const project = await runtime.geoProjectRepository.get(geoContext.tenantId, projectId);
      if (!project || project.archivedAt)
        throw new AppError('project not found', { code: 'GEO_PROJECT_NOT_FOUND', statusCode: 404 });
      if (project.status === 'terminated' || project.status === 'cancelled')
        throw new AppError('terminal project cannot receive resources', {
          code: 'GEO_PROJECT_TERMINAL',
          statusCode: 409,
        });
      const body = await readBody(request);
      const kind =
        body['@type'] === 'LogicalResource' || body.supportingPhysicalResourceId
          ? 'LogicalResource'
          : 'PhysicalResource';
      const state =
        project.status === 'active'
          ? { status: 'active', administrativeState: 'unlocked', operationalState: 'enabled' }
          : project.status === 'suspended'
            ? { status: 'suspended', administrativeState: 'locked', operationalState: 'disabled' }
            : { status: 'inactive', administrativeState: 'locked', operationalState: 'disabled' };
      const created =
        kind === 'LogicalResource'
          ? await runtime.resourceService.createLogicalResource(
              { ...body, ...state } as Parameters<
                typeof runtime.resourceService.createLogicalResource
              >[0],
              geoContext,
            )
          : await runtime.resourceService.createPhysicalResource(
              { ...body, ...state } as Parameters<
                typeof runtime.resourceService.createPhysicalResource
              >[0],
              geoContext,
            );
      await runtime.geoProjectRepository.linkResource(
        projectId,
        created.id,
        kind,
        'created',
        geoContext.actorSub,
      );
      return sendJson(response, 201, created);
    }
  }

  const projectResourceMatch = url.pathname.match(
    /^\/v1\/geo\/projects\/([^/]+)\/resources\/([^/]+)$/,
  );
  if (projectResourceMatch?.[1] && projectResourceMatch[2]) {
    const projectId = decodeURIComponent(projectResourceMatch[1]);
    const resourceId = decodeURIComponent(projectResourceMatch[2]);
    if (request.method === 'POST') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const project = await runtime.geoProjectRepository.get(geoContext.tenantId, projectId);
      if (!project || project.archivedAt)
        throw new AppError('project not found', { code: 'GEO_PROJECT_NOT_FOUND', statusCode: 404 });
      if (project.status === 'terminated' || project.status === 'cancelled')
        throw new AppError('terminal project cannot receive resources', {
          code: 'GEO_PROJECT_TERMINAL',
          statusCode: 409,
        });
      const occupied = await runtime.geoProjectRepository.findOpenProjectByResourceId(
        geoContext.tenantId,
        resourceId,
      );
      if (occupied && occupied.projectId !== projectId)
        throw new AppError('resource already belongs to an open project', {
          code: 'GEO_PROJECT_RESOURCE_CONFLICT',
          statusCode: 409,
        });
      const resource = await runtime.resourceService.getResource(resourceId, geoContext);
      if (!resource)
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      await runtime.geoProjectRepository.linkResource(
        projectId,
        resourceId,
        resource['@type'],
        'linked',
        geoContext.actorSub,
      );
      return sendJson(response, 201, resource);
    }
    if (request.method === 'DELETE') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const detached = await runtime.geoProjectRepository.detachResource(
        projectId,
        resourceId,
        geoContext.actorSub,
        'Desvinculado manualmente do projeto',
      );
      if (!detached)
        throw new AppError('project resource link not found', {
          code: 'GEO_PROJECT_RESOURCE_NOT_FOUND',
          statusCode: 404,
        });
      const resource = await runtime.resourceService.getResource(resourceId, geoContext);
      if (resource?.['@type'] === 'LogicalResource')
        await runtime.resourceService.deleteLogicalResource(resourceId, geoContext);
      if (resource?.['@type'] === 'PhysicalResource')
        await runtime.resourceService.deletePhysicalResource(resourceId, geoContext);
      return sendJson(response, 200, { detached: true });
    }
  }

  const projectSearchMatch = url.pathname.match(/^\/v1\/geo\/projects\/([^/]+)\/search$/);
  if (projectSearchMatch?.[1] && request.method === 'GET') {
    requireRoles(geoContext, GEO_PROJECT_READ_ROLES);
    const projectId = decodeURIComponent(projectSearchMatch[1]);
    const query = (url.searchParams.get('q') ?? '').trim().toLocaleLowerCase();
    const scopeParam = url.searchParams.get('scope');
    const scope =
      scopeParam === 'sites' || scopeParam === 'infrastructure' || scopeParam === 'resources'
        ? scopeParam
        : 'all';
    const limit = Math.min(
      Math.max(parseOptionalNumber(url.searchParams.get('limit')) ?? 20, 1),
      20,
    );
    const offset = Math.max(parseOptionalNumber(url.searchParams.get('offset')) ?? 0, 0);
    if (query.length < 2)
      return sendJson(response, 200, { items: [], offset, limit, hasMore: false });
    const matches = await runtime.geoProjectRepository.searchItems(
      geoContext.tenantId,
      projectId,
      query,
      limit + 1,
      scope,
    );
    const page = matches.slice(offset, offset + limit);
    const [sites, resources] = await Promise.all([
      geoTreeService.sitesByIds(page.filter((item) => item.kind === 'site').map((item) => item.id)),
      geoTreeService.resourcesByIds(
        page.filter((item) => item.kind === 'resource').map((item) => item.id),
      ),
    ]);
    const byKey = new Map(
      [...sites, ...resources].map((item) => [`${item.kind}:${item.refId ?? item.id}`, item]),
    );
    const items = page
      .map((item) => byKey.get(`${item.kind}:${item.id}`))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return sendJson(response, 200, {
      items,
      offset,
      limit,
      hasMore: matches.length > offset + limit,
    });
  }

  const projectCandidatesMatch = url.pathname.match(
    /^\/v1\/geo\/projects\/([^/]+)\/resource-candidates$/,
  );
  if (projectCandidatesMatch?.[1] && request.method === 'GET') {
    requireRoles(geoContext, GEO_PROJECT_READ_ROLES);
    const projectId = decodeURIComponent(projectCandidatesMatch[1]);
    const query = (url.searchParams.get('q') ?? '').trim();
    const resources = await runtime.resourceService.listResources(
      {
        ...(query ? { name: query } : {}),
        limit: 50,
      },
      geoContext,
    );
    const available = [] as Resource[];
    for (const resource of resources) {
      const linked = await runtime.geoProjectRepository.findOpenProjectByResourceId(
        geoContext.tenantId,
        resource.id,
      );
      if (!linked || linked.projectId === projectId) available.push(resource);
    }
    return sendJson(response, 200, available);
  }

  const projectAreasMatch = url.pathname.match(/^\/v1\/geo\/projects\/([^/]+)\/areas$/);
  if (projectAreasMatch?.[1] && request.method === 'GET') {
    const projectId = decodeURIComponent(projectAreasMatch[1]);
    requireRoles(geoContext, GEO_PROJECT_READ_ROLES);
    const areas = await runtime.geoProjectRepository.listAreas(geoContext.tenantId, projectId);
    return sendJson(response, 200, { areas });
  }

  const projectSitesMatch = url.pathname.match(/^\/v1\/geo\/projects\/([^/]+)\/sites$/);
  if (projectSitesMatch?.[1]) {
    const projectId = decodeURIComponent(projectSitesMatch[1]);
    if (request.method === 'GET') {
      requireRoles(geoContext, GEO_PROJECT_READ_ROLES);
      const minLng = parseOptionalNumber(url.searchParams.get('minLng'));
      const minLat = parseOptionalNumber(url.searchParams.get('minLat'));
      const maxLng = parseOptionalNumber(url.searchParams.get('maxLng'));
      const maxLat = parseOptionalNumber(url.searchParams.get('maxLat'));
      const limit = parseOptionalNumber(url.searchParams.get('limit'));
      const offset = Math.max(parseOptionalNumber(url.searchParams.get('offset')) ?? 0, 0);
      const hasBounds =
        minLng !== undefined &&
        minLat !== undefined &&
        maxLng !== undefined &&
        maxLat !== undefined;

      // Projeto com manchas geradas (REQ-MOD01-017) só precisa dos locais da região visível —
      // o cliente busca por bbox como já faz para infra sem projeto (fetchViewportResources).
      // Sem bbox, mantém o caminho de sempre (todos os locais, na ordem salva), com `limit`
      // opcional para a lista do painel não baixar dezenas de milhares de linhas de uma vez.
      if (hasBounds) {
        const nodes = await geoTreeService.projectSitesInViewport(
          projectId,
          { minLng, minLat, maxLng, maxLat },
          limit !== undefined ? { limit } : {},
        );
        const sites = nodes.map((node) => ({ ...node, note: null, geonetAddressId: null }));
        return sendJson(response, 200, sites);
      }

      const pageLimit = Math.min(Math.max(limit ?? 50, 1), 100);
      const page = await geoTreeService.projectSitePage(
        geoContext.tenantId,
        projectId,
        pageLimit,
        offset,
      );
      return sendJson(response, 200, {
        items: page.items,
        offset,
        limit: pageLimit,
        total: page.total,
        hasMore: offset + page.items.length < page.total,
      });
    }
    if (request.method === 'POST') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const project = await runtime.geoProjectRepository.get(geoContext.tenantId, projectId);
      if (!project) {
        throw new AppError('project not found', {
          code: 'GEO_PROJECT_NOT_FOUND',
          statusCode: 404,
        });
      }
      const body = await readBody(request);
      const geonetAddressId =
        typeof body.geonetAddressId === 'string' ? body.geonetAddressId.trim() : '';
      if (!geonetAddressId) {
        throw new AppError('geonet address id required to create a project site', {
          code: 'GEO_PROJECT_SITE_GEONET_ADDRESS_REQUIRED',
          statusCode: 400,
        });
      }
      const siteInput =
        body.site && typeof body.site === 'object' ? (body.site as Record<string, unknown>) : {};
      // O local nasce com o status do projeto (herança, não escolha do formulário) — o que
      // o cliente mandar em `site.status` é ignorado aqui de propósito.
      const created = await geoService.createSiteAtAddress(
        {
          ...(body as Parameters<typeof geoService.createSiteAtAddress>[0]),
          site: { ...siteInput, status: project.status } as Parameters<
            typeof geoService.createSiteAtAddress
          >[0]['site'],
        },
        geoContext,
      );
      await runtime.geoProjectRepository.linkSite(projectId, created.site.id, { geonetAddressId });
      const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
      if (note) {
        await runtime.geoProjectRepository.updateSiteLink(projectId, created.site.id, { note });
      }
      return sendJson(response, 201, created);
    }
  }

  const projectSiteMatch = url.pathname.match(/^\/v1\/geo\/projects\/([^/]+)\/sites\/([^/]+)$/);
  if (projectSiteMatch?.[1] && projectSiteMatch[2]) {
    const projectId = decodeURIComponent(projectSiteMatch[1]);
    const siteId = decodeURIComponent(projectSiteMatch[2]);
    if (request.method === 'PATCH') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const linked = await runtime.geoProjectRepository.hasSiteLink(
        geoContext.tenantId,
        projectId,
        siteId,
      );
      if (!linked) {
        throw new AppError('project site not found', {
          code: 'GEO_PROJECT_SITE_NOT_FOUND',
          statusCode: 404,
        });
      }
      const body = await readBody(request);
      // Nunca aceita `status` aqui: o local herda o do projeto (RN — ver PATCH de projeto
      // acima); mudar isoladamente quebraria a herança sem o usuário perceber.
      const site = await geoService.updateSite(
        siteId,
        {
          ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
          ...(body.siteSpecificationId !== undefined
            ? { siteSpecificationId: String(body.siteSpecificationId) }
            : {}),
        },
        geoContext,
      );
      const note =
        body.note === null
          ? null
          : typeof body.note === 'string'
            ? body.note.trim() || null
            : undefined;
      if (note !== undefined) {
        await runtime.geoProjectRepository.updateSiteLink(projectId, siteId, { note });
      }
      return sendJson(response, 200, { site, note });
    }
    if (request.method === 'DELETE') {
      requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
      const linked = await runtime.geoProjectRepository.hasSiteLink(
        geoContext.tenantId,
        projectId,
        siteId,
      );
      if (!linked) {
        throw new AppError('project site not found', {
          code: 'GEO_PROJECT_SITE_NOT_FOUND',
          statusCode: 404,
        });
      }
      // Mesma ordem e mesmo motivo do DELETE de projeto: soft-terminate (C6) antes de
      // desvincular, para uma falha na transição não deixar o local órfão e visível.
      await geoService.transitionSite(
        siteId,
        { status: 'Retired', statusReason: 'Local removido do projeto' },
        geoContext,
      );
      await runtime.geoProjectRepository.unlinkSite(projectId, siteId);
      return sendJson(response, 204, null);
    }
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

  // Um nó por id, já hidratado (geometria inteira + `detail`) — completa a seleção feita a
  // partir de uma feature do InfraOverlay (canvas do mapa): o índice de tile
  // (GeoMapTileService) só carrega o essencial para desenhar, sem `detail` nem, para cabo, a
  // rota inteira (só o trecho recortado no tile clicado). Despacha por prefixo do id
  // (`resource:<uuid>` | `site:<uuid>`) para o mesmo read-model que árvore e busca já usam.
  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/node') {
    const nodeId = url.searchParams.get('id');
    if (!nodeId) {
      throw new AppError('id required', { code: 'GEO_TREE_NODE_REQUIRED', statusCode: 400 });
    }
    const { kind, rest } = parseNodeId(nodeId);
    const nodes =
      kind === 'resource'
        ? await geoTreeService.resourcesByIds([rest])
        : kind === 'site'
          ? await geoTreeService.sitesByIds([rest])
          : [];
    const node = nodes[0];
    if (!node) {
      throw new AppError('node not found', { code: 'GEO_TREE_NODE_NOT_FOUND', statusCode: 404 });
    }
    return sendJson(response, 200, node);
  }

  // "Traceroute" da fibra: do equipamento selecionado até a Estação, alternando
  // equipamento e cabo (ver GeoTreeService.schematicPath) — aba Esquemático do painel de
  // Recurso, no módulo Geo.
  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/schematic') {
    const nodeId = url.searchParams.get('nodeId');
    if (!nodeId) {
      throw new AppError('nodeId required', { code: 'GEO_TREE_NODE_REQUIRED', statusCode: 400 });
    }
    const { kind, rest } = parseNodeId(nodeId);
    if (kind !== 'resource') {
      throw new AppError('nodeId must be a resource', {
        code: 'GEO_TREE_NODE_REQUIRED',
        statusCode: 400,
      });
    }
    return sendJson(response, 200, await geoTreeService.schematicPath(rest));
  }

  // Infra passiva por região visível do mapa — fonte usada em escala de detalhe (≤ 200 m),
  // no lugar da expansão da árvore (ver GeoTreeService.resourcesInViewport). Soma os Sites
  // não-CO da mesma região (GeoTreeService.sitesInViewport, Fase 3 do painel unificado de
  // Local): CO/Estação já vem sempre de roots(), qualquer outro tipo de Site segue a mesma
  // régua de escala de um Recurso — uma chamada só, não duas (backend de dev serializado).
  //
  // `include` (RF-011, controle de camadas do mapa) restringe o que é buscado: lista por
  // vírgula de 'sites' | 'resource-points' | 'resource-lines'. Ausente = tudo (compatibilidade
  // — useAddressViability e qualquer chamador que ainda não conhece o parâmetro); presente,
  // só os tokens reconhecidos contam, e nenhum reconhecido busca nada (mapa com o grupo
  // inteiro desligado no controle de camadas não deve gerar consulta nenhuma).
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
    const bounds = { minLng, minLat, maxLng, maxLat };
    const includeParam = url.searchParams.get('include');
    const includeTokens = includeParam
      ?.split(',')
      .map((token) => token.trim())
      .filter(
        (token): token is 'sites' | 'resource-points' | 'resource-lines' =>
          token === 'sites' || token === 'resource-points' || token === 'resource-lines',
      );
    const wantSites = includeTokens === undefined || includeTokens.includes('sites');
    const wantResourcePoints =
      includeTokens === undefined || includeTokens.includes('resource-points');
    const wantResourceLines =
      includeTokens === undefined || includeTokens.includes('resource-lines');
    const limitOptions = limit !== undefined ? { limit } : {};
    const [resources, sites] = await Promise.all([
      wantResourcePoints || wantResourceLines
        ? geoTreeService.resourcesInViewport(bounds, {
            ...limitOptions,
            shapes: { point: wantResourcePoints, line: wantResourceLines },
          })
        : Promise.resolve([]),
      wantSites ? geoTreeService.sitesInViewport(bounds, limitOptions) : Promise.resolve([]),
    ]);
    return sendJson(response, 200, [...resources, ...sites]);
  }

  // Leitura por tile do índice de exibição do mapa (geo_map_feature — Fase 2 da reengenharia
  // de performance, issue #69), substituto gradual de /v1/geo/tree/viewport no caminho quente
  // do mapa: uma igualdade de 4 colunas contra a PK, sem JOIN nem grafo — o custo não cresce
  // com o tamanho do acervo. Endereçável por tile (não por bbox) de propósito: o cliente decide
  // quais (z,x,y) faltam no seu cache local (ver useViewportInfra) e busca só esses, um tile
  // por requisição. z/x/y fora do que scripts/build-map-features.mjs gerou simplesmente não bate
  // linha nenhuma — devolve [], mesmo comportamento de bbox vazio no endpoint de viewport.
  if (request.method === 'GET' && url.pathname === '/v1/geo/map/tile') {
    const z = parseOptionalNumber(url.searchParams.get('z'));
    const x = parseOptionalNumber(url.searchParams.get('x'));
    const y = parseOptionalNumber(url.searchParams.get('y'));
    if (
      z === undefined ||
      x === undefined ||
      y === undefined ||
      !Number.isInteger(z) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      throw new AppError('z, x and y are required integers', {
        code: 'GEO_MAP_TILE_COORDS_REQUIRED',
        statusCode: 400,
      });
    }
    const features = await runtime.geoMapTileService.tile({ z, x, y });
    return sendJson(response, 200, features);
  }

  // Densidade agregada da planta (geo_map_density — Fase 4, issue #69): o que o mapa desenha
  // ACIMA da escala em que a feature individual some. Por bbox, não por tile único como
  // /v1/geo/map/tile — em zoom aberto a viewport cobre poucas células grossas, e pedir uma a uma
  // custaria mais em ida-e-volta do que a consulta inteira. `z` tem de ser um dos níveis
  // gerados (MAP_DENSITY_ZOOMS); qualquer outro devolveria vazio silenciosamente, então é 400.
  if (request.method === 'GET' && url.pathname === '/v1/geo/map/density') {
    const z = parseOptionalNumber(url.searchParams.get('z'));
    if (z === undefined || !Number.isInteger(z) || !isMapDensityZoom(z)) {
      throw new AppError(`z must be one of ${MAP_DENSITY_ZOOMS.join(', ')}`, {
        code: 'GEO_MAP_DENSITY_ZOOM_INVALID',
        statusCode: 400,
      });
    }
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
        code: 'GEO_MAP_DENSITY_BOUNDS_REQUIRED',
        statusCode: 400,
      });
    }
    const density = await runtime.geoMapDensityService.density(z, {
      minLng,
      minLat,
      maxLng,
      maxLat,
    });
    return sendJson(response, 200, density);
  }

  // Consulta inversa de cobertura GPON (REQ-MOD01-014, issue #171 Fase 4): dado o id de um
  // recurso, resolve seu ponto (via GeoTreeService.resourcesByIds, que já hidrata geometria para
  // os três tipos de `place`) e devolve a célula/áreas de geo_gpon_coverage_* que o contêm — o
  // inverso do recorte por bbox de `/v1/geo/coverage` logo abaixo. "Setor Censitário" não existe
  // no modelo (sem geometria IBGE) — item futuro, fora deste endpoint.
  const coverageByResourceMatch = url.pathname.match(/^\/v1\/geo\/coverage\/by-resource\/([^/]+)$/);
  if (request.method === 'GET' && coverageByResourceMatch?.[1]) {
    const resourceId = decodeURIComponent(coverageByResourceMatch[1]);
    const [node] = await runtime.geoTreeService.resourcesByIds([resourceId]);
    if (!node?.geometry || node.geometry.type !== 'Point') {
      throw new AppError('resource has no point geometry', {
        code: 'GEO_COVERAGE_RESOURCE_NOT_FOUND',
        statusCode: 404,
      });
    }
    const [lng, lat] = node.geometry.coordinates;
    return sendJson(response, 200, runtime.geoCoverageService.coverageForPoint(lng, lat));
  }

  // Mapa de calor de cobertura GPON — fonte do mapa acima de 100 m, no lugar dos recursos
  // individuais e dos clusters (ver GeoCoverageService). `level`: fine (células de 50 m) ou
  // coarse (agregado 250 m) — grade de calor, hoje sem uso no frontend; neighborhood (polígono
  // de bairro), city (polígono de município) ou uf (polígono de estado) — o LOD real usado pelo
  // mapa, escolhido por escala (ver coverageLevelForScale no frontend). `area` é aceito como
  // alias de `neighborhood` — nome do nível antes da LOD por município/estado. Recorte por bbox.
  if (request.method === 'GET' && url.pathname === '/v1/geo/coverage') {
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
        code: 'GEO_COVERAGE_BOUNDS_REQUIRED',
        statusCode: 400,
      });
    }
    const levelParam = url.searchParams.get('level');
    const level: CoverageLevel =
      levelParam === 'coarse' ||
      levelParam === 'city' ||
      levelParam === 'uf' ||
      levelParam === 'neighborhood'
        ? levelParam
        : levelParam === 'area'
          ? 'neighborhood'
          : 'fine';
    return sendJson(
      response,
      200,
      runtime.geoCoverageService.coverage({ minLng, minLat, maxLng, maxLat }, level),
    );
  }

  // Busca por nome para a barra de pesquisa unificada — Estações e Recursos (nunca
  // sub-locais/salas), devolvida como nó de árvore para reusar seleção/mapa/detalhe.
  // `kinds`/`types` (RF-013, filtro de escopo da barra) são opcionais e nunca geram 400
  // em valor desconhecido — o cliente é a única origem, e o pior caso é cair no
  // comportamento geral (sem filtro).
  if (request.method === 'GET' && url.pathname === '/v1/geo/tree/search') {
    const term = url.searchParams.get('q') ?? '';
    const limit = parseOptionalNumber(url.searchParams.get('limit'));
    const kindsParam = url.searchParams.get('kinds');
    const kinds = kindsParam
      ? kindsParam
          .split(',')
          .map((value) => value.trim())
          .filter((value): value is 'site' | 'resource' => value === 'site' || value === 'resource')
      : undefined;
    const typesParam = url.searchParams.get('types');
    const resourceTypes = typesParam
      ? typesParam
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : undefined;
    return sendJson(
      response,
      200,
      geoTreeService.search(term, {
        ...(limit !== undefined ? { limit } : {}),
        ...(kinds && kinds.length > 0 ? { kinds } : {}),
        ...(resourceTypes && resourceTypes.length > 0 ? { resourceTypes } : {}),
      }),
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

  // Origem do local (aba Visão Geral do painel unificado, REQ-MOD01-016): de onde este Site
  // veio — três formas mutuamente exclusivas, checadas nesta ordem. `_origin.system` (C5)
  // vem de uma carga de migração (ver scripts/estacoes_carregar.mjs); o vínculo em
  // geo_project_site sobrevive ao término do projeto (Fase 2), então continua respondendo
  // 'project' mesmo com o local já liberado; sem nenhum dos dois, cai no autor do evento de
  // criação (tmf_audit_log) — cadastro manual pela UI.
  const originMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/origin$/);
  if (originMatch && request.method === 'GET') {
    const siteId = decodeURIComponent(originMatch[1] ?? '');
    const site = await geoService.getSite(siteId, geoContext);
    if (!site) {
      throw new AppError('site not found', { code: 'GEO_SITE_NOT_FOUND', statusCode: 404 });
    }
    const originSystem = site.characteristic.find((c) => c.name === '_origin.system')?.value;
    if (typeof originSystem === 'string' && originSystem) {
      return sendJson(response, 200, { kind: 'import', system: originSystem });
    }
    const project = await runtime.geoProjectRepository.findProjectBySiteId(
      geoContext.tenantId,
      siteId,
    );
    if (project) {
      return sendJson(response, 200, {
        kind: 'project',
        projectId: project.projectId,
        projectName: project.projectName,
      });
    }
    const audit = await geoService.listSiteAudit(siteId, geoContext);
    const createEntry = audit.find((entry) => entry.action === 'create');
    return sendJson(response, 200, {
      kind: 'manual',
      actorSub: createEntry?.actorSub ?? 'desconhecido',
      createdAt: createEntry?.eventTime ?? '',
    });
  }

  // Vínculo de Recurso com o Site (aba Recursos do painel unificado de Local,
  // REQ-MOD01-016). Fica em src/shared/http/app.ts, não em geoService, porque a escrita é
  // do módulo Resource (C2/C3: fronteira Geo↔Resource) — aqui só se resolve o tipo
  // (Physical/Logical) e se delega a `resourceService`, como o restante do roteamento de
  // recursos (`routeResourceRequest`).
  const siteResourcesMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/resources$/);
  if (siteResourcesMatch?.[1] && request.method === 'POST') {
    requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
    const siteId = decodeURIComponent(siteResourcesMatch[1]);
    const site = await geoService.getSite(siteId, geoContext);
    if (!site) {
      throw new AppError('site not found', { code: 'GEO_SITE_NOT_FOUND', statusCode: 404 });
    }
    const body = await readBody(request);
    const resourceId = typeof body.resourceId === 'string' ? body.resourceId.trim() : '';
    if (!resourceId) {
      throw new AppError('resourceId required', {
        code: 'GEO_SITE_RESOURCE_ID_REQUIRED',
        statusCode: 400,
      });
    }
    const resource = await runtime.resourceService.getResource(resourceId, geoContext);
    if (!resource) {
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    }
    const linked =
      resource['@type'] === 'PhysicalResource'
        ? await runtime.resourceService.updatePhysicalResource(
            resourceId,
            { placeId: siteId, placeType: 'GeographicSite' },
            geoContext,
          )
        : await runtime.resourceService.updateLogicalResource(
            resourceId,
            { placeId: siteId, placeType: 'GeographicSite' },
            geoContext,
          );
    return sendJson(response, 200, linked);
  }

  const siteResourceMatch = url.pathname.match(/^\/v1\/geo\/sites\/([^/]+)\/resources\/([^/]+)$/);
  if (siteResourceMatch?.[1] && siteResourceMatch[2] && request.method === 'DELETE') {
    requireRoles(geoContext, GEO_PROJECT_WRITE_ROLES);
    const resourceId = decodeURIComponent(siteResourceMatch[2]);
    const resource = await runtime.resourceService.getResource(resourceId, geoContext);
    if (!resource) {
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    }
    // 'unlink' (default): só desfaz a relação com o Site, o recurso continua no acervo.
    // 'terminate': soft-termina o recurso (C6), como excluí-lo pelo módulo Recursos.
    const mode = url.searchParams.get('mode') === 'terminate' ? 'terminate' : 'unlink';
    if (mode === 'terminate') {
      if (resource['@type'] === 'PhysicalResource') {
        await runtime.resourceService.deletePhysicalResource(resourceId, geoContext);
      } else {
        await runtime.resourceService.deleteLogicalResource(resourceId, geoContext);
      }
    } else if (resource['@type'] === 'PhysicalResource') {
      await runtime.resourceService.updatePhysicalResource(
        resourceId,
        { placeId: null },
        geoContext,
      );
    } else {
      await runtime.resourceService.updateLogicalResource(
        resourceId,
        { placeId: null },
        geoContext,
      );
    }
    return sendJson(response, 204, null);
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
        geoService.listAddresses(parseGeoAddressListQuery(url.searchParams), geoContext),
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
  // TMF688 é transversal e só de leitura (nenhuma escrita nesta rota) — o mesmo papel de
  // leitura de inventário basta.
  const context = await buildRequestContext(request, config);
  requireRoles(context, INVENTORY_READ_ROLES);

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
  const context = await buildRequestContext(request, config);
  requireRoles(context, request.method === 'GET' ? INVENTORY_READ_ROLES : INVENTORY_WRITE_ROLES);

  const partyRoute = resolvePartyRoute(url.pathname);
  if (partyRoute) {
    if (!partyRoute.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        partyService.listParties(parsePartyQuery(url.searchParams), context),
      );
    }

    if (!partyRoute.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        partyService.createParty(
          (await readBody(request)) as Parameters<typeof partyService.createParty>[0],
          context,
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
          context,
        ),
      );
    }

    if (partyRoute.id && request.method === 'DELETE') {
      return sendJson(response, 200, partyService.deleteParty(partyRoute.id, context));
    }
  }

  const roleRoute = resolvePartyRoleRoute(url.pathname);
  if (roleRoute) {
    if (!roleRoute.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        partyService.listPartyRoles(parsePartyRoleQuery(url.searchParams), context),
      );
    }

    if (!roleRoute.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        partyService.createPartyRole(
          (await readBody(request)) as Parameters<typeof partyService.createPartyRole>[0],
          context,
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
          context,
        ),
      );
    }

    if (roleRoute.id && request.method === 'DELETE') {
      return sendJson(response, 200, partyService.deletePartyRole(roleRoute.id, context));
    }
  }

  throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
};

const routeResourceRequest = async ({
  request,
  response,
  config,
  resourceService,
  serviceService,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  resourceService: ResourceService;
  serviceService: ServiceService;
  url: URL;
}): Promise<void> => {
  const context = await buildRequestContext(request, config);

  // Rotas de painel (não-TMF): agregados de leitura do Nexus sobre o inventário canônico.
  // Mantidas no módulo Resource; a árvore Geo continua responsável só pela navegação.
  if (request.method === 'GET' && url.pathname === '/v1/resource-statuses') {
    requireRoles(context, INVENTORY_READ_ROLES);
    return sendJson(
      response,
      200,
      resourceService.listResourceStatusCatalog(
        url.searchParams.get('resourceTypeId') ?? undefined,
        context,
      ),
    );
  }
  const resourceAuditMatch = url.pathname.match(/^\/v1\/resources\/([^/]+)\/audit$/);
  if (request.method === 'GET' && resourceAuditMatch?.[1]) {
    requireRoles(context, INVENTORY_READ_ROLES);
    return sendJson(
      response,
      200,
      resourceService.listPhysicalResourceAudit(
        decodeURIComponent(resourceAuditMatch[1]),
        context,
        parseOptionalNumber(url.searchParams.get('limit')) ?? 200,
      ),
    );
  }
  const resourcePortsMatch = url.pathname.match(/^\/v1\/resources\/([^/]+)\/ports$/);
  if (request.method === 'GET' && resourcePortsMatch?.[1]) {
    requireRoles(context, INVENTORY_READ_ROLES);
    const view = await resourceService.getResourcePortsView(
      decodeURIComponent(resourcePortsMatch[1]),
      context,
    );
    const portIds = view.groups.flatMap((group) => group.ports.map((port) => port.resource.id));
    const activeServicePortIds = await serviceService.listActiveSupportingResourceIds(portIds, context);
    return sendJson(response, 200, {
      ...view,
      groups: view.groups.map((group) => ({
        ...group,
        ports: group.ports.map((port) => ({
          ...port,
          hasActiveService: activeServicePortIds.has(port.resource.id),
        })),
      })),
    });
  }
  const resourcePortDetailMatch = url.pathname.match(/^\/v1\/resources\/([^/]+)\/port-detail$/);
  if (request.method === 'GET' && resourcePortDetailMatch?.[1]) {
    requireRoles(context, INVENTORY_READ_ROLES);
    const detail = await resourceService.getResourcePortDetail(
      decodeURIComponent(resourcePortDetailMatch[1]),
      context,
    );
    const activeServicePortIds = await serviceService.listActiveSupportingResourceIds(
      [detail.resource.id],
      context,
    );
    return sendJson(response, 200, {
      ...detail,
      hasActiveService: activeServicePortIds.has(detail.resource.id),
    });
  }
  const resourceTypeCatalogContextMatch = url.pathname.match(
    /^\/v1\/resource-types\/([^/]+)\/catalog-context$/,
  );
  if (request.method === 'GET' && resourceTypeCatalogContextMatch?.[1]) {
    requireRoles(context, INVENTORY_READ_ROLES);
    return sendJson(
      response,
      200,
      resourceService.getResourceTypeCatalogContext(
        decodeURIComponent(resourceTypeCatalogContextMatch[1]),
        context,
        url.searchParams.get('includeEndedSpecifications') === 'true',
        url.searchParams.get('includeInactivePaths') === 'true',
      ),
    );
  }
  const resourceCatalogTreeMatch = url.pathname.match(/^\/v1\/resource-catalogs\/([^/]+)\/tree$/);
  if (request.method === 'GET' && resourceCatalogTreeMatch?.[1]) {
    requireRoles(context, INVENTORY_READ_ROLES);
    return sendJson(
      response,
      200,
      resourceService.getResourceCatalogTree(
        decodeURIComponent(resourceCatalogTreeMatch[1]),
        context,
        url.searchParams.get('includeInactive') === 'true',
      ),
    );
  }

  const resourceCatalogNodeMatch = url.pathname.match(
    /^\/v1\/resource-catalogs\/([^/]+)\/nodes(?:\/([^/]+)(?:\/(move|path|impact))?)?$/,
  );
  if (resourceCatalogNodeMatch?.[1]) {
    const catalogId = decodeURIComponent(resourceCatalogNodeMatch[1]);
    const nodeId = resourceCatalogNodeMatch[2]
      ? decodeURIComponent(resourceCatalogNodeMatch[2])
      : undefined;
    const action = resourceCatalogNodeMatch[3];

    // Rota de reordenação em lote (POST /v1/resource-catalogs/:id/nodes/reorder)
    if (nodeId === 'reorder' && !action && request.method === 'POST') {
      requireRoles(context, CATALOG_ADMIN_ROLES);
      return sendJson(
        response,
        200,
        await resourceService.reorderResourceCatalogNodes(
          catalogId,
          (await readBody(request)) as Parameters<typeof resourceService.reorderResourceCatalogNodes>[1],
          context,
        ),
      );
    }

    requireRoles(context, request.method === 'GET' ? INVENTORY_READ_ROLES : CATALOG_ADMIN_ROLES);

    if (!nodeId && request.method === 'GET') {
      return sendJson(
        response,
        200,
        resourceService.listResourceCatalogNodes(
          catalogId,
          context,
          url.searchParams.get('includeInactive') === 'true',
        ),
      );
    }
    if (!nodeId && request.method === 'POST') {
      return sendJson(
        response,
        201,
        resourceService.createResourceCatalogNode(
          catalogId,
          (await readBody(request)) as Parameters<typeof resourceService.createResourceCatalogNode>[1],
          context,
        ),
      );
    }
    if (nodeId && !action && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResourceCatalogNode(catalogId, nodeId, context),
        'RESOURCE_CATALOG_NODE_NOT_FOUND',
      );
    }
    if (nodeId && !action && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        resourceService.updateResourceCatalogNode(
          catalogId,
          nodeId,
          (await readBody(request)) as Parameters<typeof resourceService.updateResourceCatalogNode>[2],
          context,
        ),
      );
    }
    if (nodeId && !action && request.method === 'DELETE') {
      return sendJson(response, 200, resourceService.deleteResourceCatalogNode(catalogId, nodeId, context));
    }
    if (nodeId && action === 'move' && request.method === 'POST') {
      return sendJson(
        response,
        200,
        resourceService.moveResourceCatalogNode(
          catalogId,
          nodeId,
          (await readBody(request)) as Parameters<typeof resourceService.moveResourceCatalogNode>[2],
          context,
        ),
      );
    }
    if (nodeId && action === 'path' && request.method === 'GET') {
      return sendJson(response, 200, resourceService.getResourceCatalogNodePath(catalogId, nodeId, context));
    }
    if (nodeId && action === 'impact' && request.method === 'GET') {
      return sendJson(
        response,
        200,
        await resourceService.getResourceCatalogNodeImpact(catalogId, nodeId, context),
      );
    }
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  const resourceDetailMatch = url.pathname.match(/^\/v1\/resources\/([^/]+)\/detail$/);
  if (request.method === 'GET' && resourceDetailMatch?.[1]) {
    requireRoles(context, INVENTORY_READ_ROLES);
    return sendJson(
      response,
      200,
      resourceService.getPhysicalResourceDetail(
        decodeURIComponent(resourceDetailMatch[1]),
        context,
      ),
    );
  }

  const route = resolveResourceRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  // Specifications/functionSpecifications e ResourceCatalog são catálogos (C9): escrita exige
  // catalog.admin. Instâncias (resource/activation/relationships) seguem
  // inventory.reader/inventory.editor, como Geo e Service.
  const isResourceCatalogKind =
    route.kind === 'resourceCatalog' ||
    route.kind === 'resourceSpecification' ||
    route.kind === 'resourceFunctionSpecification' ||
    route.kind === 'resourceType';

  requireRoles(
    context,
    request.method === 'GET'
      ? INVENTORY_READ_ROLES
      : isResourceCatalogKind
        ? CATALOG_ADMIN_ROLES
        : INVENTORY_WRITE_ROLES,
  );

  if (route.kind === 'resourceCatalog') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, resourceService.listResourceCatalogs(parseResourceCatalogQuery(url.searchParams), context));
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        resourceService.createResourceCatalog(
          (await readBody(request)) as Parameters<typeof resourceService.createResourceCatalog>[0],
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResourceCatalog(route.id, context),
        'RESOURCE_CATALOG_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        resourceService.updateResourceCatalog(
          route.id,
          (await readBody(request)) as Parameters<typeof resourceService.updateResourceCatalog>[1],
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, resourceService.deleteResourceCatalog(route.id, context));
    }
  }

  if (
    route.id &&
    (url.pathname.endsWith('/relationships') || url.pathname.includes('/relationships/'))
  ) {
    if (request.method === 'GET' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 200, resourceService.listResourceRelationships(route.id, context));
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
          context,
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
          context,
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
          context,
        ),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        resourceService.createResourceSpecification(
          parseCreateResourceSpecificationInput(await readBody(request)),
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResourceSpecification(route.id, context),
        'RESOURCE_SPEC_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        resourceService.updateResourceSpecification(
          route.id,
          parseUpdateResourceSpecificationInput(await readBody(request)),
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(
        response,
        200,
        resourceService.deleteResourceSpecification(route.id, context),
      );
    }
  }

  if (route.kind === 'resourceFunctionSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        resourceService.listResourceFunctionSpecifications(
          parseResourceFunctionSpecificationQuery(url.searchParams),
          context,
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResourceFunctionSpecification(route.id, context),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(
        response,
        200,
        resourceService.deleteResourceFunctionSpecification(route.id, context),
      );
    }
  }

  if (route.kind === 'resourceType') {
    if (!route.id && request.method === 'GET') {
      return sendJson(response, 200, resourceService.listResourceTypes(context));
    }
    if (route.id && request.method === 'GET') {
      const resourceType = (await resourceService.listResourceTypes(context)).find(
        (item) => item.id === route.id || item.code === route.id,
      );
      return sendJsonOrNotFound(response, resourceType, 'RESOURCE_TYPE_NOT_FOUND');
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        resourceService.updateResourceType(
          route.id,
          parseUpdateResourceTypeInput(await readBody(request)),
          context,
        ),
      );
    }
  }

  if (route.kind === 'resource') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        resourceService.listResources(parseResourceQuery(url.searchParams), context),
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
              context,
            )
          : resourceService.createPhysicalResource(
              body as Parameters<typeof resourceService.createPhysicalResource>[0],
              context,
            ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        resourceService.getResource(route.id, context),
        'RESOURCE_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      const body = await readBody(request);
      const current = await resourceService.getResource(route.id, context);
      if (!current)
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      return sendJson(
        response,
        200,
        current['@type'] === 'LogicalResource'
          ? resourceService.updateLogicalResource(
              route.id,
              body as Parameters<typeof resourceService.updateLogicalResource>[1],
              context,
            )
          : resourceService.updatePhysicalResource(
              route.id,
              body as Parameters<typeof resourceService.updatePhysicalResource>[1],
              context,
            ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      const current = await resourceService.getResource(route.id, context);
      if (!current)
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      return sendJson(
        response,
        200,
        current['@type'] === 'LogicalResource'
          ? resourceService.deleteLogicalResource(route.id, context)
          : resourceService.deletePhysicalResource(route.id, context),
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
          context,
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
  const context = await buildRequestContext(request, config);

  const route = resolveServiceRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  // Specification/category/candidate são catálogo (C9): escrita exige catalog.admin. A
  // instância (service) e suas relações seguem inventory.reader/inventory.editor.
  const isServiceCatalogKind =
    route.kind === 'serviceSpecification' ||
    route.kind === 'serviceCategory' ||
    route.kind === 'serviceCandidate';
  requireRoles(
    context,
    request.method === 'GET'
      ? INVENTORY_READ_ROLES
      : isServiceCatalogKind
        ? CATALOG_ADMIN_ROLES
        : INVENTORY_WRITE_ROLES,
  );

  if (
    route.id &&
    (url.pathname.endsWith('/relationships') || url.pathname.includes('/relationships/'))
  ) {
    if (request.method === 'GET' && url.pathname.endsWith('/relationships')) {
      return sendJson(response, 200, serviceService.listServiceRelationships(route.id, context));
    }

    if (request.method === 'POST' && url.pathname.endsWith('/relationships')) {
      return sendJson(
        response,
        201,
        serviceService.addServiceRelationship(
          route.id,
          (await readBody(request)) as Parameters<typeof serviceService.addServiceRelationship>[1],
          context,
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
          context,
        ),
      );
    }
  }

  if (route.kind === 'serviceSpecification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServiceSpecifications(
          parseServiceSpecificationQuery(url.searchParams),
          context,
        ),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        serviceService.getServiceSpecification(route.id, context),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceSpecification(route.id, context));
    }
  }

  if (route.kind === 'serviceCategory') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServiceCategories(parseServiceCategoryQuery(url.searchParams), context),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        serviceService.createServiceCategory(
          (await readBody(request)) as Parameters<typeof serviceService.createServiceCategory>[0],
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        serviceService.getServiceCategory(route.id, context),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceCategory(route.id, context));
    }
  }

  if (route.kind === 'serviceCandidate') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServiceCandidates(parseServiceCandidateQuery(url.searchParams), context),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        serviceService.createServiceCandidate(
          (await readBody(request)) as Parameters<typeof serviceService.createServiceCandidate>[0],
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        serviceService.getServiceCandidate(route.id, context),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteServiceCandidate(route.id, context));
    }
  }

  if (route.kind === 'service') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        serviceService.listServices(parseServiceQuery(url.searchParams), context),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        serviceService.createService(
          (await readBody(request)) as Parameters<typeof serviceService.createService>[0],
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        serviceService.getService(route.id, context),
        'SERVICE_NOT_FOUND',
      );
    }
    if (route.id && request.method === 'PATCH') {
      return sendJson(
        response,
        200,
        serviceService.updateService(
          route.id,
          (await readBody(request)) as Parameters<typeof serviceService.updateService>[1],
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, serviceService.deleteService(route.id, context));
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
  const context = await buildRequestContext(request, config);

  const route = resolveOrderRoute(url.pathname);
  if (!route) {
    throw new AppError('route not found', { code: 'NOT_FOUND', statusCode: 404 });
  }

  // order.requester abre ordens e consulta viabilidade (leitura + POST); order.operator
  // executa designação e avança o estado de uma ordem existente (PATCH/DELETE).
  requireRoles(
    context,
    request.method === 'GET'
      ? ORDER_READ_ROLES
      : request.method === 'POST'
        ? ORDER_REQUEST_ROLES
        : ORDER_OPERATE_ROLES,
  );

  if (route.kind === 'serviceQualification') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        orderService.listServiceQualifications(
          parseServiceQualificationQuery(url.searchParams),
          context,
        ),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        orderService.getServiceQualification(route.id, context),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.deleteServiceQualification(route.id, context));
    }
  }

  if (route.kind === 'serviceOrder') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        orderService.listServiceOrders(parseServiceOrderQuery(url.searchParams), context),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        orderService.createServiceOrder(
          (await readBody(request)) as Parameters<typeof orderService.createServiceOrder>[0],
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        orderService.getServiceOrder(route.id, context),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.cancelServiceOrder(route.id, context));
    }
  }

  if (route.kind === 'resourceOrder') {
    if (!route.id && request.method === 'GET') {
      return sendJson(
        response,
        200,
        orderService.listResourceOrders(parseResourceOrderQuery(url.searchParams), context),
      );
    }
    if (!route.id && request.method === 'POST') {
      return sendJson(
        response,
        201,
        orderService.createResourceOrder(
          (await readBody(request)) as Parameters<typeof orderService.createResourceOrder>[0],
          context,
        ),
      );
    }
    if (route.id && request.method === 'GET') {
      return sendJsonOrNotFound(
        response,
        orderService.getResourceOrder(route.id, context),
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
          context,
        ),
      );
    }
    if (route.id && request.method === 'DELETE') {
      return sendJson(response, 200, orderService.cancelResourceOrder(route.id, context));
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
    | 'resourceCatalog'
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

// Recusa um ícone de projeto (REQ-MOD01-015) maior que GEO_PROJECT_ICON_MAX_CHARS antes de
// gravar — a validação do cliente (web/src/utils/projectIconImage.ts) não pode ser a única
// barreira contra um upload não processado.
const assertProjectIconSize = (value: unknown): void => {
  if (typeof value !== 'string' || value.length <= GEO_PROJECT_ICON_MAX_CHARS) return;
  throw new AppError('project icon too large', {
    code: 'GEO_PROJECT_ICON_TOO_LARGE',
    statusCode: 413,
  });
};

const GEO_PROJECT_STATUSES = ['planned', 'active', 'suspended', 'terminated', 'cancelled'] as const;
const GEO_PROJECT_STATUS_BEHAVIORS = [
  'planning',
  'execution',
  'suspended',
  'close-release',
] as const;

// `undefined` quando o corpo não trouxe `status` (patch parcial); lança quando trouxe um
// valor fora do vocabulário de GeoProjectStatus.
const parseGeoProjectStatus = (
  value: unknown,
): (typeof GEO_PROJECT_STATUSES)[number] | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && (GEO_PROJECT_STATUSES as readonly string[]).includes(value)) {
    return value as (typeof GEO_PROJECT_STATUSES)[number];
  }
  throw new AppError('invalid project status', {
    code: 'GEO_PROJECT_STATUS_INVALID',
    statusCode: 400,
  });
};

const parseGeoProjectStatusBehavior = (
  value: unknown,
): (typeof GEO_PROJECT_STATUS_BEHAVIORS)[number] | undefined => {
  if (value === undefined) return undefined;
  if (
    typeof value === 'string' &&
    (GEO_PROJECT_STATUS_BEHAVIORS as readonly string[]).includes(value)
  ) {
    return value as (typeof GEO_PROJECT_STATUS_BEHAVIORS)[number];
  }
  throw new AppError('invalid project status behavior', {
    code: 'GEO_PROJECT_STATUS_BEHAVIOR_INVALID',
    statusCode: 400,
  });
};

const projectStatusOperationalStatus = (
  item: { behavior: (typeof GEO_PROJECT_STATUS_BEHAVIORS)[number] } | null | undefined,
): (typeof GEO_PROJECT_STATUSES)[number] | undefined => {
  if (!item) return undefined;
  if (item.behavior === 'execution') return 'active';
  if (item.behavior === 'suspended') return 'suspended';
  if (item.behavior === 'close-release') return 'terminated';
  return 'planned';
};

const resolveProjectStatus = async (
  repository: {
    getStatusCatalogItem: (
      tenantId: string,
      code: string,
    ) => Promise<{
      code: string;
      active: boolean;
      behavior: 'planning' | 'execution' | 'suspended' | 'close-release';
    } | null>;
  },
  tenantId: string,
  code: string | undefined,
) => {
  if (code === undefined) return null;
  const item = await repository.getStatusCatalogItem(tenantId, code);
  if (!item || !item.active) {
    throw new AppError('project status is not available', {
      code: 'GEO_PROJECT_STATUS_UNAVAILABLE',
      statusCode: 409,
    });
  }
  return item;
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
  siteSpecificationIds?: string[];
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
  const siteSpecificationIds = params.get('siteSpecificationIds');
  if (siteSpecificationIds) {
    (query as { siteSpecificationIds?: string[] }).siteSpecificationIds = siteSpecificationIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
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

const parseGeoAddressListQuery = (
  params: URLSearchParams,
): NonNullable<Parameters<GeoService['listAddresses']>[0]> => {
  const query: NonNullable<Parameters<GeoService['listAddresses']>[0]> = {};
  const stringFilters = [
    ['id', 'id'],
    ['name', 'name'],
    ['street', 'street'],
    ['streetNr', 'streetNr'],
    ['city', 'city'],
    ['stateOrProvince', 'stateOrProvince'],
    ['postcode', 'postcode'],
    ['country', 'country'],
    ['geographicLocationId', 'geographicLocationId'],
    ['q', 'q'],
  ] as const;
  for (const [parameter, property] of stringFilters) {
    const value = params.get(parameter);
    if (value?.trim()) Object.assign(query, { [property]: value });
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

  if (pathname === '/v1/resource-catalogs' || pathname === `${catalogBase}/resourceCatalog`)
    return { kind: 'resourceCatalog' };
  if (
    pathname.startsWith('/v1/resource-catalogs/') &&
    !pathname.startsWith('/v1/resource-catalogs/')
  )
    return { kind: 'resourceCatalog' };
  if (pathname.startsWith('/v1/resource-catalogs/')) {
    const id = pathname.slice('/v1/resource-catalogs/'.length);
    if (id && !id.includes('/')) return { kind: 'resourceCatalog', id: decodeURIComponent(id) };
  }
  if (pathname.startsWith(`${catalogBase}/resourceCatalog/`)) {
    const id = pathname.slice(`${catalogBase}/resourceCatalog/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceCatalog', id: decodeURIComponent(id) };
  }

  if (pathname === '/v1/resource-types' || pathname === `${catalogBase}/resourceType`)
    return { kind: 'resourceType' };
  if (pathname.startsWith('/v1/resource-types/')) {
    const id = pathname.slice('/v1/resource-types/'.length);
    if (id && !id.includes('/')) return { kind: 'resourceType', id: decodeURIComponent(id) };
  }
  if (pathname.startsWith(`${catalogBase}/resourceType/`)) {
    const id = pathname.slice(`${catalogBase}/resourceType/`.length);
    if (id && !id.includes('/')) return { kind: 'resourceType', id: decodeURIComponent(id) };
  }

  if (pathname === `${catalogBase}/resourceSpecification`) return { kind: 'resourceSpecification' };
  if (pathname.startsWith(`${catalogBase}/resourceSpecification/`)) {
    const id = pathname.slice(`${catalogBase}/resourceSpecification/`.length);
    if (id && !id.includes('/'))
      return { kind: 'resourceSpecification', id: decodeURIComponent(id) };
  }

  if (pathname === inventoryBase) return { kind: 'resource' };
  if (pathname.startsWith(`${inventoryBase}/`)) {
    const tail = pathname.slice(`${inventoryBase}/`.length);
    if (tail && !tail.includes('/')) return { kind: 'resource', id: decodeURIComponent(tail) };
    // Segundo grupo é o relationshipId; terceiro (opcional) é o relationshipType explícito —
    // sem ele, o DELETE cai no default `containsAsChild` do handler, o que nunca conseguiria
    // remover uma aresta `connectedTo` (issue #177: reparo Porta→CaboDrop precisa disso).
    const relMatch = tail.match(/^([^/]+)\/relationships(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if (relMatch && relMatch[1]) {
      return {
        kind: 'resource',
        id: decodeURIComponent(relMatch[1]),
        ...(relMatch[2] ? { relationshipId: decodeURIComponent(relMatch[2]) } : {}),
        ...(relMatch[3] ? { relationshipType: decodeURIComponent(relMatch[3]) } : {}),
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

const parseResourceCatalogQuery = (
  params: URLSearchParams,
): Parameters<ResourceService['listResourceCatalogs']>[0] => {
  const query: NonNullable<Parameters<ResourceService['listResourceCatalogs']>[0]> = {};
  const name = params.get('name');
  if (name) query.name = name;
  const status = params.get('status');
  if (status === 'active' || status === 'inactive') query.status = status;
  return query;
};

const parseResourceSpecificationQuery = (params: URLSearchParams): ResourceSpecificationQuery => {
  const query: ResourceSpecificationQuery = {};
  const name = params.get('name');
  if (name) query.name = name;
  const resourceTypeId = params.get('resourceTypeId');
  if (resourceTypeId) query.resourceTypeId = resourceTypeId;
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

// Máximo por lote de importação (Configurações → Recursos de Rede → Carga em massa) — limite
// generoso para planilhas reais, mas suficiente para não deixar o backend serial (ver AGENTS.md
// §3) preso processando um upload gigante numa única requisição.
const RESOURCE_SPEC_BULK_IMPORT_MAX_ITEMS = 2000;

const parseResourceSpecificationBulkImportItems = (
  body: Record<string, unknown>,
): ResourceSpecificationBulkItem[] => {
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    throw new AppError('items must be an array', {
      code: 'INVALID_BULK_IMPORT_PAYLOAD',
      statusCode: 400,
    });
  }
  if (rawItems.length === 0) {
    throw new AppError('items must not be empty', {
      code: 'INVALID_BULK_IMPORT_PAYLOAD',
      statusCode: 400,
    });
  }
  if (rawItems.length > RESOURCE_SPEC_BULK_IMPORT_MAX_ITEMS) {
    throw new AppError(`items must not exceed ${RESOURCE_SPEC_BULK_IMPORT_MAX_ITEMS}`, {
      code: 'BULK_IMPORT_TOO_LARGE',
      statusCode: 400,
    });
  }

  return rawItems.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object') {
      throw new AppError(`items[${index}] must be an object`, {
        code: 'INVALID_BULK_IMPORT_PAYLOAD',
        statusCode: 400,
      });
    }
    const record = rawItem as Record<string, unknown>;
    const line = typeof record.line === 'number' ? record.line : index + 1;
    const input = record.input;
    if (!input || typeof input !== 'object') {
      throw new AppError(`items[${index}].input must be an object`, {
        code: 'INVALID_BULK_IMPORT_PAYLOAD',
        statusCode: 400,
      });
    }
    return {
      line,
      input: parseCreateResourceSpecificationInput(
        input as Record<string, unknown>,
        `items[${index}].input`,
      ),
    };
  });
};

const parseCreateResourceSpecificationInput = (
  body: Record<string, unknown>,
  label = 'body',
): CreateResourceSpecificationInput => {
  assertResourceSpecificationLegacyFieldsAbsent(body);
  if (typeof body.resourceTypeId !== 'string' || !body.resourceTypeId.trim()) {
    throw new AppError(`${label}.resourceTypeId is required`, {
      code: 'RESOURCE_REQUIRED_FIELD',
      statusCode: 400,
    });
  }
  return { ...body, resourceTypeId: body.resourceTypeId.trim() } as CreateResourceSpecificationInput;
};

const parseUpdateResourceSpecificationInput = (
  body: Record<string, unknown>,
): Parameters<ResourceService['updateResourceSpecification']>[1] => {
  assertResourceSpecificationLegacyFieldsAbsent(body);
  if (body.resourceTypeId !== undefined) {
    if (typeof body.resourceTypeId !== 'string' || !body.resourceTypeId.trim()) {
      throw new AppError('resourceTypeId must be a non-empty string', {
        code: 'RESOURCE_REQUIRED_FIELD',
        statusCode: 400,
      });
    }
    return { ...body, resourceTypeId: body.resourceTypeId.trim() } as Parameters<
      ResourceService['updateResourceSpecification']
    >[1];
  }
  return body as Parameters<ResourceService['updateResourceSpecification']>[1];
};

const assertResourceSpecificationLegacyFieldsAbsent = (body: Record<string, unknown>): void => {
  const removed = ['category', 'resourceType', 'resourceLayerId'].find((field) => field in body);
  if (removed) {
    throw new AppError(`${removed} was removed; use resourceTypeId`, {
      code: 'RESOURCE_SPEC_FIELD_REMOVED',
      statusCode: 400,
    });
  }
};

// ResourceType ainda não tem CRUD completo (issue #216 restringe deliberadamente a
// resourceTypeCharacteristic) — qualquer outro campo no corpo é rejeitado com o mesmo padrão de
// erro usado em assertResourceSpecificationLegacyFieldsAbsent.
const parseUpdateResourceTypeInput = (
  body: Record<string, unknown>,
): Parameters<ResourceService['updateResourceType']>[1] => {
  const unexpected = Object.keys(body).find((field) => field !== 'resourceTypeCharacteristic');
  if (unexpected) {
    throw new AppError(`${unexpected} is not editable; only resourceTypeCharacteristic is`, {
      code: 'RESOURCE_TYPE_FIELD_NOT_EDITABLE',
      statusCode: 400,
    });
  }
  if (!Array.isArray(body.resourceTypeCharacteristic)) {
    throw new AppError('resourceTypeCharacteristic must be an array', {
      code: 'RESOURCE_REQUIRED_FIELD',
      statusCode: 400,
    });
  }
  return { resourceTypeCharacteristic: body.resourceTypeCharacteristic } as Parameters<
    ResourceService['updateResourceType']
  >[1];
};

// Mesmo limite do Resource (RESOURCE_SPEC_BULK_IMPORT_MAX_ITEMS) — Configurações → Catálogo de
// Serviços → Carga em massa.
const SERVICE_SPEC_BULK_IMPORT_MAX_ITEMS = 2000;

const parseServiceSpecificationBulkImportItems = (
  body: Record<string, unknown>,
): ServiceSpecificationBulkItem[] => {
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    throw new AppError('items must be an array', {
      code: 'INVALID_BULK_IMPORT_PAYLOAD',
      statusCode: 400,
    });
  }
  if (rawItems.length === 0) {
    throw new AppError('items must not be empty', {
      code: 'INVALID_BULK_IMPORT_PAYLOAD',
      statusCode: 400,
    });
  }
  if (rawItems.length > SERVICE_SPEC_BULK_IMPORT_MAX_ITEMS) {
    throw new AppError(`items must not exceed ${SERVICE_SPEC_BULK_IMPORT_MAX_ITEMS}`, {
      code: 'BULK_IMPORT_TOO_LARGE',
      statusCode: 400,
    });
  }

  return rawItems.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object') {
      throw new AppError(`items[${index}] must be an object`, {
        code: 'INVALID_BULK_IMPORT_PAYLOAD',
        statusCode: 400,
      });
    }
    const record = rawItem as Record<string, unknown>;
    const line = typeof record.line === 'number' ? record.line : index + 1;
    const input = record.input;
    if (!input || typeof input !== 'object') {
      throw new AppError(`items[${index}].input must be an object`, {
        code: 'INVALID_BULK_IMPORT_PAYLOAD',
        statusCode: 400,
      });
    }
    return { line, input: input as CreateServiceSpecificationInput };
  });
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
  context,
}: {
  tab: ServiceWorkspaceTab;
  category?: string;
  serviceService: ServiceService;
  context?: RequestContext;
}): Promise<ServiceWorkspaceSnapshot> => {
  const serviceSpecificationOptions = await loadAllServiceSpecifications(serviceService, context);
  const serviceCategories = await serviceService.listServiceCategories(undefined, context);
  const serviceCandidates = await serviceService.listServiceCandidates(undefined, context);

  const isCatalogTab = tab === 'ServiceSpecification';
  const categoryFilter = category ? { category } : {};
  const customerFacingServices = isCatalogTab
    ? []
    : ((await serviceService.listServices(
        {
          type: 'CustomerFacingService',
          limit: SERVICE_CATEGORY_FETCH_CAP,
          ...categoryFilter,
        },
        context,
      )) as CustomerFacingService[]);
  const resourceFacingServices = isCatalogTab
    ? []
    : ((await serviceService.listServices(
        {
          type: 'ResourceFacingService',
          limit: SERVICE_CATEGORY_FETCH_CAP,
          ...categoryFilter,
        },
        context,
      )) as ResourceFacingService[]);

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
  context?: RequestContext,
): Promise<ServiceSpecification[]> => {
  const collected: ServiceSpecification[] = [];
  for (let offset = 0; ; offset += RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) {
    const items = await serviceService.listServiceSpecifications(
      {
        limit: RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE,
        offset,
      },
      context,
    );
    collected.push(...items);
    if (items.length < RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) break;
  }
  return collected;
};

// `filter` carrega os critérios enviados pelo cliente (resourceSpecificationIdIn e picklists de
// coluna em resourceTypeIn) — items e totalCount usam exatamente os mesmos critérios, para nunca
// divergir entre "página atual" e "total".
const buildResourceWorkspaceSnapshot = async ({
  tab,
  limit,
  offset,
  filter,
  resourceService,
  partyService,
  context,
}: {
  tab: ResourceWorkspaceTab;
  limit: number;
  offset: number;
  filter: Pick<ResourceQuery, 'resourceSpecificationIdIn' | 'resourceTypeIn' | 'name'>;
  resourceService: ResourceService;
  partyService: PartyService;
  context?: RequestContext;
}): Promise<ResourceWorkspaceSnapshot> => {
  const resourceSpecificationOptions = await loadAllResourceSpecifications(
    resourceService,
    context,
  );
  const resourceTypes = await resourceService.listResourceTypes(context);
  const manufacturerOptions = await loadAllManufacturerOptions(partyService);

  const items = await getResourceWorkspaceItems(
    tab,
    limit,
    offset,
    filter,
    resourceService,
    context,
  );
  const totalCount =
    tab === 'ResourceSpecification'
      ? resourceSpecificationOptions.length
      : await resourceService.countResources({ ...filter, kind: tab, status: 'active' }, context);

  return {
    items,
    totalCount,
    resourceSpecificationOptions,
    resourceTypes,
    manufacturerOptions,
  };
};

const getResourceWorkspaceItems = async (
  tab: ResourceWorkspaceTab,
  limit: number,
  offset: number,
  filter: Pick<ResourceQuery, 'resourceSpecificationIdIn' | 'resourceTypeIn' | 'name'>,
  resourceService: ResourceService,
  context?: RequestContext,
): Promise<Resource[] | ResourceSpecification[]> => {
  if (tab === 'ResourceSpecification') {
    return resourceService.listResourceSpecifications({ limit, offset }, context);
  }

  return resourceService.listResources(
    { kind: tab, limit, offset, status: 'active', ...filter },
    context,
  );
};

const loadAllResourceSpecifications = async (
  resourceService: ResourceService,
  context?: RequestContext,
): Promise<ResourceSpecification[]> => {
  const collected: ResourceSpecification[] = [];
  for (let offset = 0; ; offset += RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE) {
    const items = await resourceService.listResourceSpecifications(
      {
        limit: RESOURCE_WORKSPACE_LOOKUP_PAGE_SIZE,
        offset,
      },
      context,
    );
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
        href: role.party.href ?? buildHref('party', role.party.id),
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
  searchService,
  researchRepository,
  chatGptProvider,
  geminiProvider,
  localKnowledgeProvider,
  mcpModule,
  llmToolCatalog,
  llmRateLimiter,
  url,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  config: AppConfig;
  runtime: NexusRuntime;
  searchService: SearchService;
  researchRepository: ResearchMessageRepository;
  chatGptProvider: ChatGPTProvider | null;
  geminiProvider: GeminiProvider | null;
  localKnowledgeProvider: LocalKnowledgeProvider;
  mcpModule: ReturnType<typeof createNexusMcpModule>;
  llmToolCatalog: ReturnType<typeof buildLlmToolCatalog>;
  llmRateLimiter: RateLimiter;
  url: URL;
}): Promise<void> => {
  // Sessões de pesquisa/Copilot são por usuário: antes, toda sessão era gravada e lida sob o
  // `defaultUser` compartilhado, então qualquer conta autenticada via token estático via
  // `x-actor-sub` (ou, sem isso, todas as contas) enxergava o mesmo histórico. `requireUser`
  // resolve a identidade real; `assertSessionOwnership` barra o acesso cruzado por id adivinhado.
  const context = await buildRequestContext(request, config);
  const user = await requireUser(runtime, context);

  // GET /v1/research/sessions - List user's sessions
  if (request.method === 'GET' && url.pathname === '/v1/research/sessions') {
    const sessions = await searchService.listUserSessions(user.id);
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

    const session = await searchService.createSession(user.id, sessionInput);
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
    assertSessionOwnership(session, user);

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
    assertSessionOwnership(session, user);
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
    assertSessionOwnership(session, user);
    llmRateLimiter.check(user.id);
    llmRateLimiter.record(user.id);

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
    assertSessionOwnership(session, user);
    llmRateLimiter.check(user.id);
    llmRateLimiter.record(user.id);

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

    const existing = await searchService.getSession(sessionId);
    if (!existing) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    assertSessionOwnership(existing, user);

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

    const existing = await searchService.getSession(sessionId);
    if (!existing) throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
    assertSessionOwnership(existing, user);

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

// Mesmos papéis que GeoService.assertRole exige internamente para leitura/escrita de Site
// (READ_ROLE/WRITE_ROLE, privados a service.ts) — os Projetos de trabalho (REQ-MOD01-015)
// não passam pelo GeoService, então a rota HTTP replica a checagem aqui.
const GEO_PROJECT_READ_ROLES = ['inventory.reader', 'platform.admin'] as const;
const GEO_PROJECT_WRITE_ROLES = ['inventory.editor', 'platform.admin'] as const;

// RBAC de Party/Resource/Service/Event/Order (ver docs/3-system-design/security.md §3). Segue o
// mesmo critério estrito do GeoService.assertRole: papel exato ou platform.admin — não há
// hierarquia implícita entre papéis (um editor sem `inventory.reader` não lê por herança).
const INVENTORY_READ_ROLES = ['inventory.reader', 'platform.admin'] as const;
const INVENTORY_WRITE_ROLES = ['inventory.editor', 'platform.admin'] as const;
// Specifications/RelationshipTypes (catálogo) só mudam com catalog.admin; a leitura do catálogo
// segue o papel de leitura comum, mesmo critério do GeoService para RelationshipType (§3, C9).
const CATALOG_ADMIN_ROLES = ['catalog.admin', 'platform.admin'] as const;
// Studio é o control plane de metadados. Os papéis são explícitos para que o leitor também possa
// consultar o draft compartilhado; escrita/publicação usam gates mais estritos em seus endpoints.
export const STUDIO_READ_ROLES = [
  'studio.reader',
  'studio.editor',
  'studio.admin',
  'platform.admin',
] as const;
export const STUDIO_EDIT_ROLES = ['studio.editor', 'studio.admin', 'platform.admin'] as const;
export const STUDIO_ADMIN_ROLES = ['studio.admin', 'platform.admin'] as const;
// order.requester abre ordens e consulta viabilidade (leitura + criação); order.operator executa
// designação e avança o estado de uma ordem existente (PATCH/DELETE).
const ORDER_READ_ROLES = ['order.requester', 'order.operator', 'platform.admin'] as const;
const ORDER_REQUEST_ROLES = ['order.requester', 'platform.admin'] as const;
const ORDER_OPERATE_ROLES = ['order.operator', 'platform.admin'] as const;

// Teto do ícone de projeto (data URL): o cliente reduz para ~128×128 antes de enviar
// (ver web/src/utils/projectIconImage.ts), então qualquer coisa acima disto é sinal de
// upload não processado — recusar aqui evita gravar um blob grande na coluna CLOB.
const GEO_PROJECT_ICON_MAX_CHARS = 120_000;

// Deriva as opções de autenticação do runtime a partir da AppConfig — o runtime não lê env
// direto (testabilidade), então a fronteira HTTP traduz config → options.
// Exportado porque o handler serverless (vercel-handler.ts) precisa construir o runtime com as
// mesmas opções do servidor standalone — sem elas o AuthService nasce sem jwtSecret e todo login
// responde 503, e o ensureAdmin nunca roda.
export const runtimeOptionsFromConfig = (config: AppConfig): NexusRuntimeOptions => ({
  auth: {
    ...(config.authJwtSecret ? { jwtSecret: config.authJwtSecret } : {}),
    accessTokenTtlSeconds: (config.authAccessTokenTtlHours ?? 12) * 60 * 60,
    ...(config.adminEmail ? { adminEmail: config.adminEmail } : {}),
    ...(config.adminPassword ? { adminPassword: config.adminPassword } : {}),
  },
  ...(config.geonet ? { geonet: config.geonet } : {}),
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

// Sessões de pesquisa/Copilot pertencem a um usuário (`session.userId`). 404, não 403 — a
// existência da sessão já é informação (mesmo critério do isolamento de tenant em
// docs/3-system-design/security.md §4).
const assertSessionOwnership = (session: { userId: string }, user: { id: string }): void => {
  if (session.userId !== user.id) {
    throw new AppError('session not found', { code: 'NOT_FOUND', statusCode: 404 });
  }
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
  if (operation === 'create_condominium') return 'cadastro do condominio';
  if (operation === 'create_address') return 'cadastro do endereco';
  if (operation === 'create_site') return 'cadastro do site';
  if (operation === 'update_physical_resource') return 'atualizacao do recurso';
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
      pendingConfirmation.domain === 'geo' &&
      pendingConfirmation.operation === 'create_condominium'
    ) {
      const result = commitResult.data as {
        condominium?: { name?: string };
        blocks?: Array<{ site?: { name?: string }; cdoi?: { name?: string } }>;
      };
      const name = result.condominium?.name ?? 'Condominio';
      return `${name} cadastrado com ${result.blocks?.length ?? 0} blocos e CDOIs vinculadas com sucesso.`;
    }

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

const sendText = (response: ServerResponse, text: string): void => {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
  response.end(text);
};

const firstHeaderValue = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
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
