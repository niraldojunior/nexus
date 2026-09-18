// Controle de camadas do mapa Geo. A publicação do Studio é a fonte operacional; o catálogo
// canônico só mantém o mapa utilizável enquanto o control plane não tem publicação.

import type {
  StudioGeoCatalog,
  StudioGeoEntityNode,
  StudioGeoNode,
  StudioGeoSourceType,
} from '../services/studioGeoApi';
import type { GeoSiteRole } from '../services/geoApi';
import { resolveScaleBandKey } from './studioGeoDefaults';

export type MapSiteRole = GeoSiteRole;
export type MapLayerId = string;
export type MapLayerGroupId = string;
export type MapLayerVisibility = Record<MapLayerId, boolean>;
export type GroupVisibility = 'all' | 'some' | 'none';
export type ViewportShape = 'sites' | 'resource-points' | 'resource-lines';

export type MapLayerTreeNode = StudioGeoNode & { children: MapLayerTreeNode[] };

const group = (id: string, label: string, sortOrder: number, hint?: string): StudioGeoNode => ({
  id,
  kind: 'GROUP',
  parentNodeId: null,
  label,
  hint,
  sortOrder,
  active: true,
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
  id,
  kind: 'ENTITY',
  parentNodeId,
  label,
  hint,
  sortOrder,
  active: true,
  defaultVisible: true,
  entity: {
    category:
      sourceType === 'GEOGRAPHIC_SITE_SPECIFICATION'
        ? 'LOCAL'
        : sourceType === 'RESOURCE_TYPE'
          ? 'RESOURCE'
          : 'COVERAGE',
    sourceDomain:
      sourceType === 'GEOGRAPHIC_SITE_SPECIFICATION'
        ? 'location-model'
        : sourceType === 'RESOURCE_TYPE'
          ? 'resource-model'
          : 'spatial',
    sourceType,
    sourceId,
  },
});

export const MAP_LAYER_CATALOG_FALLBACK: StudioGeoCatalog = {
  schemaVersion: 2,
  configured: false,
  environmentId: 'legacy',
  fallback: true,
  nodes: [
    group('locations', 'Locais', 10),
    group('coverage', 'Cobertura', 20, 'Manchas agregadas por tema — hoje só GPON'),
    group('netwinInfrastructure', 'Infraestrutura Civil', 30),
    group('resources', 'Recursos de Rede', 40),
    entity(
      'stations',
      'locations',
      'Estações',
      10,
      'GEOGRAPHIC_SITE_SPECIFICATION',
      'legacy-stations',
    ),
    entity(
      'siteNetwork',
      'locations',
      'Sites de Rede',
      20,
      'GEOGRAPHIC_SITE_SPECIFICATION',
      'legacy-site-network',
    ),
    entity(
      'siteService',
      'locations',
      'Sites de Serviço',
      30,
      'GEOGRAPHIC_SITE_SPECIFICATION',
      'legacy-site-service',
    ),
    entity('netwinTower', 'locations', 'Torres', 40, 'RESOURCE_TYPE', 'legacy-tower'),
    entity('coverage-gpon', 'coverage', 'Cobertura GPON', 10, 'GPON_AGGREGATE', 'gpon-aggregate'),
    entity('netwinPole', 'netwinInfrastructure', 'Postes', 10, 'RESOURCE_TYPE', 'legacy-pole'),
    entity('netwinDuct', 'netwinInfrastructure', 'Dutos', 20, 'RESOURCE_TYPE', 'legacy-duct'),
    entity(
      'netwinManhole',
      'netwinInfrastructure',
      'Caixas Subterrâneas',
      30,
      'RESOURCE_TYPE',
      'legacy-manhole',
    ),
    entity('resourceCdoe', 'resources', 'CDOEs', 10, 'RESOURCE_TYPE', 'legacy-cdoe'),
    entity('resourceCdoi', 'resources', 'CDOIs', 20, 'RESOURCE_TYPE', 'legacy-cdoi'),
    entity('resourceCeo', 'resources', 'CEOs', 30, 'RESOURCE_TYPE', 'legacy-ceo'),
    entity('resourceDio', 'resources', 'DIOs', 40, 'RESOURCE_TYPE', 'legacy-dio'),
    entity(
      'resourceFiberCable',
      'resources',
      'Cabos de Fibra',
      50,
      'RESOURCE_TYPE',
      'legacy-fiber-cable',
    ),
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
  // Defesa contra catálogo publicado com ciclo (nó que acaba sendo ancestral de si mesmo) — a
  // validação do Studio (STUDIO_GEO_NODE_CYCLE) deveria impedir isso na publicação, mas um
  // catálogo corrompido por fora desse caminho (dado antigo, migração manual) faria `create`
  // recursar infinitamente e derrubar a página inteira (RangeError: Maximum call stack size
  // exceeded). Corta o ciclo em vez de estourar a pilha.
  const ancestry = new Set<string>();
  const create = (node: StudioGeoNode): MapLayerTreeNode => {
    if (ancestry.has(node.id)) {
      console.error(
        `mapLayerTree: ciclo detectado no catálogo publicado envolvendo o nó "${node.id}" — filhos ignorados.`,
      );
      return { ...node, children: [] };
    }
    ancestry.add(node.id);
    const children = (childrenByParent.get(node.id) ?? []).sort(compare).map(create);
    ancestry.delete(node.id);
    return { ...node, children };
  };
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

/** Entidades na mesma travessia hierárquica usada pelo controle de camadas. */
export const mapLayerEntities = (catalog: StudioGeoCatalog): StudioGeoEntityNode[] => {
  const result: StudioGeoEntityNode[] = [];
  const visit = (nodes: readonly MapLayerTreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'ENTITY') result.push(node);
      visit(node.children);
    }
  };
  visit(mapLayerTree(catalog));
  return result;
};

