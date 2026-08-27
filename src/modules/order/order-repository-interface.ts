type Awaitable<T> = T | Promise<T>;

import type {
  ServiceOrder,
  ServiceOrderQuery,
  ServiceQualification,
  ServiceQualificationQuery,
  ResourceOrder,
  ResourceOrderQuery,
} from './domain.js';

export type OrderTenantScope = { tenantId?: string };

export interface IOrderRepository {
  transaction<T>(fn: () => Awaitable<T>): Awaitable<T>;

  upsertServiceQualification(qualification: ServiceQualification): Awaitable<ServiceQualification>;
  getServiceQualification(
    id: string,
    scope?: OrderTenantScope,
  ): Awaitable<ServiceQualification | undefined>;
  listServiceQualifications(query?: ServiceQualificationQuery): Awaitable<ServiceQualification[]>;

  upsertServiceOrder(order: ServiceOrder): Awaitable<ServiceOrder>;
  getServiceOrder(id: string, scope?: OrderTenantScope): Awaitable<ServiceOrder | undefined>;
  listServiceOrders(query?: ServiceOrderQuery): Awaitable<ServiceOrder[]>;

  upsertResourceOrder(order: ResourceOrder): Awaitable<ResourceOrder>;
  getResourceOrder(id: string, scope?: OrderTenantScope): Awaitable<ResourceOrder | undefined>;
  listResourceOrders(query?: ResourceOrderQuery): Awaitable<ResourceOrder[]>;
}
