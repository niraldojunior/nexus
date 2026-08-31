// Cliente da cobertura GPON (`/v1/geo/coverage`) — a fonte do mapa de 50 m para cima, no lugar
// dos recursos individuais e dos clusters (ver GeoCoverageService no backend). `level` escolhe
// o LOD: polígono de bairro, de município ou de estado (ver coverageLevelForScale).

import { getJson, getJsonOrUndefined } from './geoApi';
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

// Resultado da consulta inversa de cobertura (REQ-MOD01-014): parte do ponto de um Resource
// e devolve a célula de grade e as áreas indexadas que o contêm. Diferente da resposta por bbox,
// as áreas já trazem as métricas diretamente, sem geometria para desenhar no mapa.
export type CoveragePointCell = {
  gridX: number;
  gridY: number;
  cdoTotal: number;
  cdoAvailable: number;
  sizeMeters: number;
};

export type CoveragePointArea = {
  level: CoverageLevel;
  id: string;
  neighborhoodKey: string;
  neighborhood: string;
  city: string;
  uf: string;
  cdoTotal: number;
  cdoAvailable: number;
  availabilityRatio: number;
  coveredAreaKm2: number;
  portsTotal: number | null;
  portsUsed: number | null;
};

export type CoveragePointResult = {
  point: { lng: number; lat: number };
  cell: CoveragePointCell | null;
  areas: CoveragePointArea[];
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

// 404 é esperado quando o Resource não existe ou não tem uma geometria Point. A aba converte esse
// caso em uma explicação de ausência de cobertura, e reserva erro visual para falhas reais da API.
export const fetchCoverageByResource = (
  resourceId: string,
): Promise<CoveragePointResult | undefined> =>
  getJsonOrUndefined<CoveragePointResult>(
    `/v1/geo/coverage/by-resource/${encodeURIComponent(resourceId)}`,
  );
