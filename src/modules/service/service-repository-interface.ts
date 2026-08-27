type Awaitable<T> = T | Promise<T>;

import type {
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
} from './domain.js';

export type ServiceTenantScope = { tenantId?: string };

export interface IServiceRepository {
  transaction<T>(fn: () => Awaitable<T>): Awaitable<T>;

  upsertServiceSpecification(spec: ServiceSpecification): Awaitable<ServiceSpecification>;
  getServiceSpecification(
    id: string,
    scope?: ServiceTenantScope,
  ): Awaitable<ServiceSpecification | undefined>;
  listServiceSpecifications(query?: ServiceSpecificationQuery): Awaitable<ServiceSpecification[]>;

  upsertServiceCategory(category: ServiceCategory): Awaitable<ServiceCategory>;
  getServiceCategory(
    id: string,
    scope?: ServiceTenantScope,
  ): Awaitable<ServiceCategory | undefined>;
  listServiceCategories(query?: ServiceCategoryQuery): Awaitable<ServiceCategory[]>;

  upsertServiceCandidate(candidate: ServiceCandidate): Awaitable<ServiceCandidate>;
  getServiceCandidate(
    id: string,
    scope?: ServiceTenantScope,
  ): Awaitable<ServiceCandidate | undefined>;
  listServiceCandidates(query?: ServiceCandidateQuery): Awaitable<ServiceCandidate[]>;

  upsertCustomerFacingService(service: CustomerFacingService): Awaitable<CustomerFacingService>;
  getCustomerFacingService(
    id: string,
    scope?: ServiceTenantScope,
  ): Awaitable<CustomerFacingService | undefined>;
  listCustomerFacingServices(query?: ServiceQuery): Awaitable<CustomerFacingService[]>;
  countCustomerFacingServices(query?: ServiceQuery): Awaitable<number>;

  upsertResourceFacingService(service: ResourceFacingService): Awaitable<ResourceFacingService>;
  getResourceFacingService(
    id: string,
    scope?: ServiceTenantScope,
  ): Awaitable<ResourceFacingService | undefined>;
  listResourceFacingServices(query?: ServiceQuery): Awaitable<ResourceFacingService[]>;
  countResourceFacingServices(query?: ServiceQuery): Awaitable<number>;

  listServices(query?: ServiceQuery): Awaitable<Service[]>;
  countServices(query?: ServiceQuery): Awaitable<number>;
}
