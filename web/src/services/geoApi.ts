// Cliente compartilhado do módulo Geo (Locais).
// Fonte única dos tipos Geo e das chamadas /v1/geo/* usadas por GeoPage,
// ResourcePage e ServicePage. Não muda o modelo canônico TMF — apenas expõe
// os dados já existentes para que outras telas resolvam rótulos amigáveis.
import { bearerToken } from './session';

// Vocabulário de GeoProject.status (REQ-MOD01-015) — NÃO é o status de GeographicSite,
// que usa o vocabulário canônico de 5 estados abaixo (GeoSiteStatus). Os dois nunca
// colidem como chave de dicionário porque um é lowercase e o outro PascalCase, mas são
// domínios diferentes — não use GeoStatus para status de site.
export type GeoStatus = 'planned' | 'active' | 'suspended' | 'terminated';

// Vocabulário canônico de GeographicSite.status (src/modules/geo/domain.ts GeoSiteStatus)
// — o que a API realmente devolve em /v1/geo/sites e /v1/geo/tree/*.
export type GeoSiteStatus = 'Planned' | 'InConstruction' | 'Active' | 'InDeactivation' | 'Retired';

export type GeoGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: Array<[number, number]> }
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };

// Fonte externa que originou o dado — o usuário escolhe entre GEONET/Google Maps no modal
// de edição de endereço; os demais valores vêm de cargas de migração ou cadastro manual.
export type GeoSourceSystem =
  | 'GEONET'
  | 'GOOGLE_MAPS'
  | 'NETWIN'
  | 'GEOSITE'
  | 'NETWORKCORE'
  | 'GEOPLEX'
  | 'MANUAL';

export type GeoAccuracyLevel = 'high' | 'medium' | 'low' | 'unknown';

export type GeoLocation = {
  '@type': 'GeographicLocation';
  id: string;
  href: string;
  geometryType: 'Point' | 'LineString' | 'Polygon';
  geometry: GeoGeometry;
  spatialRef: string;
  accuracy?: string;
  referencePoint?: string;
  sourceSystem?: GeoSourceSystem;
  sourceRef?: string;
  accuracyLevel?: GeoAccuracyLevel;
};

// TMF673: sub-endereço dentro do GeographicAddress — localiza torre/bloco/andar/unidade dentro
// do endereço único de um condomínio (ex.: Torre B, 7º andar, ap. 704).
export type GeoSubAddressType = 'building' | 'tower' | 'block' | 'floor' | 'unit';

export type GeoSubAddress = {
  '@type': 'GeographicSubAddress';
  id?: string;
  type: GeoSubAddressType;
  name?: string;
  subUnitNumber?: string;
  levelNumber?: string;
};

export type GeoAddress = {
  '@type': 'GeographicAddress';
  id: string;
  href: string;
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  geographicLocationId?: string;
  place?: { id: string; '@referredType': 'GeographicLocation' };
  subAddress?: GeoSubAddress[];
  sourceSystem?: GeoSourceSystem;
  sourceRef?: string;
};

export type GeoSpecCategory = 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';

// Eixo funcional (C11): o que o site É (network/property/service), ortogonal a `category`
// (onde ele cabe na hierarquia). Ver src/modules/geo/domain.ts GeographicSiteRole.
export type GeoSiteRole = 'grouping' | 'network' | 'property' | 'service';

export type GeoSpecCharacteristic = {
  group?: string;
  name: string;
  description?: string;
  valueType: string;
  mandatory?: boolean;
  configurable?: boolean;
  defaultValue?: unknown;
};

export type GeoSpec = {
  '@type': 'GeographicSiteSpecification';
  id: string;
  href: string;
  name: string;
  code: string;
  category: GeoSpecCategory;
  siteRole: GeoSiteRole;
  lifecycleStatus: 'Active' | 'Retired';
  description?: string;
  specCharacteristic?: GeoSpecCharacteristic[];
  allowedParentSpecIds: string[];
  allowedChildSpecIds: string[];
  allowedParentSpec?: Array<{ id: string; name: string; code: string; category: GeoSpecCategory }>;
  allowedChildSpec?: Array<{ id: string; name: string; code: string; category: GeoSpecCategory }>;
  _bootstrapProtected?: boolean;
};

export type CreateGeoSpecInput = {
  name: string;
  code?: string;
  category: GeoSpecCategory;
  siteRole?: GeoSiteRole;
  description?: string;
  lifecycleStatus?: 'Active' | 'Retired';
  allowedParentSpecIds?: string[];
  allowedChildSpecIds?: string[];
  specCharacteristic?: GeoSpecCharacteristic[];
};

export type UpdateGeoSpecInput = Partial<CreateGeoSpecInput>;

export type ContainmentImpactResult = {
  specId: string;
  removedAllowedParentSpecIds: string[];
  removedAllowedChildSpecIds: string[];
  impactedParentAssignments: number;
  impactedChildAssignments: number;
  impactedSiteIds: string[];
  blocking: boolean;
};

export async function createGeoSpec(input: CreateGeoSpecInput): Promise<GeoSpec> {
  return postJson<GeoSpec>('/v1/geo/site-specifications', input);
}

export async function updateGeoSpec(id: string, input: UpdateGeoSpecInput): Promise<GeoSpec> {
  return patchJson<GeoSpec>(`/v1/geo/site-specifications/${encodeURIComponent(id)}`, input);
}

export async function retireGeoSpec(id: string): Promise<GeoSpec> {
  return deleteJson<GeoSpec>(`/v1/geo/site-specifications/${encodeURIComponent(id)}`);
}

