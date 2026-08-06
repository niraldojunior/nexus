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
  ResourceSpecification,
  ResourceSpecificationQuery,
} from './domain.js';

export interface IResourceRepository {
  transaction<T>(fn: () => Awaitable<T>): Awaitable<T>;

  upsertResourceSpecification(spec: ResourceSpecification): Awaitable<ResourceSpecification>;
  getResourceSpecification(id: string): Awaitable<ResourceSpecification | undefined>;
  listResourceSpecifications(
    query?: ResourceSpecificationQuery,
  ): Awaitable<ResourceSpecification[]>;

  upsertResourceFunctionSpecification(
    spec: ResourceFunctionSpecification,
  ): Awaitable<ResourceFunctionSpecification>;
  getResourceFunctionSpecification(
    id: string,
  ): Awaitable<ResourceFunctionSpecification | undefined>;
  listResourceFunctionSpecifications(
    query?: ResourceFunctionSpecificationQuery,
  ): Awaitable<ResourceFunctionSpecification[]>;

  getResourceCategory(code: string): Awaitable<ResourceCategory | undefined>;
  listResourceCategories(): Awaitable<ResourceCategory[]>;
  getResourceType(code: string): Awaitable<ResourceType | undefined>;
  listResourceTypes(): Awaitable<ResourceType[]>;

  upsertPhysicalResource(resource: PhysicalResource): Awaitable<PhysicalResource>;
  getPhysicalResource(id: string): Awaitable<PhysicalResource | undefined>;
  listPhysicalResources(query?: ResourceQuery): Awaitable<PhysicalResource[]>;
  countPhysicalResources(query?: ResourceQuery): Awaitable<number>;

  upsertLogicalResource(resource: LogicalResource): Awaitable<LogicalResource>;
  getLogicalResource(id: string): Awaitable<LogicalResource | undefined>;
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

  listResources(query?: ResourceQuery): Awaitable<Resource[]>;
  countResources(query?: ResourceQuery): Awaitable<number>;
}
