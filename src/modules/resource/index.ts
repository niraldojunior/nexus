export type {
  AdministrativeState,
  CreateLogicalResourceInput,
  CreatePhysicalResourceInput,
  CreateResourceFunctionSpecificationInput,
  CreateResourceSpecificationInput,
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
  ResourceCatalog,
  ResourceCatalogNode,
  ResourceCatalogNodeKind,
  ResourceCatalogPath,
  ResourceCatalogPathEntry,
  ResourceCatalogQuery,
  ResourceCatalogTreeNode,
  ResourceTypeCatalogContext,
  ResourceTypeRef,
  CreateResourceCatalogInput,
  UpdateResourceCatalogInput,
  CreateResourceCatalogNodeInput,
  UpdateResourceCatalogNodeInput,
  MoveResourceCatalogNodeInput,
  ResourceType,
  ResourceSpecification,
  ResourceSpecificationBulkItem,
  ResourceSpecificationBulkItemResult,
  ResourceSpecificationBulkResult,
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
export { OracleResourceRepository } from './oracle-repository.js';
export { ResourceService } from './service.js';
export type {
  InternalPlantLocationChildrenPage,
  InternalPlantLocationNode,
  InternalPlantLocationNodeKind,
  InternalPlantLocationRootNode,
  InternalPlantResourcePage,
  InternalPlantResourceQuery,
  InternalPlantResourceRow,
} from './internal-plant-domain.js';
export type { IInternalPlantRepository } from './internal-plant-repository-interface.js';
export { OracleInternalPlantRepository } from './internal-plant-oracle-repository.js';
export { InternalPlantService } from './internal-plant-service.js';