export async function getGeoSpecImpact(
  id: string,
  input: { allowedParentSpecIds?: string[]; allowedChildSpecIds?: string[] },
): Promise<ContainmentImpactResult> {
  return postJson<ContainmentImpactResult>(
    `/v1/geo/site-specifications/${encodeURIComponent(id)}/containment-impact`,
    input,
  );
}

export type RelatedSite = {
  id: string;
  relationshipType: string;
  '@referredType': 'GeographicSite';
};

export type GeoSite = {
  '@type': 'GeographicSite';
  id: string;
  href: string;
  name: string;
  status: GeoSiteStatus;
  siteSpecificationId: string;
  siteSpecification: { id: string; '@referredType': 'GeographicSiteSpecification' };
  place?: { id: string; '@referredType': 'GeographicLocation' };
  address?: { id: string; '@referredType': 'GeographicAddress' };
  parentSite?: { id: string; '@referredType': 'GeographicSite' };
  relatedSite: RelatedSite[];
  relatedParty: Array<{ id: string; role?: string; '@referredType': 'Party' }>;
  note?: string | null;
  characteristic: Array<{ group?: string; name: string; value: unknown; valueType?: string }>;
};

export type GeoEvent = {
  '@type': 'Event';
  id: string;
  eventType: string;
  eventTime: string;
  source: string;
  eventData: Record<string, unknown>;
};

// Registro de auditoria (aba Histórico do painel unificado de Local, REQ-MOD01-016) —
// `before`/`after` são o estado do Site antes/depois da mutação, usados para montar o
// diff "o que mudou".
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

// Origem de um Site (aba Visão Geral): de onde ele veio — carga de migração, Projeto de
// trabalho (mesmo depois de terminado, RF-010) ou cadastro manual pela UI.
export type SiteOrigin =
  | { kind: 'import'; system: string }
  | { kind: 'project'; projectId: string; projectName: string }
  | { kind: 'manual'; actorSub: string; createdAt: string };

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${bearerToken()}`,
});

export async function getJson<T>(url: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(url, { headers: authHeaders(), signal: options.signal });
  if (!response.ok) throw new Error(`GET ${url} falhou (${response.status})`);
  return (await response.json()) as T;
}

/** Como `getJson`, mas devolve `undefined` em 404 em vez de lançar — útil para resolução por id sob demanda, onde o id pode legitimamente ser de outro tipo de recurso. */
export async function getJsonOrUndefined<T>(url: string): Promise<T | undefined> {
  const response = await fetch(url, { headers: authHeaders() });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`GET ${url} falhou (${response.status})`);
  return (await response.json()) as T;
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${url} falhou (${response.status})`);
  return (await response.json()) as T;
}

export async function patchJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`PATCH ${url} falhou (${response.status})`);
  return (await response.json()) as T;
}

export async function deleteJson<T = void>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error(`DELETE ${url} falhou (${response.status})`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const listGeoSites = (options?: {
  siteSpecificationIds?: string[];
  name?: string;
  limit?: number;
}) => {
  const params = new URLSearchParams();
  if (options?.siteSpecificationIds && options.siteSpecificationIds.length > 0) {
    params.set('siteSpecificationIds', options.siteSpecificationIds.join(','));
  }
  if (options?.name) params.set('name', options.name);
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  const query = params.toString();
  return getJson<GeoSite[]>(`/v1/geo/sites${query ? `?${query}` : ''}`);
};
export const listGeoAddresses = (options?: { q?: string; limit?: number }) => {
  const params = new URLSearchParams();
  if (options?.q) params.set('q', options.q);
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  const query = params.toString();
  return getJson<GeoAddress[]>(`/v1/geo/addresses${query ? `?${query}` : ''}`);
};
export const listGeoLocations = () => getJson<GeoLocation[]>('/v1/geo/locations');
export const listGeoSiteSpecifications = () => getJson<GeoSpec[]>('/v1/geo/site-specifications');
export const getGeoSite = (id: string) =>
  getJsonOrUndefined<GeoSite>(`/v1/geo/sites/${encodeURIComponent(id)}`);
export const getGeoAddress = (id: string) =>
  getJsonOrUndefined<GeoAddress>(`/v1/geo/addresses/${encodeURIComponent(id)}`);
export const getGeoLocation = (id: string) =>
  getJsonOrUndefined<GeoLocation>(`/v1/geo/locations/${encodeURIComponent(id)}`);
export const listGeoSiteEvents = (siteId: string) =>
  getJson<GeoEvent[]>(`/v1/geo/sites/${siteId}/events`);
export const fetchSiteAudit = (siteId: string) =>
  getJson<GeoAuditLog[]>(`/v1/geo/sites/${siteId}/audit`);
export const fetchSiteOrigin = (siteId: string) =>
  getJson<SiteOrigin>(`/v1/geo/sites/${siteId}/origin`);

// Vínculo de Recurso com o Site (aba Recursos do painel unificado) — a escrita é do módulo
// Resource (C2/C3), mas a rota fica agrupada em Site porque é daqui que o usuário decide.
export const linkSiteResource = (siteId: string, resourceId: string) =>
  postJson<{ '@type': 'PhysicalResource' | 'LogicalResource'; id: string }>(
    `/v1/geo/sites/${siteId}/resources`,
    { resourceId },
  );

export const unlinkSiteResource = (
  siteId: string,
  resourceId: string,
  mode: 'unlink' | 'terminate' = 'unlink',
): Promise<void> =>
  deleteJson(
    `/v1/geo/sites/${siteId}/resources/${encodeURIComponent(resourceId)}?mode=${mode}`,
  );
