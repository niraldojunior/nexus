/**
 * Camadas do mapa dos cabos submarinos no catálogo Studio GEO.
 *
 * Mesmo desenho das camadas do seed DEMO (scripts/seed-demo-infrastructure/studio-geo.ts): o cabo é
 * RESOURCE/RESOURCE_TYPE (recurso linear com `place` em GeographicLocation) e os equipamentos são
 * LOCAL/GEOGRAPHIC_SITE_SPECIFICATION — quem desenha o ponto é o `GeographicSite`, não o recurso. As
 * cores são o ponto de partida; o ajuste fino é feito no Studio.
 */

import type { StudioGeoNode } from '../../src/modules/studio/adapters/studio-geo-adapter.js';
import {
  lineVisualConfig,
  pointVisualConfig,
  type NodeBuilder,
} from '../seed-demo-infrastructure/studio-geo.js';
import {
  BMH_SITE_SPEC_CODE,
  BRANCHING_UNIT_SITE_SPEC_CODE,
  EQUALIZER_SITE_SPEC_CODE,
  REPEATER_SITE_SPEC_CODE,
  SUBMARINE_CABLE_RESOURCE_TYPE_CODE,
} from './mapper.js';

/** Ids dos nós publicados — casam `/^[A-Za-z][A-Za-z0-9-]*$/` (studio-geo-adapter.ts). */
export const SUBMARINE_GROUP_NODE_ID = 'cabos-submarinos';
export const SUBMARINE_CABLE_NODE_ID = 'cabos-submarinos-cabo';
export const SUBMARINE_BMH_NODE_ID = 'cabos-submarinos-bmh';
export const SUBMARINE_BU_NODE_ID = 'cabos-submarinos-bu';
export const SUBMARINE_REPEATER_NODE_ID = 'cabos-submarinos-repetidor';
export const SUBMARINE_EQUALIZER_NODE_ID = 'cabos-submarinos-equalizador';

const COLORS = {
  cable: '#1d4ed8',
  bmh: '#0f766e',
  branchingUnit: '#7c3aed',
  repeater: '#0891b2',
  equalizer: '#db2777',
} as const;

const siteNode = (
  id: string,
  label: string,
  sortOrder: number,
  specCode: string,
  color: string,
  defaultVisible = true,
): StudioGeoNode => ({
  id,
  kind: 'ENTITY',
  parentNodeId: SUBMARINE_GROUP_NODE_ID,
  label,
  sortOrder,
  active: true,
  defaultVisible,
  entity: {
    category: 'LOCAL',
    sourceDomain: 'location-model',
    sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
    sourceId: specCode,
  },
  visualConfig: pointVisualConfig(color),
});

/**
 * Nós do grupo CABOS SUBMARINOS. Repetidores (um a cada ~60–100 km de cabo) nascem desligados:
 * são detalhe de manutenção e poluem a visão continental.
 */
export const submarineNodes: NodeBuilder = (sortOrderBase) => [
  {
    id: SUBMARINE_GROUP_NODE_ID,
    kind: 'GROUP',
    parentNodeId: null,
    label: 'Cabos Submarinos',
    hint: 'Sistemas submarinos V.tal (GlobeNet e Malbec)',
    sortOrder: sortOrderBase,
    active: true,
  },
  {
    id: SUBMARINE_CABLE_NODE_ID,
    kind: 'ENTITY',
    parentNodeId: SUBMARINE_GROUP_NODE_ID,
    label: 'Cabos submarinos',
    sortOrder: 10,
    active: true,
    defaultVisible: true,
    entity: {
      category: 'RESOURCE',
      sourceDomain: 'resource-model',
      sourceType: 'RESOURCE_TYPE',
      sourceId: SUBMARINE_CABLE_RESOURCE_TYPE_CODE,
    },
    visualConfig: lineVisualConfig(COLORS.cable),
  },
  siteNode(SUBMARINE_BMH_NODE_ID, 'Beach Manholes (BMH)', 20, BMH_SITE_SPEC_CODE, COLORS.bmh),
  siteNode(
    SUBMARINE_BU_NODE_ID,
    'Branching Units (BU)',
    30,
    BRANCHING_UNIT_SITE_SPEC_CODE,
    COLORS.branchingUnit,
  ),
  siteNode(
    SUBMARINE_REPEATER_NODE_ID,
    'Repetidores',
    40,
    REPEATER_SITE_SPEC_CODE,
    COLORS.repeater,
    false,
  ),
  siteNode(
    SUBMARINE_EQUALIZER_NODE_ID,
    'Equalizadores',
    50,
    EQUALIZER_SITE_SPEC_CODE,
    COLORS.equalizer,
  ),
];
