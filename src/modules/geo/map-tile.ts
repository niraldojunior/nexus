// Matemática de tile (função pura, sem I/O) para o índice de exibição do mapa
// (`geo_map_feature` — ver scripts/build-map-features.mjs e GeoMapTileService).
//
// Esquema padrão de "slippy map" (mesmo do Google/OSM/MapBox): em cada zoom `z` o mundo vira
// uma grade de 2^z × 2^z tiles em Web Mercator. `MAP_TILE_ZOOM` é o zoom de ARMAZENAMENTO —
// fixo, não o zoom que o usuário está vendo. Um recurso pontual mora em exatamente 1 tile; um
// cabo é recortado (com margem) em cada tile que sua rota atravessa, para o payload de cada
// tile carregar só o trecho que cai nele, nunca a rota inteira.

import type { GeoJSONLineString } from './domain.js';

export type LngLat = [number, number];

export type Tile = { z: number; x: number; y: number };

export type TileBoundsRect = { minLng: number; minLat: number; maxLng: number; maxLat: number };

// z16 ≈ 570 m de lado na latitude do Rio. É o zoom de armazenamento do índice, independente
// da escala de visualização: o Studio GEO decide a visibilidade de cada camada nas faixas
// publicadas. Mudar este valor exige rebuild completo do índice.
export const MAP_TILE_ZOOM = 16;

// Margem de recorte de cabo, em fração do lado do tile — o trecho recortado carrega um pouco
// além da borda para as pontas emendarem sem costura visual entre tiles vizinhos no mapa.
export const MAP_TILE_LINE_MARGIN_FRACTION = 0.05;

