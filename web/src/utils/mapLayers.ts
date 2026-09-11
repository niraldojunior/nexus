// Controle de camadas do mapa Geo. A publicação do Studio é a fonte operacional; o catálogo
// canônico só mantém o mapa utilizável enquanto o control plane não tem publicação.

import type {
  StudioGeoCatalog,
  StudioGeoEntityNode,
  StudioGeoNode,
  StudioGeoSourceType,
} from '../services/studioGeoApi';
import type { GeoSiteRole } from '../services/geoApi';

export type MapSiteRole = GeoSiteRole;
export type MapLayerId = string;
export type MapLayerGroupId = string;
export type MapLayerVisibility = Record<MapLayerId, boolean>;
export type GroupVisibility = 'all' | 'some' | 'none';
export type ViewportShape = 'sites' | 'resource-points' | 'resource-lines';

export type MapLayerTreeNode = StudioGeoNode & { children: MapLayerTreeNode[] };

const group = (id: string, label: string, sortOrder: number, hint?: string): StudioGeoNode => ({
  id, kind: 'GROUP', parentNodeId: null, label, hint, sortOrder, active: true,
});
const entity = (
  id: string,
  parentNodeId: string,
  label: string,
  sortOrder: number,
  sourceType: StudioGeoSourceType,
  sourceId: string,
  hint?: string,
): StudioGeoEntityNode => ({
  id, kind: 'ENTITY', parentNodeId, label, hint, sortOrder, active: true, defaultVisible: true,
  entity: {
    category: sourceType === 'GEOGRAPHIC_SITE_SPECIFICATION' ? 'LOCAL' : sourceType === 'RESOURCE_TYPE' ? 'RESOURCE' : 'COVERAGE',
    sourceDomain: sourceType === 'GEOGRAPHIC_SITE_SPECIFICATION' ? 'location-model' : sourceType === 'RESOURCE_TYPE' ? 'resource-model' : 'spatial',
    sourceType, sourceId,
  },
});

export const MAP_LAYER_CATALOG_FALLBACK: StudioGeoCatalog = {
  schemaVersion: 2,
  fallback: true,
  nodes: [
    group('locations', 'Locais', 10),
    group('coverage', 'Cobertura', 20, 'Manchas agregadas por tema — hoje só GPON'),
    group('netwinInfrastructure', 'Infraestrutura Civil', 30),
    group('resources', 'Recursos de Rede', 40),
    entity('stations', 'locations', 'Estações', 10, 'GEOGRAPHIC_SITE_SPECIFICATION', 'legacy-stations'),
    entity('siteNetwork', 'locations', 'Sites de Rede', 20, 'GEOGRAPHIC_SITE_SPECIFICATION', 'legacy-site-network'),
    entity('siteService', 'locations', 'Sites de Serviço', 30, 'GEOGRAPHIC_SITE_SPECIFICATION', 'legacy-site-service'),
    entity('netwinTower', 'locations', 'Torres', 40, 'RESOURCE_TYPE', 'legacy-tower'),
    entity('coverage-gpon', 'coverage', 'Cobertura GPON', 10, 'GPON_AGGREGATE', 'gpon-aggregate'),
    entity('netwinPole', 'netwinInfrastructure', 'Postes', 10, 'RESOURCE_TYPE', 'legacy-pole'),
    entity('netwinDuct', 'netwinInfrastructure', 'Dutos', 20, 'RESOURCE_TYPE', 'legacy-duct'),
    entity('netwinManhole', 'netwinInfrastructure', 'Caixas Subterrâneas', 30, 'RESOURCE_TYPE', 'legacy-manhole'),
    entity('resourceCdoe', 'resources', 'CDOEs', 10, 'RESOURCE_TYPE', 'legacy-cdoe'),
    entity('resourceCdoi', 'resources', 'CDOIs', 20, 'RESOURCE_TYPE', 'legacy-cdoi'),
    entity('resourceCeo', 'resources', 'CEOs', 30, 'RESOURCE_TYPE', 'legacy-ceo'),
    entity('resourceDio', 'resources', 'DIOs', 40, 'RESOURCE_TYPE', 'legacy-dio'),
    entity('resourceFiberCable', 'resources', 'Cabos de Fibra', 50, 'RESOURCE_TYPE', 'legacy-fiber-cable'),
    entity('resourceDropCable', 'resources', 'Cabo Drop', 60, 'RESOURCE_TYPE', 'legacy-drop-cable'),
  ],
};

const compare = (left: StudioGeoNode, right: StudioGeoNode) =>
  left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);

