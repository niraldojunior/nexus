// Cliente do índice de exibição do mapa por tile (`GET /v1/geo/map/tile` — Fase 2 da
// reengenharia de performance, issue #69). Leitura por tile único (z/x/y), não por bbox: quem
// decide quais tiles faltam é o cliente (ver useMapTiles), que mantém o cache local.

import { getJson, type GeoGeometry } from './geoApi';
import type { Tile } from '../utils/mapTile';

export type MapTileFeature = {
  entityId: string;
  kind: 'resource' | 'site';
  entityType: string;
  shape: 'point' | 'line';
  typeCode?: string;
  siteCategory?: string;
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

export const fetchMapTile = (tile: Tile): Promise<MapTileFeature[]> =>
  getJson<MapTileFeature[]>(`/v1/geo/map/tile?z=${tile.z}&x=${tile.x}&y=${tile.y}`);
