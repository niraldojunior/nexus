/**
 * Publicação do catálogo Studio GEO para as camadas de energia.
 *
 * Único módulo do seed que fala com os serviços de domínio em vez de SQL: a publicação tem
 * validação própria (`StudioGeoAdapter.validate`/`materialize`) que não vale a pena reimplementar.
 *
 * Por que publicar do script: num ambiente `bootstrapMode:'empty'` — o caso da DEMO — o runtime
 * pula `ensurePublishedBootstrap` (nexus-runtime.ts:289), então o catálogo publicado vem
 * `{nodes:[], fallback:false}` e `isMapFeatureVisible` esconde toda feature sem camada
 * (mapLayers.ts:338). Sem esta fase, os dados entram no banco e o mapa fica vazio.
 */

import type {
  StudioGeoLineVisualConfig,
  StudioGeoNode,
  StudioGeoPointVisualConfig,
  StudioGeoSnapshot,
} from '../../src/modules/studio/adapters/studio-geo-adapter.js';
import type { StudioService } from '../../src/modules/studio/service.js';
import type { RequestContext } from '../../src/shared/http/request-context.js';
import {
  GAS_PIPELINE_RESOURCE_TYPE_CODE,
  ISOLATED_SYSTEM_SITE_SPEC_CODE,
  RAIL_SEGMENT_RESOURCE_TYPE_CODE,
  RAIL_STATION_SITE_SPEC_CODE,
  SUBSTATION_SITE_SPEC_CODE,
  TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
  type Domain,
} from './mapper.js';

/** Ids dos nós publicados — casam `/^[A-Za-z][A-Za-z0-9-]*$/` (studio-geo-adapter.ts:170). */
export const ENERGY_GROUP_NODE_ID = 'energia';
export const SUBSTATION_NODE_ID = 'energia-subestacao';
export const ISOLATED_SYSTEM_NODE_ID = 'energia-sistema-isolado';
export const TRANSMISSION_LINE_NODE_ID = 'energia-linha';

export const GAS_GROUP_NODE_ID = 'gas';
export const GAS_PIPELINE_NODE_ID = 'gas-gasoduto';
export const RAIL_GROUP_NODE_ID = 'ferrovia';
export const RAIL_STATION_NODE_ID = 'ferrovia-estacao';
export const RAIL_SEGMENT_NODE_ID = 'ferrovia-trecho';

const GAS_PIPELINE_COLOR = '#0891b2';
const RAIL_STATION_COLOR = '#475569';
const RAIL_SEGMENT_COLOR = '#334155';
const SUBSTATION_COLOR = '#f59e0b';
const ISOLATED_SYSTEM_COLOR = '#7c3aed';
const TRANSMISSION_LINE_COLOR = '#b45309';

/**
 * `statusColors` aceita somente as chaves da category: LOCAL usa o ciclo de vida do site
 * (`Planned`…`Retired`) e RESOURCE o status do recurso, em minúsculas. Chave fora do conjunto é
 * descartada na normalização e viraria cor faltando no mapa.
 */
const LOCAL_STATUS_COLORS: Record<string, string> = {
  Planned: '#f59e0b',
  InConstruction: '#2563eb',
  Active: '#047857',
  InDeactivation: '#ef4444',
  Retired: '#64748b',
};

const RESOURCE_STATUS_COLORS: Record<string, string> = {
  active: '#047857',
  inactive: '#64748b',
  suspended: '#ef4444',
  terminated: '#334155',
};

const SCALE_BAND_KEYS = [
  'le5m',
  'le10m',
  'le20m',
  'le50m',
  'le100m',
  'le500m',
  'le1km',
  'gt1km',
] as const;

/**
 * Faixas de escala do ponto — todas visíveis.
 *
 * Divergência deliberada de `defaultPointVisualConfig` (studioGeoDefaults.ts:136), que esconde
 * ponto acima de 100 m porque poste e caixa só fazem sentido em zoom de rua. Subestação é
 * infraestrutura de escala estadual: com o default, a DEMO abriria num zoom em que nada aparece.
 */
const pointVisualConfig = (color: string): StudioGeoPointVisualConfig => ({
  geometryKind: 'POINT',
  color: { mode: 'fixed', defaultColor: color, statusColors: { ...LOCAL_STATUS_COLORS } },
  opacity: 1,
  scaleBands: Object.fromEntries(
    SCALE_BAND_KEYS.map((key, index) => [
      key,
      { visible: true, sizePx: [28, 26, 22, 18, 16, 14, 12, 10][index] },
    ]),
  ) as StudioGeoPointVisualConfig['scaleBands'],
});

