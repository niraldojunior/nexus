// Cliente da leitura agregada de linhas do mapa (`GET /v1/geo/map/lines`, issue #317).
//
// Uma requisição por viewport estabilizada, com exatamente um LOD por camada linear visível.

import { getJson } from './geoApi';
import type { MapBounds } from './geoTreeApi';
import type { MapTileFeature } from './geoMapTileApi';

export type MapLineSelection = { sourceModelId: string; lodKey: string };

export type MapLineResponse = {
  features: MapTileFeature[];
  // Verdadeiro quando o servidor cortou no teto de fragmentos; nunca é silencioso.
  truncated: boolean;
  selections: Array<MapLineSelection & { tileZoom: number | null; fragments: number }>;
};

export const fetchMapLines = (
  bounds: MapBounds,
  selections: readonly MapLineSelection[],
): Promise<MapLineResponse> => {
  const params = new URLSearchParams({
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
  });
  for (const selection of selections) {
    params.append('line', `${selection.sourceModelId}:${selection.lodKey}`);
  }
  return getJson<MapLineResponse>(`/v1/geo/map/lines?${params.toString()}`);
};
