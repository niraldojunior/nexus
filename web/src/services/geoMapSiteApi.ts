// Cliente da leitura genérica de Sites do mapa (`GET /v1/geo/map/sites`, issue #314).
//
// Uma requisição por viewport estabilizada, independente do tipo de Site: o cliente envia apenas
// as GeographicSiteSpecifications visíveis no Studio GEO e o servidor não conhece códigos
// especiais. Resources seguem pelo índice por tile (geoMapTileApi).

import { getJson } from './geoApi';
import type { MapBounds } from './geoTreeApi';
import type { MapTileFeature } from './geoMapTileApi';

export type MapSiteResponse = {
  features: MapTileFeature[];
  // Verdadeiro quando o servidor cortou no teto por viewport; o cliente exibe o que veio.
  truncated: boolean;
};

export const fetchMapSites = (
  bounds: MapBounds,
  sourceModelIds: readonly string[],
): Promise<MapSiteResponse> => {
  const params = new URLSearchParams({
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
  });
  for (const id of sourceModelIds) params.append('sourceModelId', id);
  return getJson<MapSiteResponse>(`/v1/geo/map/sites?${params.toString()}`);
};