const lineVisualConfig = (color: string): StudioGeoLineVisualConfig => ({
  geometryKind: 'LINE',
  stroke: { mode: 'fixed', defaultColor: color, statusColors: { ...RESOURCE_STATUS_COLORS } },
  strokeStyle: 'solid',
  opacity: 1,
  scaleBands: Object.fromEntries(
    SCALE_BAND_KEYS.map((key) => [key, { visible: true, strokeWidth: 2 }]),
  ) as StudioGeoLineVisualConfig['scaleBands'],
});

/**
 * Nós do grupo ENERGIA.
 *
 * O nó da subestação é **LOCAL/GEOGRAPHIC_SITE_SPECIFICATION**, não RESOURCE: quem desenha o ponto
 * é o `GeographicSite` (o recurso tem `place_type='GeographicSite'` e por isso não entra no
 * `resourceSource` do indexador, que exige `place_id` resolvendo em Location —
 * build-map-features.mjs:151). O indexador emite `source_model_id = sp.code` para sites
 * (build-map-features.mjs:371), daí `sourceId` ser a constante do `code` da spec.
 */
export function energyNodes(sortOrderBase = 100): StudioGeoNode[] {
  return [
    {
      id: ENERGY_GROUP_NODE_ID,
      kind: 'GROUP',
      parentNodeId: null,
      label: 'Energia',
      hint: 'Transmissão de energia elétrica (ANEEL SIGEL)',
      sortOrder: sortOrderBase,
      active: true,
    },
    {
      id: SUBSTATION_NODE_ID,
      kind: 'ENTITY',
      parentNodeId: ENERGY_GROUP_NODE_ID,
      label: 'Subestações',
      sortOrder: 10,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'LOCAL',
        sourceDomain: 'location-model',
        sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
        sourceId: SUBSTATION_SITE_SPEC_CODE,
      },
      visualConfig: pointVisualConfig(SUBSTATION_COLOR),
    },
    {
      id: ISOLATED_SYSTEM_NODE_ID,
      kind: 'ENTITY',
      parentNodeId: ENERGY_GROUP_NODE_ID,
      label: 'Sistemas Isolados',
      sortOrder: 20,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'LOCAL',
        sourceDomain: 'location-model',
        sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
        sourceId: ISOLATED_SYSTEM_SITE_SPEC_CODE,
      },
      visualConfig: pointVisualConfig(ISOLATED_SYSTEM_COLOR),
    },
    {
      id: TRANSMISSION_LINE_NODE_ID,
      kind: 'ENTITY',
      parentNodeId: ENERGY_GROUP_NODE_ID,
      label: 'Linhas de transmissão',
      sortOrder: 30,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'RESOURCE',
        sourceDomain: 'resource-model',
        sourceType: 'RESOURCE_TYPE',
        sourceId: TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
      },
      visualConfig: lineVisualConfig(TRANSMISSION_LINE_COLOR),
    },
  ];
}

/** Nós do grupo GÁS: só o trecho (Gasoduto). Não há fonte para compressão nem ponto de entrega. */
export function gasNodes(sortOrderBase = 110): StudioGeoNode[] {
  return [
    {
      id: GAS_GROUP_NODE_ID,
      kind: 'GROUP',
      parentNodeId: null,
      label: 'Gás',
      hint: 'Dutos de gás e derivados (IBGE BC250)',
      sortOrder: sortOrderBase,
      active: true,
    },
    {
      id: GAS_PIPELINE_NODE_ID,
      kind: 'ENTITY',
      parentNodeId: GAS_GROUP_NODE_ID,
      label: 'Gasodutos',
      sortOrder: 10,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'RESOURCE',
        sourceDomain: 'resource-model',
        sourceType: 'RESOURCE_TYPE',
        sourceId: GAS_PIPELINE_RESOURCE_TYPE_CODE,
      },
      visualConfig: lineVisualConfig(GAS_PIPELINE_COLOR),
    },
  ];
}

