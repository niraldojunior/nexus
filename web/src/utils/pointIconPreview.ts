// Resolução única da identidade visual operacional de Resource e Location.
// O modelo define o glifo/asset; o Studio GEO só fornece aparência contextual de mapa.

import type { GeoTreeNode } from '../services/geoTreeApi';
import type {
  StudioGeoCatalog,
  StudioGeoEntityNode,
  VisualIdentity,
} from '../services/studioGeoApi';
import { mapLayerEntities } from './mapLayers';
import { nativeMapIconDataUrl, nativeMapIconForCode } from './nativeMapIcons';
import { siteKindFromSpec } from './placeLabel';
import { resourceIconDataUrl, resourceIconFor, type IconShape } from './resourceIcon';
import { siteIconDataUrl, siteIconFor } from './siteIcon';

export type OperationalIconKind = 'resource' | 'site';
export type OperationalIconContext = 'map' | 'glyph';

export type OperationalIconFacts = {
  kind: OperationalIconKind;
  resourceType?: string;
  siteCategory?: string;
  siteRole?: string;
  name?: string;
  sublabel?: string;
  status?: string;
};

export type OperationalIconOptions = {
  context?: OperationalIconContext;
  size: number;
  color?: string;
  opacity?: number;
};

export type ResolvedOperationalIcon = {
  /** URL pronta para identidade system ou fallback; assets são carregados pelo consumidor. */
  url?: string;
  assetId?: string;
  label: string;
  shape: IconShape;
  /** Opacidade contextual publicada pelo Studio GEO, inclusive para assets SVG. */
  opacity?: number;
};

export type PointIconPreviewOptions = Omit<OperationalIconOptions, 'size' | 'context'>;

export function operationalIconFactsForTreeNode(node: GeoTreeNode): OperationalIconFacts | undefined {
  if (node.kind === 'resource') {
    return {
      kind: 'resource',
      resourceType: node.resourceType,
      name: node.label,
      sublabel: node.sublabel,
      status: node.status,
    };
  }
  if (node.kind === 'site') {
    return {
      kind: 'site',
      siteCategory: node.siteCategory,
      name: node.label,
      sublabel: node.sublabel,
      status: node.status,
    };
  }
  return undefined;
}

/**
 * Localiza a entidade publicada apenas para ler a identidade canônica do modelo.
 * Nenhuma cópia da identidade é anexada ao nó de inventário.
 */
export function pointLayerForTreeNode(
  node: GeoTreeNode,
  catalog: StudioGeoCatalog,
): StudioGeoEntityNode | undefined {
  const facts = operationalIconFactsForTreeNode(node);
  if (!facts) return undefined;
  const sourceType = facts.kind === 'site' ? 'GEOGRAPHIC_SITE_SPECIFICATION' : 'RESOURCE_TYPE';
  const sourceIds =
    facts.kind === 'site'
      ? [node.siteSpecificationCode, node.siteSpecificationId]
      : [node.resourceType];
  return mapLayerEntities(catalog).find(
    (candidate) =>
      candidate.entity.sourceType === sourceType &&
      sourceIds.some((sourceId) => sourceId === candidate.entity.sourceId),
  );
}

export function visualIdentityForTreeNode(
  node: GeoTreeNode,
  catalog: StudioGeoCatalog,
): VisualIdentity | undefined {
  return pointLayerForTreeNode(node, catalog)?.visualIdentity;
}

/**
 * Precedência única: identidade explícita do modelo, fallback do próprio modelo e, por fim,
 * o glifo genérico dos registries. Para assets, devolve `assetId` e preserva o fallback como
 * `url`, permitindo que o consumidor continue legível enquanto a imagem assíncrona carrega.
 */
export function resolveOperationalIcon(
  facts: OperationalIconFacts,
  identity: VisualIdentity | undefined,
  options: OperationalIconOptions,
): ResolvedOperationalIcon {
  const context = options.context ?? 'map';
  const shape: IconShape = context === 'glyph' ? 'none' : facts.kind === 'site' ? 'squircle' : 'circle';
  const fallback = fallbackOperationalIcon(facts, { ...options, context });

  if (identity?.kind === 'asset') {
    return { ...fallback, assetId: identity.assetId, shape, opacity: options.opacity };
  }
  if (identity?.kind === 'system') {
    const nativeIcon = nativeMapIconForCode(identity.iconCode);
    if (nativeIcon) {
      return {
        url: nativeMapIconDataUrl(nativeIcon, {
          size: options.size,
          shape,
          color: options.color,
          opacity: options.opacity,
        }),
        label: nativeIcon.name,
        shape,
      };
    }
  }
  return fallback;
}

function fallbackOperationalIcon(
  facts: OperationalIconFacts,
  options: OperationalIconOptions & { context: OperationalIconContext },
): ResolvedOperationalIcon {
  if (facts.kind === 'site') {
    const icon = siteIconFor(
      siteKindFromSpec({
        category: facts.siteCategory,
        name: facts.sublabel ?? facts.name,
        siteRole: facts.siteRole,
      }),
      facts.status,
    );
    return {
      url: siteIconDataUrl(icon, {
        size: options.size,
        badge: options.context === 'glyph' ? false : undefined,
        color: options.color,
        opacity: options.opacity,
      }),
      label: icon.label,
      shape: options.context === 'glyph' ? 'none' : 'squircle',
    };
  }

  const icon = resourceIconFor({
    resourceType: facts.resourceType ?? '',
    status: facts.status,
    name: facts.name,
    sublabel: facts.sublabel,
  });
  return {
    url: resourceIconDataUrl(icon, {
      size: options.size,
      ring: options.context === 'glyph' ? false : undefined,
      color: options.color,
      opacity: options.opacity,
    }),
    label: icon.label,
    shape: options.context === 'glyph' ? 'none' : 'circle',
  };
}

/** Fallback e preview para os nós do editor Studio GEO. */
export function defaultPointIconPreviewUrl(node: StudioGeoEntityNode, size: number): string {
  return resolveOperationalIcon(
    {
      kind: node.entity.category === 'LOCAL' ? 'site' : 'resource',
      resourceType: node.entity.category === 'RESOURCE' ? node.entity.sourceId : undefined,
      name: node.label,
      sublabel: node.entity.category === 'LOCAL' ? node.entity.sourceId : undefined,
    },
    undefined,
    { size },
  ).url!;
}

/** Mantém a API do preview de Studio; a identidade explícita segue na união canônica. */
export function canonicalPointIconPreviewUrl(
  node: StudioGeoEntityNode,
  iconCode: string | undefined,
  size: number,
  options: PointIconPreviewOptions = {},
): string {
  return (
    resolveOperationalIcon(
      {
        kind: node.entity.category === 'LOCAL' ? 'site' : 'resource',
        resourceType: node.entity.category === 'RESOURCE' ? node.entity.sourceId : undefined,
        name: node.label,
        sublabel: node.entity.category === 'LOCAL' ? node.entity.sourceId : undefined,
      },
      iconCode ? { kind: 'system', iconCode } : undefined,
      { size, ...options },
    ).url ?? defaultPointIconPreviewUrl(node, size)
  );
}
