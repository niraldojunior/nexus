import { AppError } from '../../shared/errors/app-error.js';
import { isProjectInfrastructureResourceType } from '../project/project-resource-classification.js';
import type { NexusRuntime } from '../../shared/runtime/nexus-runtime.js';
import type { Characteristic, TmfEventQuery } from '../../shared/tmf/index.js';
import type { CreatePartyInput, CreatePartyRoleInput, PartyQuery } from '../party/index.js';
import type {
  CreatePhysicalResourceInput,
  CreateLogicalResourceInput,
  CreateResourceSpecificationInput,
  ResourceFunctionActivationInput,
  ResourceSpecification,
  ResourceQuery,
  UpdatePhysicalResourceInput,
} from '../resource/index.js';
import { MODEL_CHARACTERISTIC } from '../resource/canonical-characteristics.js';
import type { CreateServiceInput, ServiceQuery } from '../service/index.js';
import type { AddressInput } from '../geo/index.js';
import type { GeographicAddress, GeographicLocation } from '../geo/domain.js';
import type {
  CreateResourceOrderInput,
  CreateServiceOrderInput,
  CreateServiceQualificationInput,
} from '../order/index.js';
import {
  CATALOG_ADMIN_ROLES,
  INVENTORY_READ_ROLES,
  INVENTORY_WRITE_ROLES,
  ORDER_READ_ROLES,
  ORDER_REQUEST_ROLES,
  PROJECT_READ_ROLES,
  STUDIO_READ_ROLES,
  USER_ADMIN_ROLES,
} from '../../shared/http/roles.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import { registerGeoOperations } from './operations/geo.js';
import { registerResourceOperations } from './operations/resource.js';
import { registerServiceOperations } from './operations/service.js';
import { registerOrderOperations } from './operations/order.js';
import { registerPartyOperations } from './operations/party.js';
import { registerStudioOperations } from './operations/studio.js';
import { type JsonSchema, validateJsonSchema } from './schema.js';
import { createGoogleGeocodingGateway } from '../geo/geocoding-gateway.js';
import { findNearbyCdos, portAvailabilityByCdo } from '../geo/nearby-cdo.js';
import {
  OracleMcpConfirmationRepository,
  type PendingMcpConfirmation,
} from './oracle-confirmation.js';
import {
  commitCondominiumWorkflow,
  prepareCondominiumWorkflow,
  type CondominiumWorkflowInput,
  type PreparedCondominiumWorkflow,
} from './condominium-workflow.js';

export type McpToolContext = ReturnType<NexusRuntime['createToolContext']>;

type PointGeographicLocation = GeographicLocation & {
  geometry: { type: 'Point'; coordinates: [number, number] };
};

const isPointGeographicLocation = (
  location: GeographicLocation | undefined,
): location is PointGeographicLocation => location?.geometry.type === 'Point';

export type McpToolResult = {
  ok: boolean;
  domain: string;
  operation: string;
  data: unknown;
  warnings: string[];
  source: 'nexus-tmf-mcp';
  correlationId: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  exposeToModel?: boolean;
  // Papéis aceitos (qualquer um basta). Sem valor, `defaultRequiredRoles` deriva do domínio e do
  // tipo da operação, espelhando o gate HTTP equivalente.
  requiredRoles?: readonly string[];
  handler: (
    input: Record<string, unknown>,
    context: McpToolContext,
  ) => Promise<McpToolResult> | McpToolResult;
};

// Especificações e modelos de equipamento são catálogo (C9): mesma regra de `catalog.admin` das
// rotas HTTP de Specification.
const CATALOG_OPERATION = /specification|equipment_model/;

const defaultRequiredRoles = (name: string, isWrite: boolean): readonly string[] => {
  const [domain = '', ...rest] = name.split('.');
  const operation = rest.join('.');
  if (isWrite && CATALOG_OPERATION.test(operation)) return CATALOG_ADMIN_ROLES;
  if (domain === 'order') return isWrite ? ORDER_REQUEST_ROLES : ORDER_READ_ROLES;
  return isWrite ? INVENTORY_WRITE_ROLES : INVENTORY_READ_ROLES;
};

const SOURCE = 'nexus-tmf-mcp' as const;
const DEFAULT_CONFIRMATION_TTL_MS = 30 * 60 * 1000;

type PrepareResult = {
  summary: string;
  warnings?: string[];
};

export class McpToolRegistry {
  private readonly tools = new Map<string, McpToolDefinition>();

  public constructor(private readonly confirmations: OracleMcpConfirmationRepository) {}

  public register(tool: McpToolDefinition): void {
    // Commit é a escrita de fato: só o clique de confirmação do usuário pode acioná-lo, nunca o
    // modelo no mesmo turno do prepare.
    const isCommit = tool.name.includes('.commit_');
    this.tools.set(tool.name, isCommit ? { ...tool, exposeToModel: false } : tool);
  }

  // Uma tool é de escrita se é um `commit_*` ou o `prepare` de um commit registrado.
  private isWriteTool(name: string): boolean {
    if (name.includes('.commit_')) return true;
    const [domain = '', ...rest] = name.split('.');
    return this.tools.has(`${domain}.commit_${rest.join('.')}`);
  }

  private missingRole(tool: McpToolDefinition, context: McpToolContext): readonly string[] | null {
    const required =
      tool.requiredRoles ?? defaultRequiredRoles(tool.name, this.isWriteTool(tool.name));
    return context.requestContext.roles.some((role) => required.includes(role)) ? null : required;
  }

  public listTools(options: { exposeToModelOnly?: boolean } = {}): McpToolDefinition[] {
    return [...this.tools.values()].filter(
      (tool) => !options.exposeToModelOnly || tool.exposeToModel !== false,
    );
  }

  public async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: McpToolContext,
  ): Promise<McpToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return this.errorResult(
        'mcp',
        'execute_tool',
        context,
        'MCP_TOOL_NOT_FOUND',
        `tool ${name} not found`,
      );
    }

    const missing = this.missingRole(tool, context);
    if (missing) {
      return this.errorResult(
        tool.name.split('.')[0] ?? 'mcp',
        tool.name.split('.').slice(1).join('.'),
        context,
        'MCP_FORBIDDEN',
        `permissão insuficiente: requer um dos papéis ${missing.join(', ')}`,
        { requiredRoles: missing },
      );
    }

    const validationErrors = validateJsonSchema(input, tool.inputSchema);
    if (validationErrors.length > 0) {
      return this.errorResult(
        tool.name.split('.')[0] ?? 'mcp',
        tool.name.split('.').slice(1).join('.'),
        context,
        'MCP_INVALID_PAYLOAD',
        'tool payload validation failed',
        validationErrors,
      );
    }

    try {
      return await tool.handler(input, context);
    } catch (error) {
      return this.normalizeError(tool.name, context, error);
    }
  }

  // Porta dos clientes externos (stdio/HTTP): os `commit_*` não são chamáveis diretamente; a
  // escrita só se efetiva por `nexus.confirm_operation`.
  public async executeExternal(
    name: string,
    input: Record<string, unknown>,
    context: McpToolContext,
  ): Promise<McpToolResult> {
    if (this.tools.get(name)?.exposeToModel === false) {
      return this.errorResult(
        'mcp',
        'execute_tool',
        context,
        'MCP_TOOL_NOT_FOUND',
        `tool ${name} not found`,
      );
    }
    return await this.executeTool(name, input, context);
  }

  // Efetiva uma operação preparada. O token é vinculado a actorSub/tenantId em commitMutation;
  // o commit reaplica o RBAC da operação de destino.
  public async confirmOperation(
    confirmationToken: string,
    context: McpToolContext,
  ): Promise<McpToolResult> {
    const pending = await this.confirmations.get(confirmationToken);
    if (!pending || pending.context.actorSub !== context.requestContext.actorSub) {
      return this.errorResult(
        'nexus',
        'confirm_operation',
        context,
        'MCP_CONFIRMATION_NOT_FOUND',
        'confirmation token not found',
      );
    }
    return await this.executeTool(
      `${pending.domain}.commit_${pending.operation}`,
      { confirmationToken },
      context,
    );
  }

  // Operações descobríveis: tudo que o modelo pode acionar (exclui commit_* e as próprias
  // meta-tools) e que o usuário tem papel para executar.
  public listOperations(context: McpToolContext): McpToolDefinition[] {
    return this.listTools({ exposeToModelOnly: true }).filter(
      (tool) => !tool.name.startsWith('nexus.') && this.missingRole(tool, context) === null,
    );
  }

  public getOperation(name: string): McpToolDefinition | undefined {
    const tool = this.tools.get(name);
    return tool && tool.exposeToModel !== false && !name.startsWith('nexus.') ? tool : undefined;
  }

  private normalizeError(name: string, context: McpToolContext, error: unknown): McpToolResult {
    if (error instanceof AppError) {
      return this.errorResult(
        name.split('.')[0] ?? 'mcp',
        name.split('.').slice(1).join('.'),
        context,
        error.code,
        error.message,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return this.errorResult(
      name.split('.')[0] ?? 'mcp',
      name.split('.').slice(1).join('.'),
      context,
      'MCP_TOOL_FAILED',
      message,
    );
  }

  private errorResult(
    domain: string,
    operation: string,
    context: McpToolContext,
    code: string,
    message: string,
    details?: unknown,
  ): McpToolResult {
    return {
      ok: false,
      domain,
      operation,
      data: null,
      warnings: [],
      source: SOURCE,
      correlationId: context.correlationId,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    };
  }

  public async prepareMutation(
    domain: string,
    operation: string,
    payload: Record<string, unknown>,
    context: McpToolContext,
    prepare: () => Promise<PrepareResult> | PrepareResult,
  ): Promise<McpToolResult> {
    const prepared = await prepare();
    const createdAt = new Date();
    const pending = await this.confirmations.create({
      domain,
      operation,
      payload,
      summary: prepared.summary,
      warnings: prepared.warnings ?? [],
      context: {
        user: context.user,
        tenant: context.tenant,
        permissions: context.permissions,
        executionMode: context.executionMode,
        sessionId: context.sessionId,
        // Quem preparou: só o mesmo ator/tenant pode confirmar.
        actorSub: context.requestContext.actorSub,
        tenantId: context.requestContext.tenantId,
      },
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + DEFAULT_CONFIRMATION_TTL_MS).toISOString(),
    });

    return this.successResult(
      domain,
      operation,
      context,
      {
        confirmationToken: pending.token,
        summary: pending.summary,
        expiresAt: pending.expiresAt,
        payload,
      },
      pending.warnings,
    );
  }

  public async commitMutation<T>(
    domain: string,
    operation: string,
    confirmationToken: string,
    context: McpToolContext,
    commit: (pending: PendingMcpConfirmation) => Promise<T> | T,
  ): Promise<McpToolResult> {
    const pending = await this.confirmations.get(confirmationToken);
    if (!pending) {
      return this.errorResult(
        domain,
        operation,
        context,
        'MCP_CONFIRMATION_NOT_FOUND',
        'confirmation token not found',
      );
    }
    if (pending.operation !== operation || pending.domain !== domain) {
      return this.errorResult(
        domain,
        operation,
        context,
        'MCP_CONFIRMATION_OPERATION_MISMATCH',
        'confirmation token does not match the requested operation',
      );
    }
    if (
      pending.context.actorSub !== context.requestContext.actorSub ||
      pending.context.tenantId !== context.requestContext.tenantId
    ) {
      return this.errorResult(
        domain,
        operation,
        context,
        'MCP_CONFIRMATION_NOT_FOUND',
        'confirmation token not found',
      );
    }
    if (pending.consumedAt) {
      return this.errorResult(
        domain,
        operation,
        context,
        'MCP_CONFIRMATION_ALREADY_CONSUMED',
        'confirmation token already consumed',
      );
    }
    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      return this.errorResult(
        domain,
        operation,
        context,
        'MCP_CONFIRMATION_EXPIRED',
        'confirmation token expired',
      );
    }

    const consumed = await this.confirmations.consume(confirmationToken);
    if (!consumed) {
      // Outro commit pode ter consumido o token entre a leitura e o UPDATE atômico.
      // Consulta novamente para devolver o motivo correto em vez de mascarar a corrida como 404.
      const afterConsume = await this.confirmations.get(confirmationToken);
      return this.errorResult(
        domain,
        operation,
        context,
        afterConsume?.consumedAt
          ? 'MCP_CONFIRMATION_ALREADY_CONSUMED'
          : 'MCP_CONFIRMATION_NOT_FOUND',
        afterConsume?.consumedAt
          ? 'confirmation token already consumed'
          : 'confirmation token not found',
      );
    }

    try {
      return this.successResult(
        domain,
        operation,
        context,
        await commit(consumed),
        pending.warnings,
      );
    } catch (error) {
      return this.normalizeError(`${domain}.${operation}`, context, error);
    }
  }

  public successResult(
    domain: string,
    operation: string,
    context: McpToolContext,
    data: unknown,
    warnings: string[] = [],
  ): McpToolResult {
    return {
      ok: true,
      domain,
      operation,
      data,
      warnings,
      source: SOURCE,
      correlationId: context.correlationId,
    };
  }
}

const entityRefArraySchema: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      '@referredType': { type: 'string' },
      role: { type: 'string' },
      href: { type: 'string' },
      name: { type: 'string' },
    },
    required: ['id', '@referredType'],
    additionalProperties: true,
  },
};

const characteristicArraySchema: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      group: { type: 'string' },
      name: { type: 'string' },
      valueType: { type: 'string' },
    },
    required: ['name'],
    additionalProperties: true,
  },
};

