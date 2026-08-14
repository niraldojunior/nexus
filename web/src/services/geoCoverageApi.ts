// Cliente da cobertura GPON por bairro (`/v1/geo/coverage`) — a fonte do mapa de 50 m para cima,
// no lugar dos recursos individuais e dos clusters (ver GeoCoverageService no backend).

import { getJson } from './geoApi';
import type { MapBounds } from './geoTreeApi';
import type { CoverageLevel } from '../utils/mapScale';

export type CoveragePolygon = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };

export type CoverageNeighborhood = {
  id: number;
  areaIds: string[];
  neighborhoodKey: string;
  neighborhood: string;
  city: string;
  uf: string;
  cdoTotal: number;
  cdoAvailable: number;
  cdoUnavailable: number;
  availabilityRatio: number;
  coveredAreaKm2: number;
  portsTotal: number | null;
  portsUsed: number | null;
};

export type CoverageArea = {
  id: string;
  neighborhoodIndex: number;
  geometry: CoveragePolygon;
};

export type CoverageResponse = {
  level: CoverageLevel;
  grid: { sizeMeters: number; projection: 'EPSG:3857' };
  // fine: [gridX, gridY, cdoTotal, cdoAvailable, neighborhoodIndex]
  // coarse: [gridX, gridY, cdoTotal, cdoAvailable]
  cells: number[][];
  areas: CoverageArea[];
  neighborhoods: CoverageNeighborhood[];
  truncated: boolean;
};

export const fetchCoverage = (
  bounds: MapBounds,
  level: CoverageLevel,
): Promise<CoverageResponse> => {
  const params = new URLSearchParams({
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
    level,
  });
  return getJson<CoverageResponse>(`/v1/geo/coverage?${params.toString()}`);
};