/** Menor índice é a entidade mais frontal no Studio e no mapa. */
export function mapLayerVisualRank(
  node: StudioGeoEntityNode | undefined,
  catalog: StudioGeoCatalog,
): number {
  if (!node) return -1;
  const index = mapLayerEntities(catalog).findIndex((candidate) => candidate.id === node.id);
  return index === -1 ? -1 : index;
}

/** Canvas desenha fundo → frente, inverso da ordem exibida pelo Studio. */
export function mapLayerEntitiesForDraw(catalog: StudioGeoCatalog): StudioGeoEntityNode[] {
  return [...mapLayerEntities(catalog)].reverse();
}

export const descendantEntities = (
  catalog: StudioGeoCatalog,
  groupId: string,
): StudioGeoEntityNode[] => {
  const group = catalog.nodes.find(
    (node) => node.id === groupId && node.kind === 'GROUP' && node.active,
  );
  if (!group) return [];
  const result: StudioGeoEntityNode[] = [];
  const visit = (node: MapLayerTreeNode): void => {
    for (const child of node.children) {
      if (child.kind === 'ENTITY') result.push(child);
      else visit(child);
    }
  };
  const treeNode = (nodes: readonly MapLayerTreeNode[]): MapLayerTreeNode | undefined => {
    for (const node of nodes) {
      if (node.id === group.id) return node;
      const found = treeNode(node.children);
      if (found) return found;
    }
    return undefined;
  };
  const found = treeNode(mapLayerTree(catalog));
  if (found) visit(found);
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
  if (
    ['Duct', 'RisingTube', 'CableTunnel', 'Pedestal', 'SupportBracket', 'IronPipe'].includes(
      feature.typeCode ?? '',
    )
  )
    return 'legacy-duct';
  if (feature.typeCode === 'Manhole') return 'legacy-manhole';
  if (feature.typeCode === 'DIO') return 'legacy-dio';
  if (feature.typeCode === 'SpliceClosure') return 'legacy-ceo';
  if (['Fiber', 'DistributionCable', 'BackboneCable'].includes(feature.typeCode ?? ''))
    return 'legacy-fiber-cable';
  if (feature.typeCode === 'DropCable') return 'legacy-drop-cable';
  if (feature.typeCode === 'CTO')
    return feature.label?.toUpperCase().includes('CDOI') ? 'legacy-cdoi' : 'legacy-cdoe';
  return undefined;
};

