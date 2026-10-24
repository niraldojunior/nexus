import { bearerToken } from './session';
import { invalidateMapTiles } from '../utils/mapTileCache';
import type { ResourceAuditEntry } from './resourceApi';
import type { VisualIdentity } from './studioGeoApi';

export type InternalPlantLocationNodeKind = 'country' | 'uf' | 'city' | 'site-type' | 'site';

export type InternalPlantLocationRootNode = InternalPlantLocationNode & { parentId: string | null };

export type InternalPlantLocationNode = {
  id: string;
  kind: InternalPlantLocationNodeKind;
  label: string;
  sublabel?: string;
  refId?: string;
  referredType?: string;
  status?: string;
  siteSpecificationId?: string;
  visualIdentity?: VisualIdentity;
  hasChildren: boolean;
  childCount?: number;
};

export type InternalPlantChildrenPage = {
  nodeId: string;
  nodes: InternalPlantLocationNode[];
  total: number;
  limit: number;
  offset: number;
};

export type InternalPlantSiteContext = {
  site: {
    id: string;
    name: string;
    specificationName: string;
    visualIdentity?: VisualIdentity;
  };
  hierarchy: Array<{ id: string; name: string; specificationName: string }>;
  address?: {
    streetType?: string;
    streetName?: string;
    streetNr?: string;
    locality?: string;
    city?: string;
    stateOrProvince?: string;
    postcode?: string;
  };
  /** Ponto do Site (ou do seu endereço), GeoJSON `[lng, lat]`. */
  coordinates?: [number, number];
  /** Ids dos nós da árvore de Locais, do país ao Site. */
  treePath: string[];
};

export type InternalPlantSiteRow = {
  id: string;
  name: string;
  status: string;
  siteSpecification: { id: string; name: string };
  visualIdentity?: VisualIdentity;
  address?: string;
  stateOrProvince?: string;
  city?: string;
};

export type InternalPlantSitePage = {
  items: InternalPlantSiteRow[];
  total: number;
  limit: number;
  offset: number;
};

export type InternalPlantResourceRow = {
  id: string;
  '@type': 'PhysicalResource' | 'LogicalResource';
  name: string;
  status: string;
  statusCode?: string;
  resourceType: { id: string; code: string; name: string };
  resourceSpecification: { id: string; name: string; manufacturer?: { id: string; name?: string } };
  place?: { id: string; name: string };
  stateOrProvince?: string;
  city?: string;
};

export type InternalPlantResourcePage = {
  items: InternalPlantResourceRow[];
  total: number;
  limit: number;
  offset: number;
};

export type InternalPlantResourceFilter = {
  q?: string;
  siteId?: string;
  resourceTypeIds?: string[];
};

const BASE = '/v1/resource/internal-plant';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${bearerToken()}` },
    ...(signal ? { signal } : {}),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    const record = payload as Record<string, unknown> | undefined;
    const message =
      (typeof record?.message === 'string' ? record.message : undefined) ??
      (typeof record?.error === 'string' ? record.error : undefined) ??
      `Falha na requisição (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

async function sendJson<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${bearerToken()}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const record = payload as Record<string, unknown> | undefined;
    const message =
      (typeof record?.message === 'string' ? record.message : undefined) ??
      (typeof record?.error === 'string' ? record.error : undefined) ??
      `Falha na requisição (${response.status})`;
    throw new InternalPlantApiError(
      message,
      response.status,
      typeof record?.code === 'string'
        ? record.code
        : typeof record?.error === 'string'
          ? record.error
          : undefined,
    );
  }
  return payload as T;
}

export class InternalPlantApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'InternalPlantApiError';
  }
}

// ---- Editor de Resource (agregado) -------------------------------------------------------

export type EditorCharacteristic = {
  name: string;
  value: unknown;
  valueType?: string;
  group?: string;
  description?: string;
  allowedValues?: string[];
  referenceDataSetKey?: string | null;
  characteristicLevel?: 'specification' | 'instance';
};

export type EditorResourceKind = 'PhysicalResource' | 'LogicalResource';

export type EditorResource = {
  '@type': EditorResourceKind;
  id: string;
  name: string;
  resourceSpecificationId: string;
  status?: string;
  statusCode?: string;
  administrativeState?: string;
  operationalState?: string;
  usageState?: string;
  stateChangedAt?: {
    status?: string;
    administrative?: string;
    operational?: string;
    usage?: string;
  };
  label?: string;
  serialNumber?: string;
  assetReference?: string;
  relatedParty?: Array<{ id: string; '@referredType': string; role?: string; name?: string }>;
  supportingPhysicalResourceId?: string;
  place?: { id: string; name?: string; '@referredType'?: string };
  characteristic?: EditorCharacteristic[];
  validFor?: { startDateTime?: string; endDateTime?: string };
};

export type EditorComponentNode = {
  id: string;
  name: string;
  kind: EditorResourceKind;
  parentId: string | null;
  depth: number;
  relationshipId?: string;
  relationshipDefinitionId?: string;
  placement?:
    | { placementPolicy: 'LINEAR'; position: number; span?: number }
    | {
        placementPolicy: 'GRID';
        row: number;
        column: number;
        rowSpan?: number;
        columnSpan?: number;
      };
  resourceType?: string;
  status?: string;
  statusCode?: string;
  administrativeState?: string;
  operationalState?: string;
  usageState?: string;
  characteristics?: EditorCharacteristic[];
  specification?: { id: string; name?: string };
};

