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
  SUBSTATION_SITE_SPEC_CODE,
  TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
} from './mapper.js';

/** Ids dos nós publicados — casam `/^[A-Za-z][A-Za-z0-9-]*$/` (studio-geo-adapter.ts:170). */
export const ENERGY_GROUP_NODE_ID = 'energia';
export const SUBSTATION_NODE_ID = 'energia-subestacao';
export const TRANSMISSION_LINE_NODE_ID = 'energia-linha';

const SUBSTATION_COLOR = '#f59e0b';
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
      id: TRANSMISSION_LINE_NODE_ID,
      kind: 'ENTITY',
      parentNodeId: ENERGY_GROUP_NODE_ID,
      label: 'Linhas de transmissão',
      sortOrder: 20,
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

/**
 * Acrescenta os nós de energia a um snapshot existente, sem remover nada.
 *
 * `sortOrder` é único **entre irmãos** (`STUDIO_GEO_SIBLING_ORDER_DUPLICATE`), então o grupo entra
 * depois do maior `sortOrder` de raiz já publicado. Nós com os mesmos ids são substituídos — é o
 * que torna a republicação idempotente.
 */
export function mergeEnergyNodes(existing: StudioGeoNode[]): StudioGeoSnapshot {
  const ours = new Set([ENERGY_GROUP_NODE_ID, SUBSTATION_NODE_ID, TRANSMISSION_LINE_NODE_ID]);
  const kept = existing.filter((node) => !ours.has(node.id));
  const maxRootOrder = kept
    .filter((node) => node.parentNodeId === null)
    .reduce((max, node) => Math.max(max, node.sortOrder), 0);
  return { schemaVersion: 3, nodes: [...kept, ...energyNodes(maxRootOrder + 10)] };
}

export type PublishResult = { versionNumber: number; nodeCount: number; alreadyPublished: boolean };

/**
 * Publica o catálogo GEO com as camadas de energia.
 *
 * `getStatus` → `saveDraft` → `publish(ifMatch)`, nunca `ensurePublishedBootstrap`: aquele é no-op
 * quando já existe publicação (studio/service.ts:112) e não acrescentaria nós a um catálogo vivo.
 * O `ifMatch` é o checksum devolvido pelo próprio draft.
 */
export async function publishEnergyLayers(
  studioService: StudioService,
  context: RequestContext,
): Promise<PublishResult> {
  const status = await studioService.getStatus('studio-geo', context);
  const current = (status.publishedVersion?.snapshot ?? { nodes: [] }) as { nodes?: StudioGeoNode[] };
  const snapshot = mergeEnergyNodes(current.nodes ?? []);

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