function clampLat(lat: number): number {
  // Web Mercator não é definido nos polos; nada no Brasil chega perto, mas o clamp protege
  // contra coordenada anômala vinda de carga/migração.
  const MAX_LAT = 85.05112878;
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

// Índice do tile que contém (lng, lat) no zoom `z`.
export function lngLatToTile(lng: number, lat: number, z: number): Tile {
  const n = 2 ** z;
  const clampedLat = clampLat(lat);
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { z, x: clampWrap(x, n), y: clampWrap(y, n) };
}

// Tile index nunca sai de [0, n) — coordenada exatamente em ±180°/±MAX_LAT cai na borda do
// cálculo em ponto flutuante e pode arredondar para `n` (fora da grade); a longitude também
// deveria dar a volta (antimeridiano), mas nenhuma bbox do produto cruza essa linha.
function clampWrap(value: number, n: number): number {
  return Math.max(0, Math.min(n - 1, value));
}

// Retângulo lng/lat do tile — o inverso de lngLatToTile.
export function tileBounds(z: number, x: number, y: number): TileBoundsRect {
  const n = 2 ** z;
  const lngAt = (tx: number) => (tx / n) * 360 - 180;
  const latAt = (ty: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return {
    minLng: lngAt(x),
    maxLng: lngAt(x + 1),
    // y cresce para baixo (norte → sul), então minLat vem do y maior.
    minLat: latAt(y + 1),
    maxLat: latAt(y),
  };
}

// Todos os tiles cujo retângulo intersecta um bbox lng/lat — usado pelo endpoint de leitura
// para enumerar quais tiles buscar a partir da viewport do mapa.
export function tilesForBounds(bounds: TileBoundsRect, z: number): Tile[] {
  const nwTile = lngLatToTile(bounds.minLng, bounds.maxLat, z);
  const seTile = lngLatToTile(bounds.maxLng, bounds.minLat, z);
  const tiles: Tile[] = [];
  for (let x = nwTile.x; x <= seTile.x; x += 1) {
    for (let y = nwTile.y; y <= seTile.y; y += 1) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

// Expande um retângulo de tile pela margem de recorte (fração do lado), em graus.
function expandBounds(bounds: TileBoundsRect, marginFraction: number): TileBoundsRect {
  const marginLng = (bounds.maxLng - bounds.minLng) * marginFraction;
  const marginLat = (bounds.maxLat - bounds.minLat) * marginFraction;
  return {
    minLng: bounds.minLng - marginLng,
    maxLng: bounds.maxLng + marginLng,
    minLat: bounds.minLat - marginLat,
    maxLat: bounds.maxLat + marginLat,
  };
}

// Liang–Barsky: clipa o segmento a→b contra o retângulo `bounds`. Devolve os dois pontos do
// trecho clipado (podem coincidir com a/b se o segmento já estava dentro) ou `null` se o
// segmento não toca o retângulo.
function clipSegment(a: LngLat, b: LngLat, bounds: TileBoundsRect): [LngLat, LngLat] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [
    a[0] - bounds.minLng,
    bounds.maxLng - a[0],
    a[1] - bounds.minLat,
    bounds.maxLat - a[1],
  ];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null; // paralelo a essa borda e do lado de fora
      continue;
    }
    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  if (t0 > t1) return null;
  const lerp = (t: number): LngLat => [a[0] + dx * t, a[1] + dy * t];
  return [lerp(t0), lerp(t1)];
}

const EPSILON = 1e-9;
const pointsEqual = (a: LngLat, b: LngLat): boolean =>
  Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;

// Recorta uma polyline contra um retângulo (tile + margem), devolvendo 0+ sub-trechos — uma
// rota pode sair e voltar a entrar no tile mais de uma vez. Cada segmento consecutivo é
// clipado isoladamente (Liang–Barsky) e trechos contíguos são costurados numa única
// sub-polyline; um "buraco" (segmento sem interseção) fecha o trecho corrente e abre um novo
// na próxima interseção. Sub-trechos degenerados (< 2 pontos, a rota só tocou a borda) são
// descartados.
export function clipLineToBounds(
  coordinates: LngLat[],
  bounds: TileBoundsRect,
  options: { marginFraction?: number } = {},
): LngLat[][] {
  if (coordinates.length < 2) return [];
  const expanded = expandBounds(bounds, options.marginFraction ?? MAP_TILE_LINE_MARGIN_FRACTION);

  const runs: LngLat[][] = [];
  let current: LngLat[] = [];

  const finalize = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const a = coordinates[i]!;
    const b = coordinates[i + 1]!;
    const clipped = clipSegment(a, b, expanded);
    if (!clipped) {
      finalize();
      continue;
    }
    const [p0, p1] = clipped;
    if (current.length === 0) {
      current.push(p0, p1);
    } else if (pointsEqual(current[current.length - 1]!, p0)) {
      current.push(p1);
    } else {
      finalize();
      current.push(p0, p1);
    }
  }
  finalize();

  return runs;
}

// Todos os tiles que uma polyline atravessa, no zoom `z` — a rota entra em `geo_map_feature`
// uma vez por tile desta lista (recortada por clipLineToBounds em cada um). Por segmento,
// varre o retângulo de tiles que cobre os dois vértices e confirma cada candidato com
// clipSegment contra o tile (não só a caixa envolvente) — correto mesmo quando o segmento é
// diagonal e a caixa envolvente inclui tiles que a reta não toca de fato. Assume vértices
// razoavelmente densos (a rota já vem digitalizada com pontos intermediários, não só as duas
// pontas de um traçado de dezenas de km) — um segmento reto muito longo amplia o retângulo de
// candidatos e o custo deste passo, mas só no tempo de build do índice (script offline), nunca
// na leitura.
export function tilesForLine(coordinates: LngLat[], z: number): Tile[] {
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  const add = (tile: Tile) => {
    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    tiles.push(tile);
  };

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const a = coordinates[i]!;
    const b = coordinates[i + 1]!;
    const ta = lngLatToTile(a[0], a[1], z);
    const tb = lngLatToTile(b[0], b[1], z);
    const minX = Math.min(ta.x, tb.x);
    const maxX = Math.max(ta.x, tb.x);
    const minY = Math.min(ta.y, tb.y);
    const maxY = Math.max(ta.y, tb.y);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        if (clipSegment(a, b, tileBounds(z, x, y))) add({ z, x, y });
      }
    }
  }

  return tiles;
}

// Tile de um recurso pontual — atalho sobre lngLatToTile para quem só tem a geometria GeoJSON.
export function tileForPoint(coordinates: LngLat, z: number = MAP_TILE_ZOOM): Tile {
  return lngLatToTile(coordinates[0], coordinates[1], z);
}

