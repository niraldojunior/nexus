// Forma de uma feature do índice de exibição do mapa (`geographic_map_feature` — Fase 2 da
// reengenharia de performance, issue #69), comum às leituras por bbox de Sites (geoMapSiteApi),
// Recursos pontuais (geoMapResourceApi) e Linhas (geoMapLineApi). O mapa não lê mais por tile
// único (`GET /v1/geo/map/tile`): o fan-out de tiles z16 crescia com a área da viewport (#416).

import type { GeoGeometry } from './geoApi';

export type MapTileFeature = {
  entityId: string;
  kind: 'resource' | 'site';
  entityType: string;
  shape: 'point' | 'line' | 'polygon';
  typeCode?: string;
  siteCategory?: string;
  sourceModelType?: 'GEOGRAPHIC_SITE_SPECIFICATION' | 'RESOURCE_TYPE';
  sourceModelId?: string;
  status?: string;
  label: string;
  sublabel?: string;
  lng: number;
  lat: number;
  // Só em shape 'line' — o trecho da rota já recortado (com margem) para ESTE tile, não a
  // rota inteira. Ver GeoTreeService.resourcesByIds para a geometria completa (hidratação
  // de seleção).
  geometry?: GeoGeometry;
};

// Chave estável de um GeoTreeNode a partir de uma feature de tile — mesmo formato
// (`resource:<uuid>` | `site:<uuid>`) usado pela árvore/busca/seleção.
export const mapTileFeatureNodeId = (feature: MapTileFeature): string =>
  `${feature.kind}:${feature.entityId}`;