export const createNexusMcpModule = (runtime: NexusRuntime) => {
  const confirmations = new OracleMcpConfirmationRepository(runtime.db);
  const registry = new McpToolRegistry(confirmations);
  const geocoder = createGoogleGeocodingGateway();

  const pageSchema = (extra: Record<string, JsonSchema> = {}): JsonSchema => ({
    type: 'object',
    properties: {
      id: { type: 'string' },
      limit: { type: 'number' },
      offset: { type: 'number' },
      ...extra,
    },
    required: ['id'],
    additionalProperties: false,
  });
  const pageArgs = (input: Record<string, unknown>, max: number, fallback: number) => ({
    limit: Math.min(Math.max(Number(input.limit ?? fallback) || fallback, 1), max),
    offset: Math.max(Number(input.offset ?? 0) || 0, 0),
  });
  const projectIdSchema: JsonSchema = {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  };
  const projectMutationSchema: JsonSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      payload: { type: 'object', additionalProperties: true },
    },
    required: ['id', 'payload'],
    additionalProperties: false,
  };

  registry.register({
    name: 'project.list_projects',
    description: 'Lista projetos que o usuário pode consultar.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_input, context) =>
      registry.successResult(
        'project',
        'list_projects',
        context,
        await runtime.projectService.list(context.requestContext),
      ),
  });

  registry.register({
    name: 'project.get_project',
    description: 'Consulta um projeto por identificador.',
    inputSchema: projectIdSchema,
    handler: async (input, context) =>
      registry.successResult(
        'project',
        'get_project',
        context,
        (await runtime.projectService.get(String(input.id), context.requestContext)) ?? null,
      ),
  });

  const querySiteSchema: JsonSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      siteSpecificationId: { type: 'string' },
      parentSiteId: { type: 'string' },
      placeId: { type: 'string' },
      relatedPartyId: { type: 'string' },
      status: {
        type: 'string',
        enum: [
          'Planned',
          'InConstruction',
          'Active',
          'InDeactivation',
          'Retired',
          'planned',
          'active',
          'suspended',
          'terminated',
        ],
      },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
    additionalProperties: false,
  };

  const queryAddressSchema: JsonSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      street: { type: 'string' },
      streetNr: { type: 'string' },
      city: { type: 'string' },
      stateOrProvince: { type: 'string' },
      postcode: { type: 'string' },
      country: { type: 'string' },
      geographicLocationId: { type: 'string' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
    additionalProperties: false,
  };

  const resourceQuerySchema: JsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      kind: { type: 'string', enum: ['PhysicalResource', 'LogicalResource'] },
      status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'terminated'] },
      resourceSpecificationId: { type: 'string' },
      placeId: { type: 'string' },
      relatedPartyId: { type: 'string' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
    additionalProperties: false,
  };

  const serviceQuerySchema: JsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      '@type': { type: 'string', enum: ['CustomerFacingService', 'ResourceFacingService'] },
      state: {
        type: 'string',
        enum: ['feasibilityChecked', 'designed', 'reserved', 'inactive', 'active', 'terminated'],
      },
      subscriberId: { type: 'string' },
      relatedPartyId: { type: 'string' },
      placeId: { type: 'string' },
      serviceSpecificationId: { type: 'string' },
      supportingResourceId: { type: 'string' },
      supportingServiceId: { type: 'string' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
    additionalProperties: false,
  };

  const partyQuerySchema: JsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      document: { type: 'string' },
      partyType: { type: 'string', enum: ['Organization', 'Individual'] },
      status: { type: 'string', enum: ['active', 'inactive', 'terminated'] },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
    additionalProperties: false,
  };

  const eventQuerySchema: JsonSchema = {
    type: 'object',
    properties: {
      eventType: { type: 'string' },
      source: { type: 'string' },
      entityId: { type: 'string' },
      correlationId: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
    additionalProperties: false,
  };

  registry.register({
    name: 'geo.list_sites',
    description:
      'Lista Geographic Sites do inventario Nexus com filtros por id, nome, status e relacionamentos.',
    inputSchema: querySiteSchema,
    handler: async (input, context) => {
      // Status, especificação e pai filtram no banco (aceita os valores reais e os aliases). Só
      // quando sobra filtro em memória (id, nome, place, party) a paginação acontece depois dele.
      const inMemory = ['id', 'name', 'placeId', 'relatedPartyId'].some(
        (key) => typeof input[key] === 'string',
      );
      const sites = await runtime.geoService.listSites(
        {
          ...(typeof input.status === 'string' ? { status: input.status as never } : {}),
          ...(typeof input.siteSpecificationId === 'string'
            ? { siteSpecificationId: input.siteSpecificationId }
            : {}),
          ...(typeof input.parentSiteId === 'string' ? { parentSiteId: input.parentSiteId } : {}),
          ...(!inMemory && typeof input.limit === 'number' ? { limit: input.limit } : {}),
          ...(!inMemory && typeof input.offset === 'number' ? { offset: input.offset } : {}),
        },
        context.requestContext,
      );
      const filtered = sites.filter((site) => {
        if (typeof input.id === 'string' && site.id !== input.id) return false;
        if (
          typeof input.name === 'string' &&
          !site.name.toLowerCase().includes(input.name.toLowerCase())
        )
          return false;
        if (typeof input.placeId === 'string' && site.place?.id !== input.placeId) return false;
        if (
          typeof input.relatedPartyId === 'string' &&
          !site.relatedParty.some((item) => item.id === input.relatedPartyId)
        )
          return false;
        return true;
      });
      const items = inMemory ? paginate(filtered, input) : filtered;

      return registry.successResult('geo', 'list_sites', context, {
        items,
        count: items.length,
      });
    },
  });

  registry.register({
    name: 'geo.get_site',
    description: 'Consulta um Geographic Site por id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (input, context) =>
      registry.successResult(
        'geo',
        'get_site',
        context,
        (await runtime.geoService.getSite(String(input.id), context.requestContext)) ?? null,
      ),
  });

  registry.register({
    name: 'geo.list_addresses',
    description:
      'Busca Geographic Addresses com filtros estruturados normalizados no banco. Aceita variacoes de abreviacao, acento e mascara de CEP. Informe streetNr sempre que o usuario fornecer o numero.',
    inputSchema: queryAddressSchema,
    handler: async (input, context) => {
      const query: NonNullable<Parameters<typeof runtime.geoService.listAddresses>[0]> = {
        includeCharacteristics: false,
        limit: typeof input.limit === 'number' ? input.limit : 25,
      };
      if (typeof input.id === 'string') query.id = input.id;
      if (typeof input.street === 'string') query.street = input.street;
      if (typeof input.streetNr === 'string') query.streetNr = input.streetNr;
      if (typeof input.city === 'string') query.city = input.city;
      if (typeof input.stateOrProvince === 'string') query.stateOrProvince = input.stateOrProvince;
      if (typeof input.postcode === 'string') query.postcode = input.postcode;
      if (typeof input.country === 'string') query.country = input.country;
      if (typeof input.geographicLocationId === 'string')
        query.geographicLocationId = input.geographicLocationId;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = await runtime.geoService.listAddresses(query, context.requestContext);
      if (items.length === 0 && typeof input.street === 'string') {
        // Não cadastrado não é "não existe": geocodifica para o modelo não encerrar a conversa aqui.
        const geocoded = await geocoder.geocode([
          input.street,
          input.streetNr,
          input.city,
          input.stateOrProvince,
          input.postcode,
          input.country ?? 'BR',
        ]);
        return registry.successResult('geo', 'list_addresses', context, {
          items,
          count: 0,
          normalized: true,
          ...(geocoded
            ? {
                geocoded: { ...geocoded, source: 'google-geocoding' },
                note: 'Endereco nao cadastrado no Nexus, mas localizado no Google Maps. Para saber se ha rede/recursos/CDO ali, chame geo.find_nearby_cdos com os mesmos dados (ele usa essa coordenada). Nao diga que o endereco nao existe.',
              }
            : {}),
        });
      }
      return registry.successResult('geo', 'list_addresses', context, {
        items,
        count: items.length,
        normalized: true,
      });
    },
  });

  registry.register({
    name: 'geo.get_address',
    description: 'Consulta um Geographic Address por id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (input, context) =>
      registry.successResult(
        'geo',
        'get_address',
        context,
        (await runtime.geoService.getAddress(String(input.id), context.requestContext)) ?? null,
      ),
  });

  registry.register({
    name: 'geo.find_nearby_cdos',
    description:
      'Localiza CDOs proximas de um endereco em uma unica consulta. Resolve o GeographicAddress com normalizacao, usa sua GeographicLocation e retorna PhysicalResources CTO cujo nome comeca por CDO, ordenados pela distancia real em metros, cada um com ports {total, free, busy, unavailable} (portas contidas na CDO, direto ou via splitter; free = ativa, desbloqueada, habilitada e usageState idle). Use para perguntas como "tem porta livre/disponivel na CDO mais proxima?" (responda com ports.free),  perguntas como "ha CDO proxima deste endereco?", "ha rede da V.tal perto daqui?", "existe recurso neste endereco?" ou viabilidade. Funciona mesmo que o endereco nao esteja cadastrado (geocodifica no Google Maps).',
    inputSchema: {
      type: 'object',
      properties: {
        street: { type: 'string' },
        streetNr: { type: 'string' },
        city: { type: 'string' },
        stateOrProvince: { type: 'string' },
        postcode: { type: 'string' },
        country: { type: 'string' },
        radiusMeters: { type: 'integer' },
        limit: { type: 'integer' },
      },
      required: ['street'],
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const radiusMeters =
        typeof input.radiusMeters === 'number'
          ? Math.min(Math.max(Math.round(input.radiusMeters), 1), 5000)
          : 300;
      const limit =
        typeof input.limit === 'number' ? Math.min(Math.max(Math.round(input.limit), 1), 50) : 10;
      const addressQuery: NonNullable<Parameters<typeof runtime.geoService.listAddresses>[0]> = {
        street: String(input.street),
        includeCharacteristics: false,
        limit: 25,
      };
      if (typeof input.streetNr === 'string') addressQuery.streetNr = input.streetNr;
      if (typeof input.city === 'string') addressQuery.city = input.city;
      if (typeof input.stateOrProvince === 'string')
        addressQuery.stateOrProvince = input.stateOrProvince;
      if (typeof input.postcode === 'string') addressQuery.postcode = input.postcode;
      if (typeof input.country === 'string') addressQuery.country = input.country;

      const addresses = await runtime.geoService.listAddresses(
        addressQuery,
        context.requestContext,
      );
      const resolvedAddresses = (
        await Promise.all(
          addresses.map(async (address) => {
            if (!address.geographicLocationId) return undefined;
            const location = await runtime.geoService.getLocation(
              address.geographicLocationId,
              context.requestContext,
            );
            if (!isPointGeographicLocation(location)) return undefined;
            return { address, location };
          }),
        )
      ).filter(
        (item): item is { address: GeographicAddress; location: PointGeographicLocation } =>
          item !== undefined,
      );

      // Endereço fora do cadastro (ou sem coordenada): geocodifica no Google. Sem isso, "não achei
      // o endereço" virava count 0 e o Copilot afirmava que não havia CDO próxima.
      let geocoded: { lng: number; lat: number; formattedAddress: string } | undefined;
      if (resolvedAddresses.length === 0) {
        geocoded = await geocoder.geocode([
          input.street,
          input.streetNr,
          input.city,
          input.stateOrProvince,
          input.postcode,
          input.country ?? 'BR',
        ]);
        if (!geocoded) {
          return registry.successResult('geo', 'find_nearby_cdos', context, {
            addressMatches: [],
            items: [],
            count: 0,
            radiusMeters,
            addressResolved: false,
            note: 'Nao foi possivel obter a coordenada do endereco (nao cadastrado e geocodificacao indisponivel). Nao conclua que nao ha CDO proxima; informe que a localizacao nao foi resolvida.',
          });
        }
      }
      const points: Array<{ lng: number; lat: number; addressId?: string }> = geocoded
        ? [{ lng: geocoded.lng, lat: geocoded.lat }]
        : resolvedAddresses.map(({ address, location }) => ({
            lng: location.geometry.coordinates[0],
            lat: location.geometry.coordinates[1],
            addressId: address.id,
          }));

      // Consulta enxuta (nearby-cdo.ts): resourcesInViewport estourava o TEMP do Oracle em bases grandes.
      const perPoint = await Promise.all(
        points.map(async (point) => ({
          point,
          cdos: await findNearbyCdos(runtime.db, point, {
            radiusMeters,
            limit,
            tenantId: context.requestContext.tenantId,
          }),
        })),
      );
      const seen = new Set<string>();
      const nearby = perPoint
        .flatMap(({ point, cdos }) =>
          cdos.map((cdo) => ({
            id: cdo.id,
            name: cdo.name,
            resourceType: 'CDO',
            status: 'active',
            distanceMeters: Math.round(cdo.straightMeters),
            geometry: { type: 'Point' as const, coordinates: [cdo.lng, cdo.lat] },
            ...(point.addressId ? { matchedAddressId: point.addressId } : {}),
          })),
        )
        .sort(
          (left, right) =>
            left.distanceMeters - right.distanceMeters || left.name.localeCompare(right.name),
        )
        .filter((cdo) => (seen.has(cdo.id) ? false : (seen.add(cdo.id), true)))
        .slice(0, limit);

      const availability = await portAvailabilityByCdo(
        runtime.db,
        nearby.map((cdo) => cdo.id),
      );
      const items = nearby.map((cdo) => {
        const ports = availability.get(cdo.id);
        return {
          ...cdo,
          ports,
          ...(ports
            ? {
                portsSummary: `${ports.free} livres (ativas e sem uso) de ${ports.total} portas; ${ports.busy} ocupadas; ${ports.unavailable} indisponiveis (inativas/bloqueadas/desabilitadas)`,
              }
            : {}),
        };
      });

      return registry.successResult('geo', 'find_nearby_cdos', context, {
        addressMatches: resolvedAddresses.map(({ address, location }) => ({
          id: address.id,
          street: address.street,
          streetNr: address.streetNr,
          city: address.city,
          stateOrProvince: address.stateOrProvince,
          postcode: address.postcode,
          geographicLocationId: location.id,
        })),
        items,
        count: items.length,
        radiusMeters,
        addressResolved: true,
        portsNote:
          'ports.free = portas contidas na CDO (direto ou via splitter) ativas, desbloqueadas, habilitadas e com usageState idle. Para "tem porta livre/disponivel?" responda com ports.free por CDO; se free for 0 na mais proxima, cite a proxima com free > 0.',
        ...(geocoded ? { geocoded: { ...geocoded, source: 'google-geocoding' } } : {}),
      });
    },
  });

  registry.register({
    name: 'geo.list_site_specifications',
    description:
      'Lista GeographicSiteSpecifications por id, nome, codigo, categoria e lifecycleStatus. Use para resolver o tipo canonico antes de criar Sites.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        code: { type: 'string' },
        category: { type: 'string', enum: ['Region', 'Site', 'SubSite'] },
        lifecycleStatus: { type: 'string', enum: ['Active', 'Retired'] },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const query: NonNullable<Parameters<typeof runtime.geoService.listSpecs>[0]> = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (typeof input.code === 'string') query.code = input.code;
      if (input.category === 'Region' || input.category === 'Site' || input.category === 'SubSite')
        query.category = input.category;
      if (input.lifecycleStatus === 'Active' || input.lifecycleStatus === 'Retired')
        query.lifecycleStatus = input.lifecycleStatus;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const listed = await runtime.geoService.listSpecs(query, context.requestContext);
      const items =
        typeof input.id === 'string' ? listed.filter((item) => item.id === input.id) : listed;
      return registry.successResult('geo', 'list_site_specifications', context, {
        items,
        count: items.length,
      });
    },
  });

  const createAddressPayloadSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          streetNr: { type: 'string' },
          city: { type: 'string' },
          stateOrProvince: { type: 'string' },
          postcode: { type: 'string' },
          country: { type: 'string' },
          geographicLocationId: { type: 'string' },
          characteristic: characteristicArraySchema,
        },
        required: ['street'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerAddressCreationTools(registry, runtime, createAddressPayloadSchema);

  const createSitePayloadSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['planned', 'active', 'suspended', 'terminated'] },
          siteSpecificationId: { type: 'string' },
          siteSpecificationCode: { type: 'string' },
          siteSpecificationName: { type: 'string' },
          placeId: { type: 'string' },
          addressId: { type: 'string' },
          parentSiteId: { type: 'string' },
          relatedParty: entityRefArraySchema,
          characteristic: characteristicArraySchema,
          relatedSite: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                relationshipType: { type: 'string' },
              },
              required: ['id', 'relationshipType'],
              additionalProperties: true,
            },
          },
        },
        required: ['name'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  const registerPreparationAlias = (
    name: string,
    description: string,
    schema: JsonSchema,
    domain: string,
    operation: string,
    prepare: (
      payload: Record<string, unknown>,
      context: McpToolContext,
    ) => Promise<PrepareResult> | PrepareResult,
  ) => {
    registry.register({
      name,
      description,
      inputSchema: schema,
      handler: (input, context) =>
        registry.prepareMutation(
          domain,
          operation,
          input.payload as Record<string, unknown>,
          context,
          () => prepare(input.payload as Record<string, unknown>, context),
        ),
    });
  };

  const createProjectSchema: JsonSchema = {
    type: 'object',
    properties: { payload: { type: 'object', additionalProperties: true } },
    required: ['payload'],
    additionalProperties: false,
  };
  // Leituras de apoio do workspace de Projetos (mesmos dados das rotas /v1/projects/:id/*).
  registry.register({
    name: 'project.list_project_areas',
    description: 'Manchas de concentração/dispersão de um projeto (somente leitura).',
    inputSchema: projectIdSchema,
    requiredRoles: PROJECT_READ_ROLES,
    handler: async (input, context) =>
      registry.successResult('project', 'list_project_areas', context, {
        areas: await runtime.projectRepository.listAreas(
          context.requestContext.tenantId,
          String(input.id),
        ),
      }),
  });
  registry.register({
    name: 'project.search_project_items',
    description:
      'Busca locais e recursos de um projeto por texto (mín. 2 caracteres); scope: all, sites, infrastructure ou resources.',
    inputSchema: pageSchema({
      q: { type: 'string' },
      scope: { type: 'string', enum: ['all', 'sites', 'infrastructure', 'resources'] },
    }),
    requiredRoles: PROJECT_READ_ROLES,
    handler: async (input, context) => {
      const { limit, offset } = pageArgs(input, 20, 20);
      const query = String(input.q ?? '')
        .trim()
        .toLocaleLowerCase();
      if (query.length < 2) {
        return registry.successResult('project', 'search_project_items', context, {
          items: [],
          offset,
          limit,
          hasMore: false,
        });
      }
      const scope =
        input.scope === 'sites' || input.scope === 'infrastructure' || input.scope === 'resources'
          ? input.scope
          : 'all';
      const matches = await runtime.projectRepository.searchItems(
        context.requestContext.tenantId,
        String(input.id),
        query,
        limit + 1,
        scope,
      );
      const page = matches.slice(offset, offset + limit);
      const [sites, resources] = await Promise.all([
        runtime.geoTreeService.sitesByIds(
          page.filter((item) => item.kind === 'site').map((item) => item.id),
        ),
        runtime.geoTreeService.resourcesByIds(
          page.filter((item) => item.kind === 'resource').map((item) => item.id),
        ),
      ]);
      const byKey = new Map(
        [...sites, ...resources].map((item) => [`${item.kind}:${item.refId ?? item.id}`, item]),
      );
      const items = page
        .map((item) => byKey.get(`${item.kind}:${item.id}`))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      return registry.successResult('project', 'search_project_items', context, {
        items,
        offset,
        limit,
        hasMore: matches.length > offset + limit,
      });
    },
  });
  registry.register({
    name: 'project.list_project_resource_candidates',
    description:
      'Recursos que podem ser vinculados ao projeto (livres ou já neste projeto); q filtra por nome.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, q: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    requiredRoles: PROJECT_READ_ROLES,
    handler: async (input, context) => {
      const projectId = String(input.id);
      const query = String(input.q ?? '').trim();
      const resources = await runtime.resourceService.listResources(
        { ...(query ? { name: query } : {}), limit: 50 },
        context.requestContext,
      );
      const available = [];
      for (const resource of resources) {
        const linked = await runtime.projectRepository.findOpenProjectByResourceId(
          context.requestContext.tenantId,
          resource.id,
        );
        if (!linked || linked.projectId === projectId) available.push(resource);
      }
      return registry.successResult(
        'project',
        'list_project_resource_candidates',
        context,
        available,
      );
    },
  });
  registry.register({
    name: 'project.get_resource_creation_options',
    description:
      'Tipos e especificações de recurso que podem ser criados dentro do projeto (catálogo ativo).',
    inputSchema: projectIdSchema,
    requiredRoles: PROJECT_READ_ROLES,
    handler: async (input, context) => {
      const project = await runtime.projectRepository.get(
        context.requestContext.tenantId,
        String(input.id),
      );
      if (!project || project.archivedAt) {
        throw new AppError('project not found', { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
      }
      const catalogs = await runtime.resourceService.listResourceCatalogs(
        { status: 'active' },
        context.requestContext,
      );
      const catalog = catalogs.find((item) => item.isDefault) ?? catalogs[0];
      if (!catalog) {
        return registry.successResult('project', 'get_resource_creation_options', context, {
          catalog: null,
          resourceTypes: [],
          resourceSpecifications: [],
        });
      }
      const source = await runtime.resourceService.getResourceModelSnapshotSource(
        catalog.id,
        context.requestContext,
      );
      const modeledTypeIds = new Set(
        source.nodes.flatMap((node) =>
          node.kind === 'RESOURCE_TYPE' && node.status === 'active' && node.resourceTypeId
            ? [node.resourceTypeId]
            : [],
        ),
      );
      const resourceTypes = source.resourceTypes
        .filter((item) => item.status === 'active' && modeledTypeIds.has(item.id))
        .map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          nature: item.nature,
          infrastructureEligible: isProjectInfrastructureResourceType(item.code),
        }));
      const typeIds = new Set(resourceTypes.map((item) => item.id));
      const specifications = [];
      for (let offset = 0; ; offset += 500) {
        const page = await runtime.resourceService.listResourceSpecifications(
          { limit: 500, offset },
          context.requestContext,
        );
        specifications.push(...page);
        if (page.length < 500) break;
      }
      return registry.successResult('project', 'get_resource_creation_options', context, {
        catalog: { id: catalog.id, code: catalog.code, name: catalog.name },
        resourceTypes,
        resourceSpecifications: specifications
          .filter((item) => typeIds.has(item.resourceTypeId))
          .map((item) => ({ id: item.id, name: item.name, resourceTypeId: item.resourceTypeId })),
      });
    },
  });

  registerPreparationAlias(
    'project.create_project',
    'Prepara a criação de um projeto. Retorna confirmationToken para commit.',
    createProjectSchema,
    'project',
    'create_project',
    (payload) => ({
      summary: `Projeto ${String((payload as { name?: unknown }).name ?? 'sem título')} será criado.`,
    }),
  );
  registry.register({
    name: 'project.commit_create_project',
    description: 'Confirma e cria um projeto.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'project',
        'create_project',
        String(input.confirmationToken),
        context,
        (pending) => runtime.projectService.create(pending.payload, context.requestContext),
      ),
  });
  // Escritas de Projeto: o prepare guarda o input inteiro (id incluso) para o commit reaplicar. O
  // prepare já falha se o projeto não existe, para o usuário não confirmar algo que não executa.
  const confirmationTokenSchema: JsonSchema = {
    type: 'object',
    properties: { confirmationToken: { type: 'string' } },
    required: ['confirmationToken'],
    additionalProperties: false,
  };
  const registerProjectWrite = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    summarize: (input: Record<string, unknown>, projectName: string) => string,
    execute: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
  ) => {
    registry.register({
      name: `project.${operation}`,
      description: `Prepara: ${description} Retorna confirmationToken; a execução exige confirmação do usuário.`,
      inputSchema,
      handler: (input, context) =>
        registry.prepareMutation('project', operation, input, context, async () => {
          const project = await runtime.projectService.get(
            String(input.id),
            context.requestContext,
          );
          if (!project)
            throw new AppError('project not found', { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
          return { summary: summarize(input, project.name) };
        }),
    });
    registry.register({
      name: `project.commit_${operation}`,
      description: `Confirma e executa: ${description}`,
      inputSchema: confirmationTokenSchema,
      handler: (input, context) =>
        registry.commitMutation(
          'project',
          operation,
          String(input.confirmationToken),
          context,
          (pending) => execute(pending.payload, context),
        ),
    });
  };
  const objectPayload = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const projectChildSchema = (
    extra: Record<string, JsonSchema>,
    required: string[],
  ): JsonSchema => ({
    type: 'object',
    properties: { id: { type: 'string' }, ...extra },
    required: ['id', ...required],
    additionalProperties: false,
  });

  // Workflow e catálogo de status de projeto (mesmas regras e papéis das rotas /v1/geo/project-*).
  registry.register({
    name: 'project.get_project_workflow',
    description: 'Consulta o workflow de projetos (transições permitidas por status).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiredRoles: PROJECT_READ_ROLES,
    handler: async (_input, context) =>
      registry.successResult(
        'project',
        'get_project_workflow',
        context,
        await runtime.projectWorkflowService.getWorkflow(context.requestContext),
      ),
  });
  registry.register({
    name: 'project.list_project_statuses',
    description: 'Lista o catálogo de status de projeto do tenant.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiredRoles: USER_ADMIN_ROLES,
    handler: async (_input, context) =>
      registry.successResult(
        'project',
        'list_project_statuses',
        context,
        await runtime.projectRepository.listStatusCatalog(context.requestContext.tenantId),
      ),
  });
  const statusBehaviors = ['planning', 'execution', 'suspended', 'close-release'];
  const statusError = (message: string, code: string, statusCode = 409) =>
    new AppError(message, { code, statusCode });
  const registerStatusWrite = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    summarize: (input: Record<string, unknown>) => string,
    validate: (input: Record<string, unknown>) => void,
    execute: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
  ) => {
    registry.register({
      name: `project.${operation}`,
      description: `Prepara: ${description} Retorna confirmationToken; a execução exige confirmação do usuário.`,
      inputSchema,
      requiredRoles: USER_ADMIN_ROLES,
      handler: (input, context) =>
        registry.prepareMutation('project', operation, input, context, () => {
          validate(input);
          return { summary: summarize(input) };
        }),
    });
    registry.register({
      name: `project.commit_${operation}`,
      description: `Confirma e executa: ${description}`,
      inputSchema: confirmationTokenSchema,
      requiredRoles: USER_ADMIN_ROLES,
      handler: (input, context) =>
        registry.commitMutation(
          'project',
          operation,
          String(input.confirmationToken),
          context,
          (pending) => {
            validate(pending.payload);
            return execute(pending.payload, context);
          },
        ),
    });
  };
  const behaviorEnum: JsonSchema = { type: 'string', enum: statusBehaviors };
  registerStatusWrite(
    'create_project_status',
    'cria um status no catálogo de projetos.',
    {
      type: 'object',
      properties: {
        name: { type: 'string' },
        behavior: behaviorEnum,
        sortOrder: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['name', 'behavior'],
      additionalProperties: false,
    },
    (i) => `Status de projeto "${String(i.name)}" será criado.`,
    (i) => {
      if (!String(i.name ?? '').trim() || !statusBehaviors.includes(String(i.behavior))) {
        throw statusError(
          'project status name and behavior are required',
          'PROJECT_STATUS_CATALOG_INVALID',
          400,
        );
      }
      if (i.behavior === 'close-release') {
        throw statusError(
          'only status code 17 can close a project',
          'PROJECT_STATUS_TERMINAL_RESERVED',
        );
      }
    },
    (i, c) =>
      runtime.projectRepository.createStatusCatalogItem(c.requestContext.tenantId, {
        name: String(i.name).trim(),
        sortOrder: Number(i.sortOrder ?? 1000),
        active: i.active !== false,
        behavior: i.behavior as 'planning' | 'execution' | 'suspended' | 'close-release',
      }),
  );
  const validateStatusChange = (i: Record<string, unknown>, deleting: boolean) => {
    const code = String(i.code);
    const behavior = deleting ? undefined : i.behavior;
    const deactivating = deleting || i.active === false;
    if (behavior !== undefined && !statusBehaviors.includes(String(behavior))) {
      throw statusError('invalid project status behavior', 'PROJECT_STATUS_CATALOG_INVALID', 400);
    }
    if (code === '1' && deactivating) {
      throw statusError(
        'default project status cannot be deactivated',
        'PROJECT_STATUS_DEFAULT_PROTECTED',
      );
    }
    if (
      code === '17' &&
      ((behavior !== undefined && behavior !== 'close-release') || deactivating)
    ) {
      throw statusError('project closing status is protected', 'PROJECT_STATUS_TERMINAL_PROTECTED');
    }
    if (code !== '17' && behavior === 'close-release') {
      throw statusError(
        'only status code 17 can close a project',
        'PROJECT_STATUS_TERMINAL_RESERVED',
      );
    }
  };
  const statusChange = async (
    i: Record<string, unknown>,
    context: McpToolContext,
    patch: Record<string, unknown>,
  ) => {
    const updated = await runtime.projectRepository.updateStatusCatalogItem(
      context.requestContext.tenantId,
      String(i.code),
      patch as never,
    );
    if (!updated) throw statusError('project status not found', 'PROJECT_STATUS_NOT_FOUND', 404);
    return updated;
  };
  registerStatusWrite(
    'update_project_status',
    'atualiza um status do catálogo de projetos.',
    {
      type: 'object',
      properties: {
        code: { type: 'string' },
        name: { type: 'string' },
        behavior: behaviorEnum,
        sortOrder: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['code'],
      additionalProperties: false,
    },
    (i) => `Status de projeto ${String(i.code)} será atualizado.`,
    (i) => validateStatusChange(i, false),
    (i, c) =>
      statusChange(i, c, {
        ...(i.name !== undefined ? { name: String(i.name).trim() } : {}),
        ...(i.sortOrder !== undefined ? { sortOrder: Number(i.sortOrder) } : {}),
        ...(i.active !== undefined ? { active: Boolean(i.active) } : {}),
        ...(i.behavior !== undefined ? { behavior: i.behavior } : {}),
      }),
  );
  registerStatusWrite(
    'delete_project_status',
    'desativa (soft-delete) um status do catálogo de projetos.',
    {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
      additionalProperties: false,
    },
    (i) => `Status de projeto ${String(i.code)} será desativado.`,
    (i) => validateStatusChange(i, true),
    (i, c) => statusChange(i, c, { active: false }),
  );

  registerProjectWrite(
    'update_project',
    'atualiza metadados do projeto ou muda seu estado (statusCode).',
    projectMutationSchema,
    (_input, name) => `Projeto "${name}" será atualizado.`,
    (input, context) =>
      runtime.projectService.update(
        String(input.id),
        objectPayload(input.payload),
        context.requestContext,
      ),
  );
  registerProjectWrite(
    'transition_project',
    'executa uma transição do workflow do projeto, com cascata para locais e recursos.',
    projectChildSchema(
      { transitionId: { type: 'string' }, targetStateCode: { type: 'string' } },
      [],
    ),
    (input, name) =>
      `Projeto "${name}" mudará de estado (${String(input.targetStateCode ?? input.transitionId ?? 'transição')}), propagando aos locais e recursos vinculados.`,
    (input, context) =>
      runtime.projectWorkflowService.executeTransition(
        String(input.id),
        {
          ...(input.transitionId ? { transitionId: String(input.transitionId) } : {}),
          ...(input.targetStateCode ? { targetStateCode: String(input.targetStateCode) } : {}),
        },
        context.requestContext,
      ),
  );
  registerProjectWrite(
    'archive_project',
    'arquiva um projeto já encerrado, preservando locais, recursos e histórico.',
    projectChildSchema({}, []),
    (_input, name) =>
      `Projeto "${name}" será arquivado (somente projetos encerrados ou cancelados).`,
    (input, context) => runtime.projectService.archive(String(input.id), context.requestContext),
  );
  registerProjectWrite(
    'create_project_site',
    'cria um local no projeto (exige geonetAddressId; o local herda o estado do projeto).',
    projectChildSchema({ payload: { type: 'object', additionalProperties: true } }, ['payload']),
    (input, name) => {
      const site = objectPayload(objectPayload(input.payload).site);
      return `Local "${String(site.name ?? 'sem nome')}" será criado no projeto "${name}".`;
    },
    (input, context) =>
      runtime.projectService.createSite(
        String(input.id),
        objectPayload(input.payload),
        context.requestContext,
      ),
  );
  registerProjectWrite(
    'update_project_site',
    'edita nome, especificação ou nota de um local do projeto.',
    projectChildSchema(
      { siteId: { type: 'string' }, payload: { type: 'object', additionalProperties: true } },
      ['siteId', 'payload'],
    ),
    (input, name) => `Local ${String(input.siteId)} do projeto "${name}" será atualizado.`,
    (input, context) =>
      runtime.projectService.updateSite(
        String(input.id),
        String(input.siteId),
        objectPayload(input.payload),
        context.requestContext,
      ),
  );
  registerProjectWrite(
    'remove_project_site',
    'remove um local do projeto (o local é encerrado, nunca excluído).',
    projectChildSchema({ siteId: { type: 'string' } }, ['siteId']),
    (input, name) =>
      `Local ${String(input.siteId)} será encerrado e removido do projeto "${name}".`,
    async (input, context) => {
      await runtime.projectService.removeSite(
        String(input.id),
        String(input.siteId),
        context.requestContext,
      );
      return { removed: true, siteId: String(input.siteId) };
    },
  );
  registerProjectWrite(
    'create_project_resource',
    'cria um recurso (físico ou lógico) já vinculado ao projeto, herdando o estado dele.',
    projectChildSchema({ payload: { type: 'object', additionalProperties: true } }, ['payload']),
    (input, name) =>
      `Recurso "${String(objectPayload(input.payload).name ?? 'sem nome')}" será criado no projeto "${name}".`,
    (input, context) =>
      runtime.projectService.createResource(
        String(input.id),
        objectPayload(input.payload),
        context.requestContext,
      ),
  );
  registerProjectWrite(
    'link_project_resource',
    'vincula um recurso existente ao projeto.',
    projectChildSchema({ resourceId: { type: 'string' } }, ['resourceId']),
    (input, name) => `Recurso ${String(input.resourceId)} será vinculado ao projeto "${name}".`,
    (input, context) =>
      runtime.projectService.linkResource(
        String(input.id),
        String(input.resourceId),
        context.requestContext,
      ),
  );
  registerProjectWrite(
    'detach_project_resource',
    'desvincula um recurso do projeto (o recurso é encerrado, nunca excluído).',
    projectChildSchema({ resourceId: { type: 'string' } }, ['resourceId']),
    (input, name) => `Recurso ${String(input.resourceId)} será desvinculado do projeto "${name}".`,
    async (input, context) => {
      await runtime.projectService.detachResource(
        String(input.id),
        String(input.resourceId),
        context.requestContext,
      );
      return { detached: true, resourceId: String(input.resourceId) };
    },
  );

  registry.register({
    name: 'project.get_project_transitions',
    description: 'Lista as transições de workflow que o usuário pode executar no projeto.',
    inputSchema: projectIdSchema,
    handler: async (input, context) =>
      registry.successResult(
        'project',
        'get_project_transitions',
        context,
        await runtime.projectWorkflowService.getProjectTransitions(
          String(input.id),
          context.requestContext,
        ),
      ),
  });
  registry.register({
    name: 'project.list_project_sites',
    description: 'Lista (paginado) os locais vinculados a um projeto.',
    inputSchema: pageSchema(),
    handler: async (input, context) => {
      const { limit, offset } = pageArgs(input, 100, 50);
      const page = await runtime.geoTreeService.projectSitePage(
        context.requestContext.tenantId,
        String(input.id),
        limit,
        offset,
      );
      return registry.successResult('project', 'list_project_sites', context, {
        items: page.items,
        offset,
        limit,
        total: page.total,
        hasMore: offset + page.items.length < page.total,
      });
    },
  });
  registry.register({
    name: 'project.list_project_resources',
    description:
      'Lista (paginado) os recursos vinculados a um projeto; view=infrastructure filtra infraestrutura.',
    inputSchema: pageSchema({ view: { type: 'string', enum: ['all', 'infrastructure'] } }),
    handler: async (input, context) => {
      const { limit, offset } = pageArgs(input, 100, 50);
      const links = await runtime.projectRepository.listResourceLinks(
        context.requestContext.tenantId,
        String(input.id),
        { limit, offset, view: input.view === 'infrastructure' ? 'infrastructure' : 'all' },
      );
      const items = await runtime.geoTreeService.resourcesByIds(
        links.map((link) => link.resourceId),
      );
      return registry.successResult('project', 'list_project_resources', context, {
        items,
        offset,
        limit,
        hasMore: links.length === limit,
      });
    },
  });

  registerPreparationAlias(
    'geo.create_site',
    'Prepara a criacao de um Geographic Site. Nao executa a mutacao; retorna confirmationToken para commit explicito.',
    createSitePayloadSchema,
    'geo',
    'create_site',
    async (payload, context) => {
      const typedPayload = payload as Record<string, unknown>;
      const specification = await resolveSiteSpecificationReference(
        runtime,
        typedPayload,
        context.requestContext,
      );
      typedPayload.siteSpecificationId = specification.id;
      if (
        typedPayload.placeId &&
        !(await runtime.geoService.getLocation(
          String(typedPayload.placeId),
          context.requestContext,
        ))
      ) {
        throw new AppError('geographic location not found', {
          code: 'GEO_LOCATION_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (
        typedPayload.addressId &&
        !(await runtime.geoService.getAddress(
          String(typedPayload.addressId),
          context.requestContext,
        ))
      ) {
        throw new AppError('geographic address not found', {
          code: 'GEO_ADDRESS_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (
        typedPayload.parentSiteId &&
        !(await runtime.geoService.getSite(
          String(typedPayload.parentSiteId),
          context.requestContext,
        ))
      ) {
        throw new AppError('geographic site not found', {
          code: 'GEO_SITE_NOT_FOUND',
          statusCode: 404,
        });
      }
      return {
        summary: `Site ${String(typedPayload.name)} sera criado com specification ${String(typedPayload.siteSpecificationId)}.`,
        warnings: typedPayload.relatedParty
          ? []
          : ['Nenhum relatedParty informado para o novo Site.'],
      };
    },
  );

  registry.register({
    name: 'geo.commit_create_site',
    description:
      'Confirma e executa a criacao de um Geographic Site usando confirmationToken valido.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'geo',
        'create_site',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.geoService.createSite(
            pending.payload as unknown as {
              name: string;
              siteSpecificationId: string;
              status?: 'planned' | 'active' | 'suspended' | 'terminated';
              placeId?: string;
              addressId?: string;
              parentSiteId?: string;
              relatedParty?: Array<{ id: string; role?: string }>;
              characteristic?: Characteristic[];
              relatedSite?: Array<{ id: string; relationshipType: string }>;
            },
            context.requestContext,
          ),
      ),
  });

  const condominiumWorkflowSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          condominiumName: { type: 'string' },
          status: { type: 'string', enum: ['planned', 'active'] },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              streetNr: { type: 'string' },
              city: { type: 'string' },
              stateOrProvince: { type: 'string' },
              postcode: { type: 'string' },
              country: { type: 'string' },
            },
            required: ['street', 'streetNr'],
            additionalProperties: false,
          },
          relatedParty: entityRefArraySchema,
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                cdoiName: { type: 'string' },
              },
              required: ['name', 'cdoiName'],
              additionalProperties: false,
            },
          },
        },
        required: ['address', 'blocks'],
        additionalProperties: false,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registry.register({
    name: 'geo.create_condominium',
    description:
      'Prepara em uma unica confirmacao o cadastro atomico de um condominio, seus blocos e o vinculo de CDOIs existentes. Resolve endereco normalizado, specifications CONDOMINIUM/BLOCK e CDOIs por nome; nao duplica Address nem Resource.',
    inputSchema: condominiumWorkflowSchema,
    handler: async (input, context) => {
      const prepared = await prepareCondominiumWorkflow(
        runtime,
        input.payload as unknown as CondominiumWorkflowInput,
        context.requestContext,
      );
      return await registry.prepareMutation(
        'geo',
        'create_condominium',
        prepared as unknown as Record<string, unknown>,
        context,
        () => ({
          summary: `Condominio ${prepared.condominiumName}, ${prepared.blocks.length} blocos e respectivos vinculos de CDOI serao cadastrados.`,
          warnings: [],
        }),
      );
    },
  });

  registry.register({
    name: 'geo.commit_create_condominium',
    description:
      'Confirma e executa atomicamente a criacao do condominio, blocos e vinculos das CDOIs.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'geo',
        'create_condominium',
        String(input.confirmationToken),
        context,
        (pending) =>
          commitCondominiumWorkflow(
            runtime,
            pending.payload as unknown as PreparedCondominiumWorkflow,
            context.requestContext,
          ),
      ),
  });

  registry.register({
    name: 'resource.list_resource_specifications',
    description:
      'Lista ResourceSpecifications do catalogo de recursos (modelos cadastrados via TMF634). Use esta ferramenta para saber quais modelos/tipos de recurso existem no catalogo antes de criar instancias.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        resourceTypeId: { type: 'string' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const query: {
        name?: string;
        resourceTypeId?: string;
        limit?: number;
        offset?: number;
      } = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (typeof input.resourceTypeId === 'string') query.resourceTypeId = input.resourceTypeId;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = await runtime.resourceService.listResourceSpecifications(
        query,
        context.requestContext,
      );
      return registry.successResult('resource', 'list_resource_specifications', context, {
        items,
        count: items.length,
      });
    },
  });

  registry.register({
    name: 'resource.get_resource_specification',
    description: 'Consulta uma ResourceSpecification do catalogo por id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (input, context) =>
      registry.successResult(
        'resource',
        'get_resource_specification',
        context,
        (await runtime.resourceService.getResourceSpecification(
          String(input.id),
          context.requestContext,
        )) ?? null,
      ),
  });

  registry.register({
    name: 'resource.list_resources',
    description: 'Lista PhysicalResource e LogicalResource do inventario com filtros TMF.',
    inputSchema: resourceQuerySchema,
    handler: async (input, context) => {
      const query: ResourceQuery = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (input.kind === 'PhysicalResource' || input.kind === 'LogicalResource')
        query.kind = input.kind;
      if (
        input.status === 'active' ||
        input.status === 'inactive' ||
        input.status === 'suspended' ||
        input.status === 'terminated'
      )
        query.status = input.status;
      if (typeof input.resourceSpecificationId === 'string')
        query.resourceSpecificationId = input.resourceSpecificationId;
      if (typeof input.placeId === 'string') query.placeId = input.placeId;
      if (typeof input.relatedPartyId === 'string') query.relatedPartyId = input.relatedPartyId;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = await runtime.resourceService.listResources(query, context.requestContext);
      return registry.successResult('resource', 'list_resources', context, {
        items,
        count: items.length,
      });
    },
  });

  registry.register({
    name: 'resource.list_resource_types',
    description:
      'Lista ResourceType do catalogo de recursos (TMF634). Use para resolver tipos canônicos antes de criar ResourceSpecification.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const name = typeof input.name === 'string' ? input.name.trim().toLowerCase() : '';
      const status =
        input.status === 'active' || input.status === 'inactive' ? input.status : undefined;
      const items = (await runtime.resourceService.listResourceTypes(context.requestContext))
        .filter(
          (item) =>
            !name ||
            item.name.toLowerCase().includes(name) ||
            item.code.toLowerCase().includes(name),
        )
        .filter((item) => !status || item.status === status);
      return registry.successResult('resource', 'list_resource_types', context, {
        items,
        count: items.length,
      });
    },
  });

  registry.register({
    name: 'resource.get_resource',
    description: 'Consulta um Resource por id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (input, context) =>
      registry.successResult(
        'resource',
        'get_resource',
        context,
        (await runtime.resourceService.getResource(String(input.id), context.requestContext)) ??
          null,
      ),
  });

  const updatePhysicalResourceSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          placeId: { type: 'string' },
          placeType: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'terminated'] },
          administrativeState: { type: 'string', enum: ['unlocked', 'locked', 'shuttingDown'] },
          operationalState: { type: 'string', enum: ['enabled', 'disabled'] },
          usageState: { type: 'string', enum: ['idle', 'active', 'busy', 'unknown'] },
          serialNumber: { type: 'string' },
          statusCode: { type: 'string' },
          label: { type: 'string' },
          assetReference: { type: 'string' },
          projectId: { type: 'string' },
          relatedParty: entityRefArraySchema,
          resourceRelationship: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                relationshipType: { type: 'string' },
                '@referredType': { type: 'string', enum: ['Resource'] },
              },
              required: ['id', 'relationshipType'],
              additionalProperties: false,
            },
          },
          characteristic: characteristicArraySchema,
        },
        required: ['id'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registry.register({
    name: 'resource.update_physical_resource',
    description:
      'Prepara a atualizacao de um PhysicalResource existente, inclusive seu place GeographicSite. Retorna confirmationToken para commit explicito.',
    inputSchema: updatePhysicalResourceSchema,
    handler: async (input, context) => {
      const payload = input.payload as Record<string, unknown>;
      const id = String(payload.id);
      const resource = await runtime.resourceService.getResource(id, context.requestContext);
      if (!resource || resource['@type'] !== 'PhysicalResource') {
        throw new AppError('physical resource not found', {
          code: 'RESOURCE_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (typeof payload.placeId === 'string') {
        const [site, address, location] = await Promise.all([
          runtime.geoService.getSite(payload.placeId, context.requestContext),
          runtime.geoService.getAddress(payload.placeId, context.requestContext),
          runtime.geoService.getLocation(payload.placeId, context.requestContext),
        ]);
        const placeType = site
          ? 'GeographicSite'
          : address
            ? 'GeographicAddress'
            : location
              ? 'GeographicLocation'
              : undefined;
        if (!placeType) {
          throw new AppError('place not found', {
            code: 'RESOURCE_PLACE_NOT_FOUND',
            statusCode: 404,
          });
        }
        if (payload.placeType && payload.placeType !== placeType) {
          throw new AppError('place type does not match the referenced entity', {
            code: 'RESOURCE_PLACE_TYPE_MISMATCH',
            statusCode: 422,
          });
        }
        payload.placeType = placeType;
      }
      return await registry.prepareMutation(
        'resource',
        'update_physical_resource',
        payload,
        context,
        () => ({ summary: `PhysicalResource ${resource.name} sera atualizado.` }),
      );
    },
  });

  registry.register({
    name: 'resource.commit_update_physical_resource',
    description: 'Confirma e executa a atualizacao de um PhysicalResource.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'update_physical_resource',
        String(input.confirmationToken),
        context,
        (pending) => {
          const { id, ...changes } = pending.payload;
          return runtime.resourceService.updatePhysicalResource(
            String(id),
            changes as UpdatePhysicalResourceInput,
            context.requestContext,
          );
        },
      ),
  });

  const createPhysicalResourceSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          resourceSpecificationId: { type: 'string' },
          placeId: { type: 'string' },
          placeType: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'terminated'] },
          administrativeState: { type: 'string', enum: ['unlocked', 'locked', 'shuttingDown'] },
          operationalState: { type: 'string', enum: ['enabled', 'disabled'] },
          usageState: { type: 'string', enum: ['idle', 'active', 'busy', 'unknown'] },
          serialNumber: { type: 'string' },
          statusCode: { type: 'string' },
          label: { type: 'string' },
          assetReference: { type: 'string' },
          projectId: { type: 'string' },
          relatedParty: entityRefArraySchema,
          resourceRelationship: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                relationshipType: { type: 'string' },
                '@referredType': { type: 'string', enum: ['Resource'] },
              },
              required: ['id', 'relationshipType'],
              additionalProperties: false,
            },
          },
          characteristic: characteristicArraySchema,
        },
        required: ['name', 'resourceSpecificationId'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'resource.create_physical_resource',
    'Prepara a criacao de um PhysicalResource. Retorna confirmationToken para commit.',
    createPhysicalResourceSchema,
    'resource',
    'create_physical_resource',
    async (payload, context) => {
      const typedPayload = payload as CreatePhysicalResourceInput;
      if (
        !(await runtime.resourceService.getResourceSpecification(
          typedPayload.resourceSpecificationId,
          context.requestContext,
        ))
      ) {
        throw new AppError('resource specification not found', {
          code: 'RESOURCE_SPEC_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (typedPayload.placeId) {
        const [site, address, location] = await Promise.all([
          runtime.geoService.getSite(typedPayload.placeId, context.requestContext),
          runtime.geoService.getAddress(typedPayload.placeId, context.requestContext),
          runtime.geoService.getLocation(typedPayload.placeId, context.requestContext),
        ]);
        if (!site && !address && !location) {
          throw new AppError('place not found', {
            code: 'RESOURCE_PLACE_NOT_FOUND',
            statusCode: 404,
          });
        }
      }
      for (const party of typedPayload.relatedParty ?? []) {
        if (!(await runtime.partyService.getParty(party.id))) {
          throw new AppError('related party not found', {
            code: 'RESOURCE_PARTY_NOT_FOUND',
            statusCode: 404,
          });
        }
      }
      return {
        summary: `PhysicalResource ${typedPayload.name} sera criado com specification ${typedPayload.resourceSpecificationId}.`,
      };
    },
  );

  registry.register({
    name: 'resource.commit_create_physical_resource',
    description: 'Confirma e executa a criacao de um PhysicalResource.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'create_physical_resource',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.resourceService.createPhysicalResource(
            pending.payload as CreatePhysicalResourceInput,
            context.requestContext,
          ),
      ),
  });

  const createResourceSpecificationSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          resourceTypeId: { type: 'string' },
          description: { type: 'string' },
          relatedParty: entityRefArraySchema,
          resourceSpecificationCharacteristic: characteristicArraySchema,
        },
        required: ['name', 'resourceTypeId'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'resource.create_resource_specification',
    'Prepara a criacao de uma ResourceSpecification. Nao executa a mutacao; retorna confirmationToken para commit explicito.',
    createResourceSpecificationSchema,
    'resource',
    'create_resource_specification',
    async (payload, context) => {
      const typedPayload = payload as CreateResourceSpecificationInput;
      const resourceType = (
        await runtime.resourceService.listResourceTypes(context.requestContext)
      ).find((item) => item.id === typedPayload.resourceTypeId);
      if (!resourceType) {
        throw new AppError('resource type not found', {
          code: 'RESOURCE_TYPE_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (resourceType.status !== 'active') {
        throw new AppError('resource type is inactive', {
          code: 'RESOURCE_TYPE_INACTIVE',
          statusCode: 409,
        });
      }
      for (const party of typedPayload.relatedParty ?? []) {
        if (!(await runtime.partyService.getParty(party.id))) {
          throw new AppError('related party not found', {
            code: 'RESOURCE_PARTY_NOT_FOUND',
            statusCode: 404,
          });
        }
      }

      return {
        summary: `ResourceSpecification ${typedPayload.name} sera criada como ${resourceType.code}.`,
        warnings: typedPayload.relatedParty?.length
          ? []
          : ['Nenhum relatedParty informado para o ResourceSpecification.'],
      };
    },
  );

  registry.register({
    name: 'resource.commit_create_resource_specification',
    description: 'Confirma e executa a criacao de uma ResourceSpecification.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'create_resource_specification',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.resourceService.createResourceSpecification(
            pending.payload as CreateResourceSpecificationInput,
            context.requestContext,
          ),
      ),
  });

  const createEquipmentModelSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          manufacturerName: { type: 'string' },
          equipmentType: {
            type: 'string',
            description:
              'Código ou nome de um ResourceType ativo do Resource Catalog (ex.: ONT, OLT). Use resource.list_resource_types.',
          },
          description: { type: 'string' },
          equipmentCode: { type: 'string' },
          skuId: { type: 'string' },
          homologationDate: { type: 'string' },
          lifecycleStatus: { type: 'string' },
          stockable: { type: 'boolean' },
          discontinued: { type: 'boolean' },
          supportsSdWan: { type: 'boolean' },
          supportsVoice: { type: 'boolean' },
        },
        required: ['model', 'manufacturerName', 'equipmentType'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'resource.create_equipment_model',
    'Prepara o cadastro de um modelo de equipamento no catalogo de recursos. Resolve fabricante existente automaticamente e retorna confirmationToken para commit explicito.',
    createEquipmentModelSchema,
    'resource',
    'create_equipment_model',
    async (payload, context) => {
      const prepared = await prepareEquipmentModel(
        runtime,
        payload as EquipmentModelInput,
        context.requestContext,
      );

      return {
        summary: `Modelo de ${prepared.catalogEntry.label} ${prepared.model} da ${prepared.manufacturer.name} sera criado no catalogo.`,
        warnings: [],
      };
    },
  );

  registry.register({
    name: 'resource.commit_create_equipment_model',
    description:
      'Confirma e executa o cadastro de um modelo de equipamento no catalogo de recursos.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'create_equipment_model',
        String(input.confirmationToken),
        context,
        async (pending) => {
          const prepared = await prepareEquipmentModel(
            runtime,
            pending.payload as EquipmentModelInput,
            context.requestContext,
          );
          return runtime.resourceService.createResourceSpecification(
            buildEquipmentModelSpecificationInput(prepared),
            context.requestContext,
          );
        },
      ),
  });

  const createEquipmentModelsSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                model: { type: 'string' },
                manufacturerName: { type: 'string' },
                equipmentType: {
                  type: 'string',
                  description:
                    'Código ou nome de um ResourceType ativo do Resource Catalog (ex.: ONT, OLT). Use resource.list_resource_types.',
                },
                description: { type: 'string' },
                equipmentCode: { type: 'string' },
                skuId: { type: 'string' },
                homologationDate: { type: 'string' },
                lifecycleStatus: { type: 'string' },
                stockable: { type: 'boolean' },
                discontinued: { type: 'boolean' },
                supportsSdWan: { type: 'boolean' },
                supportsVoice: { type: 'boolean' },
              },
              required: ['model', 'manufacturerName', 'equipmentType'],
              additionalProperties: true,
            },
          },
        },
        required: ['items'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'resource.create_equipment_models',
    'Prepara o cadastro em lote de modelos de equipamento no catalogo de recursos. Retorna confirmationToken para commit explicito com a lista completa de itens.',
    createEquipmentModelsSchema,
    'resource',
    'create_equipment_models',
    async (payload, context) => {
      const typedPayload = payload as { items: EquipmentModelInput[] };
      if (typedPayload.items.length === 0) {
        throw new AppError('batch is empty', {
          code: 'RESOURCE_EQUIPMENT_MODEL_BATCH_EMPTY',
          statusCode: 422,
        });
      }
      const items = await Promise.all(
        typedPayload.items.map((item) =>
          prepareEquipmentModel(runtime, item, context.requestContext),
        ),
      );
      const duplicateKeys = new Set<string>();

      for (const item of items) {
        const duplicateKey = `${normalizeSearchText(item.model)}|${normalizeSearchText(item.manufacturer.name)}|${item.equipmentType}`;
        if (duplicateKeys.has(duplicateKey)) {
          throw new AppError('duplicate equipment model in batch', {
            code: 'RESOURCE_EQUIPMENT_MODEL_BATCH_DUPLICATE',
            statusCode: 409,
          });
        }
        duplicateKeys.add(duplicateKey);
      }

      return {
        summary: buildEquipmentModelBatchSummary(items),
        warnings: [],
      };
    },
  );

  registry.register({
    name: 'resource.commit_create_equipment_models',
    description:
      'Confirma e executa o cadastro em lote de modelos de equipamento no catalogo de recursos.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'create_equipment_models',
        String(input.confirmationToken),
        context,
        async (pending) => {
          const payload = pending.payload as { items: EquipmentModelInput[] };
          const items = await Promise.all(
            payload.items.map((item) =>
              prepareEquipmentModel(runtime, item, context.requestContext),
            ),
          );
          // Tudo ou nada: uma falha no meio do lote não deixa modelos pela metade.
          const createdItems = await runtime.db.transaction(async () => {
            const created = [];
            for (const item of items) {
              created.push(
                await runtime.resourceService.createResourceSpecification(
                  buildEquipmentModelSpecificationInput(item),
                  context.requestContext,
                ),
              );
            }
            return created;
          });

          return {
            items: createdItems,
          };
        },
      ),
  });

  const deleteEquipmentModelSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          manufacturerName: { type: 'string' },
          equipmentType: {
            type: 'string',
            description:
              'Código ou nome de um ResourceType ativo do Resource Catalog (ex.: ONT, OLT). Use resource.list_resource_types.',
          },
        },
        required: ['model', 'manufacturerName'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'resource.delete_equipment_model',
    'Prepara a remocao de um modelo de equipamento do catalogo de recursos. A remocao e logica/soft-delete e retorna confirmationToken para commit explicito.',
    deleteEquipmentModelSchema,
    'resource',
    'delete_equipment_model',
    async (payload, context) => {
      const typedPayload = payload as {
        model: string;
        manufacturerName: string;
        equipmentType?: string;
      };

      const match = await findEquipmentModelSpecification(
        runtime,
        typedPayload,
        context.requestContext,
      );
      if (!match) {
        throw new AppError('equipment model not found', {
          code: 'RESOURCE_EQUIPMENT_MODEL_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (match.state === 'alreadyRemoved') {
        throw new AppError('equipment model already removed', {
          code: 'RESOURCE_EQUIPMENT_MODEL_ALREADY_REMOVED',
          statusCode: 409,
        });
      }

      return {
        summary: `Modelo de ${match.label} ${match.spec.name} da ${match.manufacturer.name} sera removido do catalogo.`,
        warnings: [],
      };
    },
  );

  registry.register({
    name: 'resource.commit_delete_equipment_model',
    description:
      'Confirma e executa a remocao logica de um modelo de equipamento no catalogo de recursos.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'delete_equipment_model',
        String(input.confirmationToken),
        context,
        async (pending) => {
          const payload = pending.payload as {
            model: string;
            manufacturerName: string;
            equipmentType?: string;
          };

          const match = await findEquipmentModelSpecification(
            runtime,
            payload,
            context.requestContext,
          );
          if (!match || match.state === 'alreadyRemoved') {
            throw new AppError('equipment model not found', {
              code: !match
                ? 'RESOURCE_EQUIPMENT_MODEL_NOT_FOUND'
                : 'RESOURCE_EQUIPMENT_MODEL_ALREADY_REMOVED',
              statusCode: !match ? 404 : 409,
            });
          }

          return runtime.resourceService.deleteResourceSpecification(
            match.spec.id,
            context.requestContext,
          );
        },
      ),
  });

  const createLogicalResourceSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          resourceSpecificationId: { type: 'string' },
          placeId: { type: 'string' },
          placeType: { type: 'string' },
          supportingPhysicalResourceId: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'terminated'] },
          administrativeState: { type: 'string', enum: ['unlocked', 'locked'] },
          operationalState: { type: 'string', enum: ['enabled', 'disabled'] },
          usageState: { type: 'string', enum: ['idle', 'busy', 'unknown'] },
          relatedParty: entityRefArraySchema,
          characteristic: characteristicArraySchema,
        },
        required: ['name', 'resourceSpecificationId'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'resource.create_logical_resource',
    'Prepara a criacao de um LogicalResource. Retorna confirmationToken para commit.',
    createLogicalResourceSchema,
    'resource',
    'create_logical_resource',
    async (payload, context) => {
      const typedPayload = payload as CreateLogicalResourceInput;
      if (
        !(await runtime.resourceService.getResourceSpecification(
          typedPayload.resourceSpecificationId,
          context.requestContext,
        ))
      ) {
        throw new AppError('resource specification not found', {
          code: 'RESOURCE_SPEC_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (
        typedPayload.supportingPhysicalResourceId &&
        !(await runtime.resourceService.getPhysicalResource(
          typedPayload.supportingPhysicalResourceId,
          context.requestContext,
        ))
      ) {
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      }
      return {
        summary: `LogicalResource ${typedPayload.name} sera criado com specification ${typedPayload.resourceSpecificationId}.`,
        warnings: typedPayload.supportingPhysicalResourceId
          ? []
          : ['Nenhum supportingPhysicalResourceId informado para o LogicalResource.'],
      };
    },
  );

  registry.register({
    name: 'resource.commit_create_logical_resource',
    description: 'Confirma e executa a criacao de um LogicalResource.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'create_logical_resource',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.resourceService.createLogicalResource(
            pending.payload as CreateLogicalResourceInput,
            context.requestContext,
          ),
      ),
  });

  const activationSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          resourceId: { type: 'string' },
          action: { type: 'string', enum: ['activate', 'suspend', 'terminate'] },
          reason: { type: 'string' },
        },
        required: ['resourceId'],
        additionalProperties: false,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'resource.activate_resource_function',
    'Prepara a ativacao, suspensao ou terminacao de um Resource Function. Retorna confirmationToken para commit.',
    activationSchema,
    'resource',
    'activate_resource_function',
    async (payload, context) => {
      const typedPayload = payload as ResourceFunctionActivationInput;
      const current = await runtime.resourceService.getResource(
        typedPayload.resourceId,
        context.requestContext,
      );
      if (!current) {
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      }
      return {
        summary: `Resource ${current.name} sera processado com acao ${typedPayload.action ?? 'activate'}.`,
      };
    },
  );

  registry.register({
    name: 'resource.commit_activate_resource_function',
    description: 'Confirma e executa uma acao de Resource Function Activation.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'resource',
        'activate_resource_function',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.resourceService.activateResource(
            pending.payload as ResourceFunctionActivationInput,
            context.requestContext,
          ),
      ),
  });

  registry.register({
    name: 'service.list_services',
    description: 'Lista CFS e RFS do inventario com filtros TMF.',
    inputSchema: serviceQuerySchema,
    handler: async (input, context) => {
      const query: ServiceQuery = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (input['@type'] === 'CustomerFacingService' || input['@type'] === 'ResourceFacingService')
        query.type = input['@type'];
      if (
        input.state === 'feasibilityChecked' ||
        input.state === 'designed' ||
        input.state === 'reserved' ||
        input.state === 'inactive' ||
        input.state === 'active' ||
        input.state === 'terminated'
      ) {
        query.state = input.state;
      }
      if (typeof input.subscriberId === 'string') query.subscriberId = input.subscriberId;
      if (typeof input.relatedPartyId === 'string') query.relatedPartyId = input.relatedPartyId;
      if (typeof input.placeId === 'string') query.placeId = input.placeId;
      if (typeof input.serviceSpecificationId === 'string')
        query.serviceSpecificationId = input.serviceSpecificationId;
      if (typeof input.supportingResourceId === 'string')
        query.supportingResourceId = input.supportingResourceId;
      if (typeof input.supportingServiceId === 'string')
        query.supportingServiceId = input.supportingServiceId;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = await runtime.serviceService.listServices(query, context.requestContext);
      return registry.successResult('service', 'list_services', context, {
        items,
        count: items.length,
      });
    },
  });

  registry.register({
    name: 'service.get_service',
    description: 'Consulta um Service por id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (input, context) =>
      registry.successResult(
        'service',
        'get_service',
        context,
        (await runtime.serviceService.getService(String(input.id), context.requestContext)) ?? null,
      ),
  });

  const createCfsSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          '@type': { type: 'string', enum: ['CustomerFacingService'] },
          name: { type: 'string' },
          serviceSpecificationId: { type: 'string' },
          subscriberId: { type: 'string' },
          serviceType: { type: 'string' },
          state: {
            type: 'string',
            enum: [
              'feasibilityChecked',
              'designed',
              'reserved',
              'inactive',
              'active',
              'terminated',
            ],
          },
          category: { type: 'string' },
          relatedParty: entityRefArraySchema,
          place: entityRefArraySchema,
          supportingService: entityRefArraySchema,
          serviceRelationship: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                relationshipType: { type: 'string' },
                '@referredType': { type: 'string' },
              },
              required: ['id', 'relationshipType'],
              additionalProperties: true,
            },
          },
          serviceCharacteristic: characteristicArraySchema,
        },
        required: ['name', 'serviceSpecificationId', 'subscriberId', 'supportingService'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'service.create_cfs',
    'Prepara a criacao de um CustomerFacingService. Retorna confirmationToken para commit.',
    createCfsSchema,
    'service',
    'create_cfs',
    async (payload, context) => {
      const typedPayload = payload as CreateServiceInput & {
        subscriberId: string;
        supportingService?: Array<{ id: string }>;
        supportingResource?: Array<{ id: string }>;
      };
      const spec = await runtime.serviceService.getServiceSpecification(
        typedPayload.serviceSpecificationId,
        context.requestContext,
      );
      if (!spec) {
        throw new AppError('service specification not found', {
          code: 'SERVICE_SPEC_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (spec.serviceType !== 'CFS') {
        throw new AppError('serviceSpecification type mismatch', {
          code: 'SERVICE_SPEC_TYPE_MISMATCH',
          statusCode: 422,
        });
      }
      if (typedPayload.supportingResource && typedPayload.supportingResource.length > 0) {
        throw new AppError('CFS cannot reference supportingResource directly', {
          code: 'SERVICE_CFS_SUPPORTING_RESOURCE',
          statusCode: 422,
        });
      }
      for (const reference of typedPayload.supportingService ?? []) {
        const supporting = await runtime.serviceService.getService(
          reference.id,
          context.requestContext,
        );
        if (!supporting || supporting['@type'] !== 'ResourceFacingService') {
          throw new AppError('supporting service type mismatch', {
            code: 'SERVICE_SUPPORTING_SERVICE_TYPE_MISMATCH',
            statusCode: 422,
          });
        }
      }
      return {
        summary: `CFS ${typedPayload.name} sera criado para subscriber ${typedPayload.subscriberId}.`,
      };
    },
  );

  registry.register({
    name: 'service.commit_create_cfs',
    description: 'Confirma e executa a criacao de um CustomerFacingService.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'service',
        'create_cfs',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.serviceService.createCustomerFacingService(
            pending.payload as unknown as CreateServiceInput,
            context.requestContext,
          ),
      ),
  });

  const createRfsSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          '@type': { type: 'string', enum: ['ResourceFacingService'] },
          name: { type: 'string' },
          serviceSpecificationId: { type: 'string' },
          serviceType: { type: 'string' },
          state: {
            type: 'string',
            enum: [
              'feasibilityChecked',
              'designed',
              'reserved',
              'inactive',
              'active',
              'terminated',
            ],
          },
          category: { type: 'string' },
          relatedParty: entityRefArraySchema,
          place: entityRefArraySchema,
          supportingResource: entityRefArraySchema,
          supportingService: entityRefArraySchema,
          serviceRelationship: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                relationshipType: { type: 'string' },
                '@referredType': { type: 'string' },
              },
              required: ['id', 'relationshipType'],
              additionalProperties: true,
            },
          },
          serviceCharacteristic: characteristicArraySchema,
        },
        required: ['name', 'serviceSpecificationId', 'supportingResource'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'service.create_rfs',
    'Prepara a criacao de um ResourceFacingService. Retorna confirmationToken para commit.',
    createRfsSchema,
    'service',
    'create_rfs',
    async (payload, context) => {
      const typedPayload = payload as CreateServiceInput & {
        supportingResource?: Array<{ id: string }>;
        subscriberId?: string;
      };
      const spec = await runtime.serviceService.getServiceSpecification(
        typedPayload.serviceSpecificationId,
        context.requestContext,
      );
      if (!spec) {
        throw new AppError('service specification not found', {
          code: 'SERVICE_SPEC_NOT_FOUND',
          statusCode: 404,
        });
      }
      if (spec.serviceType !== 'RFS') {
        throw new AppError('serviceSpecification type mismatch', {
          code: 'SERVICE_SPEC_TYPE_MISMATCH',
          statusCode: 422,
        });
      }
      if (typedPayload.subscriberId) {
        throw new AppError('resource facing service cannot have subscriberId', {
          code: 'SERVICE_RFS_SUBSCRIBER_NOT_ALLOWED',
          statusCode: 422,
        });
      }
      for (const reference of typedPayload.supportingResource ?? []) {
        if (!(await runtime.resourceService.getResource(reference.id, context.requestContext))) {
          throw new AppError('supporting resource not found', {
            code: 'SERVICE_SUPPORTING_RESOURCE_NOT_FOUND',
            statusCode: 422,
          });
        }
      }
      return {
        summary: `RFS ${typedPayload.name} sera criado com ${typedPayload.supportingResource?.length ?? 0} supportingResource(s).`,
      };
    },
  );

  registry.register({
    name: 'service.commit_create_rfs',
    description: 'Confirma e executa a criacao de um ResourceFacingService.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'service',
        'create_rfs',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.serviceService.createResourceFacingService(
            pending.payload as unknown as CreateServiceInput,
            context.requestContext,
          ),
      ),
  });

  // Persiste uma qualification: por isso é escrita em duas etapas (antes rodava sem await e sem
  // confirmação, devolvendo `{}` e perdendo erros).
  const qualificationSchema: JsonSchema = {
    type: 'object',
    properties: {
      placeId: { type: 'string' },
      placeType: { type: 'string' },
      serviceSpecificationId: { type: 'string' },
      serviceType: { type: 'string' },
      relatedParty: entityRefArraySchema,
      serviceCharacteristic: characteristicArraySchema,
    },
    additionalProperties: false,
  };
  registry.register({
    name: 'order.check_service_qualification',
    description:
      'Prepara uma consulta de viabilidade via Service Qualification (persiste o registro). Retorna confirmationToken; a execução exige confirmação do usuário.',
    inputSchema: qualificationSchema,
    handler: (input, context) =>
      registry.prepareMutation('order', 'check_service_qualification', input, context, () => ({
        summary: `Consulta de viabilidade será registrada${
          typeof input.placeId === 'string' ? ` para o local ${input.placeId}` : ''
        }.`,
      })),
  });
  registry.register({
    name: 'order.commit_check_service_qualification',
    description: 'Confirma e executa a consulta de viabilidade (Service Qualification).',
    inputSchema: confirmationTokenSchema,
    handler: (input, context) =>
      registry.commitMutation(
        'order',
        'check_service_qualification',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.orderService.createServiceQualification(
            pending.payload as CreateServiceQualificationInput,
            context.requestContext,
          ),
      ),
  });

  const createServiceOrderSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          relatedParty: entityRefArraySchema,
          serviceOrderItem: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['add', 'modify', 'delete'] },
                serviceId: { type: 'string' },
                service: { type: 'object', additionalProperties: true },
                note: { type: 'string' },
              },
              required: ['action'],
              additionalProperties: true,
            },
          },
        },
        required: ['serviceOrderItem'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'order.create_service_order',
    'Prepara um Service Order. Retorna confirmationToken para commit.',
    createServiceOrderSchema,
    'order',
    'create_service_order',
    async (payload) => {
      const typedPayload = payload as CreateServiceOrderInput;
      if ((typedPayload.serviceOrderItem ?? []).length === 0) {
        throw new AppError('serviceOrderItem required', {
          code: 'SERVICE_ORDER_ITEM_REQUIRED',
          statusCode: 422,
        });
      }
      return {
        summary: `Service Order preparado com ${typedPayload.serviceOrderItem.length} item(ns).`,
      };
    },
  );

  registry.register({
    name: 'order.commit_create_service_order',
    description: 'Confirma e executa um Service Order.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'order',
        'create_service_order',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.orderService.createServiceOrder(
            pending.payload as CreateServiceOrderInput,
            context.requestContext,
          ),
      ),
  });

  const createResourceOrderSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          relatedParty: entityRefArraySchema,
          resourceOrderItem: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['add', 'modify', 'delete'] },
                resourceId: { type: 'string' },
                resource: { type: 'object', additionalProperties: true },
                note: { type: 'string' },
              },
              required: ['action'],
              additionalProperties: true,
            },
          },
        },
        required: ['resourceOrderItem'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'order.create_resource_order',
    'Prepara um Resource Order. Retorna confirmationToken para commit.',
    createResourceOrderSchema,
    'order',
    'create_resource_order',
    async (payload) => {
      const typedPayload = payload as CreateResourceOrderInput;
      if ((typedPayload.resourceOrderItem ?? []).length === 0) {
        throw new AppError('resourceOrderItem required', {
          code: 'RESOURCE_ORDER_ITEM_REQUIRED',
          statusCode: 422,
        });
      }
      return {
        summary: `Resource Order preparado com ${typedPayload.resourceOrderItem.length} item(ns).`,
      };
    },
  );

  registry.register({
    name: 'order.commit_create_resource_order',
    description: 'Confirma e executa um Resource Order.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'order',
        'create_resource_order',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.orderService.createResourceOrder(
            pending.payload as CreateResourceOrderInput,
            context.requestContext,
          ),
      ),
  });

  registry.register({
    name: 'party.list_parties',
    description: 'Lista parties do inventario TMF.',
    inputSchema: partyQuerySchema,
    handler: async (input, context) => {
      const query: PartyQuery = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (typeof input.document === 'string') query.document = input.document;
      if (input.partyType === 'Organization' || input.partyType === 'Individual')
        query.partyType = input.partyType;
      if (input.status === 'active' || input.status === 'inactive' || input.status === 'terminated')
        query.status = input.status;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = await runtime.partyService.listParties(query, context.requestContext);
      return registry.successResult('party', 'list_parties', context, {
        items,
        count: items.length,
      });
    },
  });

  registry.register({
    name: 'party.get_party',
    description: 'Consulta uma Party por id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (input, context) =>
      registry.successResult(
        'party',
        'get_party',
        context,
        (await runtime.partyService.getParty(String(input.id))) ?? null,
      ),
  });

  const createPartySchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          partyType: { type: 'string', enum: ['Organization', 'Individual'] },
          status: { type: 'string', enum: ['active', 'inactive', 'terminated'] },
          partyCharacteristic: characteristicArraySchema,
        },
        required: ['name'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'party.create_party',
    'Prepara a criacao de uma Party. Retorna confirmationToken para commit.',
    createPartySchema,
    'party',
    'create_party',
    (payload) => ({
      summary: `Party ${String((payload as CreatePartyInput).name)} sera criada.`,
    }),
  );

  registry.register({
    name: 'party.commit_create_party',
    description: 'Confirma e executa a criacao de uma Party.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'party',
        'create_party',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.partyService.createParty(
            pending.payload as CreatePartyInput,
            context.requestContext,
          ),
      ),
  });

  const createPartyRoleSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          partyId: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'terminated'] },
          partyRoleCharacteristic: characteristicArraySchema,
        },
        required: ['partyId', 'name'],
        additionalProperties: true,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  };

  registerPreparationAlias(
    'party.create_party_role',
    'Prepara a criacao de um PartyRole. Retorna confirmationToken para commit.',
    createPartyRoleSchema,
    'party',
    'create_party_role',
    async (payload) => {
      const typedPayload = payload as CreatePartyRoleInput;
      if (!(await runtime.partyService.getParty(typedPayload.partyId))) {
        throw new AppError('party not found', { code: 'TMF_PARTY_NOT_FOUND', statusCode: 404 });
      }
      return {
        summary: `PartyRole ${typedPayload.name} sera criado para a party ${typedPayload.partyId}.`,
      };
    },
  );

  registry.register({
    name: 'party.commit_create_party_role',
    description: 'Confirma e executa a criacao de um PartyRole.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'party',
        'create_party_role',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.partyService.createPartyRole(
            pending.payload as CreatePartyRoleInput,
            context.requestContext,
          ),
      ),
  });

  registry.register({
    name: 'event.list_events',
    description: 'Lista eventos TMF688 publicados pelo backend local.',
    inputSchema: eventQuerySchema,
    handler: async (input, context) => {
      const query: TmfEventQuery = {};
      if (typeof input.eventType === 'string') query.eventType = input.eventType;
      if (typeof input.source === 'string') query.source = input.source;
      if (typeof input.correlationId === 'string') query.correlationId = input.correlationId;
      if (typeof input.from === 'string') query.from = input.from;
      if (typeof input.to === 'string') query.to = input.to;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const events = (await runtime.eventService.listEvents(query)).filter(
        (event) =>
          typeof input.entityId !== 'string' ||
          String(event.eventData.entityId ?? '') === input.entityId,
      );
      return registry.successResult('event', 'list_events', context, {
        items: events,
        count: events.length,
      });
    },
  });

  registry.register({
    name: 'event.get_event',
    description: 'Consulta um evento TMF688 por id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (input, context) =>
      registry.successResult(
        'event',
        'get_event',
        context,
        (await runtime.eventService.getEvent(String(input.id))) ?? null,
      ),
  });

  registerGeoOperations(registry, runtime);
  registerResourceOperations(registry, runtime);
  registerServiceOperations(registry, runtime);
  registerOrderOperations(registry, runtime);
  registerPartyOperations(registry, runtime);
  registerStudioOperations(registry, runtime);
  registerOperationMetaTools(registry);

  return {
    serverName: SOURCE,
    registry,
    confirmations,
  };
};

