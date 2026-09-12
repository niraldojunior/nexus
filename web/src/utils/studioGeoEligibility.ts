import type { GeoSpec } from '../services/geoApi';
import type { ResourceType } from '../services/resourceApi';
import type {
  StudioGeoEntityCategory,
  StudioGeoEntityReference,
  StudioGeoSourceDomain,
  StudioGeoSourceType,
} from '../services/studioGeoApi';

export type EligibleOption = {
  id: string;
  name: string;
  code?: string;
  category: StudioGeoEntityCategory;
  sourceDomain: StudioGeoSourceDomain;
  sourceType: StudioGeoSourceType;
  sourceId: string;
  description?: string;
  reference: StudioGeoEntityReference;
};

const INTERNAL_RESOURCE_CODES = new Set(['Splitter', 'Port']);

const LOGICAL_RESOURCE_CODES = new Set([
  'IPAddress',
  'Prefix',
  'VLAN',
  'VLANGroup',
  'VRF',
  'ASN',
  'RouteTarget',
  'rt-ip-address',
  'rt-prefix',
  'rt-vlan',
  'rt-vlan-group',
  'rt-vrf',
  'rt-asn',
  'rt-route-target',
  'PONLogical',
  'ONTID',
  'GEMPort',
  'rt-pon-logical',
  'rt-ont-id',
  'rt-gem-port',
]);

/**
 * Filtra tipos de recurso elegíveis para exibição no mapa:
 * - Apenas ativos
 * - Apenas de natureza física (exclui IPAM, L2, L3, PON Lógica, etc.)
 * - Apenas tipos explicitamente configurados como visíveis no mapa
 * - Exclui componentes internos de contenção (Splitter, Port) que não têm existência geográfica própria
 */
export function isPhysicalResourceType(rt: ResourceType): boolean {
  if (rt.status !== 'active' || rt.mapPresence !== true) return false;
  if (INTERNAL_RESOURCE_CODES.has(rt.code) || INTERNAL_RESOURCE_CODES.has(rt.id)) return false;
  if (rt.categoryCode?.startsWith('Logical')) return false;
  if (LOGICAL_RESOURCE_CODES.has(rt.code) || LOGICAL_RESOURCE_CODES.has(rt.id)) return false;
  return true;
}

/**
 * Constrói a lista de opções elegíveis para "Local (Site)":
 * Apenas especificações ativas de categoria 'Site' (exclui Sub-Sites, Regiões e Recursos).
 */
function uniqueBySourceId(options: EligibleOption[]): EligibleOption[] {
  const sourceIds = new Set<string>();
  return options.filter((option) => {
    if (sourceIds.has(option.sourceId)) return false;
    sourceIds.add(option.sourceId);
    return true;
  });
}

export function buildEligibleSites(siteSpecs: GeoSpec[]): EligibleOption[] {
  return uniqueBySourceId(
    siteSpecs
      .filter((spec) => spec.lifecycleStatus === 'Active' && spec.category === 'Site')
      .map((spec) => ({
        id: spec.code || spec.id,
        name: spec.name,
        code: spec.code,
        category: 'LOCAL' as const,
        sourceDomain: 'location-model' as const,
        sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION' as const,
        sourceId: spec.code || spec.id,
        description: spec.description || `Local (Site)`,
        reference: {
          category: 'LOCAL',
          sourceDomain: 'location-model',
          sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
          sourceId: spec.code || spec.id,
        },
      })),
  );
}

/**
 * Constrói a lista de opções elegíveis para "Recurso":
 * Apenas recursos físicos ativos que representam elementos com presença no mapa.
 */
export function buildEligibleResources(resourceTypes: ResourceType[]): EligibleOption[] {
  return uniqueBySourceId(
    resourceTypes
      .filter(isPhysicalResourceType)
      .map((rt) => ({
        id: rt.code || rt.id,
        name: rt.name,
        code: rt.code,
        category: 'RESOURCE' as const,
        sourceDomain: 'resource-model' as const,
        sourceType: 'RESOURCE_TYPE' as const,
        sourceId: rt.code || rt.id,
        description: rt.description || `Recurso físico (${rt.categoryCode})`,
        reference: {
          category: 'RESOURCE',
          sourceDomain: 'resource-model',
          sourceType: 'RESOURCE_TYPE',
          sourceId: rt.code || rt.id,
        },
      })),
  );
}

/**
 * Constrói a lista de opções elegíveis para "Região (Cobertura)":
 * Apenas especificações de locais da categoria 'Region'.
 */
export function buildEligibleCoverages(siteSpecs: GeoSpec[]): EligibleOption[] {
  return uniqueBySourceId(
    siteSpecs
      .filter((spec) => spec.lifecycleStatus === 'Active' && spec.category === 'Region')
      .map((spec) => ({
        id: spec.code || spec.id,
        name: spec.name,
        code: spec.code,
        category: 'COVERAGE' as const,
        sourceDomain: 'location-model' as const,
        sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION' as const,
        sourceId: spec.code || spec.id,
        description: spec.description || 'Região geográfica (Site Spec)',
        reference: {
          category: 'COVERAGE',
          sourceDomain: 'location-model',
          sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
          sourceId: spec.code || spec.id,
        },
      })),
  );
}
