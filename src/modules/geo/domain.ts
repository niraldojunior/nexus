export type GeoGeometryType = 'Point' | 'LineString' | 'Polygon';

export type GeoJSONPoint = {
  type: 'Point';
  coordinates: [number, number];
};

export type GeoJSONLineString = {
  type: 'LineString';
  coordinates: Array<[number, number]>;
};

export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: Array<Array<[number, number]>>;
};

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString | GeoJSONPolygon;

export type TimePeriod = {
  startDateTime?: string;
  endDateTime?: string;
};

export type CharacteristicValueType =
  'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'json';

export type Characteristic = {
  group?: string;
  name: string;
  value: string | number | boolean | Record<string, unknown> | null;
  valueType?: CharacteristicValueType;
};

export type GeoSiteStatus = 'Planned' | 'InConstruction' | 'Active' | 'InDeactivation' | 'Retired';
export type GeoSiteStatusAlias = 'planned' | 'active' | 'suspended' | 'terminated';
export type GeographicSiteSpecificationCategory = 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
export type GeographicSiteSpecificationLifecycleStatus = 'Active' | 'Retired';

// Eixo funcional (C11): o que o site É, ortogonal a `category` (onde ele cabe na hierarquia).
export type GeographicSiteRole = 'grouping' | 'network' | 'property' | 'service';

export const GEO_SITE_ROLES: GeographicSiteRole[] = ['grouping', 'network', 'property', 'service'];

/** Default de `siteRole` para specs legadas (`site_role IS NULL`) ou ad-hoc sem papel explícito. */
export function defaultSiteRoleFor(category: GeographicSiteSpecificationCategory): GeographicSiteRole {
  if (category === 'Region' || category === 'FunctionalGroup') return 'grouping';
  return 'network';
}

export type GeographicSiteRelationship = {
  id: string;
  relationshipType: string;
  '@referredType': 'GeographicSite';
  validFor?: TimePeriod;
};

export type GeographicRelationshipType = {
  '@type': 'GeographicRelationshipType';
  id: string;
  href: string;
  code: string;
  name: string;
  inverseCode: string;
  symmetric: boolean;
  allowedSourceCategories: GeographicSiteSpecificationCategory[];
  allowedTargetCategories: GeographicSiteSpecificationCategory[];
  cardinality?: {
    maxSourcePerTarget?: number;
    maxTargetPerSource?: number;
  };
  lifecycleStatus: 'Active' | 'Retired';
  _bootstrapProtected?: boolean;
};

export type GeoEvent = {
  '@type': 'Event';
  id: string;
  eventType: string;
  eventTime: string;
  source: string;
  eventData: Record<string, unknown>;
  correlationId?: string;
};

export type GeoAuditLog = {
  '@type': 'GeoAuditLog';
  id: string;
  tenantId: string;
  actorSub: string;
  action: string;
  entityType: string;
  entityId: string;
  eventTime: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  traceId: string;
  sourceIp?: string;
};

export type GeoOutboxMessage = {
  '@type': 'OutboxMessage';
  id: string;
  tenantId: string;
  eventId: string;
  topic: string;
  payload: GeoEvent;
  status: 'pending' | 'published' | 'failed';
  createdAt: string;
  publishedAt?: string;
};

export type GeoBulkTarget = 'Address' | 'Site';
export type GeoBulkMode = 'validateOnly' | 'atomic' | 'bestEffort';
export type GeoBulkJobStatus = 'running' | 'completed' | 'failed';
export type GeoBulkItemStatus = 'validated' | 'created' | 'reused' | 'failed';

export type GeoBulkJob = {
  '@type': 'GeoBulkJob';
  id: string;
  tenantId: string;
  target: GeoBulkTarget;
  mode: GeoBulkMode;
  idempotencyKey: string;
  status: GeoBulkJobStatus;
  submittedAt: string;
  startedAt: string;
  completedAt?: string;
  total: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  actorSub: string;
  traceId: string;
};

export type GeoBulkJobResult = {
  '@type': 'GeoBulkJobResult';
  id: string;
  jobId: string;
  tenantId: string;
  index: number;
  status: GeoBulkItemStatus;
  entityId?: string;
  legacySystem?: string;
  legacyEntity?: string;
  legacyId?: string;
  errorCode?: string;
  message?: string;
  warnings: string[];
};

export type GeographicSiteStatusHistoryEntry = {
  '@type': 'GeographicSiteStatusHistoryEntry';
  id: string;
  siteId: string;
  tenantId: string;
  fromStatus?: GeoSiteStatus;
  toStatus: GeoSiteStatus;
  statusDate: string;
  statusReason?: string;
  actorSub: string;
  traceId: string;
};

export type GeographicSiteReferences = {
  siteId: string;
  activeChildSiteCount: number;
  activeRelationshipCount: number;
  activeResourceCount: number;
  activeServiceCount: number;
  activeOrderCount: number;
  blocking: boolean;
};

