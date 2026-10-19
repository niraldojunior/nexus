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

export type InternalPlantSiteContext = {
  site: {
    id: string;
    name: string;
    specificationName: string;
    visualIdentity?: InternalPlantVisualIdentity;
  };
  /** Cadeia da raiz ao local selecionado, com nome da instância e seu tipo de Site. */
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
  /** Ids dos nós da árvore de Locais, do país ao Site (mesmos formatos de `roots`/`children`). */
  treePath: string[];
};

export type InternalPlantSiteQuery = {
  q: string;
  limit: number;
  offset: number;
  tenantId: string;
};

export type InternalPlantSiteRow = {
  id: string;
  name: string;
  status: string;
  siteSpecification: { id: string; name: string };
  visualIdentity?: InternalPlantVisualIdentity;
  /** Endereço do Site em uma linha (logradouro, localidade, cidade, UF, CEP). */
  address?: string;
  /** Município do Site raiz da cadeia, quando houver. */
  stateOrProvince?: string;
  city?: string;
};

export type InternalPlantSitePage = {
  items: InternalPlantSiteRow[];
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
  /** Estado granular do catálogo (ex.: planned, designed), quando há. */
  statusCode?: string;
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
    manufacturer?: { id: string; name?: string };
  };
  place?: {
    id: string;
    name: string;
  };
  /** Contexto administrativo do Site em `place`, quando disponível. */
  stateOrProvince?: string;
  city?: string;
};

export type InternalPlantResourcePage = {
  items: InternalPlantResourceRow[];
  total: number;
  limit: number;
  offset: number;
};
