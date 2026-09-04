import type { GeoLocation } from '../../../services/geoApi';

export type SpatialPosition = [number, number];

export const closePolygonRing = (vertices: SpatialPosition[]): SpatialPosition[] =>
  vertices.length === 0 ? [] : [...vertices, [...vertices[0]] as SpatialPosition];

export const polygonVertices = (geometry: GeoLocation['geometry']): SpatialPosition[] => {
  if (geometry.type !== 'Polygon') return [];
  const ring = geometry.coordinates[0] ?? [];
  const vertices = ring.map(([lng, lat]) => [lng, lat] as SpatialPosition);
  if (vertices.length > 1) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) vertices.pop();
  }
  return vertices;
};

export const polygonFromVertices = (
  vertices: SpatialPosition[],
): Extract<GeoLocation['geometry'], { type: 'Polygon' }> => ({
  type: 'Polygon',
  coordinates: [closePolygonRing(vertices)],
});

export const polygonIsReady = (vertices: SpatialPosition[]): boolean => vertices.length >= 3;
