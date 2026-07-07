export type {
  CreateServiceCandidateInput,
  CreateServiceCategoryInput,
  CreateServiceInput,
  CreateServiceSpecificationInput,
  CustomerFacingService,
  ResourceFacingService,
  Service,
  ServiceCandidate,
  ServiceCandidateQuery,
  ServiceCategory,
  ServiceCategoryQuery,
  ServiceKind,
  ServiceQuery,
  ServiceReference,
  ServiceRelationship,
  ServiceSpecification,
  ServiceSpecificationQuery,
  ServiceSpecificationType,
  ServiceState,
  UpdateServiceCandidateInput,
  UpdateServiceCategoryInput,
  UpdateServiceInput,
  UpdateServiceSpecificationInput,
} from './domain.js';
export type { IServiceRepository } from './service-repository-interface.js';
export { SqliteServiceRepository } from './sqlite-repository.js';
export { ServiceService } from './service.js';
