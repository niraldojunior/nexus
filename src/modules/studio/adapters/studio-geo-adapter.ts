import { AppError } from '../../../shared/errors/app-error.js';
import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import type { ResourceType } from '../../resource/domain.js';
import type { VisualIdentity } from '../../../shared/ui/visual-identity.js';

/** Snapshot v1, kept only to normalize historical publications and drafts. */
export type StudioGeoLayerShape = 'stations' | 'sites' | 'resource-points' | 'resource-lines' | 'coverage';
export type StudioGeoLayerMatcher =
  | 'stations'
  | 'site-network'
  | 'site-service'
  | 'tower'
  | 'coverage'
  | 'pole'
  | 'duct'
  | 'manhole'
  | 'cdoe'
  | 'cdoi'
  | 'ceo'
  | 'dio'
  | 'fiber-cable'
  | 'drop-cable';

export type StudioGeoLayerSnapshot = {
  id: string;
  groupId: string;
  label: string;
  hint?: string;
  sortOrder: number;
  defaultVisible: boolean;
  shape: StudioGeoLayerShape;
  matcher: StudioGeoLayerMatcher;
  active: boolean;
  assetId?: string;
};

export type StudioGeoGroupSnapshot = {
  id: string;
  label: string;
  hint?: string;
  sortOrder: number;
  active: boolean;
};

export type StudioGeoSnapshotV1 = {
  groups: StudioGeoGroupSnapshot[];
  layers: StudioGeoLayerSnapshot[];
};

export type StudioGeoEntityCategory = 'LOCAL' | 'COVERAGE' | 'RESOURCE';
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
  assetId?: string;
  defaultVisible: boolean;
  entity: StudioGeoEntityReference;
  visualConfig?: StudioGeoVisualConfig;
};

export type StudioGeoNode = StudioGeoGroupNode | StudioGeoEntityNode;

export type StudioGeoSnapshot = {
  schemaVersion: 3;
  nodes: StudioGeoNode[];
};

export type StudioGeoCatalogNode = StudioGeoGroupNode | (StudioGeoEntityNode & {
  /** Identidade efetiva composta pelo read model; nunca faz parte do snapshot Studio GEO. */
  visualIdentity?: VisualIdentity;
});

export type StudioGeoCatalog = Omit<StudioGeoSnapshot, 'nodes'> & {
  nodes: StudioGeoCatalogNode[];
  /** Indica se existe uma publicação explícita do Studio GEO para o tenant. */
  configured: boolean;
  /** Identidade pública e estável do namespace para preferências locais do mapa. */
  environmentId: string;
  publicationChecksum?: string;
  fallback: boolean;
};

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const entitySourceForLegacyMatcher = (matcher: StudioGeoLayerMatcher): StudioGeoEntityReference => {
  if (matcher === 'coverage') {
    return { category: 'COVERAGE', sourceDomain: 'spatial', sourceType: 'GPON_AGGREGATE', sourceId: 'gpon-aggregate' };
  }
  if (matcher === 'stations' || matcher.startsWith('site-')) {
    return { category: 'LOCAL', sourceDomain: 'location-model', sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION', sourceId: `legacy-${matcher}` };
  }
  return { category: 'RESOURCE', sourceDomain: 'resource-model', sourceType: 'RESOURCE_TYPE', sourceId: `legacy-${matcher}` };
};

const compareNodes = (left: StudioGeoNode, right: StudioGeoNode) =>
  left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);

const DEFAULT_STATUS_COLORS: Record<StudioGeoEntityCategory, Record<string, string>> = {
  RESOURCE: {
    active: '#047857',
    inactive: '#64748b',
    suspended: '#ef4444',
    terminated: '#334155',
  },
  LOCAL: {
    Planned: '#f59e0b',
    InConstruction: '#2563eb',
    Active: '#047857',
    InDeactivation: '#ef4444',
    Retired: '#64748b',
  },
  COVERAGE: {
    Planned: '#f59e0b',
    InConstruction: '#2563eb',
    Active: '#047857',
    InDeactivation: '#ef4444',
    Retired: '#64748b',
  },
};