// Fonte externa que originou o dado (procedência) — pré-requisito do painel unificado de
// Local (REQ-MOD01-016): GEONET/Google Maps por escolha do usuário no modal de endereço, um
// sistema legado migrado (Netwin/Geosite/NetworkCore/Geoplex), ou cadastro manual.
export type GeoSourceSystem =
  | 'GEONET'
  | 'GOOGLE_MAPS'
  | 'NETWIN'
  | 'GEOSITE'
  | 'NETWORKCORE'
  | 'GEOPLEX'
  | 'MANUAL';

// Nível de confiança normalizado do ponto, derivado do texto cru de `accuracy` (que
// permanece na forma como a fonte devolveu, ex. "ROOFTOP", "ENDEREÇO COMPLETO").
export type GeoAccuracyLevel = 'high' | 'medium' | 'low' | 'unknown';

export type GeographicLocation = {
  '@type': 'GeographicLocation';
  id: string;
  href: string;
  tenantId?: string;
  geometryType: GeoGeometryType;
  geometry: GeoJSONGeometry;
  spatialRef: string;
  accuracy?: string;
  referencePoint?: string;
  // Procedência: quem gerou esta coordenada e a referência dela na fonte (id GEONET,
  // placeId do Google, id do registro legado).
  sourceSystem?: GeoSourceSystem;
  sourceRef?: string;
  accuracyLevel?: GeoAccuracyLevel;
  validFor?: TimePeriod;
  characteristic: Characteristic[];
};

// TMF673: sub-endereço dentro de um GeographicAddress — localiza torre/bloco/andar/unidade
// dentro do endereço único de um condomínio (ex.: Torre B, 7º andar, ap. 704). Ocorrências em
// cascata (múltiplos itens formam o caminho completo).
export type GeographicSubAddressType = 'building' | 'tower' | 'block' | 'floor' | 'unit';

export const GEO_SUB_ADDRESS_TYPES: GeographicSubAddressType[] = [
  'building',
  'tower',
  'block',
  'floor',
  'unit',
];

export type GeographicSubAddress = {
  '@type': 'GeographicSubAddress';
  id?: string;
  type: GeographicSubAddressType;
  name?: string;
  subUnitNumber?: string;
  levelNumber?: string;
};

export type GeographicAddress = {
  '@type': 'GeographicAddress';
  id: string;
  href: string;
  tenantId?: string;
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  geographicLocationId?: string;
  place?: { id: string; '@referredType': 'GeographicLocation' };
  subAddress?: GeographicSubAddress[];
  sourceSystem?: GeoSourceSystem;
  sourceRef?: string;
  validFor?: TimePeriod;
  characteristic: Characteristic[];
};

export type GeographicSiteSpecificationRef = {
  id: string;
  href: string;
  name: string;
  code: string;
  category: GeographicSiteSpecificationCategory;
  siteRole: GeographicSiteRole;
  '@referredType': 'GeographicSiteSpecification';
};

export type GeographicSiteSpecificationCharacteristic = {
  group?: string;
  name: string;
  description?: string;
  valueType: CharacteristicValueType;
  mandatory?: boolean;
  configurable?: boolean;
  defaultValue?: Characteristic['value'];
  regex?: string;
  allowedValues?: Array<string | number | boolean>;
  min?: number;
  max?: number;
  lookup?: string;
};

export type GeographicSiteSpecification = {
  '@type': 'GeographicSiteSpecification';
  id: string;
  href: string;
  name: string;
  code: string;
  category: GeographicSiteSpecificationCategory;
  siteRole: GeographicSiteRole;
  lifecycleStatus: GeographicSiteSpecificationLifecycleStatus;
  description?: string;
  validFor?: TimePeriod;
  specCharacteristic: GeographicSiteSpecificationCharacteristic[];
  allowedParentSpec: GeographicSiteSpecificationRef[];
  allowedChildSpec: GeographicSiteSpecificationRef[];
  // Compatibilidade legada com /v1 e chamadas antigas.
  allowedParentSpecIds: string[];
  allowedChildSpecIds: string[];
  // Metadados internos de governança.
  _bootstrapProtected?: boolean;
  _protectedAllowedParentSpecIds?: string[];
  _protectedAllowedChildSpecIds?: string[];
};

export type GeographicSite = {
  '@type': 'GeographicSite';
  id: string;
  href: string;
  tenantId?: string;
  name: string;
  status: GeoSiteStatus;
  statusDate?: string;
  statusReason?: string;
  siteSpecificationId: string;
  siteSpecification: { id: string; '@referredType': 'GeographicSiteSpecification' };
  place?: { id: string; '@referredType': 'GeographicLocation' };
  address?: { id: string; '@referredType': 'GeographicAddress' };
  siteAddress?: Array<{
    id: string;
    role: 'principal' | 'dispatch' | 'billing';
    '@referredType': 'GeographicAddress';
  }>;
  parentSite?: { id: string; '@referredType': 'GeographicSite' };
  relatedSite: GeographicSiteRelationship[];
  relatedParty: Array<{ id: string; role?: string; '@referredType': 'Party' }>;
  // Observação livre do local (aba Visão Geral do painel unificado, REQ-MOD01-016) — campo
  // comum, não characteristic (C1 não se aplica: anotação de trabalho, não extensão TMF).
  note?: string | null;
  characteristic: Characteristic[];
};