export const mapLayerTree = (
  catalog: StudioGeoCatalog,
  options?: { pruneEmptyGroups?: boolean },
): readonly MapLayerTreeNode[] => {
  const pruneEmptyGroups = options?.pruneEmptyGroups ?? false;
  const activeNodes = catalog.nodes.filter((node) => node.active);
  const childrenByParent = new Map<string | null, StudioGeoNode[]>();
  for (const node of activeNodes) {
    const children = childrenByParent.get(node.parentNodeId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentNodeId, children);
  }
  const create = (node: StudioGeoNode): MapLayerTreeNode => ({
    ...node,
    children: (childrenByParent.get(node.id) ?? []).sort(compare).map(create),
  });
  const prune = (node: MapLayerTreeNode): MapLayerTreeNode | undefined => {
    if (!pruneEmptyGroups) return node;
    return node.kind === 'ENTITY' || node.children.length > 0 ? node : undefined;
  };
  return (childrenByParent.get(null) ?? [])
    .sort(compare)
    .map(create)
    .map(prune)
    .filter(Boolean) as MapLayerTreeNode[];
};

export const mapLayerEntities = (catalog: StudioGeoCatalog): StudioGeoEntityNode[] =>
  catalog.nodes.filter((node): node is StudioGeoEntityNode => node.kind === 'ENTITY' && node.active);

export const descendantEntities = (catalog: StudioGeoCatalog, groupId: string): StudioGeoEntityNode[] => {
  const byParent = new Map<string | null, StudioGeoNode[]>();
  for (const node of catalog.nodes.filter((candidate) => candidate.active)) {
    const children = byParent.get(node.parentNodeId) ?? [];
    children.push(node);
    byParent.set(node.parentNodeId, children);
  }
  const result: StudioGeoEntityNode[] = [];
  const visit = (parentId: string): void => {
    for (const node of byParent.get(parentId) ?? []) {
      if (node.kind === 'ENTITY') result.push(node);
      else visit(node.id);
    }
  };
  visit(groupId);
  return result;
};

export const defaultMapLayerVisibility = (catalog: StudioGeoCatalog): MapLayerVisibility =>
  Object.fromEntries(mapLayerEntities(catalog).map((node) => [node.id, node.defaultVisible]));

export const ALL_MAP_LAYERS_VISIBLE: MapLayerVisibility = Object.fromEntries(
  mapLayerEntities(MAP_LAYER_CATALOG_FALLBACK).map((node) => [node.id, true]),
);

export function groupVisibility(
  visibility: MapLayerVisibility,
  groupId: MapLayerGroupId,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
): GroupVisibility {
  const entities = descendantEntities(catalog, groupId);
  if (entities.length === 0) return 'none';
  const states = entities.map((node) => visibility[node.id] ?? node.defaultVisible);
  if (states.every(Boolean)) return 'all';
  if (states.every((state) => !state)) return 'none';
  return 'some';
}

export function setGroupVisibility(
  visibility: MapLayerVisibility,
  groupId: MapLayerGroupId,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
): MapLayerVisibility {
  const entities = descendantEntities(catalog, groupId);
  if (!entities.length) return visibility;
  const next = groupVisibility(visibility, groupId, catalog) === 'none';
  return { ...visibility, ...Object.fromEntries(entities.map((node) => [node.id, next])) };
}

type MapFeatureLayerLike = {
  kind: 'resource' | 'site' | 'coverage';
  shape: 'point' | 'line' | 'polygon';
  sourceModelType?: StudioGeoSourceType;
  sourceModelId?: string;
  // Transitional fields are only read by the canonical fallback until tile identity is migrated.
  typeCode?: string;
  label?: string;
  sublabel?: string;
};

const LEGACY_SOURCE_BY_FEATURE = (
  feature: MapFeatureLayerLike,
  roleByCode?: ReadonlyMap<string, unknown>,
): string | undefined => {
  if (feature.kind === 'site') {
    const role = feature.sublabel && roleByCode ? roleByCode.get(feature.sublabel) : undefined;
    if (role === 'service') return 'legacy-site-service';
    return 'legacy-site-network';
  }
  if (feature.typeCode === 'Tower') return 'legacy-tower';
  if (feature.typeCode === 'Pole') return 'legacy-pole';
  if (['Duct', 'RisingTube', 'CableTunnel', 'Pedestal', 'SupportBracket', 'IronPipe'].includes(feature.typeCode ?? '')) return 'legacy-duct';
  if (feature.typeCode === 'Manhole') return 'legacy-manhole';
  if (feature.typeCode === 'DIO') return 'legacy-dio';
  if (feature.typeCode === 'SpliceClosure') return 'legacy-ceo';
  if (['Fiber', 'DistributionCable', 'BackboneCable'].includes(feature.typeCode ?? '')) return 'legacy-fiber-cable';
  if (feature.typeCode === 'DropCable') return 'legacy-drop-cable';
  if (feature.typeCode === 'CTO') return feature.label?.toUpperCase().includes('CDOI') ? 'legacy-cdoi' : 'legacy-cdoe';
  return undefined;
};