const defaultColorRule = (
  category: StudioGeoEntityCategory,
  defaultColor: string,
): StudioGeoColorRule => ({
  mode: 'fixed',
  defaultColor,
  statusColors: { ...DEFAULT_STATUS_COLORS[category] },
});

const normalizeColorRule = (
  value: unknown,
  fallback: StudioGeoColorRule,
): StudioGeoColorRule => {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<StudioGeoColorRule>;
  const statusColors =
    candidate.statusColors && typeof candidate.statusColors === 'object'
      ? Object.fromEntries(
          Object.entries(candidate.statusColors).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  return {
    mode: candidate.mode === 'status' ? 'status' : 'fixed',
    defaultColor:
      typeof candidate.defaultColor === 'string' ? candidate.defaultColor : fallback.defaultColor,
    statusColors: { ...fallback.statusColors, ...statusColors },
  };
};

const normalizeVisualConfig = (
  visualConfig: unknown,
  category: StudioGeoEntityCategory,
): StudioGeoVisualConfig | undefined => {
  if (!visualConfig || typeof visualConfig !== 'object') return undefined;
  const candidate = visualConfig as Record<string, unknown> & {
    geometryKind?: unknown;
    scaleBands?: Record<string, Record<string, unknown>>;
  };
  const bands = candidate.scaleBands ?? {};
  if (candidate.geometryKind === 'POINT') {
    const fallbackColor = defaultColorRule(category, category === 'LOCAL' ? '#8b5cf6' : '#10b981');
    return {
      geometryKind: 'POINT',
      color: normalizeColorRule(candidate.color, fallbackColor),
      opacity: typeof candidate.opacity === 'number' ? candidate.opacity : 1,
      scaleBands: Object.fromEntries(
        SCALE_BAND_KEYS.map((key) => [
          key,
          {
            visible: bands[key]?.visible,
            sizePx: bands[key]?.sizePx,
          },
        ]),
      ) as StudioGeoPointVisualConfig['scaleBands'],
    };
  }
  if (candidate.geometryKind === 'LINE') {
    const legacyColor =
      typeof candidate.strokeColor === 'string' ? candidate.strokeColor : '#334155';
    const legacyWidth = typeof candidate.strokeWidth === 'number' ? candidate.strokeWidth : 2.5;
    return {
      geometryKind: 'LINE',
      stroke: normalizeColorRule(candidate.stroke, defaultColorRule(category, legacyColor)),
      strokeStyle: candidate.strokeStyle as StudioGeoStrokeStyle,
      opacity: typeof candidate.opacity === 'number' ? candidate.opacity : 0.9,
      scaleBands: Object.fromEntries(
        SCALE_BAND_KEYS.map((key) => [
          key,
          {
            visible: bands[key]?.visible,
            strokeWidth:
              typeof bands[key]?.strokeWidth === 'number'
                ? bands[key].strokeWidth
                : legacyWidth,
          },
        ]),
      ) as StudioGeoLineVisualConfig['scaleBands'],
    };
  }
  if (candidate.geometryKind === 'POLYGON') {
    const legacyStroke =
      typeof candidate.strokeColor === 'string' ? candidate.strokeColor : '#2563eb';
    const legacyFill = typeof candidate.fillColor === 'string' ? candidate.fillColor : '#3b82f6';
    const legacyWidth = typeof candidate.strokeWidth === 'number' ? candidate.strokeWidth : 1.5;
    return {
      geometryKind: 'POLYGON',
      stroke: normalizeColorRule(candidate.stroke, defaultColorRule(category, legacyStroke)),
      strokeStyle: candidate.strokeStyle as StudioGeoStrokeStyle,
      strokeOpacity: typeof candidate.strokeOpacity === 'number' ? candidate.strokeOpacity : 1,
      fill: normalizeColorRule(candidate.fill, defaultColorRule(category, legacyFill)),
      fillOpacity: typeof candidate.fillOpacity === 'number' ? candidate.fillOpacity : 0.25,
      scaleBands: Object.fromEntries(
        SCALE_BAND_KEYS.map((key) => [
          key,
          {
            visible: bands[key]?.visible,
            strokeWidth:
              typeof bands[key]?.strokeWidth === 'number'
                ? bands[key].strokeWidth
                : legacyWidth,
          },
        ]),
      ) as StudioGeoPolygonVisualConfig['scaleBands'],
    };
  }
  return undefined;
};

const normalizeCurrentNode = (node: StudioGeoNode): StudioGeoNode => {
  if (node.kind === 'GROUP') {
    const { assetId: _legacyAssetId, ...groupNode } = node;
    return groupNode;
  }
  const { assetId: _legacyAssetId, ...entityNode } = node;
  if (node.visualConfig === undefined) return entityNode;
  const visualConfig = normalizeVisualConfig(node.visualConfig, node.entity.category);
  return visualConfig ? { ...entityNode, visualConfig } : entityNode;
};

/**
 * Normaliza snapshots históricos v1/v2 e atuais v3 para o contrato persistido v3. A remoção de
 * identidade acontece aqui, antes de checksum/persistência, para impedir uma segunda autoridade.
 */
export const normalizeStudioGeoSnapshot = (snapshot: Record<string, unknown>): StudioGeoSnapshot => {
  const candidate = snapshot as Partial<
    StudioGeoSnapshotV1 & { schemaVersion: 2 | 3; nodes: StudioGeoNode[] }
  >;
  if (
    (candidate.schemaVersion === 2 || candidate.schemaVersion === 3) &&
    Array.isArray(candidate.nodes)
  ) {
    return {
      schemaVersion: 3,
      nodes: candidate.nodes.map(normalizeCurrentNode),
    };
  }
  const groups = Array.isArray(candidate.groups) ? candidate.groups : [];
  const layers = Array.isArray(candidate.layers) ? candidate.layers : [];
  return {
    schemaVersion: 3,
    nodes: [
      ...groups.map((group) => ({
        id: group.id,
        kind: 'GROUP' as const,
        parentNodeId: null,
        label: group.label,
        ...(group.hint ? { hint: group.hint } : {}),
        sortOrder: group.sortOrder,
        active: group.active,
      })),
      ...layers.map((layer) => ({
        id: layer.id,
        kind: 'ENTITY' as const,
        parentNodeId: layer.groupId,
        label: layer.label,
        ...(layer.hint ? { hint: layer.hint } : {}),
        sortOrder: layer.sortOrder,
        active: layer.active,
        defaultVisible: layer.defaultVisible,
        entity: entitySourceForLegacyMatcher(layer.matcher),
      })),
    ],
  };
};

export const sortStudioGeoNodes = (nodes: readonly StudioGeoNode[]): StudioGeoNode[] =>
  [...nodes].sort(compareNodes);

export const studioGeoChildrenOf = (nodes: readonly StudioGeoNode[], parentNodeId: string | null): StudioGeoNode[] =>
  sortStudioGeoNodes(nodes.filter((node) => node.parentNodeId === parentNodeId));

export const studioGeoDescendantEntityIds = (nodes: readonly StudioGeoNode[], groupId: string): string[] => {
  const childrenByParent = new Map<string | null, StudioGeoNode[]>();
  for (const node of nodes) {
    const children = childrenByParent.get(node.parentNodeId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentNodeId, children);
  }
  const entityIds: string[] = [];
  const visit = (nodeId: string): void => {
    for (const child of childrenByParent.get(nodeId) ?? []) {
      if (child.kind === 'ENTITY') entityIds.push(child.id);
      else visit(child.id);
    }
  };
  visit(groupId);
  return entityIds;
};

export const compactStudioGeoSiblingOrder = (nodes: readonly StudioGeoNode[]): StudioGeoNode[] => {
  const order = new Map<string, number>();
  const parentIds = new Set(nodes.map((node) => node.parentNodeId));
  for (const parentNodeId of parentIds) {
    studioGeoChildrenOf(nodes, parentNodeId).forEach((node, index) => order.set(node.id, (index + 1) * 10));
  }
  return nodes.map((node) => ({ ...node, sortOrder: order.get(node.id) ?? node.sortOrder }));
};

const group = (id: string, label: string, sortOrder: number, hint?: string): StudioGeoGroupNode => ({
  id, kind: 'GROUP', parentNodeId: null, label, ...(hint ? { hint } : {}), sortOrder, active: true,
});
const entity = (
  id: string,
  parentNodeId: string,
  label: string,
  sortOrder: number,
  reference: StudioGeoEntityReference,
  hint?: string,
): StudioGeoEntityNode => ({
  id, kind: 'ENTITY', parentNodeId, label, ...(hint ? { hint } : {}), sortOrder, active: true, defaultVisible: true, entity: reference,
});
const resource = (sourceId: string): StudioGeoEntityReference => ({
  category: 'RESOURCE', sourceDomain: 'resource-model', sourceType: 'RESOURCE_TYPE', sourceId,
});
const local = (sourceId: string): StudioGeoEntityReference => ({
  category: 'LOCAL', sourceDomain: 'location-model', sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION', sourceId,
});

/** Fallback canônico v3 e primeira publicação idempotente do Studio GEO. */
export const CANONICAL_STUDIO_GEO_SNAPSHOT: StudioGeoSnapshot = {
  schemaVersion: 3,
  nodes: [
    group('locations', 'Locais', 10),
    group('coverage', 'Cobertura', 20, 'Manchas agregadas por tema — hoje só GPON, outras entram como novos itens do grupo'),
    group('netwinInfrastructure', 'Infraestrutura Civil', 30),
    group('resources', 'Recursos de Rede', 40),
    entity('stations', 'locations', 'Estações', 10, local('legacy-stations'), 'CO — sempre buscadas, só o desenho é afetado'),
    entity('siteNetwork', 'locations', 'Sites de Rede', 20, local('legacy-site-network'), 'CO, POP, Armário, Sala técnica, Contêiner…'),
    entity('siteService', 'locations', 'Sites de Serviço', 30, local('legacy-site-service'), 'Unidade atendida (casa, apartamento)'),
    entity('netwinTower', 'locations', 'Torres', 40, resource('legacy-tower'), 'Estrutura de sustentação elevada'),
    entity('coverage-gpon', 'coverage', 'Cobertura GPON', 10, { category: 'COVERAGE', sourceDomain: 'spatial', sourceType: 'GPON_AGGREGATE', sourceId: 'gpon-aggregate' }, 'Mancha por bairro'),
    entity('netwinPole', 'netwinInfrastructure', 'Postes', 10, resource('legacy-pole'), 'Poste de rede aérea'),
    entity('netwinDuct', 'netwinInfrastructure', 'Dutos', 20, resource('legacy-duct'), 'Duto, tubo de subida, túnel de cabos, pedestal, suporte'),
    entity('netwinManhole', 'netwinInfrastructure', 'Caixas Subterrâneas', 30, resource('legacy-manhole'), 'Poço de visita / caixa enterrada'),
    entity('resourceCdoe', 'resources', 'CDOEs', 10, resource('legacy-cdoe'), 'Caixa de terminação óptica externa (via pública)'),
    entity('resourceCdoi', 'resources', 'CDOIs', 20, resource('legacy-cdoi'), 'Caixa de terminação óptica interna (edificação)'),
    entity('resourceCeo', 'resources', 'CEOs', 30, resource('legacy-ceo'), 'Caixa de emenda óptica'),
    entity('resourceDio', 'resources', 'DIOs', 40, resource('legacy-dio'), 'Distribuidor interno óptico'),
    entity('resourceFiberCable', 'resources', 'Cabos de Fibra', 50, resource('legacy-fiber-cable'), 'Backbone, distribuição e fibra'),
    entity('resourceDropCable', 'resources', 'Cabo Drop', 60, resource('legacy-drop-cable'), 'Cabo de acesso até o cliente'),
  ],
};

const SCALE_BAND_KEYS: StudioGeoScaleBandKey[] = [
  'le5m', 'le10m', 'le20m', 'le50m', 'le100m', 'le500m', 'le1km', 'gt1km',
];
const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted', 'animated-dotted']);
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const colorRuleIssues = (
  value: unknown,
  category: StudioGeoEntityCategory,
  path: string,
): StudioValidationIssue[] => {
  if (!value || typeof value !== 'object') {
    return [{ severity: 'error', code: 'STUDIO_GEO_COLOR_RULE_INVALID', message: 'A regra de cor é inválida.', path }];
  }
  const rule = value as Partial<StudioGeoColorRule>;
  const issues: StudioValidationIssue[] = [];
  if (rule.mode !== 'fixed' && rule.mode !== 'status') {
    issues.push({ severity: 'error', code: 'STUDIO_GEO_COLOR_MODE_INVALID', message: 'O modo de cor deve ser fixo ou por status.', path: `${path}.mode` });
  }
  if (!nonEmpty(rule.defaultColor) || !COLOR_PATTERN.test(rule.defaultColor)) {
    issues.push({ severity: 'error', code: 'STUDIO_GEO_COLOR_INVALID', message: 'A cor padrão deve usar o formato hexadecimal #RRGGBB.', path: `${path}.defaultColor` });
  }
  if (!rule.statusColors || typeof rule.statusColors !== 'object') {
    issues.push({ severity: 'error', code: 'STUDIO_GEO_STATUS_COLORS_INVALID', message: 'As cores por status são inválidas.', path: `${path}.statusColors` });
  } else {
    const allowed = new Set(Object.keys(DEFAULT_STATUS_COLORS[category]));
    for (const [status, color] of Object.entries(rule.statusColors)) {
      if (!allowed.has(status) || typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
        issues.push({ severity: 'error', code: 'STUDIO_GEO_STATUS_COLOR_INVALID', message: `A cor do status ${status} é inválida para esta entidade.`, path: `${path}.statusColors.${status}` });
      }
    }
  }
  return issues;
};

const validOpacity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const visualConfigIssues = (
  visualConfig: unknown,
  category: StudioGeoEntityCategory,
  path: string,
): StudioValidationIssue[] => {
  if (visualConfig === undefined) return [];
  if (!visualConfig || typeof visualConfig !== 'object') {
    return [{ severity: 'error', code: 'STUDIO_GEO_VISUAL_CONFIG_INVALID', message: 'A configuração visual é inválida.', path }];
  }
  const config = visualConfig as Partial<StudioGeoVisualConfig> & Record<string, unknown>;
  const issues: StudioValidationIssue[] = [];
  if (config.geometryKind === 'POINT') {
    const point = config as Partial<StudioGeoPointVisualConfig>;
    issues.push(...colorRuleIssues(point.color, category, `${path}.color`));
    if (!validOpacity(point.opacity)) issues.push({ severity: 'error', code: 'STUDIO_GEO_POINT_OPACITY_INVALID', message: 'A opacidade do ponto deve ficar entre 0 e 1.', path: `${path}.opacity` });
    const bands = point.scaleBands;
    if (!bands || typeof bands !== 'object') {
      issues.push({ severity: 'error', code: 'STUDIO_GEO_POINT_SCALE_BANDS_INVALID', message: 'Um ponto deve configurar todas as faixas de escala.', path: `${path}.scaleBands` });
    } else {
      for (const key of SCALE_BAND_KEYS) {
        const band = (bands as Record<string, unknown>)[key];
        if (!band || typeof band !== 'object' || typeof (band as { visible?: unknown }).visible !== 'boolean' || !Number.isFinite((band as { sizePx?: unknown }).sizePx) || (band as { sizePx: number }).sizePx < 8 || (band as { sizePx: number }).sizePx > 64) {
          issues.push({ severity: 'error', code: 'STUDIO_GEO_POINT_SCALE_BAND_INVALID', message: `A faixa ${key} deve ter visibilidade e tamanho entre 8 e 64 px.`, path: `${path}.scaleBands.${key}` });
        }
      }
    }
    return issues;
  }
  if (config.geometryKind === 'LINE' || config.geometryKind === 'POLYGON') {
    const linear = config as Partial<StudioGeoLineVisualConfig | StudioGeoPolygonVisualConfig>;
    issues.push(...colorRuleIssues(linear.stroke, category, `${path}.stroke`));
    if (!STROKE_STYLES.has(String(linear.strokeStyle))) issues.push({ severity: 'error', code: 'STUDIO_GEO_STROKE_STYLE_INVALID', message: 'O estilo do traço é inválido.', path: `${path}.strokeStyle` });
    if (config.geometryKind === 'LINE') {
      const line = config as Partial<StudioGeoLineVisualConfig>;
      if (!validOpacity(line.opacity)) issues.push({ severity: 'error', code: 'STUDIO_GEO_STROKE_OPACITY_INVALID', message: 'A opacidade da linha deve ficar entre 0 e 1.', path: `${path}.opacity` });
    } else {
      const polygon = config as Partial<StudioGeoPolygonVisualConfig>;
      issues.push(...colorRuleIssues(polygon.fill, category, `${path}.fill`));
      if (!validOpacity(polygon.strokeOpacity)) issues.push({ severity: 'error', code: 'STUDIO_GEO_STROKE_OPACITY_INVALID', message: 'A opacidade da borda deve ficar entre 0 e 1.', path: `${path}.strokeOpacity` });
      if (!validOpacity(polygon.fillOpacity)) issues.push({ severity: 'error', code: 'STUDIO_GEO_FILL_OPACITY_INVALID', message: 'A opacidade do preenchimento deve ficar entre 0 e 1.', path: `${path}.fillOpacity` });
    }
    const bands = linear.scaleBands;
    if (!bands || typeof bands !== 'object') {
      issues.push({ severity: 'error', code: 'STUDIO_GEO_LINE_SCALE_BANDS_INVALID', message: 'Uma linha ou polígono deve configurar todas as faixas de escala.', path: `${path}.scaleBands` });
    } else {
      for (const key of SCALE_BAND_KEYS) {
        const band = (bands as Record<string, unknown>)[key];
        const width = band && typeof band === 'object' ? (band as { strokeWidth?: unknown }).strokeWidth : undefined;
        if (!band || typeof band !== 'object' || typeof (band as { visible?: unknown }).visible !== 'boolean' || typeof width !== 'number' || !Number.isFinite(width) || width <= 0 || width > 10) {
          issues.push({ severity: 'error', code: 'STUDIO_GEO_LINE_SCALE_BAND_INVALID', message: `A faixa ${key} deve declarar visibilidade e espessura entre 0 e 10 px.`, path: `${path}.scaleBands.${key}` });
        }
      }
    }
    return issues;
  }
  return [{ severity: 'error', code: 'STUDIO_GEO_GEOMETRY_KIND_INVALID', message: 'A geometria visual deve ser ponto, linha ou polígono.', path: `${path}.geometryKind` }];
};

export class StudioGeoAdapter implements StudioDomainAdapter {
  public readonly domain = 'studio-geo';

  constructor(private readonly listResourceTypes: (tenantId: string) => Promise<ResourceType[]>) {}

  public prepareSnapshot(snapshot: Record<string, unknown>): StudioGeoSnapshot {
    return normalizeStudioGeoSnapshot(snapshot);
  }

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const typed = normalizeStudioGeoSnapshot(snapshot);
    const issues: StudioValidationIssue[] = [];
    const nodesById = new Map<string, StudioGeoNode>();
    const entityKeys = new Set<string>();

    for (const [index, node] of typed.nodes.entries()) {
      const path = `nodes[${index}]`;
      if (!nonEmpty(node?.id) || !ID_PATTERN.test(node.id)) {
        issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_ID_INVALID', message: 'O ID do nó deve ser um identificador estável.', path: `${path}.id` });
      } else if (nodesById.has(node.id)) {
        issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_ID_DUPLICATE', message: `Nó duplicado: ${node.id}.`, path: `${path}.id` });
      } else {
        nodesById.set(node.id, node);
      }
      if (!nonEmpty(node?.label)) issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_LABEL_REQUIRED', message: 'O rótulo do nó é obrigatório.', path: `${path}.label` });
      if (!Number.isInteger(node?.sortOrder)) issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_ORDER_INVALID', message: 'A ordem interna do nó deve ser inteira.', path: `${path}.sortOrder` });
      if (typeof node?.active !== 'boolean') issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_ACTIVE_INVALID', message: 'O estado do nó deve ser booleano.', path: `${path}.active` });
      if (node?.assetId !== undefined && !nonEmpty(node.assetId)) issues.push({ severity: 'error', code: 'STUDIO_GEO_ASSET_ID_INVALID', message: 'A referência de asset é inválida.', path: `${path}.assetId` });
      if (node?.kind !== 'GROUP' && node?.kind !== 'ENTITY') issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_KIND_INVALID', message: 'O tipo do nó deve ser grupo ou entidade.', path: `${path}.kind` });
      if (node?.kind === 'ENTITY') {
        if (typeof node.defaultVisible !== 'boolean') issues.push({ severity: 'error', code: 'STUDIO_GEO_ENTITY_VISIBILITY_INVALID', message: 'A visibilidade padrão é obrigatória.', path: `${path}.defaultVisible` });
        issues.push(
          ...visualConfigIssues(
            node.visualConfig,
            node.entity?.category ?? 'RESOURCE',
            `${path}.visualConfig`,
          ),
        );
        const reference = node.entity;
        if (!reference || !['LOCAL', 'COVERAGE', 'RESOURCE'].includes(reference.category) || !['location-model', 'spatial', 'resource-model'].includes(reference.sourceDomain) || !['GEOGRAPHIC_SITE_SPECIFICATION', 'SPATIAL_COVERAGE', 'GPON_AGGREGATE', 'RESOURCE_TYPE'].includes(reference.sourceType) || !nonEmpty(reference.sourceId)) {
          issues.push({ severity: 'error', code: 'STUDIO_GEO_ENTITY_REFERENCE_INVALID', message: 'A entidade deve referenciar uma fonte canônica elegível.', path: `${path}.entity` });
        } else {
          const key = `${reference.sourceType}:${reference.sourceId}`;
          if (entityKeys.has(key)) issues.push({ severity: 'error', code: 'STUDIO_GEO_ENTITY_REFERENCE_DUPLICATE', message: 'A mesma entidade não pode aparecer em dois nós ativos.', path: `${path}.entity` });
          else entityKeys.add(key);
        }
      }
    }

    for (const [index, node] of typed.nodes.entries()) {
      const path = `nodes[${index}]`;
      if (node.parentNodeId !== null) {
        if (node.parentNodeId === node.id) issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_SELF_PARENT', message: 'Um nó não pode ser pai de si mesmo.', path: `${path}.parentNodeId` });
        const parent = nodesById.get(node.parentNodeId);
        if (!parent) issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_PARENT_INVALID', message: 'O pai do nó não existe.', path: `${path}.parentNodeId` });
        else if (parent.kind !== 'GROUP') issues.push({ severity: 'error', code: 'STUDIO_GEO_ENTITY_CHILDREN_FORBIDDEN', message: 'Somente grupos podem conter filhos.', path: `${path}.parentNodeId` });
      }
      const visited = new Set<string>([node.id]);
      let ancestorId = node.parentNodeId;
      while (ancestorId !== null) {
        if (visited.has(ancestorId)) {
          issues.push({ severity: 'error', code: 'STUDIO_GEO_NODE_CYCLE', message: 'A hierarquia GEO não pode conter ciclos.', path: `${path}.parentNodeId` });
          break;
        }
        visited.add(ancestorId);
        ancestorId = nodesById.get(ancestorId)?.parentNodeId ?? null;
      }
    }

    const siblingKeys = new Set<string>();
    for (const node of typed.nodes) {
      const key = `${node.parentNodeId ?? 'root'}:${node.sortOrder}`;
      if (siblingKeys.has(key)) issues.push({ severity: 'error', code: 'STUDIO_GEO_SIBLING_ORDER_DUPLICATE', message: 'Irmãos não podem compartilhar a mesma ordem interna.', path: 'nodes' });
      else siblingKeys.add(key);
    }
    return { valid: !issues.some((issue) => issue.severity === 'error'), issues, validatedAt: new Date().toISOString() };
  }

  public async materialize(snapshot: Record<string, unknown>, context: { tenantId: string }): Promise<void> {
    const validation = await this.validate(snapshot);
    if (!validation.valid) throw new AppError(validation.issues.map((issue) => issue.message).join('; '), { code: 'STUDIO_MATERIALIZE_INVALID', statusCode: 422 });
    const resourceTypes = await this.listResourceTypes(context.tenantId);
    for (const node of normalizeStudioGeoSnapshot(snapshot).nodes) {
      // Snapshots legados não materializavam `visualConfig`; eles seguem legíveis/publicáveis até
      // serem normalizados pelo editor. Toda entidade RESOURCE configurada pelo fluxo atual traz
      // a geometria visual explícita e precisa coincidir com o ResourceType canônico.
      if (
        node.kind === 'ENTITY' &&
        node.entity.category === 'RESOURCE' &&
        node.visualConfig !== undefined
      ) {
        const resourceType = resourceTypes.find(
          (type) => type.id === node.entity.sourceId || type.code === node.entity.sourceId,
        );
        // A causa precisa importa: o nó pode apontar para um tipo inexistente, inativo, lógico,
        // sem presença no mapa, sem geometria canônica, ou com geometria divergente da publicada.
        // Uma mensagem única para os seis casos obriga quem publica a inspecionar o catálogo à mão
        // para descobrir qual nó travou a operação.
        const reason = !resourceType
          ? 'o tipo de recurso não existe no catálogo vigente'
          : resourceType.status !== 'active'
            ? `o tipo de recurso está com status "${resourceType.status}"`
            : resourceType.nature !== 'PhysicalResource'
              ? `o tipo de recurso tem natureza "${resourceType.nature}", não física`
              : resourceType.mapPresence !== true
                ? 'o tipo de recurso não está marcado como visível no mapa'
                : !resourceType.geometryKind
                  ? 'o tipo de recurso não tem geometria de mapa definida'
                  : node.visualConfig?.geometryKind !== resourceType.geometryKind
                    ? `a geometria configurada (${node.visualConfig?.geometryKind}) não corresponde à do tipo de recurso (${resourceType.geometryKind})`
                    : null;
        if (reason) {
          throw new AppError(
            `studio GEO: o nó "${node.label}" referencia "${node.entity.sourceId}" e não pode ser publicado — ${reason}.`,
            {
              code: 'STUDIO_GEO_RESOURCE_GEOMETRY_INVALID',
              statusCode: 422,
            },
          );
        }
      }
    }
  }
}
