import type { Characteristic, RelatedParty, TimePeriod } from '../../shared/tmf/index.js';

export type ResourceKind = 'PhysicalResource' | 'LogicalResource';
export type ResourceStatus = 'active' | 'inactive' | 'suspended' | 'terminated';
// Eixos de estado do SID/X.731 (REQ-MOD02-006). `shuttingDown` é o estado de transição exigido
// para bloquear um recurso que ainda está em uso (RN-002: não se salta de unlocked para locked
// com usageState != idle); `active` é o uso parcial entre idle e busy. Ambos faltavam no código
// e constam do HLD — ver docs/2-functional-specs/02-module-resource.md.
export type AdministrativeState = 'unlocked' | 'locked' | 'shuttingDown';
export type OperationalState = 'enabled' | 'disabled';
export type UsageState = 'idle' | 'active' | 'busy' | 'unknown';

export type ResourceCatalogStatus = 'active' | 'inactive';

export type ResourceCategory = {
  '@type': 'ResourceCategory';
  id: string;
  href: string;
  code: string;
  name: string;
  parentCategoryCode?: string;
  description?: string;
  status: ResourceCatalogStatus;
  tenantId?: string;
};

export type ResourceType = {
  '@type': 'ResourceType';
  id: string;
  href: string;
  code: string;
  name: string;
  categoryCode: string;
  description?: string;
  status: ResourceCatalogStatus;
  tenantId?: string;
};

/**
 * Comportamento canônico de um estado de catálogo: para qual eixo SID (`ResourceStatus`) ele
 * colapsa. Permite que a UI e as regras raciocinem sobre o estado sem conhecer cada `code`.
 */
export type ResourceStatusBehavior = 'active' | 'blocked' | 'planned' | 'inactive' | 'terminated';

/**
 * Estado granular de um recurso (issue #171) — o motivo por trás do `status` SID. Substitui o
 * `substatus` de texto livre que as cargas Netwin gravavam em characteristic.
 */
export type ResourceStatusCatalogEntry = {
  '@type': 'ResourceStatusCatalogEntry';
  code: string;
  name: string;
  /** `undefined` = vale para qualquer tipo de recurso; preenchido = específico daquele tipo. */
  resourceType?: string;
  sortOrder: number;
  active: boolean;
  behavior: ResourceStatusBehavior;
  tenantId?: string;
};

/**
 * Entrada do histórico de um recurso (issue #171). Projeção de leitura de `tmf_audit_log`, que
 * `recordMutation` já alimenta em toda mutação via `ResourceService.emit()` — não há tabela nova.
 *
 * ⚠️ As cargas em massa gravam por SQL direto e **não** passam pelo audit, então o histórico
 * começa vazio para os recursos já carregados. A UI precisa degradar bem nesse caso.
 */
export type ResourceAuditEntry = {
  '@type': 'ResourceAuditEntry';
  id: string;
  tenantId: string;
  actorSub: string;
  action: string;
  entityType: string;
  entityId: string;
  eventTime: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  traceId: string;
  sourceIp?: string;
};

export type ResourceQuery = {
  name?: string;
  status?: ResourceStatus;
  resourceSpecificationId?: string;
  resourceSpecificationIdIn?: string[];
  resourceType?: string;
  resourceTypeIn?: string[];
  /** Categoria da ResourceSpecification referenciada — resolvida via join/subquery, não é coluna própria do recurso. */
  category?: string;
  placeId?: string;
  relatedPartyId?: string;
  kind?: ResourceKind;
  limit?: number;
  offset?: number;
  tenantId?: string;
};

export type ResourceSpecificationQuery = {
  name?: string;
  category?: string;
  resourceType?: string;
  includeEnded?: boolean;
  limit?: number;
  offset?: number;
  tenantId?: string;
};

export type ResourceFunctionSpecificationQuery = {
  name?: string;
  limit?: number;
  offset?: number;
  tenantId?: string;
};

export type ResourceCatalogQuery = {
  name?: string;
  status?: ResourceCatalogStatus;
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
  tenantId?: string;
};

export type ResourceFunctionSpecification = {
  '@type': 'ResourceFunctionSpecification';
  id: string;
  href: string;
  name: string;
  description?: string;
  validFor?: TimePeriod;
  resourceFunctionSpecificationCharacteristic: Characteristic[];
  tenantId?: string;
};

