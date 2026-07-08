import { AppError } from '../../shared/errors/app-error.js';
import type { NexusRuntime } from '../../shared/runtime/nexus-runtime.js';
import type { Characteristic, TmfEventQuery } from '../../shared/tmf/index.js';
import type { CreatePartyInput, CreatePartyRoleInput, PartyQuery } from '../party/index.js';
import type { CreatePhysicalResourceInput, CreateLogicalResourceInput, ResourceFunctionActivationInput, ResourceQuery } from '../resource/index.js';
import type { CreateServiceInput, ServiceQuery } from '../service/index.js';
import type { CreateResourceOrderInput, CreateServiceOrderInput, CreateServiceQualificationInput } from '../order/index.js';
import { type JsonSchema, validateJsonSchema } from './schema.js';
import { SqliteMcpConfirmationRepository } from './confirmation.js';
import type { PendingMcpConfirmation } from './confirmation.js';

export type McpToolContext = ReturnType<NexusRuntime['createToolContext']>;

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
  handler: (input: Record<string, unknown>, context: McpToolContext) => Promise<McpToolResult> | McpToolResult;
};

const SOURCE = 'nexus-tmf-mcp' as const;
const DEFAULT_CONFIRMATION_TTL_MS = 30 * 60 * 1000;

type PrepareResult = {
  summary: string;
  warnings?: string[];
};

export class McpToolRegistry {
  private readonly tools = new Map<string, McpToolDefinition>();

  public constructor(private readonly runtime: NexusRuntime, private readonly confirmations: SqliteMcpConfirmationRepository) {}

  public register(tool: McpToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public listTools(options: { exposeToModelOnly?: boolean } = {}): McpToolDefinition[] {
    return [...this.tools.values()].filter((tool) => !options.exposeToModelOnly || tool.exposeToModel !== false);
  }

  public executeTool(name: string, input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> | McpToolResult {
    const tool = this.tools.get(name);
    if (!tool) {
      return this.errorResult('mcp', 'execute_tool', context, 'MCP_TOOL_NOT_FOUND', `tool ${name} not found`);
    }

    const validationErrors = validateJsonSchema(input, tool.inputSchema);
    if (validationErrors.length > 0) {
      return this.errorResult(tool.name.split('.')[0] ?? 'mcp', tool.name.split('.').slice(1).join('.'), context, 'MCP_INVALID_PAYLOAD', 'tool payload validation failed', validationErrors);
    }

    try {
      return tool.handler(input, context);
    } catch (error) {
      return this.normalizeError(tool.name, context, error);
    }
  }

  public toModelTools(): Array<{ type: 'function'; function: { name: string; description: string; parameters: JsonSchema } }> {
    return this.listTools({ exposeToModelOnly: true }).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
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
    return this.errorResult(name.split('.')[0] ?? 'mcp', name.split('.').slice(1).join('.'), context, 'MCP_TOOL_FAILED', message);
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

  public prepareMutation(
    domain: string,
    operation: string,
    payload: Record<string, unknown>,
    context: McpToolContext,
    prepare: () => PrepareResult,
  ): McpToolResult {
    const prepared = prepare();
    const createdAt = new Date();
    const pending = this.confirmations.create({
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
      },
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + DEFAULT_CONFIRMATION_TTL_MS).toISOString(),
    });

    return this.successResult(domain, operation, context, {
      confirmationToken: pending.token,
      summary: pending.summary,
      expiresAt: pending.expiresAt,
      payload,
    }, pending.warnings);
  }

  public commitMutation<T>(
    domain: string,
    operation: string,
    confirmationToken: string,
    context: McpToolContext,
    commit: (pending: PendingMcpConfirmation) => T,
  ): McpToolResult {
    const pending = this.confirmations.get(confirmationToken);
    if (!pending) {
      return this.errorResult(domain, operation, context, 'MCP_CONFIRMATION_NOT_FOUND', 'confirmation token not found');
    }
    if (pending.operation !== operation || pending.domain !== domain) {
      return this.errorResult(domain, operation, context, 'MCP_CONFIRMATION_OPERATION_MISMATCH', 'confirmation token does not match the requested operation');
    }
    if (pending.consumedAt) {
      return this.errorResult(domain, operation, context, 'MCP_CONFIRMATION_ALREADY_CONSUMED', 'confirmation token already consumed');
    }
    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      return this.errorResult(domain, operation, context, 'MCP_CONFIRMATION_EXPIRED', 'confirmation token expired');
    }

    const consumed = this.confirmations.consume(confirmationToken);
    if (!consumed) {
      return this.errorResult(domain, operation, context, 'MCP_CONFIRMATION_NOT_FOUND', 'confirmation token not found');
    }

    try {
      return this.successResult(domain, operation, context, commit(consumed), pending.warnings);
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

const pagingSchema: JsonSchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer' },
    offset: { type: 'integer' },
  },
  additionalProperties: true,
};

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
  const confirmations = new SqliteMcpConfirmationRepository(runtime.db);
  const registry = new McpToolRegistry(runtime, confirmations);

