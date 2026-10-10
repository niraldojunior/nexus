import type { ResourceKind, ResourceStatus } from './domain.js';

export type InternalPlantLocationNodeKind = 'country' | 'uf' | 'city' | 'site-type' | 'site';

export type InternalPlantVisualIdentity =
  { kind: 'system'; iconCode: string } | { kind: 'asset'; assetId: string };

export type InternalPlantLocationNode = {
  id: string;
  kind: InternalPlantLocationNodeKind;
  label: string;
  sublabel?: string;
  refId?: string;
  referredType?: 'GeographicSite';
  siteCategory?: string;
  siteSpecificationId?: string;
  visualIdentity?: InternalPlantVisualIdentity;
  status?: string;
  hasChildren: boolean;
  childCount?: number;
};

export type InternalPlantLocationRootNode = InternalPlantLocationNode & {
  parentId: string | null;
};

export type InternalPlantLocationChildrenPage = {
  nodeId: string;
  nodes: InternalPlantLocationNode[];
  total: number;
  limit: number;
  offset: number;
};

export type InternalPlantResourceQuery = {
  q?: string;
  siteId?: string;
  resourceTypeIdIn?: string[];
  limit: number;
  offset: number;
  tenantId: string;
};

export type InternalPlantResourceRow = {
  id: string;
  '@type': ResourceKind;
  name: string;
  status: ResourceStatus;
  resourceType: {
    id: string;
    code: string;
    name: string;
    iconCode?: string;
    iconAssetId?: string;
  };
  resourceSpecification: {
    id: string;
    name: string;
  };
  place?: {
    id: string;
    name: string;
  };
  stateOrProvince?: string;
  city?: string;
};

export type InternalPlantResourcePage = {
  items: InternalPlantResourceRow[];
  total: number;
  limit: number;
  offset: number;
};