// Tiles + trecho recortado de um cabo, prontos para virar linhas de geo_map_feature. Um tile pode
// receber mais de um trecho quando a rota sai dele e volta a entrar; `rank` é o ordinal estável
// desses trechos na ordem da rota e completa a chave física da projeção.
export function tileSegmentsForLine(
  line: GeoJSONLineString,
  z: number = MAP_TILE_ZOOM,
): Array<{ tile: Tile; coordinates: LngLat[]; rank: number }> {
  const coordinates = line.coordinates as LngLat[];
  const tiles = tilesForLine(coordinates, z);
  const segments: Array<{ tile: Tile; coordinates: LngLat[]; rank: number }> = [];
  for (const tile of tiles) {
    const runs = clipLineToBounds(coordinates, tileBounds(tile.z, tile.x, tile.y));
    for (const [rank, run] of runs.entries()) segments.push({ tile, coordinates: run, rank });
  }
  return segments;
}

// ---------------------------------------------------------------------------------------------
// Indexação por camada: o zoom de armazenamento e a simplificação das LINHAS vêm do Studio GEO
// (visualConfig.tileZoom / simplifyToleranceMeters), não de MAP_TILE_ZOOM. Todo escritor do índice
// e o cliente precisam ler a mesma configuração, ou a camada some do mapa.
// ---------------------------------------------------------------------------------------------

export type LineTiling = { tileZoom: number; toleranceMeters: number };

const METERS_PER_DEGREE = 111_320;

// Douglas-Peucker em lng/lat com distância equiretangular em metros. Preserva os extremos.
export function simplifyLine(coordinates: LngLat[], toleranceMeters: number): LngLat[] {
  if (!(toleranceMeters > 0) || coordinates.length <= 2) return coordinates;
  const midLat = coordinates.reduce((sum, c) => sum + c[1], 0) / coordinates.length;
  const kx = METERS_PER_DEGREE * Math.cos((midLat * Math.PI) / 180);
  const ky = METERS_PER_DEGREE;
  const keep = new Array<boolean>(coordinates.length).fill(false);
  keep[0] = true;
  keep[coordinates.length - 1] = true;
  const stack: Array<[number, number]> = [[0, coordinates.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop() as [number, number];
    const [ax, ay] = [coordinates[start]![0] * kx, coordinates[start]![1] * ky];
    const [bx, by] = [coordinates[end]![0] * kx, coordinates[end]![1] * ky];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const px = coordinates[i]![0] * kx;
      const py = coordinates[i]![1] * ky;
      let dist: number;
      if (lenSq === 0) dist = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index >= 0 && maxDist > toleranceMeters) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return coordinates.filter((_, i) => keep[i]);
}

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

// sourceId (código do ResourceType) → configuração de indexação, só para camadas LINE de RESOURCE_TYPE.
// Camada sem tileZoom/tolerância não entra no mapa: quem consulta cai no padrão (z16, sem simplificar).
export function studioGeoLineTilingIndex(snapshot: unknown): Map<string, LineTiling> {
  const index = new Map<string, LineTiling>();
  const nodes = asObject(snapshot)?.nodes;
  if (!Array.isArray(nodes)) return index;
  for (const entry of nodes) {
    const node = asObject(entry);
    if (!node || node.kind !== 'ENTITY') continue;
    const entity = asObject(node.entity);
    if (!entity || entity.sourceType !== 'RESOURCE_TYPE') continue;
    if (typeof entity.sourceId !== 'string' || !entity.sourceId.trim()) continue;
    const visual = asObject(node.visualConfig);
    if (visual?.geometryKind !== 'LINE') continue;
    const zoom = visual.tileZoom;
    const tolerance = visual.simplifyToleranceMeters;
    const tileZoom =
      typeof zoom === 'number' && Number.isInteger(zoom) && zoom >= 6 && zoom <= 16
        ? zoom
        : MAP_TILE_ZOOM;
    const toleranceMeters =
      typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0
        ? Math.min(tolerance, 500)
        : 0;
    index.set(entity.sourceId.trim(), { tileZoom, toleranceMeters });
  }
  return index;
}

export function tileSegmentsForLayerLine(
  line: GeoJSONLineString,
  tiling?: LineTiling,
): Array<{ tile: Tile; coordinates: LngLat[]; rank: number }> {
  const zoom = tiling?.tileZoom ?? MAP_TILE_ZOOM;
  const coordinates = simplifyLine(line.coordinates as LngLat[], tiling?.toleranceMeters ?? 0);
  return tileSegmentsForLine({ ...line, coordinates }, zoom);
}

// ---------------------------------------------------------------------------------------------
// LOD multirresolução das linhas (issue #317). Cada camada LINE do Studio GEO declara perfis
// (`lodProfiles`) e cada faixa de escala escolhe um. O índice materializa UMA vez cada perfil
// referenciado, gravado em `geo_map_feature.lod_key`; o cliente pede exatamente o LOD da faixa.
// ---------------------------------------------------------------------------------------------

/** `lod_key` de pontos e de qualquer feature que não tem pirâmide de LOD. */
export const MAP_BASE_LOD_KEY = 'base';
/** `lod_key` do perfil único de camadas LINE sem `lodProfiles` (tileZoom/tolerância legados). */
export const MAP_LEGACY_LOD_KEY = 'legacy';

export type LineLodProfile = { key: string; tileZoom: number; toleranceMeters: number };

const SCALE_BAND_ORDER = [
  'le5m',
  'le10m',
  'le20m',
  'le50m',
  'le100m',
  'le500m',
  'le1km',
  'gt1km',
] as const;

const validTileZoom = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 6 && value <= 16
    ? value
    : MAP_TILE_ZOOM;

const validTolerance = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, 500) : 0;

