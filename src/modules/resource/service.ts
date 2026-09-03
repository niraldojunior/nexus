import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildHref, type EventService, type RelatedParty } from '../../shared/tmf/index.js';
import type {
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  CreateResourceLayerInput,
  CreateResourceFunctionSpecificationInput,
  CreateResourceSpecificationInput,
  LogicalResource,
  PhysicalResource,
  PhysicalResourceDetail,
  Resource,
  ResourceFunctionActivationInput,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceRelationship,
  ResourceCategory,
  ResourceCatalog,
  ResourceCatalogNode,
  ResourceCatalogPath,
  ResourceCatalogPathEntry,
  ResourceCatalogQuery,
  ResourceCatalogTreeNode,
  ResourceLayer,
  ResourceType,
  ResourceSpecification,
  ResourceSpecificationBulkItem,
  ResourceSpecificationBulkItemResult,
  ResourceSpecificationBulkResult,
  ResourceSpecificationQuery,
  ResourceAuditEntry,
  ResourceStatus,
  ResourceStatusCatalogEntry,
  ResourcePortDetail,
  ResourcePortsView,
  UpdateLogicalResourceInput,
  UpdatePhysicalResourceInput,
  UpdateResourceLayerInput,
  UpdateResourceFunctionSpecificationInput,
  UpdateResourceSpecificationInput,
  CreateResourceCatalogInput,
  UpdateResourceCatalogInput,
  CreateResourceCatalogNodeInput,
  UpdateResourceCatalogNodeInput,
  MoveResourceCatalogNodeInput,
} from './domain.js';
import type {
  IResourceRepository,
  ResourceTenantScope,
} from './resource-repository-interface.js';
import type { MapFeatureSynchronizer } from '../geo/map-feature-synchronizer.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { recordMutation } from '../../shared/persistence/audit-outbox.js';

const DEFAULT_TENANT_ID = 'default';
const tenantOf = (context?: RequestContext): string => context?.tenantId ?? DEFAULT_TENANT_ID;
const scopeOf = (context?: RequestContext): ResourceTenantScope => ({
  tenantId: tenantOf(context),
});

type ResourceServiceDependencies = {
  lookupPlace?: (
    id: string,
  ) =>
    | Promise<{ id: string; '@referredType': string; href?: string; name?: string } | undefined>
    | { id: string; '@referredType': string; href?: string; name?: string }
    | undefined;
  lookupParty?: (
    id: string,
  ) =>
    | Promise<{ id: string; '@referredType': string; href?: string; name?: string } | undefined>
    | { id: string; '@referredType': string; href?: string; name?: string }
    | undefined;
  lookupPartyRoles?: (
    partyId: string,
  ) => Promise<Array<{ name: string; status: 'active' | 'inactive' | 'terminated' }>>;
  mapFeatureSynchronizer?: MapFeatureSynchronizer;
  /** Trilha de auditoria + outbox (C7) — best-effort: sem `db` (ex.: testes que montam o
   *  serviço com um repositório em memória), a auditoria só não roda. */
  db?: DatabaseClient;
};

export class ResourceService {
  public constructor(
    private readonly repository: IResourceRepository,
    private readonly eventService: EventService,
    private readonly dependencies: ResourceServiceDependencies = {},
  ) {}

  public async createResourceSpecification(
    input: CreateResourceSpecificationInput,
    context?: RequestContext,
  ): Promise<ResourceSpecification> {
    assertName(input.name);
    const category = await this.getResourceCategoryOrThrow(input.category);
    const resourceType = await this.getResourceTypeOrThrow(input.resourceType);
    this.assertResourceTypeMatchesCategory(resourceType, category);
    const id = createCanonicalId();
    const spec: ResourceSpecification = {
      '@type': 'ResourceSpecification',
      id,
      href: buildHref('resourceSpecification', id),
      name: input.name.trim(),
      category: category.code,
      resourceType: resourceType.code,
      resourceSpecificationCharacteristic: assertCanonicalSpecificationCharacteristics(
        input.resourceSpecificationCharacteristic ?? [],
      ),
      relatedParty: await normalizeSpecificationRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
        this.dependencies.lookupPartyRoles,
      ),
      tenantId: tenantOf(context),
      ...(input.resourceLayerId
        ? { resourceLayerId: (await this.getResourceLayerOrThrow(input.resourceLayerId, context)).id }
        : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertResourceSpecification(spec);
    await this.emit(
      'ResourceSpecificationCreateEvent',
      stored.id,
      'ResourceSpecification',
      stored,
      context,
    );
    return stored;
  }

  public async updateResourceSpecification(
    id: string,
    input: UpdateResourceSpecificationInput,
    context?: RequestContext,
  ): Promise<ResourceSpecification> {
    const current = await this.getResourceSpecificationOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);
    const nextCategoryCode =
      input.category !== undefined ? input.category.trim() : current.category;
    const nextResourceTypeCode =
      input.resourceType !== undefined ? input.resourceType.trim() : current.resourceType;
    const nextCategory = await this.getResourceCategoryOrThrow(nextCategoryCode);
    const nextResourceType = await this.getResourceTypeOrThrow(nextResourceTypeCode);
    this.assertResourceTypeMatchesCategory(nextResourceType, nextCategory);

    const updated = await this.repository.upsertResourceSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      category: nextCategory.code,
      resourceType: nextResourceType.code,
      resourceSpecificationCharacteristic: assertCanonicalSpecificationCharacteristics(
        input.resourceSpecificationCharacteristic ?? current.resourceSpecificationCharacteristic,
      ),
      relatedParty:
        input.relatedParty !== undefined
          ? await normalizeSpecificationRelatedParties(
              input.relatedParty,
              this.dependencies.lookupParty,
              this.dependencies.lookupPartyRoles,
            )
          : current.relatedParty,
      ...(input.resourceLayerId !== undefined
        ? input.resourceLayerId
          ? { resourceLayerId: (await this.getResourceLayerOrThrow(input.resourceLayerId, context)).id }
          : {}
        : current.resourceLayerId
          ? { resourceLayerId: current.resourceLayerId }
          : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      'ResourceSpecificationAttributeValueChangeEvent',
      updated.id,
      'ResourceSpecification',
      updated,
      context,
    );
    return updated;
  }

  // Carga em massa do catálogo (Configurações → Recursos de Rede → Carga em massa). Reusa
  // createResourceSpecification linha a linha para herdar validação canônica e evento TMF688 por
  // item, mas segue o lote inteiro em vez de abortar na primeira falha (importação parcial) — o
  // resultado por linha volta para o relatório exibido no modal.
  public async bulkCreateResourceSpecifications(
    items: ResourceSpecificationBulkItem[],
    context?: RequestContext,
  ): Promise<ResourceSpecificationBulkResult> {
    const results: ResourceSpecificationBulkItemResult[] = [];
    for (const item of items) {
      try {
        const created = await this.createResourceSpecification(item.input, context);
        results.push({ line: item.line, status: 'created', id: created.id, name: created.name });
      } catch (error) {
        results.push({
          line: item.line,
          status: 'error',
          name: item.input.name,
          code: error instanceof AppError ? error.code : 'RESOURCE_SPEC_BULK_FAILED',
          message: error instanceof Error ? error.message : 'Falha ao criar especificação.',
        });
      }
    }
    const created = results.filter((result) => result.status === 'created').length;
    return { total: items.length, created, failed: items.length - created, results };
  }

