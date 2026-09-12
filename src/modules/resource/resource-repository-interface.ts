type Awaitable<T> = T | Promise<T>;

import type {
  LogicalResource,
  PhysicalResource,
  Resource,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceRelationship,
  ResourceType,
  ResourceSpecification,
  ResourceSpecificationQuery,
  PhysicalResourceDetail,
  ResourceAuditEntry,
  ResourceStatusCatalogEntry,
  ResourcePortDetail,
  ResourcePortsView,
  ResourceCatalog,
  ResourceCatalogNode,
  ResourceCatalogQuery,
  ResourceRelationshipType,
  ResourceTypeRelationshipRule,
} from './domain.js';
// Escopo de tenant para leitura por id — as mesmas entidades cujo `list*` já aceita `tenantId`
// na query.
export type ResourceTenantScope = { tenantId?: string };

export interface IResourceRepository {
  transaction<T>(fn: () => Awaitable<T>): Awaitable<T>;

  upsertResourceSpecification(spec: ResourceSpecification): Awaitable<ResourceSpecification>;
  getResourceSpecification(
    id: string,
    scope?: ResourceTenantScope,
  ): Awaitable<ResourceSpecification | undefined>;
  listResourceSpecifications(
    query?: ResourceSpecificationQuery,
  ): Awaitable<ResourceSpecification[]>;

  upsertResourceFunctionSpecification(
    spec: ResourceFunctionSpecification,
  ): Awaitable<ResourceFunctionSpecification>;
  getResourceFunctionSpecification(
    id: string,
    scope?: ResourceTenantScope,
  ): Awaitable<ResourceFunctionSpecification | undefined>;
  listResourceFunctionSpecifications(
    query?: ResourceFunctionSpecificationQuery,
  ): Awaitable<ResourceFunctionSpecification[]>;

  // Cada ResourceType pertence a exatamente uma folha RESOURCE_TYPE ativa no mesmo tenant.
  listResourceTypes(scope?: ResourceTenantScope): Awaitable<ResourceType[]>;
  getResourceType(id: string, scope?: ResourceTenantScope): Awaitable<ResourceType | undefined>;
  getResourceTypeByCode(
    code: string,
    scope?: ResourceTenantScope,
  ): Awaitable<ResourceType | undefined>;
  upsertResourceType(resourceType: ResourceType): Awaitable<ResourceType>;

  listResourceRelationshipTypes(scope?: ResourceTenantScope): Awaitable<ResourceRelationshipType[]>;
  getResourceRelationshipType(
    code: string,
    scope?: ResourceTenantScope,
  ): Awaitable<ResourceRelationshipType | undefined>;
  upsertResourceRelationshipType(
    relationshipType: ResourceRelationshipType,
  ): Awaitable<ResourceRelationshipType>;

  listResourceTypeRelationshipRules(
    sourceResourceTypeId: string,
    scope?: ResourceTenantScope & { includeRetired?: boolean },
  ): Awaitable<ResourceTypeRelationshipRule[]>;
  /** Carrega as regras de várias folhas em lote para snapshots/reconciliações do Studio. */
  listResourceTypeRelationshipRulesBySourceIds(
    sourceResourceTypeIds: string[],
    scope?: ResourceTenantScope & { includeRetired?: boolean },
  ): Awaitable<ResourceTypeRelationshipRule[]>;
  getResourceTypeRelationshipRule(
    id: string,
    scope?: ResourceTenantScope,
  ): Awaitable<ResourceTypeRelationshipRule | undefined>;
  upsertResourceTypeRelationshipRule(
    rule: ResourceTypeRelationshipRule,
  ): Awaitable<ResourceTypeRelationshipRule>;

  // Árvore dinâmica de catálogo (issue #188), sempre tenant-scoped.
  upsertResourceCatalog(catalog: ResourceCatalog): Awaitable<ResourceCatalog>;
  getResourceCatalog(id: string, scope: ResourceTenantScope): Awaitable<ResourceCatalog | undefined>;
  getResourceCatalogByCode(
    code: string,
    scope: ResourceTenantScope,
  ): Awaitable<ResourceCatalog | undefined>;
  getDefaultResourceCatalog(scope: ResourceTenantScope): Awaitable<ResourceCatalog | undefined>;
  listResourceCatalogs(
    query: ResourceCatalogQuery & ResourceTenantScope,
  ): Awaitable<ResourceCatalog[]>;

