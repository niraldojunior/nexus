// Cliente compartilhado do módulo Geo (Locais).
// Fonte única dos tipos Geo e das chamadas /v1/geo/* usadas por GeoPage,
// ResourcePage e ServicePage. Não muda o modelo canônico TMF — apenas expõe
// os dados já existentes para que outras telas resolvam rótulos amigáveis.

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
  sourceSystem?: GeoSourceSystem;
  sourceRef?: string;
};

export type GeoSpecCategory = 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';

export type GeoSpec = {
  '@type': 'GeographicSiteSpecification';
  id: string;
  href: string;
  name: string;
  code: string;
  category: GeoSpecCategory;
  lifecycleStatus: 'Active' | 'Retired';
  allowedParentSpecIds: string[];
  allowedChildSpecIds: string[];
};

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
  Authorization: `Bearer ${localStorage.getItem('authToken') || 'change-me'}`,
});

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: authHeaders() });
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

export async function deleteJson(url: string): Promise<void> {
  const response = await fetch(url, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error(`DELETE ${url} falhou (${response.status})`);
}

export const listGeoSites = (options?: { siteSpecificationIds?: string[] }) => {
  const query =
    options?.siteSpecificationIds && options.siteSpecificationIds.length > 0
      ? `?siteSpecificationIds=${options.siteSpecificationIds.map(encodeURIComponent).join(',')}`
      : '';
  return getJson<GeoSite[]>(`/v1/geo/sites${query}`);
};
export const listGeoAddresses = () => getJson<GeoAddress[]>('/v1/geo/addresses');
export const listGeoLocations = () => getJson<GeoLocation[]>('/v1/geo/locations');
export const listGeoSiteSpecifications = () => getJson<GeoSpec[]>('/v1/geo/site-specifications');
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