  const querySiteSchema: JsonSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      siteSpecificationId: { type: 'string' },
      parentSiteId: { type: 'string' },
      placeId: { type: 'string' },
      relatedPartyId: { type: 'string' },
      status: { type: 'string', enum: ['planned', 'active', 'suspended', 'terminated'] },
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
      city: { type: 'string' },
      postcode: { type: 'string' },
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
      state: { type: 'string', enum: ['feasibilityChecked', 'designed', 'reserved', 'inactive', 'active', 'terminated'] },
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
    description: 'Lista Geographic Sites do inventario Nexus com filtros por id, nome, status e relacionamentos.',
    inputSchema: querySiteSchema,
    handler: (input, context) => {
      const items = paginate(
        runtime.geoService.listSites().filter((site) => {
          if (typeof input.id === 'string' && site.id !== input.id) return false;
          if (typeof input.name === 'string' && !site.name.toLowerCase().includes(input.name.toLowerCase())) return false;
          if (typeof input.siteSpecificationId === 'string' && site.siteSpecificationId !== input.siteSpecificationId) return false;
          if (typeof input.parentSiteId === 'string' && site.parentSite?.id !== input.parentSiteId) return false;
          if (typeof input.placeId === 'string' && site.place?.id !== input.placeId) return false;
          if (typeof input.relatedPartyId === 'string' && !site.relatedParty.some((item) => item.id === input.relatedPartyId)) return false;
          if (typeof input.status === 'string' && site.status !== input.status) return false;
          return true;
        }),
        input,
      );

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
    handler: (input, context) => registry.successResult('geo', 'get_site', context, runtime.geoService.getSite(String(input.id)) ?? null),
  });

  registry.register({
    name: 'geo.list_addresses',
    description: 'Lista Geographic Addresses do inventario Nexus.',
    inputSchema: queryAddressSchema,
    handler: (input, context) => {
      const items = paginate(
        runtime.geoService.listAddresses().filter((address) => {
          if (typeof input.id === 'string' && address.id !== input.id) return false;
          if (typeof input.street === 'string' && !address.street.toLowerCase().includes(input.street.toLowerCase())) return false;
          if (typeof input.city === 'string' && (address.city ?? '').toLowerCase() !== input.city.toLowerCase()) return false;
          if (typeof input.postcode === 'string' && address.postcode !== input.postcode) return false;
          if (typeof input.geographicLocationId === 'string' && address.geographicLocationId !== input.geographicLocationId) return false;
          return true;
        }),
        input,
      );
      return registry.successResult('geo', 'list_addresses', context, {
        items,
        count: items.length,
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
    handler: (input, context) => registry.successResult('geo', 'get_address', context, runtime.geoService.getAddress(String(input.id)) ?? null),
  });

  const createSitePayloadSchema: JsonSchema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['planned', 'active', 'suspended', 'terminated'] },
          siteSpecificationId: { type: 'string' },
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
        required: ['name', 'siteSpecificationId'],
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
    prepare: (payload: Record<string, unknown>) => PrepareResult,
  ) => {
    registry.register({
      name,
      description,
      inputSchema: schema,
      handler: (input, context) => registry.prepareMutation(domain, operation, input.payload as Record<string, unknown>, context, () => prepare(input.payload as Record<string, unknown>)),
    });
  };

  registerPreparationAlias(
    'geo.create_site',
    'Prepara a criacao de um Geographic Site. Nao executa a mutacao; retorna confirmationToken para commit explicito.',
    createSitePayloadSchema,
    'geo',
    'create_site',
    (payload) => {
      const typedPayload = payload as Record<string, unknown>;
      if (!runtime.geoService.getSpec(String(typedPayload.siteSpecificationId))) {
        throw new AppError('site specification not found', { code: 'GEO_SPEC_NOT_FOUND', statusCode: 404 });
      }
      if (typedPayload.placeId && !runtime.geoService.getLocation(String(typedPayload.placeId))) {
        throw new AppError('geographic location not found', { code: 'GEO_LOCATION_NOT_FOUND', statusCode: 404 });
      }
      if (typedPayload.addressId && !runtime.geoService.getAddress(String(typedPayload.addressId))) {
        throw new AppError('geographic address not found', { code: 'GEO_ADDRESS_NOT_FOUND', statusCode: 404 });
      }
      if (typedPayload.parentSiteId && !runtime.geoService.getSite(String(typedPayload.parentSiteId))) {
        throw new AppError('geographic site not found', { code: 'GEO_SITE_NOT_FOUND', statusCode: 404 });
      }
      return {
        summary: `Site ${String(typedPayload.name)} sera criado com specification ${String(typedPayload.siteSpecificationId)}.`,
        warnings: typedPayload.relatedParty ? [] : ['Nenhum relatedParty informado para o novo Site.'],
      };
    },
  );

  registry.register({
    name: 'geo.commit_create_site',
    description: 'Confirma e executa a criacao de um Geographic Site usando confirmationToken valido.',
    inputSchema: {
      type: 'object',
      properties: { confirmationToken: { type: 'string' } },
      required: ['confirmationToken'],
      additionalProperties: false,
    },
    handler: (input, context) =>
      registry.commitMutation('geo', 'create_site', String(input.confirmationToken), context, (pending) =>
        runtime.geoService.createSite(pending.payload as unknown as {
          name: string;
          siteSpecificationId: string;
          status?: 'planned' | 'active' | 'suspended' | 'terminated';
          placeId?: string;
          addressId?: string;
          parentSiteId?: string;
          relatedParty?: Array<{ id: string; role?: string }>;
          characteristic?: Characteristic[];
          relatedSite?: Array<{ id: string; relationshipType: string }>;
        }),
      ),
  });

  registry.register({
    name: 'resource.list_resources',
    description: 'Lista PhysicalResource e LogicalResource do inventario com filtros TMF.',
    inputSchema: resourceQuerySchema,
    handler: (input, context) => {
      const query: ResourceQuery = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (input.kind === 'PhysicalResource' || input.kind === 'LogicalResource') query.kind = input.kind;
      if (input.status === 'active' || input.status === 'inactive' || input.status === 'suspended' || input.status === 'terminated') query.status = input.status;
      if (typeof input.resourceSpecificationId === 'string') query.resourceSpecificationId = input.resourceSpecificationId;
      if (typeof input.placeId === 'string') query.placeId = input.placeId;
      if (typeof input.relatedPartyId === 'string') query.relatedPartyId = input.relatedPartyId;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = runtime.resourceService.listResources(query);
      return registry.successResult('resource', 'list_resources', context, { items, count: items.length });
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
    handler: (input, context) => registry.successResult('resource', 'get_resource', context, runtime.resourceService.getResource(String(input.id)) ?? null),
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
          administrativeState: { type: 'string', enum: ['unlocked', 'locked'] },
          operationalState: { type: 'string', enum: ['enabled', 'disabled'] },
          usageState: { type: 'string', enum: ['idle', 'busy', 'unknown'] },
          manufacturer: { type: 'string' },
          model: { type: 'string' },
          serialNumber: { type: 'string' },
          partNumber: { type: 'string' },
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
    'resource.create_physical_resource',
    'Prepara a criacao de um PhysicalResource. Retorna confirmationToken para commit.',
    createPhysicalResourceSchema,
    'resource',
    'create_physical_resource',
    (payload) => {
      const typedPayload = payload as CreatePhysicalResourceInput;
      if (!runtime.resourceService.getResourceSpecification(typedPayload.resourceSpecificationId)) {
        throw new AppError('resource specification not found', { code: 'RESOURCE_SPEC_NOT_FOUND', statusCode: 404 });
      }
      if (typedPayload.placeId) {
        const placeExists =
          runtime.geoService.getSite(typedPayload.placeId) ||
          runtime.geoService.getAddress(typedPayload.placeId) ||
          runtime.geoService.getLocation(typedPayload.placeId);
        if (!placeExists) {
          throw new AppError('place not found', { code: 'RESOURCE_PLACE_NOT_FOUND', statusCode: 404 });
        }
      }
      for (const party of typedPayload.relatedParty ?? []) {
        if (!runtime.partyService.getParty(party.id)) {
          throw new AppError('related party not found', { code: 'RESOURCE_PARTY_NOT_FOUND', statusCode: 404 });
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
      registry.commitMutation('resource', 'create_physical_resource', String(input.confirmationToken), context, (pending) =>
        runtime.resourceService.createPhysicalResource(pending.payload as CreatePhysicalResourceInput),
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
    (payload) => {
      const typedPayload = payload as CreateLogicalResourceInput;
      if (!runtime.resourceService.getResourceSpecification(typedPayload.resourceSpecificationId)) {
        throw new AppError('resource specification not found', { code: 'RESOURCE_SPEC_NOT_FOUND', statusCode: 404 });
      }
      if (typedPayload.supportingPhysicalResourceId && !runtime.resourceService.getPhysicalResource(typedPayload.supportingPhysicalResourceId)) {
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      }
      return {
        summary: `LogicalResource ${typedPayload.name} sera criado com specification ${typedPayload.resourceSpecificationId}.`,
        warnings: typedPayload.supportingPhysicalResourceId ? [] : ['Nenhum supportingPhysicalResourceId informado para o LogicalResource.'],
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
      registry.commitMutation('resource', 'create_logical_resource', String(input.confirmationToken), context, (pending) =>
        runtime.resourceService.createLogicalResource(pending.payload as CreateLogicalResourceInput),
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
    (payload) => {
      const typedPayload = payload as ResourceFunctionActivationInput;
      const current = runtime.resourceService.getResource(typedPayload.resourceId);
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
      registry.commitMutation('resource', 'activate_resource_function', String(input.confirmationToken), context, (pending) =>
        runtime.resourceService.activateResource(pending.payload as ResourceFunctionActivationInput),
      ),
  });

  registry.register({
    name: 'service.list_services',
    description: 'Lista CFS e RFS do inventario com filtros TMF.',
    inputSchema: serviceQuerySchema,
    handler: (input, context) => {
      const query: ServiceQuery = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (input['@type'] === 'CustomerFacingService' || input['@type'] === 'ResourceFacingService') query.type = input['@type'];
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
      if (typeof input.serviceSpecificationId === 'string') query.serviceSpecificationId = input.serviceSpecificationId;
      if (typeof input.supportingResourceId === 'string') query.supportingResourceId = input.supportingResourceId;
      if (typeof input.supportingServiceId === 'string') query.supportingServiceId = input.supportingServiceId;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = runtime.serviceService.listServices(query);
      return registry.successResult('service', 'list_services', context, { items, count: items.length });
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
    handler: (input, context) => registry.successResult('service', 'get_service', context, runtime.serviceService.getService(String(input.id)) ?? null),
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
          state: { type: 'string', enum: ['feasibilityChecked', 'designed', 'reserved', 'inactive', 'active', 'terminated'] },
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
    (payload) => {
      const typedPayload = payload as CreateServiceInput & { subscriberId: string; supportingService?: Array<{ id: string }>; supportingResource?: Array<{ id: string }> };
      const spec = runtime.serviceService.getServiceSpecification(typedPayload.serviceSpecificationId);
      if (!spec) {
        throw new AppError('service specification not found', { code: 'SERVICE_SPEC_NOT_FOUND', statusCode: 404 });
      }
      if (spec.serviceType !== 'CFS') {
        throw new AppError('serviceSpecification type mismatch', { code: 'SERVICE_SPEC_TYPE_MISMATCH', statusCode: 422 });
      }
      if (typedPayload.supportingResource && typedPayload.supportingResource.length > 0) {
        throw new AppError('CFS cannot reference supportingResource directly', { code: 'SERVICE_CFS_SUPPORTING_RESOURCE', statusCode: 422 });
      }
      for (const reference of typedPayload.supportingService ?? []) {
        const supporting = runtime.serviceService.getService(reference.id);
        if (!supporting || supporting['@type'] !== 'ResourceFacingService') {
          throw new AppError('supporting service type mismatch', { code: 'SERVICE_SUPPORTING_SERVICE_TYPE_MISMATCH', statusCode: 422 });
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
      registry.commitMutation('service', 'create_cfs', String(input.confirmationToken), context, (pending) =>
        runtime.serviceService.createCustomerFacingService(pending.payload as unknown as CreateServiceInput),
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
          state: { type: 'string', enum: ['feasibilityChecked', 'designed', 'reserved', 'inactive', 'active', 'terminated'] },
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
    (payload) => {
      const typedPayload = payload as CreateServiceInput & { supportingResource?: Array<{ id: string }>; subscriberId?: string };
      const spec = runtime.serviceService.getServiceSpecification(typedPayload.serviceSpecificationId);
      if (!spec) {
        throw new AppError('service specification not found', { code: 'SERVICE_SPEC_NOT_FOUND', statusCode: 404 });
      }
      if (spec.serviceType !== 'RFS') {
        throw new AppError('serviceSpecification type mismatch', { code: 'SERVICE_SPEC_TYPE_MISMATCH', statusCode: 422 });
      }
      if (typedPayload.subscriberId) {
        throw new AppError('resource facing service cannot have subscriberId', { code: 'SERVICE_RFS_SUBSCRIBER_NOT_ALLOWED', statusCode: 422 });
      }
      for (const reference of typedPayload.supportingResource ?? []) {
        if (!runtime.resourceService.getResource(reference.id)) {
          throw new AppError('supporting resource not found', { code: 'SERVICE_SUPPORTING_RESOURCE_NOT_FOUND', statusCode: 422 });
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
      registry.commitMutation('service', 'create_rfs', String(input.confirmationToken), context, (pending) =>
        runtime.serviceService.createResourceFacingService(pending.payload as unknown as CreateServiceInput),
      ),
  });

  registry.register({
    name: 'order.check_service_qualification',
    description: 'Executa uma consulta de viabilidade via Service Qualification.',
    inputSchema: {
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
    },
    handler: (input, context) =>
      registry.successResult(
        'order',
        'check_service_qualification',
        context,
        runtime.orderService.createServiceQualification(input as CreateServiceQualificationInput),
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
    (payload) => {
      const typedPayload = payload as CreateServiceOrderInput;
      if ((typedPayload.serviceOrderItem ?? []).length === 0) {
        throw new AppError('serviceOrderItem required', { code: 'SERVICE_ORDER_ITEM_REQUIRED', statusCode: 422 });
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
      registry.commitMutation('order', 'create_service_order', String(input.confirmationToken), context, (pending) =>
        runtime.orderService.createServiceOrder(pending.payload as CreateServiceOrderInput),
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
    (payload) => {
      const typedPayload = payload as CreateResourceOrderInput;
      if ((typedPayload.resourceOrderItem ?? []).length === 0) {
        throw new AppError('resourceOrderItem required', { code: 'RESOURCE_ORDER_ITEM_REQUIRED', statusCode: 422 });
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
      registry.commitMutation('order', 'create_resource_order', String(input.confirmationToken), context, (pending) =>
        runtime.orderService.createResourceOrder(pending.payload as CreateResourceOrderInput),
      ),
  });

  registry.register({
    name: 'party.list_parties',
    description: 'Lista parties do inventario TMF.',
    inputSchema: partyQuerySchema,
    handler: (input, context) => {
      const query: PartyQuery = {};
      if (typeof input.name === 'string') query.name = input.name;
      if (typeof input.document === 'string') query.document = input.document;
      if (input.partyType === 'Organization' || input.partyType === 'Individual') query.partyType = input.partyType;
      if (input.status === 'active' || input.status === 'inactive' || input.status === 'terminated') query.status = input.status;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const items = runtime.partyService.listParties(query);
      return registry.successResult('party', 'list_parties', context, { items, count: items.length });
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
    handler: (input, context) => registry.successResult('party', 'get_party', context, runtime.partyService.getParty(String(input.id)) ?? null),
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
      registry.commitMutation('party', 'create_party', String(input.confirmationToken), context, (pending) =>
        runtime.partyService.createParty(pending.payload as CreatePartyInput),
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
    (payload) => {
      const typedPayload = payload as CreatePartyRoleInput;
      if (!runtime.partyService.getParty(typedPayload.partyId)) {
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
      registry.commitMutation('party', 'create_party_role', String(input.confirmationToken), context, (pending) =>
        runtime.partyService.createPartyRole(pending.payload as CreatePartyRoleInput),
      ),
  });

  registry.register({
    name: 'event.list_events',
    description: 'Lista eventos TMF688 publicados pelo backend local.',
    inputSchema: eventQuerySchema,
    handler: (input, context) => {
      const query: TmfEventQuery = {};
      if (typeof input.eventType === 'string') query.eventType = input.eventType;
      if (typeof input.source === 'string') query.source = input.source;
      if (typeof input.correlationId === 'string') query.correlationId = input.correlationId;
      if (typeof input.from === 'string') query.from = input.from;
      if (typeof input.to === 'string') query.to = input.to;
      if (typeof input.limit === 'number') query.limit = input.limit;
      if (typeof input.offset === 'number') query.offset = input.offset;
      const events = runtime.eventService
        .listEvents(query)
        .filter((event) => typeof input.entityId !== 'string' || String(event.eventData.entityId ?? '') === input.entityId);
      return registry.successResult('event', 'list_events', context, { items: events, count: events.length });
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
    handler: (input, context) => registry.successResult('event', 'get_event', context, runtime.eventService.getEvent(String(input.id)) ?? null),
  });

  return {
    serverName: SOURCE,
    registry,
    confirmations,
  };
};

const paginate = <T>(items: T[], input: Record<string, unknown>): T[] => {
  const offset = typeof input.offset === 'number' ? input.offset : 0;
  const limit = typeof input.limit === 'number' ? input.limit : undefined;
  return items.slice(offset, limit !== undefined ? offset + limit : undefined);
};
