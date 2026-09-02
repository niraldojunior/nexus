import type { Party } from './partyApi';
import type { GeoGeometry } from './geoApi';
import { invalidateMapTiles } from '../utils/mapTileCache';
import { bearerToken } from './session';

const API_BASE_URL = '/tmf-api';

type FetchJsonOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export type ResourceTab = 'PhysicalResource' | 'LogicalResource' | 'ResourceSpecification';

export type ResourceCategory = {
  '@type': 'ResourceCategory';
  id: string;
  href: string;
  code: string;
  name: string;
  parentCategoryCode?: string;
  description?: string;
  status: 'active' | 'inactive';
};

export type ResourceType = {
  '@type': 'ResourceType';
  id: string;
  href: string;
  code: string;
  name: string;
  categoryCode: string;
  description?: string;
  status: 'active' | 'inactive';
};

export type ResourceLayer = {
  '@type': 'ResourceLayer';
  id: string;
  href: string;
  code: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
};

export type ResourceLayerPayload = {
  code?: string;
  name?: string;
  description?: string;
  status?: ResourceLayer['status'];
};

export type TimePeriod = {
  startDateTime?: string;
  endDateTime?: string;
};

export type ResourceCharacteristic = {
  name: string;
  value: unknown;
  valueType?: string;
  group?: string;
};

export type ResourceSpecification = {
  '@type'?: 'ResourceSpecification';
  id: string;
  href?: string;
  name: string;
  category: string;
  resourceType: string;
  resourceLayerId?: string;
  description?: string;
  validFor?: TimePeriod;
  resourceSpecificationCharacteristic: ResourceCharacteristic[];
  relatedParty: Array<{ id: string; '@referredType': string; role?: string; name?: string }>;
};

export type ResourceReference = {
  id: string;
  '@referredType': string;
};

export type ResourceBase = {
  '@type'?: 'PhysicalResource' | 'LogicalResource';
  id: string;
  href?: string;
  name: string;
  resourceSpecificationId: string;
  resourceSpecification?: ResourceReference;
  resourceType?: string;
  status?: 'active' | 'inactive' | 'suspended' | 'terminated';
  administrativeState?: 'unlocked' | 'locked' | 'shuttingDown';
  operationalState?: 'enabled' | 'disabled';
  usageState?: 'idle' | 'active' | 'busy' | 'unknown';
  place?: ResourceReference;
  validFor?: TimePeriod;
  characteristic?: Array<{ name: string; value: unknown; valueType?: string; group?: string }>;
};

export type PhysicalResource = ResourceBase & {
  '@type'?: 'PhysicalResource';
  serialNumber?: string;
  partNumber?: string;
};

export type LogicalResource = ResourceBase & {
  '@type'?: 'LogicalResource';
  supportingPhysicalResourceId?: string;
};

export type ResourceEntity = PhysicalResource | LogicalResource;

export type ResourceWorkspaceSnapshot = {
  items: ResourceEntity[] | ResourceSpecification[];
  totalCount: number;
  resourceSpecificationOptions: ResourceSpecification[];
  resourceCategories: ResourceCategory[];
  resourceTypes: ResourceType[];
  manufacturerOptions: Party[];
};

export type ListParams = {
  limit: number;
  offset: number;
  status?: 'active' | 'inactive' | 'suspended' | 'terminated';
};

export type ResourceSpecificationPayload = {
  name?: string;
  category?: string;
  resourceType?: string;
  resourceLayerId?: string;
  description?: string;
  validFor?: TimePeriod;
  resourceSpecificationCharacteristic?: ResourceCharacteristic[];
  relatedParty?: Array<{ id: string; '@referredType': string; role?: string; name?: string }>;
};

export type PhysicalResourcePayload = {
  '@type'?: 'PhysicalResource';
  name?: string;
  resourceSpecificationId?: string;
  placeId?: string;
  placeType?: string;
  status?: PhysicalResource['status'];
  serialNumber?: string;
  partNumber?: string;
  validFor?: TimePeriod;
};