const registerAddressCreationTools = (
  registry: McpToolRegistry,
  runtime: NexusRuntime,
  schema: JsonSchema,
): void => {
  registry.register({
    name: 'geo.create_address',
    description:
      'Prepara a criacao de um GeographicAddress TMF673 quando uma busca normalizada confirmou que ele ainda nao existe. Retorna confirmationToken; nao cria sem confirmacao.',
    inputSchema: schema,
    handler: async (input, context) => {
      const payload = input.payload as unknown as AddressInput;
      if (payload.geographicLocationId) {
        const location = await runtime.geoService.getLocation(
          payload.geographicLocationId,
          context.requestContext,
        );
        if (!location) {
          throw new AppError('geographic location not found', {
            code: 'GEO_LOCATION_NOT_FOUND',
            statusCode: 404,
          });
        }
      }
      const existing = await runtime.geoService.listAddresses(
        {
          street: payload.street,
          ...(payload.streetNr ? { streetNr: payload.streetNr } : {}),
          ...(payload.city ? { city: payload.city } : {}),
          ...(payload.postcode ? { postcode: payload.postcode } : {}),
          includeCharacteristics: false,
          limit: 1,
        },
        context.requestContext,
      );
      if (existing.length > 0) {
        throw new AppError('geographic address already exists', {
          code: 'GEO_ADDRESS_DUPLICATE',
          statusCode: 409,
        });
      }
      return await registry.prepareMutation(
        'geo',
        'create_address',
        payload as unknown as Record<string, unknown>,
        context,
        () => ({
          summary: `Endereco ${payload.street}${payload.streetNr ? `, ${payload.streetNr}` : ''} sera criado.`,
        }),
      );
    },
  });

  registry.register({
    name: 'geo.commit_create_address',
    description: 'Confirma e executa a criacao de um GeographicAddress TMF673.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation(
        'geo',
        'create_address',
        String(input.confirmationToken),
        context,
        (pending) =>
          runtime.geoService.createAddress(
            pending.payload as unknown as AddressInput,
            context.requestContext,
          ),
      ),
  });
};

