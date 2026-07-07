import type { Characteristic, EntityRef, RelatedParty, TimePeriod } from '../../shared/tmf/index.js';
import type { CreateServiceInput, Service, UpdateServiceInput } from '../service/index.js';
import type { Resource } from '../resource/index.js';

export type ServiceQualificationState = 'done' | 'terminated';
export type ServiceQualificationResultState = 'qualified' | 'unqualified';
export type ServiceOrderState = 'acknowledged' | 'inProgress' | 'completed' | 'failed' | 'cancelled';
export type ServiceOrderAction = 'add' | 'modify' | 'delete';
export type ResourceOrderState = 'acknowledged' | 'inProgress' | 'completed' | 'failed' | 'cancelled';
export type ResourceOrderAction = 'add' | 'modify' | 'delete';
export type ResourceOrderPayload = {
  '@type': 'PhysicalResource' | 'LogicalResource';
  [key: string]: unknown;
};

export type ServiceQualificationQuery = {
  state?: ServiceQualificationState;
  placeId?: string;
  serviceSpecificationId?: string;
  limit?: number;
  offset?: number;
};

export type ServiceOrderQuery = {
  state?: ServiceOrderState;
  relatedPartyId?: string;
  limit?: number;
  offset?: number;
};

export type ResourceOrderQuery = {
  state?: ResourceOrderState;
  relatedPartyId?: string;
  resourceId?: string;
  limit?: number;
  offset?: number;
};

export type ServiceQualificationItem = {
  id: string;
  serviceSpecification?: EntityRef | undefined;
  serviceType?: string | undefined;
  eligibility: ServiceQualificationResultState;
  reason?: string | undefined;
};

export type ServiceQualification = {
  '@type': 'ServiceQualification';
  id: string;
  href: string;
  state: ServiceQualificationState;
  serviceQualificationItem: ServiceQualificationItem[];
  place: EntityRef[];
  relatedParty: RelatedParty[];
  serviceCharacteristic: Characteristic[];
  validFor?: TimePeriod | undefined;
};

export type CreateServiceQualificationInput = {
  placeId?: string;
  placeType?: string;
  serviceSpecificationId?: string;
  serviceType?: string;
  relatedParty?: RelatedParty[];
  serviceCharacteristic?: Characteristic[];
  validFor?: TimePeriod;
};

export type UpdateServiceQualificationInput = Partial<CreateServiceQualificationInput> & {
  state?: ServiceQualificationState;
};

export type ServiceOrderItem = {
  id: string;
  action: ServiceOrderAction;
  service?: CreateServiceInput | UpdateServiceInput | undefined;
  serviceId?: string | undefined;
  serviceResult?: Service | undefined;
  note?: string | undefined;
};

export type ServiceOrder = {
  '@type': 'ServiceOrder';
  id: string;
  href: string;
  state: ServiceOrderState;
  description?: string | undefined;
  relatedParty: RelatedParty[];
  serviceOrderItem: ServiceOrderItem[];
  note: string[];
  validFor?: TimePeriod | undefined;
};

export type ResourceOrderItem = {
  id: string;
  action: ResourceOrderAction;
  resource?: ResourceOrderPayload | undefined;
  resourceId?: string | undefined;
  resourceResult?: Resource | undefined;
  note?: string | undefined;
};

export type ResourceOrder = {
  '@type': 'ResourceOrder';
  id: string;
  href: string;
  state: ResourceOrderState;
  description?: string | undefined;
  relatedParty: RelatedParty[];
  resourceOrderItem: ResourceOrderItem[];
  note: string[];
  validFor?: TimePeriod | undefined;
};

export type CreateServiceOrderInput = {
  description?: string;
  relatedParty?: RelatedParty[];
  serviceOrderItem: Array<{
    action: ServiceOrderAction;
    service?: CreateServiceInput | UpdateServiceInput;
    serviceId?: string;
    note?: string;
  }>;
  state?: ServiceOrderState;
  autoComplete?: boolean;
  validFor?: TimePeriod;
};

export type UpdateServiceOrderInput = Partial<CreateServiceOrderInput> & {
  state?: ServiceOrderState;
};

export type CreateResourceOrderInput = {
  description?: string;
  relatedParty?: RelatedParty[];
  resourceOrderItem: Array<{
    action: ResourceOrderAction;
    resource?: ResourceOrderPayload;
    resourceId?: string;
    note?: string;
  }>;
  state?: ResourceOrderState;
  autoComplete?: boolean;
  validFor?: TimePeriod;
};

export type UpdateResourceOrderInput = Partial<CreateResourceOrderInput> & {
  state?: ResourceOrderState;
};
