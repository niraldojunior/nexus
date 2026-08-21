// Cliente da densidade agregada da planta (`GET /v1/geo/map/density` — Fase 4, issue #69).
//
// Ao contrário do índice por tile (geoMapTileApi), a leitura é por BBOX: em zoom aberto a
// viewport cobre poucas células grossas, e pedir uma a uma custaria mais em ida-e-volta do que a
// consulta inteira. Mesmo formato de geoCoverageApi, inclusive a flag `truncated`.

import { getJson } from './geoApi';
import type { MapDensityZoom } from '../utils/mapScale';
import type { MapBounds } from './geoTreeApi';

export type MapDensityCell = {
  x: number;
  y: number;
  // Entidades distintas na célula — um cabo que atravessa vários tiles conta uma vez só.
  count: number;
  resources: number;
  sites: number;
  // Centroide das features, não o centro do tile: o ponto cai onde a planta está.
  lng: number;
  lat: number;
};

export type MapDensityResponse = {
  z: MapDensityZoom;
  cells: MapDensityCell[];
  // Verdadeiro quando o servidor cortou no teto (MAX_CELLS) — as células mais densas foram
  // preservadas. Só acontece com bbox anômalo; o cliente exibe o que veio.
  truncated: boolean;
};

export const fetchMapDensity = (
  z: MapDensityZoom,
  bounds: MapBounds,
): Promise<MapDensityResponse> => {
  const params = new URLSearchParams({
    z: String(z),
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
  });
  return getJson<MapDensityResponse>(`/v1/geo/map/density?${params.toString()}`);
};