const resolveSiteSpecificationReference = async (
  runtime: NexusRuntime,
  payload: Record<string, unknown>,
  requestContext?: RequestContext,
) => {
  if (typeof payload.siteSpecificationId === 'string') {
    const specification = await runtime.geoService.getSpec(
      payload.siteSpecificationId,
      requestContext,
    );
    if (specification?.lifecycleStatus === 'Active') return specification;
  }

  const code =
    typeof payload.siteSpecificationCode === 'string'
      ? payload.siteSpecificationCode.trim().toUpperCase()
      : undefined;
  const name =
    typeof payload.siteSpecificationName === 'string'
      ? payload.siteSpecificationName.trim()
      : undefined;
  const candidates = code
    ? await runtime.geoService.listSpecs(
        { code, lifecycleStatus: 'Active', limit: 2 },
        requestContext,
      )
    : name
      ? await runtime.geoService.listSpecs(
          { name, lifecycleStatus: 'Active', limit: 10 },
          requestContext,
        )
      : [];
  const exact = candidates.filter(
    (item) =>
      (code && item.code.toUpperCase() === code) ||
      (name && normalizeSearchText(item.name) === normalizeSearchText(name)),
  );
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) {
    throw new AppError('site specification is ambiguous', {
      code: 'GEO_SPEC_AMBIGUOUS',
      statusCode: 409,
    });
  }
  throw new AppError('site specification not found', {
    code: 'GEO_SPEC_NOT_FOUND',
    statusCode: 404,
  });
};

