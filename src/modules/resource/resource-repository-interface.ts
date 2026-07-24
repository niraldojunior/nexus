import type {
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  CreateResourceFunctionSpecificationInput,
  CreateResourceSpecificationInput,
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
  UpdateLogicalResourceInput,
  UpdatePhysicalResourceInput,
  UpdateResourceFunctionSpecificationInput,
  UpdateResourceSpecificationInput,
} from './domain.js';

export interface IResourceRepository {
  transaction<T>(fn: () => T): T;

  upsertResourceSpecification(spec: ResourceSpecification): ResourceSpecification;
  getResourceSpecification(id: string): ResourceSpecification | undefined;
  listResourceSpecifications(query?: ResourceSpecificationQuery): ResourceSpecification[];

  upsertResourceFunctionSpecification(spec: ResourceFunctionSpecification): ResourceFunctionSpecification;
  getResourceFunctionSpecification(id: string): ResourceFunctionSpecification | undefined;
  listResourceFunctionSpecifications(query?: ResourceFunctionSpecificationQuery): ResourceFunctionSpecification[];

  getResourceCategory(code: string): ResourceCategory | undefined;
  listResourceCategories(): ResourceCategory[];
  getResourceType(code: string): ResourceType | undefined;
  listResourceTypes(): ResourceType[];

  upsertPhysicalResource(resource: PhysicalResource): PhysicalResource;
  getPhysicalResource(id: string): PhysicalResource | undefined;
  listPhysicalResources(query?: ResourceQuery): PhysicalResource[];
  countPhysicalResources(query?: ResourceQuery): number;

  upsertLogicalResource(resource: LogicalResource): LogicalResource;
  getLogicalResource(id: string): LogicalResource | undefined;
  listLogicalResources(query?: ResourceQuery): LogicalResource[];
  countLogicalResources(query?: ResourceQuery): number;

  upsertResourceRelationship(resourceId: string, relationship: ResourceRelationship): ResourceRelationship;
  deleteResourceRelationship(resourceId: string, relatedResourceId: string, relationshipType: string): boolean;
  listResourceRelationships(resourceId: string): ResourceRelationship[];

  listResources(query?: ResourceQuery): Resource[];
  countResources(query?: ResourceQuery): number;
}