  public async deleteResourceSpecification(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceSpecification> {
    const current = await this.getResourceSpecificationOrThrow(id, context);
    const terminated = await this.repository.upsertResourceSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ResourceSpecificationAttributeValueChangeEvent',
      terminated.id,
      'ResourceSpecification',
      terminated,
      context,
    );
    return terminated;
  }

  public async listResourceSpecifications(
    query?: ResourceSpecificationQuery,
    context?: RequestContext,
  ): Promise<ResourceSpecification[]> {
    return await this.repository.listResourceSpecifications({
      ...query,
      tenantId: tenantOf(context),
    });
  }

  public async getResourceSpecification(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceSpecification | undefined> {
    return await this.repository.getResourceSpecification(id, scopeOf(context));
  }

  public async listResourceCategories(): Promise<ResourceCategory[]> {
    return await this.repository.listResourceCategories();
  }

  public async listResourceTypes(): Promise<ResourceType[]> {
    return await this.repository.listResourceTypes();
  }

  public async createResourceLayer(
    input: CreateResourceLayerInput,
    context?: RequestContext,
  ): Promise<ResourceLayer> {
    assertName(input.code, 'code');
    assertName(input.name);
    const tenantId = tenantOf(context);
    const duplicate = (await this.repository.listResourceLayers({ tenantId })).find(
      (layer) => layer.code === input.code.trim(),
    );
    if (duplicate) {
      throw new AppError('resource layer code already exists', {
        code: 'RESOURCE_LAYER_CODE_DUPLICATE',
        statusCode: 409,
      });
    }
    const id = createCanonicalId();
    const layer: ResourceLayer = {
      '@type': 'ResourceLayer',
      id,
      href: buildHref('resourceLayer', id),
      code: input.code.trim(),
      name: input.name.trim(),
      status: 'active',
      tenantId,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    };
    const stored = await this.repository.upsertResourceLayer(layer);
    await this.emit('ResourceLayerCreateEvent', stored.id, 'ResourceLayer', stored, context);
    return stored;
  }

  public async updateResourceLayer(
    id: string,
    input: UpdateResourceLayerInput,
    context?: RequestContext,
  ): Promise<ResourceLayer> {
    const current = await this.getResourceLayerOrThrow(id, context, false);
    if (input.code !== undefined) assertName(input.code, 'code');
    if (input.name !== undefined) assertName(input.name);
    const nextCode = input.code?.trim() ?? current.code;
    if (nextCode !== current.code) {
      const duplicate = (await this.repository.listResourceLayers(scopeOf(context))).find(
        (layer) => layer.code === nextCode && layer.id !== current.id,
      );
      if (duplicate) {
        throw new AppError('resource layer code already exists', {
          code: 'RESOURCE_LAYER_CODE_DUPLICATE',
          statusCode: 409,
        });
      }
    }
    const updated = await this.repository.upsertResourceLayer({
      ...current,
      code: nextCode,
      name: input.name?.trim() ?? current.name,
      status: input.status ?? current.status,
      ...(input.description !== undefined
        ? input.description.trim()
          ? { description: input.description.trim() }
          : {}
        : current.description
          ? { description: current.description }
          : {}),
    });
    await this.emit(
      'ResourceLayerAttributeValueChangeEvent',
      updated.id,
      'ResourceLayer',
      updated,
      context,
      current,
    );
    return updated;
  }

  public async deleteResourceLayer(id: string, context?: RequestContext): Promise<ResourceLayer> {
    const current = await this.getResourceLayerOrThrow(id, context, false);
    const retired = await this.repository.upsertResourceLayer({ ...current, status: 'inactive' });
    await this.emit(
      'ResourceLayerAttributeValueChangeEvent',
      retired.id,
      'ResourceLayer',
      retired,
      context,
      current,
    );
    return retired;
  }

  public async getResourceLayer(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceLayer | undefined> {
    return await this.repository.getResourceLayer(id, scopeOf(context));
  }

  public async listResourceLayers(context?: RequestContext): Promise<ResourceLayer[]> {
    return await this.repository.listResourceLayers(scopeOf(context));
  }

  // --- Árvore dinâmica de catálogo (issue #188) -------------------------------------------------
  // Convive com Category/Layer acima até o cutover lógico (plano §7.8). ResourceType ainda não tem
  // CRUD/tenant-scoping próprio (bootstrap estático em catalog.ts) — a resolução por id abaixo usa
  // listResourceTypes() em memória, aceitável no tamanho atual do catálogo; ganha método dedicado
  // quando ResourceType ganhar CRUD (tarefas #7/#9 do plano).

  public async createResourceCatalog(
    input: CreateResourceCatalogInput,
    context?: RequestContext,
  ): Promise<ResourceCatalog> {
    assertName(input.code, 'code');
    assertName(input.name);
    const tenantId = tenantOf(context);
    const duplicate = await this.repository.getResourceCatalogByCode(input.code.trim(), {
      tenantId,
    });
    if (duplicate) {
      throw new AppError('resource catalog code already exists', {
        code: 'RESOURCE_CATALOG_CODE_DUPLICATE',
        statusCode: 409,
      });
    }
    const isDefault = input.isDefault ?? false;
    if (isDefault && (await this.repository.getDefaultResourceCatalog({ tenantId }))) {
      throw new AppError('resource catalog default already exists', {
        code: 'RESOURCE_CATALOG_DEFAULT_DUPLICATE',
        statusCode: 409,
      });
    }
    const id = createCanonicalId();
    const catalog: ResourceCatalog = {
      '@type': 'ResourceCatalog',
      id,
      href: buildHref('resourceCatalog', id),
      code: input.code.trim(),
      name: input.name.trim(),
      status: 'active',
      isDefault,
      sortOrder: input.sortOrder ?? 0,
      tenantId,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(context?.actorSub ? { createdBy: context.actorSub, updatedBy: context.actorSub } : {}),
    };
    const stored = await this.repository.upsertResourceCatalog(catalog);
    await this.emit('ResourceCatalogCreateEvent', stored.id, 'ResourceCatalog', stored, context);
    return stored;
  }

  public async updateResourceCatalog(
    id: string,
    input: UpdateResourceCatalogInput,
    context?: RequestContext,
  ): Promise<ResourceCatalog> {
    const current = await this.getResourceCatalogOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);
    const tenantId = tenantOf(context);
    const nextIsDefault = input.isDefault ?? current.isDefault;
    if (nextIsDefault && !current.isDefault) {
      const existingDefault = await this.repository.getDefaultResourceCatalog({ tenantId });
      if (existingDefault && existingDefault.id !== current.id) {
        throw new AppError('resource catalog default already exists', {
          code: 'RESOURCE_CATALOG_DEFAULT_DUPLICATE',
          statusCode: 409,
        });
      }
    }
    const updated = await this.repository.upsertResourceCatalog({
      ...current,
      name: input.name?.trim() ?? current.name,
      status: input.status ?? current.status,
      isDefault: nextIsDefault,
      sortOrder: input.sortOrder ?? current.sortOrder,
      ...(input.description !== undefined
        ? input.description.trim()
          ? { description: input.description.trim() }
          : {}
        : current.description
          ? { description: current.description }
          : {}),
      ...(context?.actorSub ? { updatedBy: context.actorSub } : {}),
    });
    await this.emit(
      'ResourceCatalogAttributeValueChangeEvent',
      updated.id,
      'ResourceCatalog',
      updated,
      context,
      current,
    );
    return updated;
  }

  public async deleteResourceCatalog(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceCatalog> {
    const current = await this.getResourceCatalogOrThrow(id, context);
    const activeNodes = await this.repository.listResourceCatalogNodes(current.id, scopeOf(context));
    if (activeNodes.length > 0) {
      throw new AppError('resource catalog is not empty', {
        code: 'RESOURCE_CATALOG_NOT_EMPTY',
        statusCode: 409,
      });
    }
    const retired = await this.repository.upsertResourceCatalog({
      ...current,
      status: 'inactive',
      ...(context?.actorSub ? { updatedBy: context.actorSub } : {}),
    });
    await this.emit(
      'ResourceCatalogAttributeValueChangeEvent',
      retired.id,
      'ResourceCatalog',
      retired,
      context,
      current,
    );
    return retired;
  }

  public async getResourceCatalog(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceCatalog | undefined> {
    return await this.repository.getResourceCatalog(id, scopeOf(context));
  }

  public async listResourceCatalogs(
    query?: ResourceCatalogQuery,
    context?: RequestContext,
  ): Promise<ResourceCatalog[]> {
    return await this.repository.listResourceCatalogs({ ...query, tenantId: tenantOf(context) });
  }

  public async createResourceCatalogNode(
    catalogId: string,
    input: CreateResourceCatalogNodeInput,
    context?: RequestContext,
  ): Promise<ResourceCatalogNode> {
    assertName(input.code, 'code');
    assertName(input.name);
    const catalog = await this.getResourceCatalogOrThrow(catalogId, context);
    const tenantId = tenantOf(context);
    const duplicate = await this.repository.getResourceCatalogNodeByCode(
      catalog.id,
      input.code.trim(),
      { tenantId },
    );
    if (duplicate) {
      throw new AppError('resource catalog node code already exists', {
        code: 'RESOURCE_CATALOG_NODE_CODE_DUPLICATE',
        statusCode: 409,
      });
    }
    const parent = await this.assertValidParent(catalog.id, input.parentNodeId, context);
    const resourceType =
      input.kind === 'RESOURCE_TYPE'
        ? await this.getResourceTypeByIdOrThrow(input.resourceTypeId)
        : undefined;
    const id = createCanonicalId();
    const node: ResourceCatalogNode = {
      '@type': 'ResourceCatalogNode',
      id,
      href: buildHref('resourceCatalogNode', id),
      catalogId: catalog.id,
      code: input.code.trim(),
      name: input.name.trim(),
      kind: input.kind,
      status: 'active',
      sortOrder: input.sortOrder ?? 0,
      tenantId,
      ...(parent ? { parentNodeId: parent.id } : {}),
      ...(resourceType ? { resourceTypeId: resourceType.id } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(context?.actorSub ? { createdBy: context.actorSub, updatedBy: context.actorSub } : {}),
    };
    const stored = await this.repository.upsertResourceCatalogNode(node);
    await this.emit(
      'ResourceCatalogNodeCreateEvent',
      stored.id,
      'ResourceCatalogNode',
      stored,
      context,
    );
    return stored;
  }

  public async updateResourceCatalogNode(
    catalogId: string,
    nodeId: string,
    input: UpdateResourceCatalogNodeInput,
    context?: RequestContext,
  ): Promise<ResourceCatalogNode> {
    const current = await this.getResourceCatalogNodeOrThrow(catalogId, nodeId, context);
    if (input.name !== undefined) assertName(input.name);
    const updated = await this.repository.upsertResourceCatalogNode({
      ...current,
      name: input.name?.trim() ?? current.name,
      status: input.status ?? current.status,
      ...(input.metadata !== undefined
        ? { metadata: input.metadata }
        : current.metadata
          ? { metadata: current.metadata }
          : {}),
      ...(input.description !== undefined
        ? input.description.trim()
          ? { description: input.description.trim() }
          : {}
        : current.description
          ? { description: current.description }
          : {}),
      ...(context?.actorSub ? { updatedBy: context.actorSub } : {}),
    });
    await this.emit(
      'ResourceCatalogNodeAttributeValueChangeEvent',
      updated.id,
      'ResourceCatalogNode',
      updated,
      context,
      current,
    );
    return updated;
  }

  /**
   * Único caminho que muda `parentNodeId`/`sortOrder` (plano §4) — centraliza a prevenção de
   * ciclo/self-parent. `PATCH` normal (acima) nunca toca posição.
   */
  public async moveResourceCatalogNode(
    catalogId: string,
    nodeId: string,
    input: MoveResourceCatalogNodeInput,
    context?: RequestContext,
  ): Promise<ResourceCatalogNode> {
    const current = await this.getResourceCatalogNodeOrThrow(catalogId, nodeId, context);
    if (input.parentNodeId === current.id) {
      throw new AppError('resource catalog node cannot be its own parent', {
        code: 'RESOURCE_CATALOG_NODE_SELF_PARENT',
        statusCode: 409,
      });
    }
    const parent =
      input.parentNodeId === null
        ? undefined
        : await this.assertValidParent(current.catalogId, input.parentNodeId, context);

    if (parent) {
      // Caminha do novo pai até a raiz; se alcançar o próprio nó movido, é ciclo (direto ou
      // indireto) — cobre também árvore preexistente já corrompida via `visited`.
      const allNodes = await this.repository.listResourceCatalogNodes(current.catalogId, {
        ...scopeOf(context),
        includeInactive: true,
      });
      const parentById = new Map(allNodes.map((node) => [node.id, node.parentNodeId]));
      const visited = new Set<string>();
      let cursor: string | undefined = parent.id;
      while (cursor) {
        if (cursor === current.id) {
          throw new AppError('resource catalog node move creates a cycle', {
            code: 'RESOURCE_CATALOG_NODE_CYCLE',
            statusCode: 409,
          });
        }
        if (visited.has(cursor)) break;
        visited.add(cursor);
        cursor = parentById.get(cursor);
      }
    }

    const updated = await this.repository.upsertResourceCatalogNode({
      ...current,
      sortOrder: input.sortOrder,
      ...(parent ? { parentNodeId: parent.id } : {}),
      ...(context?.actorSub ? { updatedBy: context.actorSub } : {}),
    });
    if (input.parentNodeId === null) {
      // spread acima não remove parentNodeId quando current já tinha um — grava explicitamente
      // a raiz via segundo upsert só quando necessário (evita mutar objetos parciais no meio do caminho).
      const { parentNodeId: _discardedParentNodeId, ...withoutParent } = updated;
      const uprooted = await this.repository.upsertResourceCatalogNode(withoutParent);
      await this.emit(
        'ResourceCatalogNodeAttributeValueChangeEvent',
        uprooted.id,
        'ResourceCatalogNode',
        uprooted,
        context,
        current,
      );
      return uprooted;
    }
    await this.emit(
      'ResourceCatalogNodeAttributeValueChangeEvent',
      updated.id,
      'ResourceCatalogNode',
      updated,
      context,
      current,
    );
    return updated;
  }

  public async deleteResourceCatalogNode(
    catalogId: string,
    nodeId: string,
    context?: RequestContext,
  ): Promise<ResourceCatalogNode> {
    const current = await this.getResourceCatalogNodeOrThrow(catalogId, nodeId, context);
    const childCount = await this.repository.countResourceCatalogNodeChildren(
      current.id,
      scopeOf(context),
    );
    if (childCount > 0) {
      throw new AppError('resource catalog node has children', {
        code: 'RESOURCE_CATALOG_NODE_HAS_CHILDREN',
        statusCode: 409,
      });
    }
    const retired = await this.repository.upsertResourceCatalogNode({
      ...current,
      status: 'inactive',
      ...(context?.actorSub ? { updatedBy: context.actorSub } : {}),
    });
    await this.emit(
      'ResourceCatalogNodeAttributeValueChangeEvent',
      retired.id,
      'ResourceCatalogNode',
      retired,
      context,
      current,
    );
    return retired;
  }

  public async getResourceCatalogNode(
    catalogId: string,
    nodeId: string,
    context?: RequestContext,
  ): Promise<ResourceCatalogNode | undefined> {
    const node = await this.repository.getResourceCatalogNode(nodeId, scopeOf(context));
    return node && node.catalogId === catalogId ? node : undefined;
  }

  public async listResourceCatalogNodes(
    catalogId: string,
    context?: RequestContext,
    includeInactive = false,
  ): Promise<ResourceCatalogNode[]> {
    await this.getResourceCatalogOrThrow(catalogId, context);
    return await this.repository.listResourceCatalogNodes(catalogId, {
      ...scopeOf(context),
      includeInactive,
    });
  }

  /** Monta a árvore a partir de uma consulta flat, em memória, O(n) (plano §4). */
  public async getResourceCatalogTree(
    catalogId: string,
    context?: RequestContext,
    includeInactive = false,
  ): Promise<ResourceCatalogTreeNode[]> {
    const flat = await this.listResourceCatalogNodes(catalogId, context, includeInactive);
    return buildResourceCatalogTree(flat);
  }

  public async getResourceCatalogNodePath(
    catalogId: string,
    nodeId: string,
    context?: RequestContext,
  ): Promise<ResourceCatalogPath> {
    const catalog = await this.getResourceCatalogOrThrow(catalogId, context);
    const allNodes = await this.repository.listResourceCatalogNodes(catalog.id, {
      ...scopeOf(context),
      includeInactive: true,
    });
    const byId = new Map(allNodes.map((node) => [node.id, node]));
    const target = byId.get(nodeId);
    if (!target) {
      throw new AppError('resource catalog node not found', {
        code: 'RESOURCE_CATALOG_NODE_NOT_FOUND',
        statusCode: 404,
      });
    }
    const chain: ResourceCatalogPathEntry[] = [];
    const visited = new Set<string>();
    let cursor: ResourceCatalogNode | undefined = target;
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      chain.unshift({
        id: cursor.id,
        code: cursor.code,
        name: cursor.name,
        kind: cursor.kind,
        ...(cursor.resourceTypeId ? { resourceTypeId: cursor.resourceTypeId } : {}),
      });
      cursor = cursor.parentNodeId ? byId.get(cursor.parentNodeId) : undefined;
    }
    return {
      catalog: { id: catalog.id, code: catalog.code, name: catalog.name },
      nodes: chain,
    };
  }

  private async assertValidParent(
    catalogId: string,
    parentNodeId: string | undefined,
    context?: RequestContext,
  ): Promise<ResourceCatalogNode | undefined> {
    if (!parentNodeId) return undefined;
    const parent = await this.repository.getResourceCatalogNode(parentNodeId, scopeOf(context));
    if (!parent) {
      throw new AppError('resource catalog parent node not found', {
        code: 'RESOURCE_CATALOG_NODE_PARENT_NOT_FOUND',
        statusCode: 404,
      });
    }
    if (parent.catalogId !== catalogId) {
      throw new AppError('resource catalog parent node belongs to another catalog', {
        code: 'RESOURCE_CATALOG_NODE_CROSS_CATALOG',
        statusCode: 409,
      });
    }
    if (parent.kind !== 'GROUP') {
      throw new AppError('resource catalog parent node must be a group', {
        code: 'RESOURCE_CATALOG_NODE_PARENT_NOT_GROUP',
        statusCode: 409,
      });
    }
    if (parent.status !== 'active') {
      throw new AppError('resource catalog parent node is inactive', {
        code: 'RESOURCE_CATALOG_NODE_PARENT_INACTIVE',
        statusCode: 409,
      });
    }
    return parent;
  }

  private async getResourceCatalogOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceCatalog> {
    const catalog = await this.repository.getResourceCatalog(id, scopeOf(context));
    if (!catalog) {
      throw new AppError('resource catalog not found', {
        code: 'RESOURCE_CATALOG_NOT_FOUND',
        statusCode: 404,
      });
    }
    return catalog;
  }

  private async getResourceCatalogNodeOrThrow(
    catalogId: string,
    nodeId: string,
    context?: RequestContext,
  ): Promise<ResourceCatalogNode> {
    const node = await this.repository.getResourceCatalogNode(nodeId, scopeOf(context));
    if (!node || node.catalogId !== catalogId) {
      throw new AppError('resource catalog node not found', {
        code: 'RESOURCE_CATALOG_NODE_NOT_FOUND',
        statusCode: 404,
      });
    }
    return node;
  }

  private async getResourceTypeByIdOrThrow(id: string): Promise<ResourceType> {
    const types = await this.repository.listResourceTypes();
    const type = types.find((candidate) => candidate.id === id);
    if (!type) {
      throw new AppError('resource type not found', {
        code: 'RESOURCE_TYPE_NOT_FOUND',
        statusCode: 404,
      });
    }
    if (type.status !== 'active') {
      throw new AppError('resource type is inactive', {
        code: 'RESOURCE_TYPE_INACTIVE',
        statusCode: 409,
      });
    }
    return type;
  }

  /**
   * Estados granulares disponíveis (issue #171). Com `resourceType`, devolve os específicos
   * daquele tipo **mais** os transversais — a UI de um CTO precisa das duas famílias.
   */
  public async listResourceStatusCatalog(
    resourceType?: string,
    context?: RequestContext,
  ): Promise<ResourceStatusCatalogEntry[]> {
    return await this.repository.listResourceStatusCatalog({
      ...(resourceType ? { resourceType } : {}),
      ...scopeOf(context),
    });
  }

  public async createResourceFunctionSpecification(
    input: CreateResourceFunctionSpecificationInput,
    context?: RequestContext,
  ): Promise<ResourceFunctionSpecification> {
    assertName(input.name);
    const id = createCanonicalId();
    const spec: ResourceFunctionSpecification = {
      '@type': 'ResourceFunctionSpecification',
      id,
      href: buildHref('resourceFunctionSpecification', id),
      name: input.name.trim(),
      resourceFunctionSpecificationCharacteristic:
        input.resourceFunctionSpecificationCharacteristic ?? [],
      tenantId: tenantOf(context),
      ...(input.description ? { description: input.description } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertResourceFunctionSpecification(spec);
    await this.emit(
      'ResourceFunctionSpecificationCreateEvent',
      stored.id,
      'ResourceFunctionSpecification',
      stored,
      context,
    );
    return stored;
  }

  public async updateResourceFunctionSpecification(
    id: string,
    input: UpdateResourceFunctionSpecificationInput,
    context?: RequestContext,
  ): Promise<ResourceFunctionSpecification> {
    const current = await this.getResourceFunctionSpecificationOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);

    const updated = await this.repository.upsertResourceFunctionSpecification({
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      resourceFunctionSpecificationCharacteristic:
        input.resourceFunctionSpecificationCharacteristic ??
        current.resourceFunctionSpecificationCharacteristic,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      'ResourceFunctionSpecificationAttributeValueChangeEvent',
      updated.id,
      'ResourceFunctionSpecification',
      updated,
      context,
    );
    return updated;
  }

  public async deleteResourceFunctionSpecification(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceFunctionSpecification> {
    const current = await this.getResourceFunctionSpecificationOrThrow(id, context);
    const terminated = await this.repository.upsertResourceFunctionSpecification({
      ...current,
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ResourceFunctionSpecificationAttributeValueChangeEvent',
      terminated.id,
      'ResourceFunctionSpecification',
      terminated,
      context,
    );
    return terminated;
  }

  public async listResourceFunctionSpecifications(
    query?: ResourceFunctionSpecificationQuery,
    context?: RequestContext,
  ): Promise<ResourceFunctionSpecification[]> {
    return await this.repository.listResourceFunctionSpecifications({
      ...query,
      tenantId: tenantOf(context),
    });
  }

  public async getResourceFunctionSpecification(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceFunctionSpecification | undefined> {
    return await this.repository.getResourceFunctionSpecification(id, scopeOf(context));
  }

  public async createPhysicalResource(
    input: CreatePhysicalResourceInput,
    context?: RequestContext,
  ): Promise<PhysicalResource> {
    assertName(input.name);
    const spec = await this.getResourceSpecificationOrThrow(
      input.resourceSpecificationId,
      context,
    );
    const id = createCanonicalId();
    const place = await this.resolvePlace(input.placeId, input.placeType);
    const resource: PhysicalResource = {
      '@type': 'PhysicalResource',
      id,
      href: buildHref('resource', id),
      name: input.name.trim(),
      resourceSpecificationId: spec.id,
      resourceSpecification: { id: spec.id, '@referredType': 'ResourceSpecification' },
      resourceType: spec.resourceType,
      status: input.status ?? 'active',
      administrativeState: input.administrativeState ?? 'unlocked',
      operationalState: input.operationalState ?? 'enabled',
      usageState: input.usageState ?? 'idle',
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      resourceRelationship: [],
      characteristic: input.characteristic ?? [],
      tenantId: tenantOf(context),
      ...(place ? { place } : {}),
      ...(input.serialNumber ? { serialNumber: input.serialNumber } : {}),
      ...(input.partNumber ? { partNumber: input.partNumber } : {}),
      ...(input.statusCode ? { statusCode: input.statusCode } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.assetReference ? { assetReference: input.assetReference } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertPhysicalResource(resource);
    for (const relationship of input.resourceRelationship ?? []) {
      await this.addResourceRelationship(stored.id, relationship, context);
    }
    const finalResource = await this.getPhysicalResourceOrThrow(stored.id, context);
    await this.syncMapFeature(finalResource, context);
    await this.emit(
      'ResourceCreateEvent',
      finalResource.id,
      'PhysicalResource',
      finalResource,
      context,
    );
    return finalResource;
  }

  public async updatePhysicalResource(
    id: string,
    input: UpdatePhysicalResourceInput,
    context?: RequestContext,
  ): Promise<PhysicalResource> {
    const current = await this.getPhysicalResourceOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);
    const specification =
      input.resourceSpecificationId !== undefined
        ? await this.getResourceSpecificationOrThrow(input.resourceSpecificationId, context)
        : undefined;

    // `place` some do objeto base (não só do spread condicional de baixo) porque
    // `placeId: null` (desvincular do local, aba Recursos do painel unificado, C2) precisa
    // apagar um `current.place` existente — `exactOptionalPropertyTypes` não aceita
    // `place: undefined` explícito, só a chave ausente.
    const { place: _currentPlace, ...currentWithoutPlace } = current;
    const place =
      input.placeId !== undefined
        ? await this.resolvePlace(input.placeId, input.placeType)
        : current.place;
    const updated = await this.repository.upsertPhysicalResource({
      ...currentWithoutPlace,
      name: input.name !== undefined ? input.name.trim() : current.name,
      resourceSpecificationId: input.resourceSpecificationId ?? current.resourceSpecificationId,
      resourceSpecification: {
        id: input.resourceSpecificationId ?? current.resourceSpecificationId,
        '@referredType': 'ResourceSpecification',
      },
      resourceType: specification?.resourceType ?? current.resourceType,
      status: input.status ?? current.status,
      administrativeState: input.administrativeState ?? current.administrativeState,
      operationalState: input.operationalState ?? current.operationalState,
      usageState: input.usageState ?? current.usageState,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      resourceRelationship: current.resourceRelationship,
      characteristic: input.characteristic ?? current.characteristic,
      ...(place ? { place } : {}),
      ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
      ...(input.partNumber !== undefined ? { partNumber: input.partNumber } : {}),
      ...(input.statusCode !== undefined ? { statusCode: input.statusCode } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.assetReference !== undefined ? { assetReference: input.assetReference } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.syncMapFeature(updated, context);

    await this.emit(
      current.status !== updated.status
        ? 'ResourceStateChangeEvent'
        : 'ResourceAttributeValueChangeEvent',
      updated.id,
      'PhysicalResource',
      updated,
      context,
      current,
    );
    return updated;
  }

  public async deletePhysicalResource(
    id: string,
    context?: RequestContext,
  ): Promise<PhysicalResource> {
    const current = await this.getPhysicalResourceOrThrow(id, context);
    const terminated = await this.repository.upsertPhysicalResource({
      ...current,
      status: 'terminated',
      administrativeState: 'locked',
      operationalState: 'disabled',
      usageState: 'idle',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.syncMapFeature(terminated, context);
    await this.emit(
      'ResourceStateChangeEvent',
      terminated.id,
      'PhysicalResource',
      terminated,
      context,
      current,
    );
    return terminated;
  }

  public async getPhysicalResource(
    id: string,
    context?: RequestContext,
  ): Promise<PhysicalResource | undefined> {
    return await this.repository.getPhysicalResource(id, scopeOf(context));
  }

  /** Agregado de leitura do painel; a árvore Geo segue servindo apenas navegação. */
  public async getPhysicalResourceDetail(
    id: string,
    context?: RequestContext,
  ): Promise<PhysicalResourceDetail> {
    const detail = await this.repository.getPhysicalResourceDetail(id, scopeOf(context));
    if (!detail) {
      throw new AppError('physical resource not found', {
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
      });
    }
    return detail;
  }

  /** Projeção em lote da CTO: estados SID e ocupação derivada das conexões físicas das portas. */
  public async getResourcePortsView(
    ctoId: string,
    context?: RequestContext,
  ): Promise<ResourcePortsView> {
    const view = await this.repository.getResourcePortsView(ctoId, scopeOf(context));
    if (!view) {
      throw new AppError('CTO not found', { code: 'RESOURCE_CTO_NOT_FOUND', statusCode: 404 });
    }
    return view;
  }

  /** Detalhe físico especializado de uma porta, incluindo os drops conectados. */
  public async getResourcePortDetail(
    portId: string,
    context?: RequestContext,
  ): Promise<ResourcePortDetail> {
    const detail = await this.repository.getResourcePortDetail(portId, scopeOf(context));
    if (!detail) {
      throw new AppError('port not found', { code: 'RESOURCE_PORT_NOT_FOUND', statusCode: 404 });
    }
    return detail;
  }

  /** Histórico de mutações do recurso (issue #171), alimentado pelo audit/outbox existente. */
  public async listPhysicalResourceAudit(
    id: string,
    context?: RequestContext,
    limit = 200,
  ): Promise<ResourceAuditEntry[]> {
    await this.getPhysicalResourceOrThrow(id, context);
    return await this.repository.listResourceAudit(id, {
      ...scopeOf(context),
      limit: Math.min(Math.max(Math.trunc(limit), 1), 500),
    });
  }

  public async listPhysicalResources(
    query?: ResourceQuery,
    context?: RequestContext,
  ): Promise<PhysicalResource[]> {
    return await this.repository.listPhysicalResources({
      ...query,
      kind: 'PhysicalResource',
      tenantId: tenantOf(context),
    });
  }

  public async createLogicalResource(
    input: CreateLogicalResourceInput,
    context?: RequestContext,
  ): Promise<LogicalResource> {
    assertName(input.name);
    const spec = await this.getResourceSpecificationOrThrow(
      input.resourceSpecificationId,
      context,
    );
    const place = await this.resolvePlace(input.placeId, input.placeType);
    const supporting = input.supportingPhysicalResourceId
      ? await this.getPhysicalResourceOrThrow(input.supportingPhysicalResourceId, context)
      : undefined;
    const id = createCanonicalId();
    const resource: LogicalResource = {
      '@type': 'LogicalResource',
      id,
      href: buildHref('resource', id),
      name: input.name.trim(),
      resourceSpecificationId: spec.id,
      resourceSpecification: { id: spec.id, '@referredType': 'ResourceSpecification' },
      resourceType: spec.resourceType,
      status: input.status ?? 'active',
      administrativeState: input.administrativeState ?? 'unlocked',
      operationalState: input.operationalState ?? 'enabled',
      usageState: input.usageState ?? 'idle',
      relatedParty: await normalizeRelatedParties(
        input.relatedParty,
        this.dependencies.lookupParty,
      ),
      resourceRelationship: [],
      characteristic: input.characteristic ?? [],
      tenantId: tenantOf(context),
      ...(place ? { place } : {}),
      ...(supporting ? { supportingPhysicalResourceId: supporting.id } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
    };

    const stored = await this.repository.upsertLogicalResource(resource);
    for (const relationship of input.resourceRelationship ?? []) {
      await this.addResourceRelationship(stored.id, relationship, context);
    }
    const finalResource = await this.getLogicalResourceOrThrow(stored.id, context);
    await this.emit(
      'ResourceCreateEvent',
      finalResource.id,
      'LogicalResource',
      finalResource,
      context,
    );
    return finalResource;
  }

  public async updateLogicalResource(
    id: string,
    input: UpdateLogicalResourceInput,
    context?: RequestContext,
  ): Promise<LogicalResource> {
    const current = await this.getLogicalResourceOrThrow(id, context);
    if (input.name !== undefined) assertName(input.name);
    const specification =
      input.resourceSpecificationId !== undefined
        ? await this.getResourceSpecificationOrThrow(input.resourceSpecificationId, context)
        : undefined;
    // `place` some do objeto base (mesmo motivo do updatePhysicalResource): só assim
    // `placeId: null` (desvincular do local) consegue apagar um `current.place` existente
    // sob `exactOptionalPropertyTypes`.
    const { place: _currentPlace, ...currentWithoutPlace } = current;
    const place =
      input.placeId !== undefined
        ? await this.resolvePlace(input.placeId, input.placeType)
        : current.place;
    const supporting =
      input.supportingPhysicalResourceId !== undefined
        ? await this.getPhysicalResourceOrThrow(input.supportingPhysicalResourceId, context)
        : current.supportingPhysicalResourceId
          ? await this.getPhysicalResourceOrThrow(current.supportingPhysicalResourceId, context)
          : undefined;

    const updated = await this.repository.upsertLogicalResource({
      ...currentWithoutPlace,
      name: input.name !== undefined ? input.name.trim() : current.name,
      resourceSpecificationId: input.resourceSpecificationId ?? current.resourceSpecificationId,
      resourceSpecification: {
        id: input.resourceSpecificationId ?? current.resourceSpecificationId,
        '@referredType': 'ResourceSpecification',
      },
      resourceType: specification?.resourceType ?? current.resourceType,
      status: input.status ?? current.status,
      administrativeState: input.administrativeState ?? current.administrativeState,
      operationalState: input.operationalState ?? current.operationalState,
      usageState: input.usageState ?? current.usageState,
      relatedParty: input.relatedParty
        ? await normalizeRelatedParties(input.relatedParty, this.dependencies.lookupParty)
        : current.relatedParty,
      resourceRelationship: current.resourceRelationship,
      characteristic: input.characteristic ?? current.characteristic,
      ...(place ? { place } : {}),
      ...(supporting ? { supportingPhysicalResourceId: supporting.id } : {}),
      ...(input.validFor !== undefined ? { validFor: input.validFor } : {}),
    });

    await this.emit(
      current.status !== updated.status
        ? 'ResourceStateChangeEvent'
        : 'ResourceAttributeValueChangeEvent',
      updated.id,
      'LogicalResource',
      updated,
      context,
    );
    return updated;
  }

  public async deleteLogicalResource(
    id: string,
    context?: RequestContext,
  ): Promise<LogicalResource> {
    const current = await this.getLogicalResourceOrThrow(id, context);
    const terminated = await this.repository.upsertLogicalResource({
      ...current,
      status: 'terminated',
      administrativeState: 'locked',
      operationalState: 'disabled',
      usageState: 'idle',
      validFor: buildTimePeriod(current.validFor?.startDateTime, new Date().toISOString()),
    });
    await this.emit(
      'ResourceStateChangeEvent',
      terminated.id,
      'LogicalResource',
      terminated,
      context,
    );
    return terminated;
  }

  public async getLogicalResource(
    id: string,
    context?: RequestContext,
  ): Promise<LogicalResource | undefined> {
    return await this.repository.getLogicalResource(id, scopeOf(context));
  }

  public async listLogicalResources(
    query?: ResourceQuery,
    context?: RequestContext,
  ): Promise<LogicalResource[]> {
    return await this.repository.listLogicalResources({
      ...query,
      kind: 'LogicalResource',
      tenantId: tenantOf(context),
    });
  }

  public async getResource(id: string, context?: RequestContext): Promise<Resource | undefined> {
    return (
      (await this.repository.getPhysicalResource(id, scopeOf(context))) ??
      (await this.repository.getLogicalResource(id, scopeOf(context)))
    );
  }

  public async listResources(
    query?: ResourceQuery,
    context?: RequestContext,
  ): Promise<Resource[]> {
    const scopedQuery = { ...query, tenantId: tenantOf(context) };
    if (scopedQuery.kind === 'PhysicalResource') {
      return await this.repository.listPhysicalResources(scopedQuery);
    }

    if (scopedQuery.kind === 'LogicalResource') {
      return await this.repository.listLogicalResources(scopedQuery);
    }

    return await this.repository.listResources(scopedQuery);
  }

  public async countResources(query?: ResourceQuery, context?: RequestContext): Promise<number> {
    return await this.repository.countResources({ ...query, tenantId: tenantOf(context) });
  }

  public async addResourceRelationship(
    resourceId: string,
    input: ResourceRelationship,
    context?: RequestContext,
  ): Promise<ResourceRelationship> {
    assertName(input.relationshipType, 'relationshipType');
    const resource = await this.getResourceOrThrow(resourceId, context);
    const relatedResource = await this.getResourceOrThrow(input.id, context);
    if (input.relationshipType === 'connectedTo') {
      await this.assertSplitterOutputDropConnection(resource, relatedResource, input, context);
    }
    const relationship = await this.repository.upsertResourceRelationship(resourceId, input);
    const current = await this.getResourceOrThrow(resourceId, context);
    await this.emit(
      'ResourceRelationshipCreateEvent',
      resourceId,
      current['@type'],
      { resourceId, relationship },
      context,
    );
    return relationship;
  }

  private async assertSplitterOutputDropConnection(
    resource: Resource,
    relatedResource: Resource,
    input: ResourceRelationship,
    context?: RequestContext,
  ): Promise<void> {
    const port = resource.resourceType === 'Port' ? resource : relatedResource.resourceType === 'Port' ? relatedResource : undefined;
    const drop =
      resource.resourceType === 'DropCable'
        ? resource
        : relatedResource.resourceType === 'DropCable'
          ? relatedResource
          : undefined;
    if (!port || !drop || characteristicValue(port, 'role') !== 'FO.O' || !relationshipIsActive(input)) {
      return;
    }

    const existing = await this.repository.listIncidentResourceRelationships(port.id);
    for (const relationship of existing) {
      if (
        relationship.id === drop.id ||
        relationship.relationshipType !== 'connectedTo' ||
        !relationshipIsActive(relationship)
      ) {
        continue;
      }
      const connected = await this.getResource(relationship.id, context);
      if (connected?.resourceType === 'DropCable') {
        throw new AppError('splitter output port already has an active drop', {
          code: 'RESOURCE_PORT_DROP_OCCUPIED',
          statusCode: 409,
        });
      }
    }
  }

  public async removeResourceRelationship(
    resourceId: string,
    relatedResourceId: string,
    relationshipType: string,
    context?: RequestContext,
  ): Promise<boolean> {
    await this.getResourceOrThrow(resourceId, context);
    await this.getResourceOrThrow(relatedResourceId, context);
    const removed = await this.repository.deleteResourceRelationship(
      resourceId,
      relatedResourceId,
      relationshipType,
    );
    if (removed) {
      const current = await this.getResourceOrThrow(resourceId, context);
      await this.emit(
        'ResourceRelationshipDeleteEvent',
        resourceId,
        current['@type'],
        { resourceId, relatedResourceId, relationshipType },
        context,
      );
    }
    return removed;
  }

  public async listResourceRelationships(
    resourceId: string,
    context?: RequestContext,
  ): Promise<ResourceRelationship[]> {
    await this.getResourceOrThrow(resourceId, context);
    return await this.repository.listResourceRelationships(resourceId);
  }

  public async activateResource(
    input: ResourceFunctionActivationInput,
    context?: RequestContext,
  ): Promise<Resource> {
    const current = await this.getResourceOrThrow(input.resourceId, context);
    const status = activationToStatus(input.action);
    const resource =
      current['@type'] === 'PhysicalResource'
        ? await this.repository.upsertPhysicalResource({
            ...current,
            status,
            administrativeState: status === 'terminated' ? 'locked' : 'unlocked',
            operationalState: status === 'active' ? 'enabled' : 'disabled',
            usageState: status === 'active' ? 'busy' : 'idle',
          })
        : await this.repository.upsertLogicalResource({
            ...current,
            status,
            administrativeState: status === 'terminated' ? 'locked' : 'unlocked',
            operationalState: status === 'active' ? 'enabled' : 'disabled',
            usageState: status === 'active' ? 'busy' : 'idle',
          });

    await this.emit(
      'ResourceFunctionActivationEvent',
      resource.id,
      resource['@type'],
      { resourceId: resource.id, action: input.action ?? 'activate', reason: input.reason, resource },
      context,
    );
    return resource;
  }

  private async emit(
    eventType: string,
    entityId: string,
    entityType: string,
    payload: unknown,
    context?: RequestContext,
    before?: unknown,
  ): Promise<void> {
    const event = await this.eventService.appendEvent({
      eventType,
      source: `resource.${entityType}`,
      correlationId: entityId,
      eventData: {
        entityId,
        entityType,
        payload,
      },
    });

    if (this.dependencies.db && context) {
      await recordMutation(this.dependencies.db, context, {
        action: eventType.includes('Create') ? 'create' : 'update',
        entityType,
        entityId,
        ...(before !== undefined ? { before } : {}),
        after: payload,
        event,
        topic: 'tmf688.resource',
      });
    }
  }

  private async resolvePlace(
    placeId: string | null | undefined,
    placeType: string | undefined,
  ): Promise<{ id: string; '@referredType': string } | undefined> {
    if (!placeId) return undefined;
    const lookup = await this.dependencies.lookupPlace?.(placeId);
    if (!lookup) {
      throw new AppError('place not found', { code: 'RESOURCE_PLACE_NOT_FOUND', statusCode: 404 });
    }
    return {
      id: lookup.id,
      '@referredType': placeType ?? lookup['@referredType'] ?? 'GeographicLocation',
    };
  }

  private async syncMapFeature(
    resource: PhysicalResource,
    context?: RequestContext,
  ): Promise<void> {
    await this.dependencies.mapFeatureSynchronizer?.syncEntity(resource.id, tenantOf(context));
  }

  private async getResourceSpecificationOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceSpecification> {
    const spec = await this.repository.getResourceSpecification(id, scopeOf(context));
    if (!spec)
      throw new AppError('resource specification not found', {
        code: 'RESOURCE_SPEC_NOT_FOUND',
        statusCode: 404,
      });
    return spec;
  }

  private async getResourceCategoryOrThrow(code: string): Promise<ResourceCategory> {
    assertName(code, 'category');
    const category = await this.repository.getResourceCategory(code.trim());
    if (!category)
      throw new AppError('resource category not found', {
        code: 'RESOURCE_CATEGORY_NOT_FOUND',
        statusCode: 404,
      });
    if (category.status !== 'active') {
      throw new AppError('resource category is inactive', {
        code: 'RESOURCE_CATEGORY_INACTIVE',
        statusCode: 409,
      });
    }
    return category;
  }

  private async getResourceLayerOrThrow(
    id: string,
    context?: RequestContext,
    requireActive = true,
  ): Promise<ResourceLayer> {
    const layer = await this.repository.getResourceLayer(id.trim(), scopeOf(context));
    if (!layer) {
      throw new AppError('resource layer not found', {
        code: 'RESOURCE_LAYER_NOT_FOUND',
        statusCode: 404,
      });
    }
    if (requireActive && layer.status !== 'active') {
      throw new AppError('resource layer is inactive', {
        code: 'RESOURCE_LAYER_INACTIVE',
        statusCode: 409,
      });
    }
    return layer;
  }

  private async getResourceTypeOrThrow(code: string): Promise<ResourceType> {
    assertName(code, 'resourceType');
    const resourceType = await this.repository.getResourceType(code.trim());
    if (!resourceType)
      throw new AppError('resource type not found', {
        code: 'RESOURCE_TYPE_NOT_FOUND',
        statusCode: 404,
      });
    if (resourceType.status !== 'active') {
      throw new AppError('resource type is inactive', {
        code: 'RESOURCE_TYPE_INACTIVE',
        statusCode: 409,
      });
    }
    return resourceType;
  }

  private assertResourceTypeMatchesCategory(
    resourceType: ResourceType,
    category: ResourceCategory,
  ): void {
    if (resourceType.categoryCode !== category.code) {
      throw new AppError('resource type is not allowed for category', {
        code: 'RESOURCE_TYPE_CATEGORY_MISMATCH',
        statusCode: 409,
      });
    }
  }

  private async getResourceFunctionSpecificationOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<ResourceFunctionSpecification> {
    const spec = await this.repository.getResourceFunctionSpecification(id, scopeOf(context));
    if (!spec) {
      throw new AppError('resource function specification not found', {
        code: 'RESOURCE_FUNCTION_SPEC_NOT_FOUND',
        statusCode: 404,
      });
    }
    return spec;
  }

  private async getPhysicalResourceOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<PhysicalResource> {
    const resource = await this.repository.getPhysicalResource(id, scopeOf(context));
    if (!resource)
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }

  private async getLogicalResourceOrThrow(
    id: string,
    context?: RequestContext,
  ): Promise<LogicalResource> {
    const resource = await this.repository.getLogicalResource(id, scopeOf(context));
    if (!resource)
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }

  private async getResourceOrThrow(id: string, context?: RequestContext): Promise<Resource> {
    const resource = await this.getResource(id, context);
    if (!resource)
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    return resource;
  }
}

const assertName = (value: unknown, field = 'name'): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(`${field} is required`, {
      code: 'RESOURCE_REQUIRED_FIELD',
      statusCode: 400,
    });
  }
};

/**
 * Monta a árvore a partir de uma lista flat, O(n): agrupa por `parentNodeId`, depois monta
 * recursivamente a partir das raízes. Ordenação determinística (`sortOrder`, nome, id) já vem do
 * repositório — aqui só preserva a ordem recebida.
 */
const buildResourceCatalogTree = (flat: ResourceCatalogNode[]): ResourceCatalogTreeNode[] => {
  const childrenByParent = new Map<string | undefined, ResourceCatalogNode[]>();
  for (const node of flat) {
    const key = node.parentNodeId;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(node);
    childrenByParent.set(key, siblings);
  }
  const attach = (node: ResourceCatalogNode): ResourceCatalogTreeNode => ({
    ...node,
    children: (childrenByParent.get(node.id) ?? []).map(attach),
  });
  return (childrenByParent.get(undefined) ?? []).map(attach);
};

const buildTimePeriod = (
  startDateTime: string | undefined,
  endDateTime: string,
): { startDateTime?: string; endDateTime: string } => {
  const period: { startDateTime?: string; endDateTime: string } = { endDateTime };
  if (startDateTime) {
    period.startDateTime = startDateTime;
  }
  return period;
};

const assertCanonicalSpecificationCharacteristics = (
  characteristics: ResourceSpecification['resourceSpecificationCharacteristic'],
): ResourceSpecification['resourceSpecificationCharacteristic'] => {
  const forbidden = characteristics.find(
    (characteristic) => characteristic.name === 'manufacturer' || characteristic.name === 'networkType',
  );
  if (forbidden) {
    throw new AppError(`${forbidden.name} is not a ResourceSpecification characteristic`, {
      code: 'RESOURCE_SPEC_CHARACTERISTIC_FORBIDDEN',
      statusCode: 400,
    });
  }
  return characteristics;
};

const normalizeSpecificationRelatedParties = async (
  relatedParty: RelatedParty[] | undefined,
  lookupParty?: ResourceServiceDependencies['lookupParty'],
  lookupPartyRoles?: ResourceServiceDependencies['lookupPartyRoles'],
): Promise<RelatedParty[]> => {
  const parties = await normalizeRelatedParties(relatedParty, lookupParty);
  const manufacturers = parties.filter((party) => party.role === 'manufacturer');
  if (manufacturers.length > 1) {
    throw new AppError('only one manufacturer can be related to a resource specification', {
      code: 'RESOURCE_SPEC_MANUFACTURER_DUPLICATE',
      statusCode: 409,
    });
  }
  if (manufacturers.length === 1 && lookupPartyRoles) {
    const roles = await lookupPartyRoles(manufacturers[0]!.id);
    if (!roles.some((role) => role.name === 'manufacturer' && role.status === 'active')) {
      throw new AppError('manufacturer party must have an active manufacturer role', {
        code: 'RESOURCE_SPEC_MANUFACTURER_ROLE_INVALID',
        statusCode: 409,
      });
    }
  }
  return parties;
};

const normalizeRelatedParties = async (
  relatedParty: RelatedParty[] | undefined,
  lookupParty?: ResourceServiceDependencies['lookupParty'],
): Promise<RelatedParty[]> => {
  const parties = relatedParty ?? [];
  if (!lookupParty) return parties;

  return await Promise.all(
    parties.map(async (party) => {
      const found = await lookupParty(party.id);
      if (!found) {
        throw new AppError('related party not found', {
          code: 'RESOURCE_PARTY_NOT_FOUND',
          statusCode: 404,
        });
      }
      const ref: RelatedParty = {
        id: found.id,
        '@referredType': found['@referredType'],
      };
      if (found.href) ref.href = found.href;
      if (found.name) ref.name = found.name;
      if (party.role) ref.role = party.role;
      return ref;
    }),
  );
};

const characteristicValue = (resource: Resource, name: string): string | undefined => {
  const value = resource.characteristic.find((item) => item.name === name)?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const relationshipIsActive = (relationship: ResourceRelationship): boolean => {
  const end = relationship.validFor?.endDateTime;
  return !end || new Date(end).getTime() > Date.now();
};

const activationToStatus = (action: ResourceFunctionActivationInput['action']): ResourceStatus => {
  if (action === 'suspend') return 'suspended';
  if (action === 'terminate') return 'terminated';
  return 'active';
};