export type LogicalResourcePayload = {
  '@type'?: 'LogicalResource';
  name?: string;
  resourceSpecificationId?: string;
  placeId?: string;
  placeType?: string;
  status?: LogicalResource['status'];
  supportingPhysicalResourceId?: string;
  validFor?: TimePeriod;
};

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${bearerToken()}`,
});

const cleanObject = <T extends Record<string, unknown>>(value: T): Partial<T> => {
  const entries = Object.entries(value).filter(([, item]) => {
    if (item === undefined || item === null) return false;
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item === 'object') return Object.keys(item as Record<string, unknown>).length > 0;
    return true;
  });
  return Object.fromEntries(entries) as Partial<T>;
};

async function requestJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: authHeaders(),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : (undefined as T);

  if (!response.ok) {
    const message = extractErrorMessage(payload, response.status);
    throw new Error(message);
  }

  return payload;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return `Request failed (${status})`;
}

export async function listResourceSpecifications({
  limit,
  offset,
  includeEnded,
}: ListParams & { includeEnded?: boolean }): Promise<ResourceSpecification[]> {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (includeEnded) searchParams.set('includeEnded', 'true');
  return await requestJson<ResourceSpecification[]>(
    `${API_BASE_URL}/resourceCatalogManagement/v4/resourceSpecification?${searchParams.toString()}`,
  );
}

export async function listResourceCategories(): Promise<ResourceCategory[]> {
  return await requestJson<ResourceCategory[]>(
    '/tmf-api/resourceCatalogManagement/v4/resourceCategory',
  );
}

export async function listResourceTypes(): Promise<ResourceType[]> {
  return await requestJson<ResourceType[]>('/tmf-api/resourceCatalogManagement/v4/resourceType');
}

export async function listResourceLayers(): Promise<ResourceLayer[]> {
  return await requestJson<ResourceLayer[]>('/v1/resource-layers');
}

export async function createResourceLayer(
  payload: Required<Pick<ResourceLayerPayload, 'code' | 'name'>> & ResourceLayerPayload,
): Promise<ResourceLayer> {
  return await requestJson<ResourceLayer>('/v1/resource-layers', {
    method: 'POST',
    body: cleanObject(payload),
  });
}

export async function updateResourceLayer(
  id: string,
  payload: ResourceLayerPayload,
): Promise<ResourceLayer> {
  return await requestJson<ResourceLayer>(`/v1/resource-layers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cleanObject(payload),
  });
}

export async function deleteResourceLayer(id: string): Promise<ResourceLayer> {
  return await requestJson<ResourceLayer>(`/v1/resource-layers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function loadResourceWorkspaceSnapshot({
  tab,
  limit,
  offset,
  category,
  resourceSpecificationIdIn,
  resourceTypeIn,
  name,
}: {
  tab: ResourceTab;
  limit: number;
  offset: number;
  category?: string;
  resourceSpecificationIdIn?: string[];
  resourceTypeIn?: string[];
  name?: string;
}): Promise<ResourceWorkspaceSnapshot> {
  const searchParams = new URLSearchParams({
    tab,
    limit: String(limit),
    offset: String(offset),
  });
  if (category) searchParams.set('category', category);
  for (const id of resourceSpecificationIdIn ?? [])
    searchParams.append('resourceSpecificationIdIn', id);
  for (const type of resourceTypeIn ?? []) searchParams.append('resourceTypeIn', type);
  if (name) searchParams.set('name', name);
  return await requestJson<ResourceWorkspaceSnapshot>(
    `/v1/resource/workspace?${searchParams.toString()}`,
  );
}

export async function createResourceSpecification(
  payload: ResourceSpecificationPayload,
): Promise<ResourceSpecification> {
  return await requestJson<ResourceSpecification>(
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    {
      method: 'POST',
      body: cleanObject(payload),
    },
  );
}

export async function updateResourceSpecification(
  id: string,
  payload: ResourceSpecificationPayload,
): Promise<ResourceSpecification> {
  return await requestJson<ResourceSpecification>(
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: cleanObject(payload),
    },
  );
}

export async function deleteResourceSpecification(id: string): Promise<ResourceSpecification> {
  return await requestJson<ResourceSpecification>(
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
}

export type ResourceSpecificationBulkItem = {
  line: number;
  input: ResourceSpecificationPayload;
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

export async function bulkCreateResourceSpecifications(
  items: ResourceSpecificationBulkItem[],
): Promise<ResourceSpecificationBulkResult> {
  return await requestJson<ResourceSpecificationBulkResult>(
    '/v1/resource/specifications/bulk-import',
    {
      method: 'POST',
      body: { items },
    },
  );
}

export async function listResources({
  kind,
  limit,
  offset,
  status,
  name,
}: ListParams & { kind: Exclude<ResourceTab, 'ResourceSpecification'>; name?: string }): Promise<
  ResourceEntity[]
> {
  const searchParams = new URLSearchParams({
    kind,
    limit: String(limit),
    offset: String(offset),
  });
  if (status) searchParams.set('status', status);
  if (name) searchParams.set('name', name);
  return await requestJson<ResourceEntity[]>(
    `/tmf-api/resourceInventoryManagement/v4/resource?${searchParams.toString()}`,
  );
}

export async function createResource(
  payload: PhysicalResourcePayload | LogicalResourcePayload,
): Promise<ResourceEntity> {
  const resource = await requestJson<ResourceEntity>(
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      method: 'POST',
      body: cleanObject(payload as Record<string, unknown>),
    },
  );
  if (payload['@type'] === 'PhysicalResource') invalidateMapTiles();
  return resource;
}

export async function updateResource(
  id: string,
  payload: PhysicalResourcePayload | LogicalResourcePayload,
): Promise<ResourceEntity> {
  const resource = await requestJson<ResourceEntity>(
    `/tmf-api/resourceInventoryManagement/v4/resource/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: cleanObject(payload as Record<string, unknown>),
    },
  );
  if (payload['@type'] === 'PhysicalResource') invalidateMapTiles();
  return resource;
}

