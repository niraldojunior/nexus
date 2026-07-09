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
  administrativeState?: 'unlocked' | 'locked';
  operationalState?: 'enabled' | 'disabled';
  usageState?: 'idle' | 'busy' | 'unknown';
  place?: ResourceReference;
  validFor?: TimePeriod;
  characteristic?: Array<{ name: string; value: unknown; valueType?: string; group?: string }>;
};

export type PhysicalResource = ResourceBase & {
  '@type'?: 'PhysicalResource';
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  partNumber?: string;
};

export type LogicalResource = ResourceBase & {
  '@type'?: 'LogicalResource';
  supportingPhysicalResourceId?: string;
};

export type ResourceEntity = PhysicalResource | LogicalResource;

export type ListParams = {
  limit: number;
  offset: number;
  status?: 'active' | 'inactive' | 'suspended' | 'terminated';
};

export type ResourceSpecificationPayload = {
  name?: string;
  category?: string;
  resourceType?: string;
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
  manufacturer?: string;
  model?: string;
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
  Authorization: `Bearer ${localStorage.getItem('authToken') || 'change-me'}`,
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
  return await requestJson<ResourceCategory[]>('/tmf-api/resourceCatalogManagement/v4/resourceCategory');
}

export async function listResourceTypes(): Promise<ResourceType[]> {
  return await requestJson<ResourceType[]>('/tmf-api/resourceCatalogManagement/v4/resourceType');
}

export async function createResourceSpecification(payload: ResourceSpecificationPayload): Promise<ResourceSpecification> {
  return await requestJson<ResourceSpecification>('/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
    method: 'POST',
    body: cleanObject(payload),
  });
}

export async function updateResourceSpecification(
  id: string,
  payload: ResourceSpecificationPayload,
): Promise<ResourceSpecification> {
  return await requestJson<ResourceSpecification>(`/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cleanObject(payload),
  });
}

export async function deleteResourceSpecification(id: string): Promise<ResourceSpecification> {
  return await requestJson<ResourceSpecification>(`/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function listResources({
  kind,
  limit,
  offset,
  status,
}: ListParams & { kind: Exclude<ResourceTab, 'ResourceSpecification'> }): Promise<ResourceEntity[]> {
  const searchParams = new URLSearchParams({
    kind,
    limit: String(limit),
    offset: String(offset),
  });
  if (status) searchParams.set('status', status);
  return await requestJson<ResourceEntity[]>(`/tmf-api/resourceInventoryManagement/v4/resource?${searchParams.toString()}`);
}

export async function createResource(
  payload: PhysicalResourcePayload | LogicalResourcePayload,
): Promise<ResourceEntity> {
  return await requestJson<ResourceEntity>('/tmf-api/resourceInventoryManagement/v4/resource', {
    method: 'POST',
    body: cleanObject(payload as Record<string, unknown>),
  });
}

export async function updateResource(
  id: string,
  payload: PhysicalResourcePayload | LogicalResourcePayload,
): Promise<ResourceEntity> {
  return await requestJson<ResourceEntity>(`/tmf-api/resourceInventoryManagement/v4/resource/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cleanObject(payload as Record<string, unknown>),
  });
}

export async function deleteResource(id: string): Promise<ResourceEntity> {
  return await requestJson<ResourceEntity>(`/tmf-api/resourceInventoryManagement/v4/resource/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
