export type {
  AdministrativeState,
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  CreateResourceFunctionSpecificationInput,
  CreateResourceSpecificationInput,
  ResourceCategory,
  LogicalResource,
  OperationalState,
  PhysicalResource,
  Resource,
  ResourceFunctionActivationInput,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceKind,
  ResourceQuery,
  ResourceRelationship,
  ResourceCatalogQuery,
  ResourceType,
  ResourceSpecification,
  ResourceSpecificationQuery,
  ResourceStatus,
  UpdateLogicalResourceInput,
  UpdatePhysicalResourceInput,
  UpdateResourceFunctionSpecificationInput,
  UpdateResourceSpecificationInput,
  UsageState,
} from './domain.js';
export type { IResourceRepository } from './resource-repository-interface.js';
export { ResourceRepository } from './repository.js';
export { SqliteResourceRepository } from './sqlite-repository.js';
export { ResourceService } from './service.js';