export type EditorConnection = {
  direction: 'outgoing' | 'incoming';
  relationshipType: string;
  resource: { id: string; name: string; resourceType?: string; status?: string };
};

export type EditorSiteRelationship = {
  id: string;
  relationshipType: string;
  site: { id: string; name?: string };
};

export type ResourceEditorSnapshot = {
  resource: EditorResource;
  specification: {
    id: string;
    name: string;
    resourceTypeId?: string;
    relatedParty?: Array<{ id: string; '@referredType': string; role?: string; name?: string }>;
    resourceSpecificationCharacteristic?: EditorCharacteristic[];
  };
  resourceType: {
    id: string;
    code: string;
    name: string;
    nature?: EditorResourceKind;
    resourceTypeCharacteristic?: EditorCharacteristic[];
  };
  components: EditorComponentNode[];
  relationships: EditorConnection[];
  siteRelationships: EditorSiteRelationship[];
  place?: { id: string; name?: string; '@referredType'?: string };
};

export type AggregateChildDraft = {
  id?: string;
  relationshipId?: string;
  relationshipDefinitionId?: string;
  placement?:
    | { placementPolicy: 'LINEAR'; position: number; span?: number }
    | {
        placementPolicy: 'GRID';
        row: number;
        column: number;
        rowSpan?: number;
        columnSpan?: number;
      };
  name: string;
  resourceSpecificationId: string;
  status?: string;
  statusCode?: string;
  administrativeState?: string;
  operationalState?: string;
  usageState?: string;
  characteristic?: EditorCharacteristic[];
  children?: AggregateChildDraft[];
};

export type SaveResourceAggregatePayload = {
  id?: string;
  '@type': EditorResourceKind;
  name: string;
  resourceSpecificationId: string;
  status?: string;
  statusCode?: string;
  administrativeState?: string;
  operationalState?: string;
  usageState?: string;
  label?: string;
  serialNumber?: string;
  assetReference?: string;
  relatedParty?: Array<{ id: string; '@referredType': string; role?: string; name?: string }>;
  supportingPhysicalResourceId?: string | null;
  placeId?: string | null;
  placeType?: 'GeographicSite' | 'GeographicAddress' | 'GeographicLocation';
  characteristic?: EditorCharacteristic[];
  components?: AggregateChildDraft[];
  relationships?: Array<{
    targetId: string;
    relationshipType: string;
    direction?: 'outgoing' | 'incoming';
  }>;
  siteRelationships?: Array<{ siteId: string; relationshipType: string }>;
};

export const fetchResourceEditor = (id: string, signal?: AbortSignal) =>
  getJson<ResourceEditorSnapshot>(`${BASE}/resources/${encodeURIComponent(id)}/editor`, signal);

export const fetchResourceHistory = (id: string, signal?: AbortSignal) =>
  getJson<ResourceAuditEntry[]>(`${BASE}/resources/${encodeURIComponent(id)}/audit`, signal);

// O agregado grava place/nome/status do recurso — tudo que o mapa mostra (issue #425).
export const saveResourceAggregate = async (payload: SaveResourceAggregatePayload) => {
  const result = payload.id
    ? await sendJson<{ resource: EditorResource; createdIds: string[] }>(
        'PUT',
        `${BASE}/resources/${encodeURIComponent(payload.id)}`,
        payload,
      )
    : await sendJson<{ resource: EditorResource; createdIds: string[] }>(
        'POST',
        `${BASE}/resources`,
        payload,
      );
  invalidateMapTiles();
  return result;
};

export const terminateInternalPlantResource = async (
  id: string,
  options: { cascade?: boolean } = {},
) => {
  const query = options.cascade ? '?cascade=true' : '';
  const result = await sendJson<unknown>(
    'DELETE',
    `${BASE}/resources/${encodeURIComponent(id)}${query}`,
  );
  invalidateMapTiles();
  return result;
};

export const fetchInternalPlantRoots = (signal?: AbortSignal) =>
  getJson<InternalPlantLocationRootNode[]>(`${BASE}/locations/roots`, signal);

export const fetchInternalPlantChildren = (
  nodeId: string,
  options: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ nodeId });
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  return getJson<InternalPlantChildrenPage>(`${BASE}/locations/children?${params}`, signal);
};

export const fetchInternalPlantSiteContext = (siteId: string, signal?: AbortSignal) =>
  getJson<InternalPlantSiteContext>(`${BASE}/sites/${encodeURIComponent(siteId)}/context`, signal);

export const fetchInternalPlantSites = (
  q: string,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ q });
  params.set('limit', String(page.limit));
  params.set('offset', String(page.offset));
  return getJson<InternalPlantSitePage>(`${BASE}/sites?${params}`, signal);
};

export const fetchInternalPlantResources = (
  filter: InternalPlantResourceFilter,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.siteId) params.set('siteId', filter.siteId);
  for (const id of filter.resourceTypeIds ?? []) params.append('resourceTypeId', id);
  params.set('limit', String(page.limit));
  params.set('offset', String(page.offset));
  return getJson<InternalPlantResourcePage>(`${BASE}/resources?${params}`, signal);
};
