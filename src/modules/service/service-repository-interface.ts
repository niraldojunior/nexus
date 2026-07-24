import type {
  CreateServiceCandidateInput,
  CreateServiceCategoryInput,
  CreateServiceSpecificationInput,
  CreateServiceInput,
  CustomerFacingService,
  ResourceFacingService,
  Service,
  ServiceCandidate,
  ServiceCandidateQuery,
  ServiceCategory,
  ServiceCategoryQuery,
  ServiceQuery,
  ServiceSpecification,
  ServiceSpecificationQuery,
  UpdateServiceCandidateInput,
  UpdateServiceCategoryInput,
  UpdateServiceInput,
  UpdateServiceSpecificationInput,
} from './domain.js';

export interface IServiceRepository {
  transaction<T>(fn: () => T): T;

  upsertServiceSpecification(spec: ServiceSpecification): ServiceSpecification;
  getServiceSpecification(id: string): ServiceSpecification | undefined;
  listServiceSpecifications(query?: ServiceSpecificationQuery): ServiceSpecification[];

  upsertServiceCategory(category: ServiceCategory): ServiceCategory;
  getServiceCategory(id: string): ServiceCategory | undefined;
  listServiceCategories(query?: ServiceCategoryQuery): ServiceCategory[];

  upsertServiceCandidate(candidate: ServiceCandidate): ServiceCandidate;
  getServiceCandidate(id: string): ServiceCandidate | undefined;
  listServiceCandidates(query?: ServiceCandidateQuery): ServiceCandidate[];

  upsertCustomerFacingService(service: CustomerFacingService): CustomerFacingService;
  getCustomerFacingService(id: string): CustomerFacingService | undefined;
  listCustomerFacingServices(query?: ServiceQuery): CustomerFacingService[];
  countCustomerFacingServices(query?: ServiceQuery): number;

  upsertResourceFacingService(service: ResourceFacingService): ResourceFacingService;
  getResourceFacingService(id: string): ResourceFacingService | undefined;
  listResourceFacingServices(query?: ServiceQuery): ResourceFacingService[];
  countResourceFacingServices(query?: ServiceQuery): number;

  listServices(query?: ServiceQuery): Service[];
  countServices(query?: ServiceQuery): number;
}