const paginate = <T>(items: T[], input: Record<string, unknown>): T[] => {
  const offset = typeof input.offset === 'number' ? input.offset : 0;
  const limit = typeof input.limit === 'number' ? input.limit : undefined;
  return items.slice(offset, limit !== undefined ? offset + limit : undefined);
};

// Tools nomeadas expostas direto ao modelo; o restante do registro é alcançado pelas meta-tools.
export const CORE_MODEL_TOOLS: ReadonlySet<string> = new Set([
  'geo.list_sites',
  'geo.get_site',
  'geo.list_addresses',
  'geo.find_nearby_cdos',
  'geo.geocode_address',
  'geo.search_geonet_addresses',
  'resource.list_resources',
  'resource.get_resource',
  'service.list_services',
  'party.list_parties',
  'project.list_projects',
  'event.list_events',
]);

// Descoberta sob demanda (search → describe → invoke). Escrita continua em duas etapas: invocar
// um prepare devolve o `confirmationToken` e só o clique do usuário aciona o commit.
// A permissão real é conferida na operação de destino (executeTool) e no filtro da busca;
// as meta-tools só exigem algum papel de uso do Nexus.
const META_TOOL_ROLES = [
  ...INVENTORY_READ_ROLES,
  ...INVENTORY_WRITE_ROLES,
  ...CATALOG_ADMIN_ROLES,
  ...ORDER_READ_ROLES,
  ...ORDER_REQUEST_ROLES,
  ...STUDIO_READ_ROLES,
] as const;

