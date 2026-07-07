import type { Characteristic, RelatedParty, TimePeriod } from '../../shared/tmf/index.js';

export type ResourceKind = 'PhysicalResource' | 'LogicalResource';
export type ResourceStatus = 'active' | 'inactive' | 'suspended' | 'terminated';
export type AdministrativeState = 'unlocked' | 'locked';
export type OperationalState = 'enabled' | 'disabled';
export type UsageState = 'idle' | 'busy' | 'unknown';

export type ResourceQuery = {
  name?: string;
  status?: ResourceStatus;
  resourceSpecificationId?: string;
  placeId?: string;
  relatedPartyId?: string;
  kind?: ResourceKind;
  limit?: number;
  offset?: number;
};

export type ResourceSpecificationQuery = {
  name?: string;
  category?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
};

export type ResourceFunctionSpecificationQuery = {
  name?: string;
  limit?: number;
  offset?: number;
};

export type ResourceRelationship = {
  id: string;
  relationshipType: string;
  '@referredType': 'Resource';
  validFor?: TimePeriod;
};

export type ResourceSpecification = {
  '@type': 'ResourceSpecification';
  id: string;
  href: string;
  name: string;
  category: string;
  resourceType: string;
  description?: string;
  validFor?: TimePeriod;
  resourceSpecificationCharacteristic: Characteristic[];
  relatedParty: RelatedParty[];
};

export type ResourceFunctionSpecification = {
  '@type': 'ResourceFunctionSpecification';
  id: string;
  href: string;
  name: string;
  description?: string;
  validFor?: TimePeriod;
  resourceFunctionSpecificationCharacteristic: Characteristic[];
};

export type ResourceBase = {
  id: string;
  href: string;
  name: string;
  resourceSpecificationId: string;
  resourceSpecification: { id: string; '@referredType': 'ResourceSpecification' };
  status: ResourceStatus;
  administrativeState: AdministrativeState;
  operationalState: OperationalState;
  usageState: UsageState;
  place?: { id: string; '@referredType': string };
  relatedParty: RelatedParty[];
  resourceRelationship: ResourceRelationship[];
  validFor?: TimePeriod;
  characteristic: Characteristic[];
};

export type PhysicalResource = ResourceBase & {
  '@type': 'PhysicalResource';
  resourceType: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  partNumber?: string;
};

export type LogicalResource = ResourceBase & {
  '@type': 'LogicalResource';
  resourceType: string;
  supportingPhysicalResourceId?: string;
};

export type Resource = PhysicalResource | LogicalResource;

export type CreateResourceSpecificationInput = {
  name: string;
  category: string;
  resourceType: string;
  description?: string;
  validFor?: TimePeriod;
  resourceSpecificationCharacteristic?: Characteristic[];
  relatedParty?: RelatedParty[];
};

export type UpdateResourceSpecificationInput = Partial<CreateResourceSpecificationInput>;

export type CreateResourceFunctionSpecificationInput = {
  name: string;
  description?: string;
  validFor?: TimePeriod;
  resourceFunctionSpecificationCharacteristic?: Characteristic[];
};

export type UpdateResourceFunctionSpecificationInput = Partial<CreateResourceFunctionSpecificationInput>;

export type CreatePhysicalResourceInput = {
  name: string;
  resourceSpecificationId: string;
  placeId?: string;
  placeType?: string;
  status?: ResourceStatus;
  administrativeState?: AdministrativeState;
  operationalState?: OperationalState;
  usageState?: UsageState;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  partNumber?: string;
  relatedParty?: RelatedParty[];
  resourceRelationship?: ResourceRelationship[];
  characteristic?: Characteristic[];
  validFor?: TimePeriod;
};

export type UpdatePhysicalResourceInput = Partial<CreatePhysicalResourceInput>;

export type CreateLogicalResourceInput = {
  name: string;
  resourceSpecificationId: string;
  placeId?: string;
  placeType?: string;
  supportingPhysicalResourceId?: string;
  status?: ResourceStatus;
  administrativeState?: AdministrativeState;
  operationalState?: OperationalState;
  usageState?: UsageState;
  relatedParty?: RelatedParty[];
  resourceRelationship?: ResourceRelationship[];
  characteristic?: Characteristic[];
  validFor?: TimePeriod;
};

export type UpdateLogicalResourceInput = Partial<CreateLogicalResourceInput>;

export type ResourceFunctionActivationInput = {
  resourceId: string;
  action?: 'activate' | 'suspend' | 'terminate';
  reason?: string;
};