/**
 * Perfis de LOD efetivamente usados por cada camada LINE de RESOURCE_TYPE (sourceId → perfis).
 * Sem `lodProfiles`, a camada tem um único perfil `legacy` (tileZoom/tolerância antigos). Só entram
 * perfis referenciados por alguma faixa; faixa sem `lodProfileId` válido usa o primeiro perfil.
 */
export function studioGeoLineLodIndex(snapshot: unknown): Map<string, LineLodProfile[]> {
  const index = new Map<string, LineLodProfile[]>();
  const nodes = asObject(snapshot)?.nodes;
  if (!Array.isArray(nodes)) return index;
  for (const entry of nodes) {
    const node = asObject(entry);
    if (!node || node.kind !== 'ENTITY') continue;
    const entity = asObject(node.entity);
    if (!entity || entity.sourceType !== 'RESOURCE_TYPE') continue;
    if (typeof entity.sourceId !== 'string' || !entity.sourceId.trim()) continue;
    const visual = asObject(node.visualConfig);
    if (visual?.geometryKind !== 'LINE') continue;

    const declared: LineLodProfile[] = [];
    if (Array.isArray(visual.lodProfiles)) {
      for (const raw of visual.lodProfiles) {
        const profile = asObject(raw);
        if (!profile || typeof profile.id !== 'string' || !profile.id) continue;
        declared.push({
          key: profile.id,
          tileZoom: validTileZoom(profile.tileZoom),
          toleranceMeters: validTolerance(profile.simplifyToleranceMeters),
        });
      }
    }
    if (declared.length === 0) {
      index.set(entity.sourceId.trim(), [
        {
          key: MAP_LEGACY_LOD_KEY,
          tileZoom: validTileZoom(visual.tileZoom),
          toleranceMeters: validTolerance(visual.simplifyToleranceMeters),
        },
      ]);
      continue;
    }

    const byKey = new Map(declared.map((profile) => [profile.key, profile]));
    const bands = asObject(visual.scaleBands) ?? {};
    const used = new Set<string>();
    for (const band of SCALE_BAND_ORDER) {
      const id = asObject(bands[band])?.lodProfileId;
      used.add(typeof id === 'string' && byKey.has(id) ? id : declared[0]!.key);
    }
    index.set(
      entity.sourceId.trim(),
      declared.filter((profile) => used.has(profile.key)),
    );
  }
  return index;
}

/** Fragmentos de uma linha em todos os perfis de LOD dados, já recortados por tile. */
export function tileSegmentsForLineLods(
  line: GeoJSONLineString,
  profiles: readonly LineLodProfile[] | undefined,
): Array<{ lodKey: string; tile: Tile; coordinates: LngLat[]; rank: number }> {
  const effective = profiles?.length
    ? profiles
    : [{ key: MAP_LEGACY_LOD_KEY, tileZoom: MAP_TILE_ZOOM, toleranceMeters: 0 }];
  return effective.flatMap((profile) =>
    tileSegmentsForLayerLine(line, {
      tileZoom: profile.tileZoom,
      toleranceMeters: profile.toleranceMeters,
    }).map((segment) => ({ ...segment, lodKey: profile.key })),
  );
}