const registerOperationMetaTools = (registry: McpToolRegistry): void => {
  // Só para clientes externos (stdio/HTTP). No Copilot o commit é o botão de confirmação da UI,
  // por isso a tool fica fora de CORE_MODEL_TOOLS e do catálogo do modelo (ver app.ts).
  registry.register({
    name: 'nexus.confirm_operation',
    requiredRoles: META_TOOL_ROLES,
    description:
      'Confirma e executa uma operação de escrita preparada, usando o confirmationToken devolvido por invoke_operation. Só chame depois que o usuário aprovar o resumo.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.confirmOperation(String(input.confirmationToken), context),
  });

  registry.register({
    name: 'nexus.search_operations',
    requiredRoles: META_TOOL_ROLES,
    description:
      'Busca operações do Nexus (leitura e escrita) por texto e domínio, limitadas ao que o usuário pode executar. Use antes de describe_operation/invoke_operation.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, domain: { type: 'string' } },
      additionalProperties: false,
    },
    handler: (input, context) => {
      const query = normalizeSearchText(typeof input.query === 'string' ? input.query : '');
      const domain = typeof input.domain === 'string' ? input.domain : undefined;
      const terms = query.split(/\s+/).filter(Boolean);
      const operations = registry
        .listOperations(context)
        .filter((tool) => !domain || tool.name.startsWith(`${domain}.`))
        .filter((tool) => {
          const haystack = normalizeSearchText(`${tool.name} ${tool.description}`);
          return terms.every((term) => haystack.includes(term));
        })
        .slice(0, 40)
        .map((tool) => ({
          name: tool.name,
          summary: tool.description,
          kind: isPrepareLike(registry, tool.name) ? 'write' : 'read',
        }));
      return registry.successResult('nexus', 'search_operations', context, { operations });
    },
  });

  registry.register({
    name: 'nexus.describe_operation',
    requiredRoles: META_TOOL_ROLES,
    description:
      'Devolve o schema de entrada completo de uma operação encontrada por search_operations.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
    handler: (input, context) => {
      const tool = registry.getOperation(String(input.name));
      if (!tool) {
        return registry.successResult('nexus', 'describe_operation', context, null, [
          'operação não encontrada',
        ]);
      }
      return registry.successResult('nexus', 'describe_operation', context, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        kind: isPrepareLike(registry, tool.name) ? 'write' : 'read',
      });
    },
  });

  registry.register({
    name: 'nexus.invoke_operation',
    requiredRoles: META_TOOL_ROLES,
    description:
      'Executa uma operação. Leitura devolve os dados; escrita só prepara e devolve confirmationToken para o usuário confirmar.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        input: { type: 'object', additionalProperties: true },
      },
      required: ['name'],
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const name = String(input.name);
      if (!registry.getOperation(name)) {
        return registry.successResult('nexus', 'invoke_operation', context, null, [
          `operação ${name} não encontrada`,
        ]);
      }
      // Papel e schema são verificados por executeTool; o resultado mantém domain/operation da
      // operação real para o card de confirmação.
      return await registry.executeTool(
        name,
        (input.input as Record<string, unknown> | undefined) ?? {},
        context,
      );
    },
  });
};

