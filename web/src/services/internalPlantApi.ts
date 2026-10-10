import { bearerToken } from './session';
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

export type InternalPlantResourceRow = {
  id: string;
  '@type': 'PhysicalResource' | 'LogicalResource';
  name: string;
  status: string;
  resourceType: { id: string; code: string; name: string };
  resourceSpecification: { id: string; name: string };
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
