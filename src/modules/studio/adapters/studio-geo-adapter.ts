import { AppError } from '../../../shared/errors/app-error.js';
import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';

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

export type StudioGeoScalePointConfig = {
  visible: boolean;
  sizePx: number;
};

export type StudioGeoPointVisualConfig = {
  geometryKind: 'POINT';
  assetId?: string;
  iconCode?: string;
  scaleBands: Record<StudioGeoScaleBandKey, StudioGeoScalePointConfig>;
};

export type StudioGeoLineVisualConfig = {
  geometryKind: 'LINE';
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  opacity: number;
};

export type StudioGeoPolygonVisualConfig = {
  geometryKind: 'POLYGON';
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  fillColor: string;
  fillOpacity: number;
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
  schemaVersion: 2;
  nodes: StudioGeoNode[];
};

export type StudioGeoCatalog = StudioGeoSnapshot & {
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

/**
 * Normalizes historical v1 snapshots at the control-plane boundary. It is deliberately
 * deterministic so a v1 publication remains readable until an editor saves it as v2.
 */
export const normalizeStudioGeoSnapshot = (snapshot: Record<string, unknown>): StudioGeoSnapshot => {
  const candidate = snapshot as Partial<StudioGeoSnapshot & StudioGeoSnapshotV1>;
  if (candidate.schemaVersion === 2 && Array.isArray(candidate.nodes)) {
    return { schemaVersion: 2, nodes: [...candidate.nodes] as StudioGeoNode[] };
  }
  const groups = Array.isArray(candidate.groups) ? candidate.groups : [];
  const layers = Array.isArray(candidate.layers) ? candidate.layers : [];
  return {
    schemaVersion: 2,
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
        ...(layer.assetId ? { assetId: layer.assetId } : {}),
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

/** Canonical v2 fallback and idempotent first Studio GEO publication. */
export const CANONICAL_STUDIO_GEO_SNAPSHOT: StudioGeoSnapshot = {
  schemaVersion: 2,
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
const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const visualConfigIssues = (visualConfig: unknown, path: string): StudioValidationIssue[] => {
  if (visualConfig === undefined) return [];
  if (!visualConfig || typeof visualConfig !== 'object') {
    return [{ severity: 'error', code: 'STUDIO_GEO_VISUAL_CONFIG_INVALID', message: 'A configuração visual é inválida.', path }];
  }
  const config = visualConfig as Partial<StudioGeoVisualConfig> & Record<string, unknown>;
  if (config.geometryKind === 'POINT') {
    const bands = config.scaleBands;
    if (!bands || typeof bands !== 'object') {
      return [{ severity: 'error', code: 'STUDIO_GEO_POINT_SCALE_BANDS_INVALID', message: 'Um ponto deve configurar todas as faixas de escala.', path: `${path}.scaleBands` }];
    }
    const issues: StudioValidationIssue[] = [];
    for (const key of SCALE_BAND_KEYS) {
      const band = (bands as Record<string, unknown>)[key];
      if (!band || typeof band !== 'object' || typeof (band as { visible?: unknown }).visible !== 'boolean' || !Number.isFinite((band as { sizePx?: unknown }).sizePx) || (band as { sizePx: number }).sizePx < 8 || (band as { sizePx: number }).sizePx > 64) {
        issues.push({ severity: 'error', code: 'STUDIO_GEO_POINT_SCALE_BAND_INVALID', message: `A faixa ${key} deve ter visibilidade e tamanho entre 8 e 64 px.`, path: `${path}.scaleBands.${key}` });
      }
    }
    if (config.assetId !== undefined && !nonEmpty(config.assetId)) issues.push({ severity: 'error', code: 'STUDIO_GEO_VISUAL_ASSET_ID_INVALID', message: 'A referência de asset visual é inválida.', path: `${path}.assetId` });
    if (config.iconCode !== undefined && !nonEmpty(config.iconCode)) issues.push({ severity: 'error', code: 'STUDIO_GEO_ICON_CODE_INVALID', message: 'O código do ícone é inválido.', path: `${path}.iconCode` });
    return issues;
  }
  if (config.geometryKind === 'LINE' || config.geometryKind === 'POLYGON') {
    const issues: StudioValidationIssue[] = [];
    const strokeWidth = config.strokeWidth;
    const strokeInvalid =
      !nonEmpty(config.strokeColor) ||
      !COLOR_PATTERN.test(config.strokeColor) ||
      !Number.isFinite(strokeWidth) ||
      typeof strokeWidth !== 'number' ||
      strokeWidth <= 0 ||
      strokeWidth > 10 ||
      !STROKE_STYLES.has(String(config.strokeStyle));
    const opacityInvalid =
      config.geometryKind === 'LINE' &&
      (typeof config.opacity !== 'number' || config.opacity < 0 || config.opacity > 1);
    if (strokeInvalid || opacityInvalid) {
      issues.push({ severity: 'error', code: 'STUDIO_GEO_STROKE_CONFIG_INVALID', message: 'A configuração de traço visual é inválida.', path });
    }
    if (config.geometryKind === 'POLYGON' && (!nonEmpty(config.fillColor) || !COLOR_PATTERN.test(config.fillColor) || typeof config.fillOpacity !== 'number' || config.fillOpacity < 0 || config.fillOpacity > 1)) {
      issues.push({ severity: 'error', code: 'STUDIO_GEO_FILL_CONFIG_INVALID', message: 'A configuração de preenchimento visual é inválida.', path });
    }
    return issues;
  }
  return [{ severity: 'error', code: 'STUDIO_GEO_GEOMETRY_KIND_INVALID', message: 'A geometria visual deve ser ponto, linha ou polígono.', path: `${path}.geometryKind` }];
};

export class StudioGeoAdapter implements StudioDomainAdapter {
  public readonly domain = 'studio-geo';

  constructor(private readonly assetExists: (tenantId: string, assetId: string) => Promise<boolean>) {}

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
        issues.push(...visualConfigIssues(node.visualConfig, `${path}.visualConfig`));
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
    if (!typed.nodes.some((node) => node.kind === 'ENTITY' && node.active)) {
      issues.push({ severity: 'error', code: 'STUDIO_GEO_ENTITIES_EMPTY', message: 'Ao menos uma entidade GEO deve permanecer ativa.', path: 'nodes' });
    }
    return { valid: !issues.some((issue) => issue.severity === 'error'), issues, validatedAt: new Date().toISOString() };
  }

  public async materialize(snapshot: Record<string, unknown>, context: { tenantId: string }): Promise<void> {
    const validation = await this.validate(snapshot);
    if (!validation.valid) throw new AppError(validation.issues.map((issue) => issue.message).join('; '), { code: 'STUDIO_MATERIALIZE_INVALID', statusCode: 422 });
    for (const node of normalizeStudioGeoSnapshot(snapshot).nodes) {
      const visualAssetId =
        node.kind === 'ENTITY' && node.visualConfig?.geometryKind === 'POINT'
          ? node.visualConfig.assetId
          : undefined;
      for (const assetId of [node.assetId, visualAssetId]) {
        if (assetId && !(await this.assetExists(context.tenantId, assetId))) {
          throw new AppError('studio GEO node references an unavailable asset', { code: 'STUDIO_GEO_ASSET_UNAVAILABLE', statusCode: 422 });
        }
      }
    }
  }
}