const isPrepareLike = (registry: McpToolRegistry, name: string): boolean => {
  const [domain = '', ...rest] = name.split('.');
  return registry.listTools().some((tool) => tool.name === `${domain}.commit_${rest.join('.')}`);
};

type ManufacturerPartyReference = {
  id: string;
  '@referredType': string;
  href?: string;
  name: string;
};

type EquipmentCatalogEntry = { resourceTypeCode: string; label: string };

type EquipmentModelInput = {
  model: string;
  manufacturerName: string;
  equipmentType: string;
  description?: string;
  equipmentCode?: string;
  skuId?: string;
  homologationDate?: string;
  lifecycleStatus?: string;
  stockable?: boolean;
  discontinued?: boolean;
  supportsSdWan?: boolean;
  supportsVoice?: boolean;
};

type PreparedEquipmentModel = EquipmentModelInput & {
  manufacturer: ManufacturerPartyReference;
  catalogEntry: EquipmentCatalogEntry;
  resourceTypeId: string;
};

type EquipmentModelLookupResult = {
  state: 'active' | 'alreadyRemoved';
  spec: ResourceSpecification;
  manufacturer: ManufacturerPartyReference;
  label: string;
};

const resolveManufacturerParty = async (
  runtime: NexusRuntime,
  manufacturerName: string,
  requestContext?: RequestContext,
): Promise<ManufacturerPartyReference> => {
  const normalizedName = normalizeSearchText(manufacturerName);
  if (!normalizedName) {
    throw new AppError('manufacturer name is required', {
      code: 'RESOURCE_MANUFACTURER_NAME_REQUIRED',
      statusCode: 422,
    });
  }

  const manufacturerRoles = (
    await runtime.partyService.listPartyRoles(
      {
        name: 'manufacturer',
        status: 'active',
        limit: 1000,
        offset: 0,
      },
      requestContext,
    )
  )
    .map((role) => toManufacturerPartyReference(role.party))
    .filter((party): party is ManufacturerPartyReference => party !== null);

  const exactRoleMatches = manufacturerRoles.filter(
    (party) => normalizeSearchText(party.name ?? '') === normalizedName,
  );
  if (exactRoleMatches.length === 1) {
    const match = exactRoleMatches[0];
    if (match) return match;
  }

  const partialRoleMatches = manufacturerRoles.filter((party) =>
    normalizeSearchText(party.name ?? '').includes(normalizedName),
  );
  const roleMatches = exactRoleMatches.length > 0 ? exactRoleMatches : partialRoleMatches;
  if (roleMatches.length === 1) {
    const match = roleMatches[0];
    if (match) return match;
  }
  if (roleMatches.length > 1) {
    throw new AppError('manufacturer name is ambiguous', {
      code: 'RESOURCE_MANUFACTURER_AMBIGUOUS',
      statusCode: 409,
    });
  }

  const partyMatches = (
    await runtime.partyService.listParties(
      {
        name: manufacturerName,
        partyType: 'Organization',
        status: 'active',
        limit: 1000,
        offset: 0,
      },
      requestContext,
    )
  )
    .filter(
      (party) =>
        normalizeSearchText(party.name) === normalizedName ||
        normalizeSearchText(party.name).includes(normalizedName),
    )
    .map((party) => ({
      id: party.id,
      '@referredType': party.partyType,
      href: party.href,
      name: party.name,
    }));

  if (partyMatches.length === 1) {
    const match = partyMatches[0];
    if (match) return match;
  }
  if (partyMatches.length > 1) {
    throw new AppError('manufacturer name is ambiguous', {
      code: 'RESOURCE_MANUFACTURER_AMBIGUOUS',
      statusCode: 409,
    });
  }

  throw new AppError('manufacturer not found', {
    code: 'RESOURCE_MANUFACTURER_NOT_FOUND',
    statusCode: 404,
  });
};

