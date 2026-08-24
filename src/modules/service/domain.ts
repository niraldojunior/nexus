import type {
  Characteristic,
  CharacteristicValue,
  EntityRef,
  RelatedParty,
  TimePeriod,
} from '../../shared/tmf/index.js';

export type ServiceKind = 'CustomerFacingService' | 'ResourceFacingService';
export type ServiceSpecificationType = 'CFS' | 'RFS' | 'Other';

// Definição de atributo de ServiceSpecification (TMF633 ServiceSpecCharacteristic) — descreve o
// atributo em si (nome, tipo, domínio de valores), não um valor instanciado. Diferente de
// `Characteristic`, usado em Service/ServiceCandidate para valores já atribuídos.
export type ServiceSpecCharacteristicValue = {
  value: CharacteristicValue;
  isDefault?: boolean;
};

export type ServiceSpecCharacteristic = {
  '@type'?: 'ServiceSpecCharacteristic';
  name: string;
  description?: string;
  valueType?: 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'json';
  required?: boolean;
  // Eixo V.tal: separa os dois blocos do catálogo Netwin (Especificações Negócio/Técnicas).
  group?: 'business' | 'technical';
  // Texto cru do "Domínio:" do catálogo de origem — fonte de verdade editável na UI.
  valueDomain?: string;
  // Derivado de valueDomain quando ele descreve um enum `{a, b, c}`.
  characteristicValueSpecification?: ServiceSpecCharacteristicValue[];
  // Tipo cru do catálogo de origem (`FK`, `string(32)`, `list<int>`…), preservado por fidelidade.
  sourceType?: string;
};

export type ServiceState =
  'feasibilityChecked' | 'designed' | 'reserved' | 'inactive' | 'active' | 'terminated';
export type ServiceStatus = 'active' | 'inactive' | 'suspended' | 'terminated';

export type ServiceQuery = {
  name?: string;
  state?: ServiceState;
  type?: ServiceKind;
  serviceSpecificationId?: string;
  serviceSpecificationIdIn?: string[];
  category?: string;
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
  includeEnded?: boolean;
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
  // Anotação livre sobre a especificação (ex.: nota de origem/migração do catálogo Netwin) —
  // campo comum, não characteristic (C1 não se aplica: mesma exceção de geo/domain.ts `note`).
  // `description` fica reservado para a descrição funcional do serviço.
  observation?: string | undefined;
  validFor?: TimePeriod | undefined;
  serviceSpecificationCharacteristic: ServiceSpecCharacteristic[];
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
  observation?: string;
  validFor?: TimePeriod;
  serviceSpecificationCharacteristic?: ServiceSpecCharacteristic[];
  relatedParty?: RelatedParty[];
};

export type UpdateServiceSpecificationInput = Partial<CreateServiceSpecificationInput>;

export type ServiceSpecificationBulkItem = {
  line: number;
  input: CreateServiceSpecificationInput;
};

export type ServiceSpecificationBulkItemResult =
  | { line: number; status: 'created'; id: string; name: string }
  | { line: number; status: 'error'; name: string; code: string; message: string };

export type ServiceSpecificationBulkResult = {
  total: number;
  created: number;
  failed: number;
  results: ServiceSpecificationBulkItemResult[];
};

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

export type CreateServiceInput =
  CreateCustomerFacingServiceInput | CreateResourceFacingServiceInput;

export type UpdateCustomerFacingServiceInput = Partial<
  Omit<CreateCustomerFacingServiceInput, '@type'>
>;
export type UpdateResourceFacingServiceInput = Partial<
  Omit<CreateResourceFacingServiceInput, '@type'>
>;
export type UpdateServiceInput =
  UpdateCustomerFacingServiceInput | UpdateResourceFacingServiceInput;
