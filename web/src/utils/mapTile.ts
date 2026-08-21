// Matemática de tile (função pura, sem I/O) para o cliente decidir quais tiles pedir ao
// índice de exibição do mapa (`geo_map_feature` — ver useMapTiles/geoMapTileApi). Espelha
// `src/modules/geo/map-tile.ts` do backend: mesmo esquema de "slippy map" (grade 2^z × 2^z em
// Web Mercator), mesmo MAP_TILE_ZOOM fixo — precisa ser o MESMO valor dos dois lados, senão o
// cliente pede tiles que não existem no índice. Duplicado aqui (não importado de `src/`) pelo
// mesmo motivo que CoverageOverlay.ts já duplica lngLatToMercator: o bundle do frontend (Vite)
// e o do backend (Node/tsc) são builds separados.

export type Tile = { z: number; x: number; y: number };

export type TileBoundsRect = { minLng: number; minLat: number; maxLng: number; maxLat: number };

// Zoom de ARMAZENAMENTO do índice — fixo, não o zoom que o usuário está vendo no mapa. Precisa
// bater com MAP_TILE_ZOOM do backend (src/modules/geo/map-tile.ts).
export const MAP_TILE_ZOOM = 16;

function clampLat(lat: number): number {
  const MAX_LAT = 85.05112878;
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

function clampWrap(value: number, n: number): number {
  return Math.max(0, Math.min(n - 1, value));
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

// Retângulo lng/lat do tile — o inverso de lngLatToTile. Não usado pelo hook (que só precisa
// enumerar tiles, não seus limites), mas exportado pra manter paridade com o módulo do backend
// e permitir testar consistência ponto↔tile.
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

// Todos os tiles cujo retângulo intersecta um bbox lng/lat — a viewport do mapa vira esta
// lista, e o hook busca só os que ainda não estão no cache local (ver useMapTiles).
export function tilesForBounds(bounds: TileBoundsRect, z: number = MAP_TILE_ZOOM): Tile[] {
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

export const tileKey = (tile: Tile): string => `${tile.z}:${tile.x}:${tile.y}`;