const normalizeEquipmentModelInput = (input: EquipmentModelInput): EquipmentModelInput => ({
  model: input.model.trim(),
  manufacturerName: input.manufacturerName.trim(),
  equipmentType: input.equipmentType,
  ...(input.description !== undefined ? { description: input.description.trim() } : {}),
  ...(input.equipmentCode !== undefined ? { equipmentCode: input.equipmentCode.trim() } : {}),
  ...(input.skuId !== undefined ? { skuId: input.skuId.trim() } : {}),
  ...(input.homologationDate !== undefined
    ? { homologationDate: input.homologationDate.trim() }
    : {}),
  ...(input.lifecycleStatus !== undefined ? { lifecycleStatus: input.lifecycleStatus.trim() } : {}),
  ...(input.stockable !== undefined ? { stockable: input.stockable } : {}),
  ...(input.discontinued !== undefined ? { discontinued: input.discontinued } : {}),
  ...(input.supportsSdWan !== undefined ? { supportsSdWan: input.supportsSdWan } : {}),
  ...(input.supportsVoice !== undefined ? { supportsVoice: input.supportsVoice } : {}),
});

const resolveEquipmentResourceType = async (
  runtime: NexusRuntime,
  equipmentType: string,
  requestContext?: RequestContext,
) => {
  const wanted = normalizeSearchText(equipmentType);
  const resourceType = (await runtime.resourceService.listResourceTypes(requestContext)).find(
    (item) =>
      normalizeSearchText(item.code) === wanted || normalizeSearchText(item.name) === wanted,
  );
  if (!resourceType) {
    throw new AppError('equipment type not found in the Resource Catalog', {
      code: 'RESOURCE_TYPE_NOT_FOUND',
      statusCode: 404,
    });
  }
  if (resourceType.status !== 'active') {
    throw new AppError('resource type is inactive', {
      code: 'RESOURCE_TYPE_INACTIVE',
      statusCode: 409,
    });
  }
  return resourceType;
};

const prepareEquipmentModel = async (
  runtime: NexusRuntime,
  input: EquipmentModelInput,
  requestContext?: RequestContext,
): Promise<PreparedEquipmentModel> => {
  const normalized = normalizeEquipmentModelInput(input);
  // O tipo vem do Resource Catalog (C9), não de lista fixa: aceita código ou nome do ResourceType.
  const resourceType = await resolveEquipmentResourceType(
    runtime,
    normalized.equipmentType,
    requestContext,
  );
  const catalogEntry: EquipmentCatalogEntry = {
    resourceTypeCode: resourceType.code,
    label: resourceType.name,
  };

  const manufacturer = await resolveManufacturerParty(
    runtime,
    normalized.manufacturerName,
    requestContext,
  );
  return {
    ...normalized,
    manufacturer,
    catalogEntry,
    resourceTypeId: resourceType.id,
  };
};

const buildEquipmentModelSpecificationInput = (
  item: PreparedEquipmentModel,
): CreateResourceSpecificationInput => ({
  name: item.model,
  resourceTypeId: item.resourceTypeId,
  ...(item.description ? { description: item.description } : {}),
  relatedParty: [
    {
      id: item.manufacturer.id,
      '@referredType': item.manufacturer['@referredType'],
      name: item.manufacturer.name,
      role: 'manufacturer',
    },
  ],
  resourceSpecificationCharacteristic: buildEquipmentModelCharacteristics(item),
});

const buildEquipmentModelBatchSummary = (items: PreparedEquipmentModel[]): string => {
  if (items.length === 0) {
    return 'Nenhum modelo informado.';
  }

  const first = items[0];
  if (!first) {
    return 'Nenhum modelo informado.';
  }

  const sameManufacturer = items.every(
    (item) =>
      normalizeSearchText(item.manufacturer.name) === normalizeSearchText(first.manufacturer.name),
  );
  const sameType = items.every((item) => item.equipmentType === first.equipmentType);

  if (sameManufacturer && sameType) {
    return `${items.length} modelos de ${first.catalogEntry.label} da ${first.manufacturer.name} serao criados no catalogo.`;
  }

  if (sameManufacturer) {
    return `${items.length} modelos da ${first.manufacturer.name} serao criados no catalogo.`;
  }

  return `${items.length} modelos de equipamento serao criados no catalogo.`;
};

const findEquipmentModelSpecification = async (
  runtime: NexusRuntime,
  input: {
    model: string;
    manufacturerName: string;
    equipmentType?: string;
  },
  requestContext?: RequestContext,
): Promise<EquipmentModelLookupResult | undefined> => {
  const normalizedModel = normalizeSearchText(input.model);
  const manufacturer = await resolveManufacturerParty(
    runtime,
    input.manufacturerName,
    requestContext,
  );
  const resolvedType = input.equipmentType
    ? await resolveEquipmentResourceType(runtime, input.equipmentType, requestContext)
    : undefined;
  const catalogEntry: EquipmentCatalogEntry | undefined = resolvedType
    ? { resourceTypeCode: resolvedType.code, label: resolvedType.name }
    : undefined;
  const specs = await runtime.resourceService.listResourceSpecifications(
    {
      name: input.model,
      includeEnded: true,
    },
    requestContext,
  );

  const matches = specs.filter((spec) => {
    if (normalizeSearchText(spec.name) !== normalizedModel) {
      return false;
    }
    if (catalogEntry && spec.resourceType.code !== catalogEntry.resourceTypeCode) {
      return false;
    }

    const specManufacturer = spec.relatedParty.find((party) => party.role === 'manufacturer');
    if (!specManufacturer) {
      return false;
    }

    const manufacturerNameMatches =
      normalizeSearchText(specManufacturer.name ?? '') === normalizeSearchText(manufacturer.name);
    const manufacturerIdMatches = specManufacturer.id === manufacturer.id;
    return manufacturerNameMatches || manufacturerIdMatches;
  });

  const activeMatches = matches.filter((spec) => !spec.validFor?.endDateTime);
  if (activeMatches.length === 1) {
    const spec = activeMatches[0];
    if (spec) {
      return {
        state: 'active',
        spec,
        manufacturer,
        label: catalogEntry?.label ?? spec.resourceType.code,
      };
    }
  }

  if (activeMatches.length > 1) {
    throw new AppError('equipment model is ambiguous', {
      code: 'RESOURCE_EQUIPMENT_MODEL_AMBIGUOUS',
      statusCode: 409,
    });
  }

  const endedMatches = matches.filter((spec) => Boolean(spec.validFor?.endDateTime));
  if (endedMatches.length > 0) {
    const spec = endedMatches[0];
    if (spec) {
      return {
        state: 'alreadyRemoved',
        spec,
        manufacturer,
        label: catalogEntry?.label ?? spec.resourceType.code,
      };
    }
  }

  return undefined;
};

const buildEquipmentModelCharacteristics = (input: {
  model: string;
  equipmentCode?: string;
  skuId?: string;
  homologationDate?: string;
  lifecycleStatus?: string;
  stockable?: boolean;
  discontinued?: boolean;
  supportsSdWan?: boolean;
  supportsVoice?: boolean;
}): Characteristic[] => {
  const characteristics: Characteristic[] = [
    {
      name: MODEL_CHARACTERISTIC.name,
      value: input.model.trim(),
      valueType: MODEL_CHARACTERISTIC.valueType,
      group: MODEL_CHARACTERISTIC.group,
    },
  ];

  if (input.equipmentCode?.trim()) {
    characteristics.push({
      name: 'equipmentCode',
      value: input.equipmentCode.trim(),
      valueType: 'string' as const,
      group: 'identification',
    });
  }
  if (input.skuId?.trim()) {
    characteristics.push({
      name: 'skuId',
      value: input.skuId.trim(),
      valueType: 'string' as const,
      group: 'commercial',
    });
  }
  if (input.homologationDate?.trim()) {
    characteristics.push({
      name: 'homologationDate',
      value: input.homologationDate.trim(),
      valueType: 'date' as const,
      group: 'commercial',
    });
  }
  if (input.lifecycleStatus?.trim()) {
    characteristics.push({
      name: 'lifecycleStatus',
      value: input.lifecycleStatus.trim(),
      valueType: 'string' as const,
      group: 'lifecycle',
    });
  }
  if (input.stockable !== undefined) {
    characteristics.push({
      name: 'stockable',
      value: input.stockable,
      valueType: 'boolean' as const,
      group: 'capability',
    });
  }
  if (input.discontinued !== undefined) {
    characteristics.push({
      name: 'discontinued',
      value: input.discontinued,
      valueType: 'boolean' as const,
      group: 'lifecycle',
    });
  }
  if (input.supportsSdWan !== undefined) {
    characteristics.push({
      name: 'supportsSdWan',
      value: input.supportsSdWan,
      valueType: 'boolean' as const,
      group: 'capability',
    });
  }
  if (input.supportsVoice !== undefined) {
    characteristics.push({
      name: 'supportsVoice',
      value: input.supportsVoice,
      valueType: 'boolean' as const,
      group: 'capability',
    });
  }

  return characteristics;
};

const normalizeSearchText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const toManufacturerPartyReference = (
  party: { id: string; '@referredType': string; href?: string; name?: string } | undefined,
): ManufacturerPartyReference | null => {
  if (!party || party['@referredType'] !== 'Organization') {
    return null;
  }

  return {
    id: party.id,
    '@referredType': party['@referredType'],
    ...(party.href ? { href: party.href } : {}),
    name: party.name ?? party.id,
  };
};
