import { bearerToken } from './session';

export type VisualIdentity =
  | { kind: 'system'; iconCode: string }
  | { kind: 'asset'; assetId: string };

export type StudioGeoEntityCategory = 'LOCAL' | 'COVERAGE' | 'RESOURCE';
export type StudioGeoNodeKind = 'GROUP' | 'ENTITY';
export type StudioGeoSourceDomain = 'location-model' | 'spatial' | 'resource-model';
export type StudioGeoSourceType =
  | 'GEOGRAPHIC_SITE_SPECIFICATION'
  | 'SPATIAL_COVERAGE'
  | 'GPON_AGGREGATE'
  | 'RESOURCE_TYPE';

export type StudioGeoEntityReference = {
  category: StudioGeoEntityCategory;
  sourceDomain: StudioGeoSourceDomain;
  sourceType: StudioGeoSourceType;
  sourceId: string;
};

export type StudioGeoGroupNode = {
  id: string;
  kind: 'GROUP';
  parentNodeId: string | null;
  label: string;
  hint?: string;
  sortOrder: number;
  active: boolean;
  assetId?: string;
};

export type StudioGeoScaleBandKey =
  | 'le5m'
  | 'le10m'
  | 'le20m'
  | 'le50m'
  | 'le100m'
  | 'le500m'
  | 'le1km'
  | 'gt1km';

export type StudioGeoScaleVisibility = {
  visible: boolean;
};

export type StudioGeoScalePointConfig = StudioGeoScaleVisibility & {
  sizePx: number;
};

export type StudioGeoScaleStrokeConfig = StudioGeoScaleVisibility & {
  strokeWidth: number;
};

export type StudioGeoColorMode = 'fixed' | 'status';

export type StudioGeoColorRule = {
  mode: StudioGeoColorMode;
  defaultColor: string;
  statusColors: Record<string, string>;
};

export type StudioGeoStrokeStyle = 'solid' | 'dashed' | 'dotted' | 'animated-dotted';

export type StudioGeoPointVisualConfig = {
  geometryKind: 'POINT';
  color: StudioGeoColorRule;
  opacity: number;
  scaleBands: Record<StudioGeoScaleBandKey, StudioGeoScalePointConfig>;
};

export type StudioGeoLineVisualConfig = {
  geometryKind: 'LINE';
  stroke: StudioGeoColorRule;
  strokeStyle: StudioGeoStrokeStyle;
  opacity: number;
  scaleBands: Record<StudioGeoScaleBandKey, StudioGeoScaleStrokeConfig>;
};

export type StudioGeoPolygonVisualConfig = {
  geometryKind: 'POLYGON';
  stroke: StudioGeoColorRule;
  strokeStyle: StudioGeoStrokeStyle;
  strokeOpacity: number;
  fill: StudioGeoColorRule;
  fillOpacity: number;
  scaleBands: Record<StudioGeoScaleBandKey, StudioGeoScaleStrokeConfig>;
};

export type StudioGeoVisualConfig =
  | StudioGeoPointVisualConfig
  | StudioGeoLineVisualConfig
  | StudioGeoPolygonVisualConfig;

export type StudioGeoEntityNode = {
  id: string;
  kind: 'ENTITY';
  parentNodeId: string | null;
  label: string;
  hint?: string;
  sortOrder: number;
  active: boolean;
  /** Projeção pública da identidade canônica do modelo; não integra o snapshot do Studio GEO. */
  visualIdentity?: VisualIdentity;
  defaultVisible: boolean;
  entity: StudioGeoEntityReference;
  visualConfig?: StudioGeoVisualConfig;
};

export type StudioGeoNode = StudioGeoGroupNode | StudioGeoEntityNode;

export type StudioGeoCatalog = {
  schemaVersion: 2 | 3;
  nodes: StudioGeoNode[];
  /** Whether an explicit Studio GEO publication exists for the current tenant. */
  configured: boolean;
  /** Stable public namespace identity for browser-only map preferences. */
  environmentId: string;
  publicationChecksum?: string;
  fallback: boolean;
};

let catalogRequest: Promise<StudioGeoCatalog> | null = null;

export async function getPublishedMapLayerCatalog(): Promise<StudioGeoCatalog> {
  if (!catalogRequest) {
    catalogRequest = fetch('/v1/geo/map-layer-catalog', {
      headers: { Authorization: `Bearer ${bearerToken()}` },
    })
      .then(async (response) => {
        const text = await response.text();
        const payload = text ? (JSON.parse(text) as StudioGeoCatalog) : undefined;
        if (!response.ok || !payload) throw new Error(`Falha ao carregar camadas (${response.status})`);
        return payload;
      })
      .finally(() => {
        catalogRequest = null;
      });
  }
  return await catalogRequest;
}
