// Cliente compartilhado do módulo Geo (Locais).
// Fonte única dos tipos Geo e das chamadas /v1/geo/* usadas por GeoPage,
// ResourcePage e ServicePage. Não muda o modelo canônico TMF — apenas expõe
// os dados já existentes para que outras telas resolvam rótulos amigáveis.

export type GeoStatus = 'planned' | 'active' | 'suspended' | 'terminated';

export type GeoGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: Array<[number, number]> }
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };

export type GeoLocation = {
  '@type': 'GeographicLocation';
  id: string;
  href: string;
  geometryType: 'Point' | 'LineString' | 'Polygon';
  geometry: GeoGeometry;
  spatialRef: string;
  referencePoint?: string;
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
};

export type GeoSpecCategory = 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';

export type GeoSpec = {
  '@type': 'GeographicSiteSpecification';
  id: string;
  href: string;
  name: string;
  category: GeoSpecCategory;
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
  status: GeoStatus;
  siteSpecificationId: string;
  siteSpecification: { id: string; '@referredType': 'GeographicSiteSpecification' };
  place?: { id: string; '@referredType': 'GeographicLocation' };
  address?: { id: string; '@referredType': 'GeographicAddress' };
  parentSite?: { id: string; '@referredType': 'GeographicSite' };
  relatedSite: RelatedSite[];
  relatedParty: Array<{ id: string; role?: string; '@referredType': 'Party' }>;
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
  const response = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`POST ${url} falhou (${response.status})`);
  return (await response.json()) as T;
}

export async function patchJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`PATCH ${url} falhou (${response.status})`);
  return (await response.json()) as T;
}

export const listGeoSites = () => getJson<GeoSite[]>('/v1/geo/sites');
export const listGeoAddresses = () => getJson<GeoAddress[]>('/v1/geo/addresses');
export const listGeoLocations = () => getJson<GeoLocation[]>('/v1/geo/locations');
export const listGeoSiteSpecifications = () => getJson<GeoSpec[]>('/v1/geo/site-specifications');
export const listGeoSiteEvents = (siteId: string) => getJson<GeoEvent[]>(`/v1/geo/sites/${siteId}/events`);
