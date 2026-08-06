import type { GeoGeometry } from '../services/geoApi';

export type StreetViewTarget = {
  label?: 'Início' | 'Fim';
  point: [number, number];
};

export function isValidStreetViewPoint(
  point: [number, number] | null | undefined,
): point is [number, number] {
  if (!point) return false;
  const [lng, lat] = point;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

export function streetViewTargetsForGeometry(
  geometry: GeoGeometry | null | undefined,
): StreetViewTarget[] {
  if (!geometry) return [];

  if (geometry.type === 'Point') {
    return isValidStreetViewPoint(geometry.coordinates) ? [{ point: geometry.coordinates }] : [];
  }

  if (geometry.type !== 'LineString' || geometry.coordinates.length < 2) return [];

  const start = geometry.coordinates[0];
  const end = geometry.coordinates[geometry.coordinates.length - 1];
  if (!start || !end || !isValidStreetViewPoint(start) || !isValidStreetViewPoint(end)) return [];

  return [
    { label: 'Início', point: start },
    { label: 'Fim', point: end },
  ];
}
