// Cliente da leitura genérica de Recursos pontuais do mapa (`GET /v1/geo/map/resources`, issue
// #416). Uma requisição por viewport estabilizada: o cliente envia apenas os ResourceTypes cujas
// camadas POINT estão visíveis no Studio GEO e o servidor filtra por eles.

import { getJson } from './geoApi';
import type { MapBounds } from './geoTreeApi';
import type { MapSiteResponse } from './geoMapSiteApi';

export type MapResourceResponse = MapSiteResponse;

export const fetchMapResources = (
  bounds: MapBounds,
  sourceModelIds: readonly string[],
): Promise<MapResourceResponse> => {
  const params = new URLSearchParams({
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
  });
  for (const id of sourceModelIds) params.append('sourceModelId', id);
  return getJson<MapResourceResponse>(`/v1/geo/map/resources?${params.toString()}`);
};