export function nodeForMapFeature(
  feature: MapFeatureLayerLike,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
  roleByCode?: ReadonlyMap<string, unknown>,
): StudioGeoEntityNode | undefined {
  const sourceId =
    feature.sourceModelId ??
    (catalog.fallback ? LEGACY_SOURCE_BY_FEATURE(feature, roleByCode) : undefined);
  if (!sourceId) return undefined;
  const sourceType = feature.sourceModelType;
  return mapLayerEntities(catalog).find(
    (candidate) =>
      candidate.entity.sourceId === sourceId &&
      (!sourceType || candidate.entity.sourceType === sourceType),
  );
}

export function isStudioGeoEntityVisible(
  node: StudioGeoEntityNode,
  visibility: MapLayerVisibility,
  scaleMeters?: number | null,
): boolean {
  if (!(visibility[node.id] ?? node.defaultVisible)) return false;
  if (scaleMeters === undefined || scaleMeters === null || !node.visualConfig) return true;
  return node.visualConfig.scaleBands[resolveScaleBandKey(scaleMeters)]?.visible !== false;
}

export function isMapFeatureVisible(
  feature: MapFeatureLayerLike,
  visibility: MapLayerVisibility,
  roleByCode?: ReadonlyMap<string, unknown>,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
  scaleMeters?: number | null,
): boolean {
  const node = nodeForMapFeature(feature, catalog, roleByCode);
  if (!node) {
    // No fallback canônico de compatibilidade, recursos sem camada específica continuam visíveis.
    return Boolean(catalog.fallback && feature.kind === 'resource');
  }
  return isStudioGeoEntityVisible(node, visibility, scaleMeters);
}

// `legacy-cable`-like ids são a única identidade de LINE no catálogo canônico de compatibilidade
// — dutos e demais RESOURCE_TYPE ficam como POINT até haver publicação Studio GEO real.
const fallbackGeometryKind = (node: StudioGeoEntityNode): 'POINT' | 'LINE' | undefined => {
  if (!node.entity.sourceId.startsWith('legacy-')) return undefined;
  if (node.entity.category === 'LOCAL') return 'POINT';
  return node.entity.sourceId.includes('cable') ? 'LINE' : 'POINT';
};

export function viewportInclude(
  visibility: MapLayerVisibility,
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
  scaleMeters?: number | null,
): ViewportShape[] | undefined {
  const shapes = new Set<ViewportShape>();
  for (const node of mapLayerEntities(catalog)) {
    // Estações não são buscadas por viewport de tile — vêm da árvore Geo, não de `useMapTiles`.
    if (node.id === 'stations') continue;
    if (!isStudioGeoEntityVisible(node, visibility, scaleMeters)) continue;
    // A publicação sempre declara a geometria. A inferência abaixo existe exclusivamente para o
    // catálogo canônico de compatibilidade enquanto ainda não há publicação Studio GEO.
    const geometryKind =
      node.visualConfig?.geometryKind ??
      (catalog.fallback ? fallbackGeometryKind(node) : undefined);
    if (node.entity.category === 'LOCAL' && geometryKind === 'POINT') shapes.add('sites');
    if (node.entity.category === 'RESOURCE' && geometryKind === 'POINT')
      shapes.add('resource-points');
    if (node.entity.category === 'RESOURCE' && geometryKind === 'LINE')
      shapes.add('resource-lines');
  }
  const result = [...shapes];
  return result.length === 3 ? undefined : result;
}

export const hasVisibleGponAggregate = (
  visibility: MapLayerVisibility,
  catalog: StudioGeoCatalog,
  scaleMeters?: number | null,
): boolean =>
  mapLayerEntities(catalog).some(
    (node) =>
      node.entity.sourceType === 'GPON_AGGREGATE' &&
      isStudioGeoEntityVisible(node, visibility, scaleMeters),
  );

