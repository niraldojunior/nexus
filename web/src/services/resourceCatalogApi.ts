import { bearerToken } from './session';
import type { ResourceType, ResourceSpecification } from './resourceApi';

export type ResourceCatalogNodeKind = 'GROUP' | 'RESOURCE_TYPE';
export type ResourceCatalogStatus = 'active' | 'inactive';

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
};

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
  resourceType?: {
    id: string;
    href: string;
    code: string;
    name: string;
    '@referredType': 'ResourceType';
  };
  status: ResourceCatalogStatus;
  sortOrder: number;
  metadata?: Record<string, unknown>;
  tenantId: string;
  createdBy?: string;
  updatedBy?: string;
};

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

export type ResourceCatalogPath = {
  catalog: { id: string; code: string; name: string };
  nodes: ResourceCatalogPathEntry[];
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

export type ResourceTypeCatalogContext = {
  resourceType: ResourceType;
  specifications: Array<{ id: string; href: string; name: string }>;
  catalogPaths: ResourceCatalogPath[];
};

export type CreateResourceCatalogNodeInput = {
  code: string;
  name: string;
  description?: string;
  kind: ResourceCatalogNodeKind;
  resourceTypeId?: string;
  parentNodeId?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

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

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${bearerToken()}`,
});

async function requestJson<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: authHeaders(),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : (undefined as T);
  if (!response.ok) {
    const record = payload as Record<string, unknown> | undefined;
    const message =
      (typeof record?.message === 'string' ? record.message : undefined) ??
      (typeof record?.error === 'string' ? record.error : undefined) ??
      `Falha na requisição (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export async function listResourceCatalogs(): Promise<ResourceCatalog[]> {
  return await requestJson<ResourceCatalog[]>('/v1/resource-catalogs');
}

export async function getResourceCatalog(id: string): Promise<ResourceCatalog> {
  return await requestJson<ResourceCatalog>(`/v1/resource-catalogs/${encodeURIComponent(id)}`);
}

export async function getResourceCatalogTree(
  catalogId: string,
  includeInactive = false,
): Promise<ResourceCatalogTreeNode[]> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return await requestJson<ResourceCatalogTreeNode[]>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/tree${query}`,
  );
}

export async function listResourceCatalogNodes(
  catalogId: string,
  includeInactive = false,
): Promise<ResourceCatalogNode[]> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return await requestJson<ResourceCatalogNode[]>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes${query}`,
  );
}

export async function getResourceCatalogNode(
  catalogId: string,
  nodeId: string,
): Promise<ResourceCatalogNode> {
  return await requestJson<ResourceCatalogNode>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes/${encodeURIComponent(nodeId)}`,
  );
}

export async function createResourceCatalogNode(
  catalogId: string,
  input: CreateResourceCatalogNodeInput,
): Promise<ResourceCatalogNode> {
  return await requestJson<ResourceCatalogNode>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes`,
    {
      method: 'POST',
      body: input,
    },
  );
}

export async function updateResourceCatalogNode(
  catalogId: string,
  nodeId: string,
  input: UpdateResourceCatalogNodeInput,
): Promise<ResourceCatalogNode> {
  return await requestJson<ResourceCatalogNode>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: 'PATCH',
      body: input,
    },
  );
}

export async function deleteResourceCatalogNode(
  catalogId: string,
  nodeId: string,
): Promise<ResourceCatalogNode> {
  return await requestJson<ResourceCatalogNode>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function moveResourceCatalogNode(
  catalogId: string,
  nodeId: string,
  input: MoveResourceCatalogNodeInput,
): Promise<ResourceCatalogNode> {
  return await requestJson<ResourceCatalogNode>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes/${encodeURIComponent(nodeId)}/move`,
    {
      method: 'POST',
      body: input,
    },
  );
}

export async function reorderResourceCatalogNodes(
  catalogId: string,
  input: ReorderResourceCatalogNodesInput,
): Promise<ResourceCatalogNode[]> {
  return await requestJson<ResourceCatalogNode[]>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes/reorder`,
    {
      method: 'POST',
      body: input,
    },
  );
}

export async function getResourceCatalogNodePath(
  catalogId: string,
  nodeId: string,
): Promise<ResourceCatalogPath> {
  return await requestJson<ResourceCatalogPath>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes/${encodeURIComponent(nodeId)}/path`,
  );
}

export async function getResourceCatalogNodeImpact(
  catalogId: string,
  nodeId: string,
): Promise<ResourceCatalogNodeImpact> {
  return await requestJson<ResourceCatalogNodeImpact>(
    `/v1/resource-catalogs/${encodeURIComponent(catalogId)}/nodes/${encodeURIComponent(nodeId)}/impact`,
  );
}

export async function getResourceTypeCatalogContext(
  resourceTypeId: string,
): Promise<ResourceTypeCatalogContext> {
  return await requestJson<ResourceTypeCatalogContext>(
    `/v1/resource-types/${encodeURIComponent(resourceTypeId)}/catalog-context`,
  );
}

export async function listResourceTypes(): Promise<ResourceType[]> {
  return await requestJson<ResourceType[]>('/v1/resource-types');
}

export async function listResourceSpecifications(query: {
  resourceTypeId?: string;
  includeEnded?: boolean;
} = {}): Promise<ResourceSpecification[]> {
  const params = new URLSearchParams();
  if (query.resourceTypeId) params.set('resourceTypeId', query.resourceTypeId);
  if (query.includeEnded) params.set('includeEnded', 'true');
  const queryStr = params.toString() ? `?${params.toString()}` : '';
  return await requestJson<ResourceSpecification[]>(
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification${queryStr}`,
  );
}