export function nodeForMapFeature(
  feature: MapFeatureLayerLike,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
  roleByCode?: ReadonlyMap<string, unknown>,
): StudioGeoEntityNode | undefined {
  const sourceId =
    feature.sourceModelId ?? (catalog.fallback ? LEGACY_SOURCE_BY_FEATURE(feature, roleByCode) : undefined);
  if (!sourceId) return undefined;
  const sourceType = feature.sourceModelType;
  return mapLayerEntities(catalog).find(
    (candidate) =>
      candidate.entity.sourceId === sourceId &&
      (!sourceType || candidate.entity.sourceType === sourceType),
  );
}

export function isMapFeatureVisible(
  feature: MapFeatureLayerLike,
  visibility: MapLayerVisibility,
  roleByCode?: ReadonlyMap<string, unknown>,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
): boolean {
  const node = nodeForMapFeature(feature, catalog, roleByCode);
  if (!node) {
    // No fallback canônico de compatibilidade, recursos sem camada específica continuam visíveis.
    return Boolean(catalog.fallback && feature.kind === 'resource');
  }
  return visibility[node.id] ?? node.defaultVisible;
}

export function viewportInclude(
  visibility: MapLayerVisibility,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
): ViewportShape[] | undefined {
  const entities = mapLayerEntities(catalog).filter((node) =>
    node.id !== 'stations' && (visibility[node.id] ?? node.defaultVisible),
  );
  const shapes = new Set<ViewportShape>();
  for (const node of entities) {
    if (node.entity.sourceType === 'GEOGRAPHIC_SITE_SPECIFICATION') shapes.add('sites');
    if (node.entity.sourceType === 'RESOURCE_TYPE') {
      if (node.entity.sourceId.includes('cable')) shapes.add('resource-lines');
      else shapes.add('resource-points');
    }
  }
  const result = [...shapes];
  return result.length === 3 ? undefined : result;
}

export const hasVisibleGponAggregate = (visibility: MapLayerVisibility, catalog: StudioGeoCatalog): boolean =>
  mapLayerEntities(catalog).some((node) =>
    node.entity.sourceType === 'GPON_AGGREGATE' && (visibility[node.id] ?? node.defaultVisible),
  );

const STORAGE_KEY = 'nexus.geo.mapLayers';
const STORAGE_KEY_CONTROL_OPEN = 'nexus.geo.mapLayerControl.open';
const STORAGE_KEY_EXPANDED_GROUPS = 'nexus.geo.mapLayerControl.expandedGroups';

export function readStoredLayers(catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK): MapLayerVisibility {
  const defaults = defaultMapLayerVisibility(catalog);
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaults;
    const stored = parsed as Record<string, unknown>;
    return Object.fromEntries(Object.entries(defaults).map(([id, fallback]) => [id, typeof stored[id] === 'boolean' ? stored[id] : fallback]));
  } catch {
    return defaults;
  }
}

export function writeStoredLayers(visibility: MapLayerVisibility): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // Storage indisponível: a preferência só não persiste.
  }
}

export function readStoredLayerControlOpen(defaultOpen = false): boolean {
  if (typeof window === 'undefined') return defaultOpen;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CONTROL_OPEN);
    if (raw === null) return defaultOpen;
    return raw === 'true';
  } catch {
    return defaultOpen;
  }
}

export function writeStoredLayerControlOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_CONTROL_OPEN, open ? 'true' : 'false');
  } catch {
    // Storage indisponível: a preferência só não persiste.
  }
}

export function readStoredExpandedGroups(catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK): Set<string> {
  const allGroupIds = catalog.nodes.filter((n) => n.kind === 'GROUP').map((n) => n.id);
  const defaultSet = new Set(allGroupIds);
  if (typeof window === 'undefined') return defaultSet;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_EXPANDED_GROUPS);
    if (!raw) return defaultSet;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultSet;
    const validIds = new Set(allGroupIds);
    const filtered = (parsed as unknown[]).filter((id): id is string => typeof id === 'string' && validIds.has(id));
    return new Set(filtered);
  } catch {
    return defaultSet;
  }
}

export function writeStoredExpandedGroups(expandedGroups: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_EXPANDED_GROUPS, JSON.stringify(Array.from(expandedGroups)));
  } catch {
    // Storage indisponível: a preferência só não persiste.
  }
}
