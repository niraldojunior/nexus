type Awaitable<T> = T | Promise<T>;

import type {
  LogicalResource,
  PhysicalResource,
  ResourceCategory,
  Resource,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceRelationship,
  ResourceType,
  ResourceLayer,
  ResourceSpecification,
  ResourceSpecificationQuery,
  PhysicalResourceDetail,
  ResourceAuditEntry,
  ResourceStatusCatalogEntry,
  ResourcePortDetail,
  ResourcePortsView,
} from './domain.js';

// Escopo de tenant para leitura por id — as mesmas entidades cujo `list*` já aceita `tenantId`
// na query. Category/Type ficam de fora (ver nota em postgres-repository.ts): são vocabulário
// fixo com `code` globalmente único, semeado por catálogo estático, não por usuário/tenant.
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

  getResourceCategory(code: string): Awaitable<ResourceCategory | undefined>;
  listResourceCategories(): Awaitable<ResourceCategory[]>;
  getResourceType(code: string): Awaitable<ResourceType | undefined>;
  listResourceTypes(): Awaitable<ResourceType[]>;
  upsertResourceLayer(layer: ResourceLayer): Awaitable<ResourceLayer>;
  getResourceLayer(id: string, scope?: ResourceTenantScope): Awaitable<ResourceLayer | undefined>;
  listResourceLayers(scope?: ResourceTenantScope): Awaitable<ResourceLayer[]>;

  // Catálogo de estados granulares (issue #171). Diferente de Category/Type, é por tenant:
  // o operador pode acrescentar estado próprio via API (C9).
  listResourceStatusCatalog(query?: {
    resourceType?: string;
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