  upsertResourceCatalogNode(node: ResourceCatalogNode): Awaitable<ResourceCatalogNode>;
  getResourceCatalogNode(
    id: string,
    scope: ResourceTenantScope,
  ): Awaitable<ResourceCatalogNode | undefined>;
  getResourceCatalogNodeByCode(
    catalogId: string,
    code: string,
    scope: ResourceTenantScope,
  ): Awaitable<ResourceCatalogNode | undefined>;
  /** Lista flat (sem árvore montada) de todos os nós de um catálogo, com ResourceType expandido via JOIN. */
  listResourceCatalogNodes(
    catalogId: string,
    scope: ResourceTenantScope & { includeInactive?: boolean },
  ): Awaitable<ResourceCatalogNode[]>;
  /** Nós (de qualquer catálogo do tenant) que referenciam este ResourceType — usado por delete/context. */
  listResourceCatalogNodesByResourceType(
    resourceTypeId: string,
    scope: ResourceTenantScope,
  ): Awaitable<ResourceCatalogNode[]>;
  /** Conta filhos diretos (qualquer status) — bloqueia soft-delete de GROUP não-vazio. */
  countResourceCatalogNodeChildren(
    nodeId: string,
    scope: ResourceTenantScope,
  ): Awaitable<number>;

  // Catálogo de estados granulares (issue #171). Diferente de Category/Type, é por tenant:
  // o operador pode acrescentar estado próprio via API (C9).
  listResourceStatusCatalog(query?: {
    resourceTypeId?: string;
    tenantId?: string;
  }): Awaitable<ResourceStatusCatalogEntry[]>;
  getResourceStatusCatalogEntry(
    code: string,
    tenantId?: string,
  ): Awaitable<ResourceStatusCatalogEntry | undefined>;

  // Histórico do recurso — leitura de tmf_audit_log, sem tabela própria (issue #171).
  listResourceAudit(
    resourceId: string,
    scope?: ResourceTenantScope & { limit?: number },
  ): Awaitable<ResourceAuditEntry[]>;
  getPhysicalResourceDetail(
    resourceId: string,
    scope?: ResourceTenantScope,
  ): Awaitable<PhysicalResourceDetail | undefined>;
  getResourcePortsView(
    ctoId: string,
    scope?: ResourceTenantScope,
  ): Awaitable<ResourcePortsView | undefined>;
  getResourcePortDetail(
    portId: string,
    scope?: ResourceTenantScope,
  ): Awaitable<ResourcePortDetail | undefined>;

  upsertPhysicalResource(resource: PhysicalResource): Awaitable<PhysicalResource>;
  getPhysicalResource(
    id: string,
    scope?: ResourceTenantScope,
  ): Awaitable<PhysicalResource | undefined>;
  listPhysicalResources(query?: ResourceQuery): Awaitable<PhysicalResource[]>;
  countPhysicalResources(query?: ResourceQuery): Awaitable<number>;

  upsertLogicalResource(resource: LogicalResource): Awaitable<LogicalResource>;
  getLogicalResource(
    id: string,
    scope?: ResourceTenantScope,
  ): Awaitable<LogicalResource | undefined>;
  listLogicalResources(query?: ResourceQuery): Awaitable<LogicalResource[]>;
  countLogicalResources(query?: ResourceQuery): Awaitable<number>;

  upsertResourceRelationship(
    resourceId: string,
    relationship: ResourceRelationship,
  ): Awaitable<ResourceRelationship>;
  deleteResourceRelationship(
    resourceId: string,
    relatedResourceId: string,
    relationshipType: string,
  ): Awaitable<boolean>;
  listResourceRelationships(resourceId: string): Awaitable<ResourceRelationship[]>;
  /** Relações incidentes nos dois sentidos, necessárias para relações físicas simétricas. */
  listIncidentResourceRelationships(resourceId: string): Awaitable<ResourceRelationship[]>;

  listResources(query?: ResourceQuery): Awaitable<Resource[]>;
  countResources(query?: ResourceQuery): Awaitable<number>;
}
