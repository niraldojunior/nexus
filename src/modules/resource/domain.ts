import type { Characteristic, RelatedParty, TimePeriod } from '../../shared/tmf/index.js';
import type { GeoGeometryType, GeoJSONGeometry } from '../geo/domain.js';

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
  resourceTypeId?: string;
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
  placeId?: string;
  relatedPartyId?: string;
  kind?: ResourceKind;
  limit?: number;
  offset?: number;
  tenantId?: string;
};

export type ResourceSpecificationQuery = {
  name?: string;
  resourceTypeId?: string;
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

// --- Árvore dinâmica de catálogo (issue #188) ---------------------------------------------------
// ResourceCategory/ResourceLayer (classificação legada, pré-refactor) foram removidas fisicamente
// na Fase B do cutover (issue #188). `categoryCode` de ResourceType agora deriva do node
// RESOURCE_TYPE mais específico desta árvore (ver postgres-repository.ts).

export type ResourceCatalogNodeKind = 'GROUP' | 'RESOURCE_TYPE';

/** Contêiner tenant-scoped de uma árvore de catálogo governada; não é nó da árvore em si. */
export type ResourceCatalog = {
  '@type': 'ResourceCatalog';
  id: string;
  href: string;
  code: string;
  name: string;
  description?: string;
  status: ResourceCatalogStatus;
  isDefault: boolean;
  sortOrder: number;
  tenantId: string;
  createdBy?: string;
  updatedBy?: string;
};

/** Referência resumida a um ResourceType, usada nas projeções de leitura da árvore. */
export type ResourceTypeRef = {
  id: string;
  href: string;
  code: string;
  name: string;
  '@referredType': 'ResourceType';
};

/**
 * Nó da árvore de catálogo. `GROUP` é organizacional e nunca referencia tipo; `RESOURCE_TYPE` é
 * sempre folha e referencia exatamente um `ResourceType` — sem unicidade global, o mesmo tipo pode
 * aparecer em 0..N nós, inclusive no mesmo catálogo. `code` é a chave estável do nó dentro do
 * catálogo, distinta do `code` do ResourceType que ele eventualmente referencia.
 */
export type ResourceCatalogNode = {
  '@type': 'ResourceCatalogNode';
  id: string;
  href: string;
  catalogId: string;
  parentNodeId?: string;
  code: string;
  name: string;
  description?: string;
  kind: ResourceCatalogNodeKind;
  resourceTypeId?: string;
  /** Presente só quando `kind === 'RESOURCE_TYPE'`; projeção de leitura, nunca persistida no nó. */
  resourceType?: ResourceTypeRef;
  status: ResourceCatalogStatus;
  sortOrder: number;
  metadata?: Record<string, unknown>;
  tenantId: string;
  createdBy?: string;
  updatedBy?: string;
};

/** Nó com filhos já resolvidos e ordenados — forma devolvida por `GET .../tree`. */
export type ResourceCatalogTreeNode = ResourceCatalogNode & {
  children: ResourceCatalogTreeNode[];
};

export type ResourceCatalogPathEntry = {
  id: string;
  code: string;
  name: string;
  kind: ResourceCatalogNodeKind;
  resourceTypeId?: string;
};

/** Um caminho raiz→nó dentro de um catálogo — usado tanto por `GET .../path` quanto pela visão consolidada. */
export type ResourceCatalogPath = {
  catalog: { id: string; code: string; name: string };
  nodes: ResourceCatalogPathEntry[];
};

/** Visão consolidada de um ResourceType: onde ele aparece na(s) árvore(s) + suas specifications. */
export type ResourceTypeCatalogContext = {
  resourceType: ResourceType;
  specifications: Array<{ id: string; href: string; name: string }>;
  catalogPaths: ResourceCatalogPath[];
};

export type CreateResourceCatalogInput = {
  code: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  sortOrder?: number;
};

export type UpdateResourceCatalogInput = Partial<Omit<CreateResourceCatalogInput, 'code'>> & {
  status?: ResourceCatalogStatus;
};

type ResourceCatalogNodeShapeInput =
  | { kind: 'GROUP'; resourceTypeId?: undefined }
  | { kind: 'RESOURCE_TYPE'; resourceTypeId: string };

export type CreateResourceCatalogNodeInput = ResourceCatalogNodeShapeInput & {
  code: string;
  name: string;
  description?: string;
  parentNodeId?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

/** `PATCH` normal — nunca muda `parentNodeId`/posição; isso é só `.../move` (RN de ciclo/pai). */
export type UpdateResourceCatalogNodeInput = {
  name?: string;
  description?: string;
  status?: ResourceCatalogStatus;
  metadata?: Record<string, unknown>;
};

export type MoveResourceCatalogNodeInput = {
  parentNodeId: string | null;
  sortOrder: number;
};

export type ReorderResourceCatalogNodesInput = {
  parentNodeId?: string | null;
  orderedNodeIds: string[];
};

export type ResourceCatalogNodeImpact = {
  nodeId: string;
  catalogId: string;
  descendantCount: number;
  descendantNodeIds: string[];
  resourceTypeIds: string[];
  specificationCount: number;
  specifications: Array<{ id: string; name: string; resourceTypeId: string }>;
  activePhysicalResourceCount: number;
  activeLogicalResourceCount: number;
};

export type ResourceModelSnapshot = {
  catalog: {
    id?: string;
    code: string;
    name: string;
    description?: string;
  };
  nodes: Array<{
    id?: string;
    code: string;
    name: string;
    description?: string;
    kind: ResourceCatalogNodeKind;
    resourceTypeId?: string;
    resourceTypeCode?: string;
    parentNodeId?: string | null;
    parentCode?: string | null;
    sortOrder?: number;
    status?: ResourceCatalogStatus;
    metadata?: Record<string, unknown>;
  }>;
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
  resourceTypeId: string;
  /** Referência expandida do ResourceType — projeção de leitura, nunca persistida na Specification. */
  resourceType: ResourceTypeRef;
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
  /** Projeção da ResourceSpecification; nunca é persistido na instância TMF639. */
  resourceType: string;
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
export type ResourcePortConnection = {
  resource: { id: string; name: string; '@referredType': 'PhysicalResource'; resourceType: string };
  active: boolean;
  validFor?: TimePeriod;
  /**
   * ONT alimentada por este drop, resolvida pelo grafo físico (`connectedTo`), independente do
   * estado do Service — cobre também porta com drop ativo porém sem RFS/CFS ativos (churn).
   * Só é populado para a conexão `active: true`.
   */
  ont?: ResourceDetailReference;
};

export type ResourcePortDetail = {
  '@type': 'ResourcePortDetail';
  resource: PhysicalResource;
  role?: string;
  index?: number;
  splitter?: ResourceDetailReference;
  cto?: ResourceDetailReference;
  splitRatio?: string;
  /** Estado de uso calculado das conexões físicas ativas — nunca aceito como contador manual. */
  derivedUsageState: UsageState;
  /** Há RFS ativo que referencia esta porta como `supportingResource`. Projeção de leitura C3. */
  hasActiveService: boolean;
  drops: ResourcePortConnection[];
};

export type ResourcePortsView = {
  '@type': 'ResourcePortsView';
  ctoId: string;
  groups: Array<{
    splitter: ResourceDetailReference & { splitRatio?: string };
    ports: ResourcePortDetail[];
  }>;
};

export type PhysicalResourceDetail = {
  '@type': 'PhysicalResourceDetail';
  resource: PhysicalResource & { createdAt: string; updatedAt: string };
  specification: ResourceSpecification & {
    resourceTypeName: string;
    manufacturer?: ResourceDetailReference;
    model?: string;
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
    // Presente também quando o place é um GeographicSite com endereço vinculado
    // (geographic_address_id) — a UI usa o par rua+sourceSystem, não o Site em si,
    // para o campo "Endereço" (ver resolveDetailPlace).
    sourceSystem?: string;
  };
  location?: ResourceDetailReference & {
    geometryType?: GeoGeometryType;
    geometry?: GeoJSONGeometry;
  };
  servingSite?: ResourceDetailReference;
  project?: ResourceDetailReference;
  childCount: number;
};

export type CreateResourceSpecificationInput = {
  name: string;
  resourceTypeId: string;
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