export type ResourceStatusCatalogEntry = {
  '@type': 'ResourceStatusCatalogEntry';
  code: string;
  name: string;
  resourceType?: string;
  sortOrder: number;
  active: boolean;
  behavior: 'active' | 'blocked' | 'planned' | 'inactive' | 'terminated';
};

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

export type ResourceDetailReference = {
  id: string;
  name?: string;
  '@referredType': string;
  resourceType?: string;
};

export type PhysicalResourceDetail = {
  '@type': 'PhysicalResourceDetail';
  resource: PhysicalResource & {
    statusCode?: string;
    label?: string;
    assetReference?: string;
    projectId?: string;
    createdAt: string;
    updatedAt: string;
  };
  specification: ResourceSpecification & {
    resourceTypeName: string;
    manufacturer?: ResourceDetailReference;
    model?: string;
    resourceLayer?: ResourceDetailReference & { code: string };
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
    // Presente também quando o place é um GeographicSite com endereço vinculado —
    // ver resolveDetailPlace no backend.
    sourceSystem?: string;
  };
  location?: ResourceDetailReference & {
    geometryType?: 'Point' | 'LineString' | 'Polygon';
    geometry?: GeoGeometry;
  };
  servingSite?: ResourceDetailReference;
  project?: ResourceDetailReference;
  childCount: number;
};

export type ResourcePortConnection = {
  resource: ResourceDetailReference & { name: string; '@referredType': 'PhysicalResource'; resourceType: string };
  active: boolean;
  validFor?: TimePeriod;
  /** ONT alimentada por este drop (via grafo físico), presente só na conexão ativa. */
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
  derivedUsageState: NonNullable<PhysicalResource['usageState']>;
  /** RFS ativo que referencia a porta; enriquecido pelo agregado de leitura do painel. */
  hasActiveService: boolean;
  drops: ResourcePortConnection[];
};

export type ResourcePortsView = {
  '@type': 'ResourcePortsView';
  ctoId: string;
  groups: Array<{
    splitter: ResourceDetailReference & { name: string; splitRatio?: string };
    ports: ResourcePortDetail[];
  }>;
};

export async function fetchResourcePorts(ctoId: string): Promise<ResourcePortsView> {
  return await requestJson<ResourcePortsView>(`/v1/resources/${encodeURIComponent(ctoId)}/ports`);
}

export async function fetchResourcePortDetail(portId: string): Promise<ResourcePortDetail> {
  return await requestJson<ResourcePortDetail>(`/v1/resources/${encodeURIComponent(portId)}/port-detail`);
}

export async function fetchPhysicalResourceDetail(id: string): Promise<PhysicalResourceDetail> {
  return await requestJson<PhysicalResourceDetail>(`/v1/resources/${encodeURIComponent(id)}/detail`);
}

export async function fetchPhysicalResourceAudit(id: string): Promise<ResourceAuditEntry[]> {
  return await requestJson<ResourceAuditEntry[]>(`/v1/resources/${encodeURIComponent(id)}/audit`);
}

export async function listResourceStatusCatalog(resourceType?: string): Promise<ResourceStatusCatalogEntry[]> {
  const searchParams = new URLSearchParams();
  if (resourceType) searchParams.set('resourceType', resourceType);
  const query = searchParams.toString();
  return await requestJson<ResourceStatusCatalogEntry[]>(`/v1/resource-statuses${query ? `?${query}` : ''}`);
}

export async function deleteResource(id: string): Promise<ResourceEntity> {
  const resource = await requestJson<ResourceEntity>(
    `/tmf-api/resourceInventoryManagement/v4/resource/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
  invalidateMapTiles();
  return resource;
}
