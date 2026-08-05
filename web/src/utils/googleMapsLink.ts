import type { GeoGeometry } from '../services/geoApi';

export type StreetViewTarget = {
  label?: 'Início' | 'Fim';
  point: [number, number];
};

const isValidPoint = ([lng, lat]: [number, number]): boolean =>
  Number.isFinite(lng) &&
  Number.isFinite(lat) &&
  lng >= -180 &&
  lng <= 180 &&
  lat >= -90 &&
  lat <= 90;

export function buildGoogleMapsStreetViewUrl(
  point: [number, number] | null | undefined,
): string | null {
  if (!point || !isValidPoint(point)) return null;

  const [lng, lat] = point;
  const url = new URL('https://www.google.com/maps/@');
  url.searchParams.set('api', '1');
  url.searchParams.set('map_action', 'pano');
  url.searchParams.set('viewpoint', `${lat},${lng}`);
  return url.toString();
}

export function streetViewTargetsForGeometry(
  geometry: GeoGeometry | null | undefined,
): StreetViewTarget[] {
  if (!geometry) return [];

  if (geometry.type === 'Point') {
    return isValidPoint(geometry.coordinates) ? [{ point: geometry.coordinates }] : [];
  }

  if (geometry.type !== 'LineString' || geometry.coordinates.length < 2) return [];

  const start = geometry.coordinates[0];
  const end = geometry.coordinates[geometry.coordinates.length - 1];
  if (!start || !end || !isValidPoint(start) || !isValidPoint(end)) return [];

  return [
    { label: 'Início', point: start },
    { label: 'Fim', point: end },
  ];
}