/** Nós do grupo FERROVIA: estação (LOCAL, como a subestação) e trecho (RESOURCE). */
export function railNodes(sortOrderBase = 120): StudioGeoNode[] {
  return [
    {
      id: RAIL_GROUP_NODE_ID,
      kind: 'GROUP',
      parentNodeId: null,
      label: 'Ferrovia',
      hint: 'Malha ferroviária (IBGE BC250 / BCIM)',
      sortOrder: sortOrderBase,
      active: true,
    },
    {
      id: RAIL_STATION_NODE_ID,
      kind: 'ENTITY',
      parentNodeId: RAIL_GROUP_NODE_ID,
      label: 'Estações Ferroviárias',
      sortOrder: 10,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'LOCAL',
        sourceDomain: 'location-model',
        sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
        sourceId: RAIL_STATION_SITE_SPEC_CODE,
      },
      visualConfig: pointVisualConfig(RAIL_STATION_COLOR),
    },
    {
      id: RAIL_SEGMENT_NODE_ID,
      kind: 'ENTITY',
      parentNodeId: RAIL_GROUP_NODE_ID,
      label: 'Trechos Ferroviários',
      sortOrder: 20,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'RESOURCE',
        sourceDomain: 'resource-model',
        sourceType: 'RESOURCE_TYPE',
        sourceId: RAIL_SEGMENT_RESOURCE_TYPE_CODE,
      },
      visualConfig: lineVisualConfig(RAIL_SEGMENT_COLOR),
    },
  ];
}

const DOMAIN_NODES: Record<Domain, (sortOrderBase: number) => StudioGeoNode[]> = {
  energy: energyNodes,
  gas: gasNodes,
  rail: railNodes,
};

/**
 * Acrescenta os nós dos domínios pedidos a um snapshot existente, sem remover nada alheio.
 *
 * `sortOrder` é único **entre irmãos** (`STUDIO_GEO_SIBLING_ORDER_DUPLICATE`), então cada grupo entra
 * depois do maior `sortOrder` de raiz já publicado. Nós com os mesmos ids são substituídos — é o
 * que torna a republicação idempotente. Grupos de domínios não pedidos ficam como estão.
 */
export function mergeDomainNodes(
  existing: StudioGeoNode[],
  domains: readonly Domain[],
): StudioGeoSnapshot {
  const fresh = domains.map((domain) => DOMAIN_NODES[domain]);
  // Ids que o seed publica, descobertos gerando os nós (um único ponto de verdade).
  const ours = new Set(fresh.flatMap((build) => build(0).map((node) => node.id)));
  const kept = existing.filter((node) => !ours.has(node.id));
  let nextRootOrder = kept
    .filter((node) => node.parentNodeId === null)
    .reduce((max, node) => Math.max(max, node.sortOrder), 0);
  const added = fresh.flatMap((build) => {
    nextRootOrder += 10;
    return build(nextRootOrder);
  });
  return { schemaVersion: 3, nodes: [...kept, ...added] };
}

/** Compatibilidade: só o grupo ENERGIA. */
export const mergeEnergyNodes = (existing: StudioGeoNode[]): StudioGeoSnapshot =>
  mergeDomainNodes(existing, ['energy']);

export type PublishResult = { versionNumber: number; nodeCount: number; alreadyPublished: boolean };

/**
 * Publica o catálogo GEO com as camadas de energia.
 *
 * `getStatus` → `saveDraft` → `publish(ifMatch)`, nunca `ensurePublishedBootstrap`: aquele é no-op
 * quando já existe publicação (studio/service.ts:112) e não acrescentaria nós a um catálogo vivo.
 * O `ifMatch` é o checksum devolvido pelo próprio draft.
 */
export async function publishDomainLayers(
  studioService: StudioService,
  context: RequestContext,
  domains: readonly Domain[] = ['energy'],
): Promise<PublishResult> {
  const status = await studioService.getStatus('studio-geo', context);
  const current = (status.publishedVersion?.snapshot ?? { nodes: [] }) as { nodes?: StudioGeoNode[] };
  const snapshot = mergeDomainNodes(current.nodes ?? [], domains);

  const draft = await studioService.saveDraft(
    'studio-geo',
    snapshot as unknown as Record<string, unknown>,
    context,
    status.draftVersion?.checksum,
  );
  const published = await studioService.publish('studio-geo', context, draft.checksum);

  return {
    versionNumber: published.versionNumber,
    nodeCount: snapshot.nodes.length,
    alreadyPublished: Boolean(status.publishedVersion),
  };
}
