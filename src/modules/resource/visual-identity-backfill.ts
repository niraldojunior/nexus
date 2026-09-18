import {
  isValidNativeMapIconCode,
  type VisualIdentity,
} from '../../shared/ui/visual-identity.js';

export type VisualIdentityEvidenceSource = 'studio-geo' | 'catalog-node-metadata';

export type VisualIdentityEvidence = {
  visualIdentity: VisualIdentity;
  source: VisualIdentityEvidenceSource;
};

export type StudioGeoVisualCandidate = {
  sourceType: 'RESOURCE_TYPE' | 'GEOGRAPHIC_SITE_SPECIFICATION';
  sourceId: string;
  visualIdentity: VisualIdentity;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * Extrai evidências de identidade visual de um snapshot Studio GEO (v1 ou v2).
 *
 * Regras determinísticas:
 * - Apenas nós ENTITY com sourceType 'RESOURCE_TYPE' ou 'GEOGRAPHIC_SITE_SPECIFICATION'.
 * - Exige exatamente uma seleção válida (iconCode xor assetId).
 * - iconCode deve ser um código nativo válido segundo o manifesto.
 * - assetId deve ser string não vazia.
 * - Se o mesmo sourceId aparecer com identidades divergentes no mesmo snapshot, é descartado (conflito/ausência de consenso).
 */
export function extractStudioGeoVisualIdentities(
  snapshot: unknown,
): Map<string, StudioGeoVisualCandidate> {
  const result = new Map<string, StudioGeoVisualCandidate>();
  const conflictingKeys = new Set<string>();
  const record = asRecord(snapshot);
  if (!record) return result;

  const remember = (candidate: StudioGeoVisualCandidate): void => {
    const key = `${candidate.sourceType}:${candidate.sourceId}`;
    if (conflictingKeys.has(key)) return;

    const existing = result.get(key);
    if (existing) {
      const sameKind = existing.visualIdentity.kind === candidate.visualIdentity.kind;
      const sameVal =
        existing.visualIdentity.kind === 'system' && candidate.visualIdentity.kind === 'system'
          ? existing.visualIdentity.iconCode === candidate.visualIdentity.iconCode
          : existing.visualIdentity.kind === 'asset' && candidate.visualIdentity.kind === 'asset'
            ? existing.visualIdentity.assetId === candidate.visualIdentity.assetId
            : false;
      if (!sameKind || !sameVal) {
        result.delete(key);
        conflictingKeys.add(key);
      }
      return;
    }
    result.set(key, candidate);
  };

  // Snapshot v2 / v3 com nós estruturados
  const nodes = Array.isArray(record.nodes) ? record.nodes : [];
  for (const entry of nodes) {
    const node = asRecord(entry);
    if (!node || node.kind !== 'ENTITY') continue;
    const entity = asRecord(node.entity);
    if (!entity) continue;
    const sourceType = entity.sourceType;
    if (sourceType !== 'RESOURCE_TYPE' && sourceType !== 'GEOGRAPHIC_SITE_SPECIFICATION') continue;
    const sourceId = typeof entity.sourceId === 'string' ? entity.sourceId.trim() : '';
    if (!sourceId) continue;

    const visualConfig = asRecord(node.visualConfig);
    const nodeAssetId = typeof node.assetId === 'string' && node.assetId.trim() ? node.assetId.trim() : undefined;
    const configAssetId =
      typeof visualConfig?.assetId === 'string' && visualConfig.assetId.trim()
        ? visualConfig.assetId.trim()
        : undefined;
    const rawAssetId = configAssetId ?? nodeAssetId;

    const rawIconCode =
      typeof visualConfig?.iconCode === 'string' && visualConfig.iconCode.trim()
        ? visualConfig.iconCode.trim()
        : undefined;

    const hasValidIcon = rawIconCode ? isValidNativeMapIconCode(rawIconCode) : false;
    const hasValidAsset = Boolean(rawAssetId);

    // Exatamente uma seleção válida (iconCode xor assetId)
    if (hasValidIcon && !hasValidAsset && rawIconCode) {
      remember({
        sourceType,
        sourceId,
        visualIdentity: { kind: 'system', iconCode: rawIconCode },
      });
    } else if (hasValidAsset && !hasValidIcon && rawAssetId) {
      remember({
        sourceType,
        sourceId,
        visualIdentity: { kind: 'asset', assetId: rawAssetId },
      });
    }
  }

  // Snapshot v1 com layers legadas
  const layers = Array.isArray(record.layers) ? record.layers : [];
  for (const entry of layers) {
    const layer = asRecord(entry);
    if (!layer) continue;
    const layerAssetId = typeof layer.assetId === 'string' && layer.assetId.trim() ? layer.assetId.trim() : undefined;
    if (layerAssetId && typeof layer.matcher === 'string') {
      const matcher = layer.matcher.trim();
      const sourceType =
        matcher === 'stations' || matcher.startsWith('site-')
          ? 'GEOGRAPHIC_SITE_SPECIFICATION'
          : 'RESOURCE_TYPE';
      remember({
        sourceType,
        sourceId: `legacy-${matcher}`,
        visualIdentity: { kind: 'asset', assetId: layerAssetId },
      });
    }
  }

  return result;
}

/**
 * Extrai evidência secundária a partir de `ResourceCatalogNode.metadata.icon`.
 * Apenas aceito se for código nativo válido.
 */
export function extractCatalogNodeIconEvidence(
  metadata: unknown,
): VisualIdentity | undefined {
  const record = asRecord(metadata);
  if (!record) return undefined;
  const icon = typeof record.icon === 'string' ? record.icon.trim() : undefined;
  if (!icon || !isValidNativeMapIconCode(icon)) return undefined;
  return { kind: 'system', iconCode: icon };
}

export type ResolveVisualIdentityParams = {
  sourceType: 'RESOURCE_TYPE' | 'GEOGRAPHIC_SITE_SPECIFICATION';
  targetId: string;
  targetCode: string;
  studioGeoMap: ReadonlyMap<string, StudioGeoVisualCandidate>;
  catalogNodeMetadata?: unknown;
  activeAssetIds: ReadonlySet<string>;
  existingIdentity?: VisualIdentity | null;
};

export type ResolveVisualIdentityResult =
  | { status: 'already_set'; visualIdentity: VisualIdentity }
  | { status: 'resolved'; evidence: VisualIdentityEvidence }
  | { status: 'no_evidence' }
  | { status: 'invalid_asset'; assetId: string };

/**
 * Resolve a identidade visual canônica para um alvo (ResourceType ou GeographicSiteSpecification)
 * dentro do contexto de um tenant.
 */
export function resolveTargetVisualIdentity(
  params: ResolveVisualIdentityParams,
): ResolveVisualIdentityResult {
  if (params.existingIdentity) {
    return { status: 'already_set', visualIdentity: params.existingIdentity };
  }

  // 1. Evidência do Studio GEO por ID ou por Code
  const keyById = `${params.sourceType}:${params.targetId}`;
  const keyByCode = `${params.sourceType}:${params.targetCode}`;
  const studioCandidate = params.studioGeoMap.get(keyById) ?? params.studioGeoMap.get(keyByCode);

  if (studioCandidate) {
    const identity = studioCandidate.visualIdentity;
    if (identity.kind === 'asset') {
      if (!params.activeAssetIds.has(identity.assetId)) {
        return { status: 'invalid_asset', assetId: identity.assetId };
      }
    }
    return {
      status: 'resolved',
      evidence: { visualIdentity: identity, source: 'studio-geo' },
    };
  }

  // 2. Evidência secundária de ResourceCatalogNode metadata.icon (somente ResourceType)
  if (params.sourceType === 'RESOURCE_TYPE' && params.catalogNodeMetadata) {
    const metadataIdentity = extractCatalogNodeIconEvidence(params.catalogNodeMetadata);
    if (metadataIdentity) {
      return {
        status: 'resolved',
        evidence: { visualIdentity: metadataIdentity, source: 'catalog-node-metadata' },
      };
    }
  }

  return { status: 'no_evidence' };
}
