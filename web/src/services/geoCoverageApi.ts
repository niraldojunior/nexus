// Cliente da cobertura do mapa (`/v1/geo/coverage`) — a fonte do mapa de 50 m para cima, no lugar
// dos recursos individuais e dos clusters (ver GeoCoverageService no backend). `level` escolhe
// o LOD: polígono de bairro, de município ou de estado (ver coverageLevelForScale). `sourceType`/
// `sourceId` identificam a camada publicada no Studio GEO (ver CoverageLayer no backend) — GPON
// é hoje o único gerador, mas o cliente não sabe disso.

import { getJson } from './geoApi';
import type { MapBounds } from './geoTreeApi';
import type { CoverageLevel } from '../utils/mapScale';

export type CoveragePolygon = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };

export type CoverageLayerRef = { sourceType: string; sourceId: string };

export type CoverageNeighborhood = {
  id: number;
  areaIds: string[];
  neighborhoodKey: string;
  neighborhood: string;
  city: string;
  uf: string;
  unitTotal: number;
  unitAvailable: number;
  unitUnavailable: number;
  unitLabel: string | null;
  availabilityRatio: number;
  coveredAreaKm2: number;
  portsTotal: number | null;
  portsUsed: number | null;
};

export type CoverageArea = {
  id: string;
  neighborhoodIndex: number;
  geometry: CoveragePolygon;
  // [minLng, minLat, maxLng, maxLat] — usado pelo canvas para culling sem reprocessar a
  // geometria a cada frame (ver CoverageOverlay.draw).
  bounds?: [number, number, number, number];
};

export type CoverageResponse = {
  level: CoverageLevel;
  grid: { sizeMeters: number; projection: 'EPSG:3857' };
  cells: number[][];
  areas: CoverageArea[];
  neighborhoods: CoverageNeighborhood[];
  truncated: boolean;
};

export const fetchCoverage = (
  bounds: MapBounds,
  level: CoverageLevel,
  layer?: CoverageLayerRef | null,
): Promise<CoverageResponse> => {
  const params = new URLSearchParams({
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
    level,
  });
  if (layer) {
    params.set('sourceType', layer.sourceType);
    params.set('sourceId', layer.sourceId);
  }
  return getJson<CoverageResponse>(`/v1/geo/coverage?${params.toString()}`);
};