export type ResourceBase = {
  id: string;
  href: string;
  name: string;
  resourceSpecificationId: string;
  resourceSpecification: { id: string; '@referredType': 'ResourceSpecification' };
  status: ResourceStatus;
  /**
   * Motivo granular por trás do `status` SID, resolvido em `tmf_resource_status_catalog`
   * (ex.: `blocked_risk_area` sob `status='suspended'`). Extensível via catálogo (C9) —
   * `status` continua sendo o eixo canônico fechado.
   */
  statusCode?: string;
  administrativeState: AdministrativeState;
  operationalState: OperationalState;
  usageState: UsageState;
  place?: { id: string; '@referredType': string };
  relatedParty: RelatedParty[];
  resourceRelationship: ResourceRelationship[];
  validFor?: TimePeriod;
  characteristic: Characteristic[];
  tenantId?: string;
};

export type PhysicalResource = ResourceBase & {
  '@type': 'PhysicalResource';
  resourceType: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  partNumber?: string;
  /** Etiqueta física da caixa — o que está escrito nela em campo, distinto de `name`. */
  label?: string;
  /** ID Imobilizado (SAP) — referência patrimonial do exemplar. */
  assetReference?: string;
  /** Projeto de implantação que originou o recurso (`geo_project.id`). */
  projectId?: string;
};

export type LogicalResource = ResourceBase & {
  '@type': 'LogicalResource';
  resourceType: string;
  supportingPhysicalResourceId?: string;
};

export type Resource = PhysicalResource | LogicalResource;

export type ResourceDetailReference = {
  id: string;
  name?: string;
  '@referredType': string;
  resourceType?: string;
};

/**
 * Agregado de leitura do painel de recurso (issue #171). Não é entidade TMF nova: reúne a instância
 * TMF639 com referências já existentes para evitar que o frontend faça uma cascata de chamadas.
 */
export type PhysicalResourceDetail = {
  '@type': 'PhysicalResourceDetail';
  resource: PhysicalResource & { createdAt: string; updatedAt: string };
  specification: ResourceSpecification & {
    resourceTypeName: string;
    manufacturer?: string;
    model?: string;
    networkType?: string;
  };
  statusCatalogEntry?: ResourceStatusCatalogEntry;
  parent?: ResourceDetailReference & { relationshipType: string };
  place?: ResourceDetailReference & {
    streetType?: string;
    streetName?: string;
    streetNr?: string;
    locality?: string;
    city?: string;
    stateOrProvince?: string;
    postcode?: string;
  };
  location?: ResourceDetailReference;
  servingSite?: ResourceDetailReference;
  project?: ResourceDetailReference;
  childCount: number;
};

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

export type ResourceSpecificationBulkItem = {
  line: number;
  input: CreateResourceSpecificationInput;
};

export type ResourceSpecificationBulkItemResult =
  | { line: number; status: 'created'; id: string; name: string }
  | { line: number; status: 'error'; name: string; code: string; message: string };

export type ResourceSpecificationBulkResult = {
  total: number;
  created: number;
  failed: number;
  results: ResourceSpecificationBulkItemResult[];
};

export type CreateResourceFunctionSpecificationInput = {
  name: string;
  description?: string;
  validFor?: TimePeriod;
  resourceFunctionSpecificationCharacteristic?: Characteristic[];
};

export type UpdateResourceFunctionSpecificationInput =
  Partial<CreateResourceFunctionSpecificationInput>;

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
  statusCode?: string;
  label?: string;
  assetReference?: string;
  projectId?: string;
  relatedParty?: RelatedParty[];
  resourceRelationship?: ResourceRelationship[];
  characteristic?: Characteristic[];
  validFor?: TimePeriod;
};

// `placeId: null` desvincula o recurso do local atual (aba Recursos do painel unificado de
// Local, REQ-MOD01-016) — distinto de `placeId` ausente (nenhuma mudança pedida), que
// `Partial<>` sozinho não conseguiria expressar.
export type UpdatePhysicalResourceInput = Omit<Partial<CreatePhysicalResourceInput>, 'placeId'> & {
  placeId?: string | null;
};

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

// Mesmo motivo do UpdatePhysicalResourceInput: `placeId: null` desvincula explicitamente.
export type UpdateLogicalResourceInput = Omit<Partial<CreateLogicalResourceInput>, 'placeId'> & {
  placeId?: string | null;
};

export type ResourceFunctionActivationInput = {
  resourceId: string;
  action?: 'activate' | 'suspend' | 'terminate';
  reason?: string;
};
