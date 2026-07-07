import type { Characteristic, EntityRef, RelatedParty, TimePeriod } from '../../shared/tmf/index.js';

export type ServiceKind = 'CustomerFacingService' | 'ResourceFacingService';
export type ServiceSpecificationType = 'CFS' | 'RFS' | 'Other';
export type ServiceState = 'feasibilityChecked' | 'designed' | 'reserved' | 'inactive' | 'active' | 'terminated';
export type ServiceStatus = 'active' | 'inactive' | 'suspended' | 'terminated';

export type ServiceQuery = {
  name?: string;
  state?: ServiceState;
  type?: ServiceKind;
  serviceSpecificationId?: string;
  subscriberId?: string;
  relatedPartyId?: string;
  placeId?: string;
  supportingResourceId?: string;
  supportingServiceId?: string;
  characteristicName?: string;
  characteristicValue?: string;
  limit?: number;
  offset?: number;
};

export type ServiceSpecificationQuery = {
  name?: string;
  category?: string;
  serviceType?: ServiceSpecificationType;
  limit?: number;
  offset?: number;
};

export type ServiceCategoryQuery = {
  name?: string;
  parentCategoryId?: string;
  limit?: number;
  offset?: number;
};

export type ServiceCandidateQuery = {
  name?: string;
  serviceSpecificationId?: string;
  serviceCategoryId?: string;
  status?: ServiceStatus;
  limit?: number;
  offset?: number;
};

export type ServiceReference = EntityRef & {
  role?: string;
};

export type ServiceRelationship = {
  id: string;
  relationshipType: string;
  '@referredType': string;
  validFor?: TimePeriod | undefined;
};

export type ServiceSpecification = {
  '@type': 'ServiceSpecification';
  id: string;
  href: string;
  name: string;
  category: string;
  serviceType: ServiceSpecificationType;
  description?: string | undefined;
  validFor?: TimePeriod | undefined;
  serviceSpecificationCharacteristic: Characteristic[];
  relatedParty: RelatedParty[];
};

export type ServiceCategory = {
  '@type': 'ServiceCategory';
  id: string;
  href: string;
  name: string;
  description?: string | undefined;
  parentServiceCategory?: EntityRef | undefined;
  validFor?: TimePeriod | undefined;
  serviceCategoryCharacteristic: Characteristic[];
};

export type ServiceCandidate = {
  '@type': 'ServiceCandidate';
  id: string;
  href: string;
  name: string;
  description?: string | undefined;
  status: ServiceStatus;
  serviceSpecification: EntityRef;
  serviceCategory?: EntityRef | undefined;
  validFor?: TimePeriod | undefined;
  serviceCandidateCharacteristic: Characteristic[];
};

export type ServiceBase = {
  id: string;
  href: string;
  name: string;
  serviceSpecificationId: string;
  serviceSpecification: EntityRef;
  serviceType?: string | undefined;
  category?: string | undefined;
  state: ServiceState;
  serviceDate?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  isServiceEnabled?: boolean | undefined;
  hasStarted?: boolean | undefined;
  serviceCharacteristic: Characteristic[];
  relatedParty: RelatedParty[];
  place: ServiceReference[];
  serviceRelationship: ServiceRelationship[];
  validFor?: TimePeriod | undefined;
};

export type CustomerFacingService = ServiceBase & {
  '@type': 'CustomerFacingService';
  subscriberId: string;
  supportingService: ServiceReference[];
};

export type ResourceFacingService = ServiceBase & {
  '@type': 'ResourceFacingService';
  supportingResource: ServiceReference[];
  supportingService: ServiceReference[];
};

export type Service = CustomerFacingService | ResourceFacingService;

export type CreateServiceSpecificationInput = {
  name: string;
  category: string;
  serviceType: ServiceSpecificationType;
  description?: string;
  validFor?: TimePeriod;
  serviceSpecificationCharacteristic?: Characteristic[];
  relatedParty?: RelatedParty[];
};

export type UpdateServiceSpecificationInput = Partial<CreateServiceSpecificationInput>;

export type CreateServiceCategoryInput = {
  name: string;
  description?: string;
  parentCategoryId?: string;
  validFor?: TimePeriod;
  serviceCategoryCharacteristic?: Characteristic[];
};

export type UpdateServiceCategoryInput = Partial<CreateServiceCategoryInput>;

export type CreateServiceCandidateInput = {
  name: string;
  serviceSpecificationId: string;
  serviceCategoryId?: string;
  status?: ServiceStatus;
  description?: string;
  validFor?: TimePeriod;
  serviceCandidateCharacteristic?: Characteristic[];
};

export type UpdateServiceCandidateInput = Partial<CreateServiceCandidateInput>;

export type ServiceBaseInput = {
  name: string;
  serviceSpecificationId: string;
  serviceType?: string;
  state?: ServiceState;
  category?: string;
  serviceDate?: string;
  startDate?: string;
  endDate?: string;
  isServiceEnabled?: boolean;
  hasStarted?: boolean;
  relatedParty?: RelatedParty[];
  place?: ServiceReference[];
  serviceRelationship?: ServiceRelationship[];
  serviceCharacteristic?: Characteristic[];
  validFor?: TimePeriod;
};

export type CreateCustomerFacingServiceInput = ServiceBaseInput & {
  '@type'?: 'CustomerFacingService';
  subscriberId: string;
  supportingService?: ServiceReference[];
};

export type CreateResourceFacingServiceInput = ServiceBaseInput & {
  '@type'?: 'ResourceFacingService';
  supportingResource: ServiceReference[];
  supportingService?: ServiceReference[];
};

export type CreateServiceInput = CreateCustomerFacingServiceInput | CreateResourceFacingServiceInput;

export type UpdateCustomerFacingServiceInput = Partial<Omit<CreateCustomerFacingServiceInput, '@type'>>;
export type UpdateResourceFacingServiceInput = Partial<Omit<CreateResourceFacingServiceInput, '@type'>>;
export type UpdateServiceInput = UpdateCustomerFacingServiceInput | UpdateResourceFacingServiceInput;