const STORAGE_KEY_BASE = 'nexus.geo.mapLayers';
const STORAGE_KEY_CONTROL_OPEN_BASE = 'nexus.geo.mapLayerControl.open';
const STORAGE_KEY_EXPANDED_GROUPS_BASE = 'nexus.geo.mapLayerControl.expandedGroups';
// Preferências antigas (sem namespace) migram uma única vez para o primeiro ambiente legacy que
// ainda não tiver chave própria — um ambiente empty nunca lê nem apaga essas chaves legadas.
// 'legacy' é o environmentId que EnvironmentProfileRepository.get() devolve para todo namespace
// sem linha própria em nexus_environment (schema pré-v17 ou perfil nunca marcado).
const LEGACY_MIGRATION_ENVIRONMENT_ID = 'legacy';

const namespacedKey = (base: string, environmentId: string): string => `${base}::${environmentId}`;

const migrateLegacyKey = (base: string, environmentId: string): void => {
  if (typeof window === 'undefined' || environmentId !== LEGACY_MIGRATION_ENVIRONMENT_ID) return;
  try {
    const namespaced = namespacedKey(base, environmentId);
    if (window.localStorage.getItem(namespaced) !== null) return;
    const legacy = window.localStorage.getItem(base);
    if (legacy !== null) window.localStorage.setItem(namespaced, legacy);
  } catch {
    // Storage indisponível: segue sem migrar, sem quebrar leitura/escrita.
  }
};

export function readStoredLayers(
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
): MapLayerVisibility {
  const defaults = defaultMapLayerVisibility(catalog);
  if (typeof window === 'undefined') return defaults;
  migrateLegacyKey(STORAGE_KEY_BASE, catalog.environmentId);
  try {
    const raw = window.localStorage.getItem(namespacedKey(STORAGE_KEY_BASE, catalog.environmentId));
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaults;
    const stored = parsed as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(defaults).map(([id, fallback]) => [
        id,
        typeof stored[id] === 'boolean' ? stored[id] : fallback,
      ]),
    );
  } catch {
    return defaults;
  }
}

export function writeStoredLayers(visibility: MapLayerVisibility, environmentId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      namespacedKey(STORAGE_KEY_BASE, environmentId),
      JSON.stringify(visibility),
    );
  } catch {
    // Storage indisponível: a preferência só não persiste.
  }
}

export function readStoredLayerControlOpen(environmentId: string, defaultOpen = false): boolean {
  if (typeof window === 'undefined') return defaultOpen;
  migrateLegacyKey(STORAGE_KEY_CONTROL_OPEN_BASE, environmentId);
  try {
    const raw = window.localStorage.getItem(
      namespacedKey(STORAGE_KEY_CONTROL_OPEN_BASE, environmentId),
    );
    if (raw === null) return defaultOpen;
    return raw === 'true';
  } catch {
    return defaultOpen;
  }
}

export function writeStoredLayerControlOpen(open: boolean, environmentId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      namespacedKey(STORAGE_KEY_CONTROL_OPEN_BASE, environmentId),
      open ? 'true' : 'false',
    );
  } catch {
    // Storage indisponível: a preferência só não persiste.
  }
}

export function readStoredExpandedGroups(
  catalog: StudioGeoCatalog = MAP_LAYER_CATALOG_FALLBACK,
): Set<string> {
  const allGroupIds = catalog.nodes.filter((n) => n.kind === 'GROUP').map((n) => n.id);
  const defaultSet = new Set(allGroupIds);
  if (typeof window === 'undefined') return defaultSet;
  migrateLegacyKey(STORAGE_KEY_EXPANDED_GROUPS_BASE, catalog.environmentId);
  try {
    const raw = window.localStorage.getItem(
      namespacedKey(STORAGE_KEY_EXPANDED_GROUPS_BASE, catalog.environmentId),
    );
    if (!raw) return defaultSet;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultSet;
    const validIds = new Set(allGroupIds);
    const filtered = (parsed as unknown[]).filter(
      (id): id is string => typeof id === 'string' && validIds.has(id),
    );
    return new Set(filtered);
  } catch {
    return defaultSet;
  }
}

export function writeStoredExpandedGroups(
  expandedGroups: Set<string>,
  environmentId: string,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      namespacedKey(STORAGE_KEY_EXPANDED_GROUPS_BASE, environmentId),
      JSON.stringify(Array.from(expandedGroups)),
    );
  } catch {
    // Storage indisponível: a preferência só não persiste.
  }
}
