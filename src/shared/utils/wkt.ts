/**
 * Parser mínimo de WKT (Well-Known Text) para GeoJSON — só o que a carga de OSP do Netwin
 * precisa: `SDO_UTIL.TO_WKTGEOMETRY` no Oracle de origem devolve `POINT (...)` e
 * `LINESTRING (...)`, sem Z/M, sem MULTI*, sem CRS embutido (ver `src/scripts/migrate-netwin-osp.ts`,
 * que já valida `SDO_SRID = 4326` antes de gravar).
 */
import type { GeoJSONLineString, GeoJSONPoint } from '../../modules/geo/domain.js';

function parseCoordinates(text: string): [number, number][] {
  return text
    .trim()
    .split(',')
    .map((pair) => {
      const [lng, lat] = pair
        .trim()
        .split(/\s+/)
        .map(Number);
      if (lng === undefined || lat === undefined || !Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new Error(`Coordenada WKT inválida: "${pair}"`);
      }
      return [lng, lat] as [number, number];
    });
}

export function parseWktLineString(wkt: string): GeoJSONLineString {
  const match = /^\s*LINESTRING\s*\(([^)]*)\)\s*$/i.exec(wkt);
  if (!match?.[1]) throw new Error(`WKT não é um LINESTRING válido: "${wkt}"`);
  const coordinates = parseCoordinates(match[1]);
  if (coordinates.length < 2) throw new Error(`LINESTRING precisa de ao menos 2 pontos: "${wkt}"`);
  return { type: 'LineString', coordinates };
}

export function parseWktPoint(wkt: string): GeoJSONPoint {
  const match = /^\s*POINT\s*\(([^)]*)\)\s*$/i.exec(wkt);
  if (!match?.[1]) throw new Error(`WKT não é um POINT válido: "${wkt}"`);
  const [point] = parseCoordinates(match[1]);
  if (!point) throw new Error(`POINT sem coordenada: "${wkt}"`);
  return { type: 'Point', coordinates: point };
}
