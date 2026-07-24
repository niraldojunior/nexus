import type { ResourceCharacteristic, TimePeriod } from './resourceApi';

/**
 * Cliente do Módulo de Serviços (TMF633 Service Catalog + TMF638 Service Inventory).
 *
 * Espelha `resourceApi.ts`: um snapshot agregado (`/v1/service/workspace`) alimenta a página e o
 * CRUD vai direto às rotas TMF canônicas.
 */

const API_BASE_URL = '/tmf-api';
const CATALOG_BASE = `${API_BASE_URL}/serviceCatalogManagement/v4`;
const INVENTORY_BASE = `${API_BASE_URL}/serviceInventoryManagement/v4/service`;

type FetchJsonOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export type ServiceTab = 'CustomerFacingService' | 'ResourceFacingService' | 'ServiceSpecification';

export type ServiceKind = 'CustomerFacingService' | 'ResourceFacingService';

export type ServiceSpecificationType = 'CFS' | 'RFS' | 'Other';

/** Ciclo de vida canônico TMF638. `terminated` é terminal; "suspenso" não é estado (ver §10.3). */
export type ServiceState =
  | 'feasibilityChecked'
  | 'designed'
  | 'reserved'
  | 'inactive'
  | 'active'
  | 'terminated';

export type ServiceStatus = 'active' | 'inactive' | 'suspended' | 'terminated';

export type RelatedParty = {
  id: string;
  '@referredType': string;
  role?: string;
  name?: string;
};

export type ServiceReference = {
  id: string;
  '@referredType': string;
  role?: string;
  name?: string;
};

export type ServiceRelationship = {
  id: string;
  relationshipType: string;
  '@referredType': string;
  validFor?: TimePeriod;
};

export type ServiceSpecification = {
  '@type'?: 'ServiceSpecification';
  id: string;
  href?: string;
  name: string;
  /** String livre no TMF — é a chave de junção com a categoria exibida no submenu. */
  category: string;
  serviceType: ServiceSpecificationType;
  description?: string;
  validFor?: TimePeriod;
  serviceSpecificationCharacteristic: ResourceCharacteristic[];
  relatedParty: RelatedParty[];
};

export type ServiceCategory = {
  '@type'?: 'ServiceCategory';
  id: string;
  href?: string;
  /** Não existe no modelo TMF do backend; derivado no frontend a partir de `spec.category`. */
  code: string;
  name: string;
  description?: string;
  parentServiceCategory?: ServiceReference;
  validFor?: TimePeriod;
  serviceCategoryCharacteristic?: ResourceCharacteristic[];
};

export type ServiceCandidate = {
  '@type'?: 'ServiceCandidate';
  id: string;
  href?: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  serviceSpecification: ServiceReference;
  serviceCategory?: ServiceReference;
  validFor?: TimePeriod;
  serviceCandidateCharacteristic: ResourceCharacteristic[];
};

export type ServiceBase = {
  id: string;
  href?: string;
  name: string;
  serviceSpecificationId: string;
  serviceSpecification?: ServiceReference;
  serviceType?: string;
  category?: string;
  state: ServiceState;
  serviceDate?: string;
  startDate?: string;
  endDate?: string;
  isServiceEnabled?: boolean;
  hasStarted?: boolean;
  serviceCharacteristic: ResourceCharacteristic[];
  relatedParty: RelatedParty[];
  place: ServiceReference[];
  serviceRelationship: ServiceRelationship[];
  validFor?: TimePeriod;
};

export type CustomerFacingService = ServiceBase & {
  '@type': 'CustomerFacingService';
  subscriberId: string;
  supportingService: ServiceReference[];
};

export type ResourceFacingService = ServiceBase & {
  '@type': 'ResourceFacingService';
  supportingResource: ServiceReference[];
  supportingService: ServiceReference[];
};

export type ServiceEntity = CustomerFacingService | ResourceFacingService;

export type ServiceWorkspaceSnapshot = {
  serviceSpecificationOptions: ServiceSpecification[];
  serviceCategories: ServiceCategory[];
  serviceCandidates: ServiceCandidate[];
  customerFacingServices: CustomerFacingService[];
  resourceFacingServices: ResourceFacingService[];
};

export type ServiceSpecificationPayload = {
  name?: string;
  category?: string;
  serviceType?: ServiceSpecificationType;
  description?: string;
  validFor?: TimePeriod;
  serviceSpecificationCharacteristic?: ResourceCharacteristic[];
  relatedParty?: RelatedParty[];
};

export type CustomerFacingServicePayload = {
  '@type'?: 'CustomerFacingService';
  name?: string;
  serviceSpecificationId?: string;
  subscriberId?: string;
  state?: ServiceState;
  category?: string;
  supportingService?: ServiceReference[];
  relatedParty?: RelatedParty[];
  place?: ServiceReference[];
  serviceCharacteristic?: ResourceCharacteristic[];
  validFor?: TimePeriod;
};

export type ResourceFacingServicePayload = {
  '@type'?: 'ResourceFacingService';
  name?: string;
  serviceSpecificationId?: string;
  state?: ServiceState;
  category?: string;
  supportingResource?: ServiceReference[];
  supportingService?: ServiceReference[];
  place?: ServiceReference[];
  serviceCharacteristic?: ResourceCharacteristic[];
  validFor?: TimePeriod;
};

export type ServicePayload = CustomerFacingServicePayload | ResourceFacingServicePayload;

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
    throw new Error(extractErrorMessage(payload, response.status));
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

export async function loadServiceWorkspaceSnapshot({
  tab,
  category,
}: {
  tab: ServiceTab;
  category?: string;
}): Promise<ServiceWorkspaceSnapshot> {
  const searchParams = new URLSearchParams({ tab });
  if (category) searchParams.set('category', category);
  return await requestJson<ServiceWorkspaceSnapshot>(`/v1/service/workspace?${searchParams.toString()}`);
}

export async function createServiceSpecification(
  payload: ServiceSpecificationPayload,
): Promise<ServiceSpecification> {
  return await requestJson<ServiceSpecification>(`${CATALOG_BASE}/serviceSpecification`, {
    method: 'POST',
    body: cleanObject(payload),
  });
}

export async function updateServiceSpecification(
  id: string,
  payload: ServiceSpecificationPayload,
): Promise<ServiceSpecification> {
  return await requestJson<ServiceSpecification>(
    `${CATALOG_BASE}/serviceSpecification/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: cleanObject(payload) },
  );
}

/** Soft-terminate (C6): o backend marca a spec como encerrada; nada é removido fisicamente. */
export async function deleteServiceSpecification(id: string): Promise<ServiceSpecification> {
  return await requestJson<ServiceSpecification>(
    `${CATALOG_BASE}/serviceSpecification/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function createService(payload: ServicePayload): Promise<ServiceEntity> {
  return await requestJson<ServiceEntity>(INVENTORY_BASE, {
    method: 'POST',
    body: cleanObject(payload),
  });
}

export async function updateService(id: string, payload: ServicePayload): Promise<ServiceEntity> {
  return await requestJson<ServiceEntity>(`${INVENTORY_BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cleanObject(payload),
  });
}

/** Soft-terminate (C6): leva o serviço a `state='terminated'`; não é DELETE físico. */
export async function terminateService(id: string): Promise<ServiceEntity> {
  return await requestJson<ServiceEntity>(`${INVENTORY_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
