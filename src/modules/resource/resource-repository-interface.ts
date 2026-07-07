import type {
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  CreateResourceFunctionSpecificationInput,
  CreateResourceSpecificationInput,
  LogicalResource,
  PhysicalResource,
  Resource,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceRelationship,
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

  upsertPhysicalResource(resource: PhysicalResource): PhysicalResource;
  getPhysicalResource(id: string): PhysicalResource | undefined;
  listPhysicalResources(query?: ResourceQuery): PhysicalResource[];

  upsertLogicalResource(resource: LogicalResource): LogicalResource;
  getLogicalResource(id: string): LogicalResource | undefined;
  listLogicalResources(query?: ResourceQuery): LogicalResource[];

  upsertResourceRelationship(resourceId: string, relationship: ResourceRelationship): ResourceRelationship;
  deleteResourceRelationship(resourceId: string, relatedResourceId: string, relationshipType: string): boolean;
  listResourceRelationships(resourceId: string): ResourceRelationship[];

  listResources(query?: ResourceQuery): Resource[];
}
