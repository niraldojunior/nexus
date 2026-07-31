import type {
  ServiceOrder,
  ServiceOrderQuery,
  ServiceQualification,
  ServiceQualificationQuery,
  ResourceOrder,
  ResourceOrderQuery,
} from './domain.js';

export interface IOrderRepository {
  transaction<T>(fn: () => T): T;

  upsertServiceQualification(qualification: ServiceQualification): ServiceQualification;
  getServiceQualification(id: string): ServiceQualification | undefined;
  listServiceQualifications(query?: ServiceQualificationQuery): ServiceQualification[];

  upsertServiceOrder(order: ServiceOrder): ServiceOrder;
  getServiceOrder(id: string): ServiceOrder | undefined;
  listServiceOrders(query?: ServiceOrderQuery): ServiceOrder[];

  upsertResourceOrder(order: ResourceOrder): ResourceOrder;
  getResourceOrder(id: string): ResourceOrder | undefined;
  listResourceOrders(query?: ResourceOrderQuery): ResourceOrder[];
}
