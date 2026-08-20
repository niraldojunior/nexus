import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  clipLineToBounds,
  lngLatToTile,
  tileBounds,
  tileForPoint,
  tileSegmentsForLine,
  tilesForBounds,
  tilesForLine,
  MAP_TILE_ZOOM,
  type LngLat,
  type TileBoundsRect,
} from '../src/modules/geo/map-tile.js';

// Icaraí, Niterói — mesma coordenada de referência usada em geo.coverage.unit.spec.ts.
const ICARAI: LngLat = [-43.106, -22.906];

test('lngLatToTile → tileBounds é consistente: o ponto sempre cai dentro do seu próprio tile', () => {
  for (const z of [10, 14, MAP_TILE_ZOOM, 19]) {
    const tile = lngLatToTile(ICARAI[0], ICARAI[1], z);
    const bounds = tileBounds(z, tile.x, tile.y);
    assert.ok(ICARAI[0] >= bounds.minLng && ICARAI[0] <= bounds.maxLng, `lng fora do tile em z${z}`);
    assert.ok(ICARAI[1] >= bounds.minLat && ICARAI[1] <= bounds.maxLat, `lat fora do tile em z${z}`);
    assert.ok(tile.x >= 0 && tile.x < 2 ** z);
    assert.ok(tile.y >= 0 && tile.y < 2 ** z);
  }
});

test('lngLatToTile: um ponto do lado oposto de uma borda de tile cai no tile vizinho', () => {
  const z = MAP_TILE_ZOOM;
  const tile = lngLatToTile(ICARAI[0], ICARAI[1], z);
  const bounds = tileBounds(z, tile.x, tile.y);

  const justInsideEast: LngLat = [bounds.maxLng - 1e-7, ICARAI[1]];
  const justOutsideEast: LngLat = [bounds.maxLng + 1e-7, ICARAI[1]];
  assert.deepEqual(lngLatToTile(...justInsideEast, z), tile);
  assert.equal(lngLatToTile(...justOutsideEast, z).x, tile.x + 1);

  // y cresce para o sul: um pouco abaixo de minLat cai no tile de baixo (y+1).
  const justBelowSouth: LngLat = [ICARAI[0], bounds.minLat - 1e-7];
  assert.equal(lngLatToTile(...justBelowSouth, z).y, tile.y + 1);
});

test('tileForPoint delega para lngLatToTile no zoom de armazenamento', () => {
  assert.deepEqual(tileForPoint(ICARAI), lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM));
});

test('tilesForBounds cobre exatamente o retângulo de 2×2 tiles vizinhos', () => {
  const z = MAP_TILE_ZOOM;
  const origin = lngLatToTile(ICARAI[0], ICARAI[1], z);
  const center = (b: TileBoundsRect): LngLat => [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
  // Envelope dos CENTROS do tile NW e do tile SE do bloco — nunca cai exatamente sobre uma
  // linha de grade (ao contrário de usar as bordas dos tiles), então não há ambiguidade de
  // ponto flutuante sobre "a borda pertence a qual tile".
  const nwCenter = center(tileBounds(z, origin.x, origin.y));
  const seCenter = center(tileBounds(z, origin.x + 1, origin.y + 1));
  const bbox = {
    minLng: nwCenter[0],
    maxLng: seCenter[0],
    minLat: seCenter[1],
    maxLat: nwCenter[1],
  };

  const tiles = tilesForBounds(bbox, z);
  const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
  assert.equal(keys.size, 4);
  for (const dx of [0, 1]) {
    for (const dy of [0, 1]) {
      assert.ok(keys.has(`${origin.x + dx},${origin.y + dy}`), `faltou o tile (${dx},${dy})`);
    }
  }
});

test('clipLineToBounds: rota inteiramente dentro do tile volta como um único trecho igual', () => {
  const origin = lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM);
  const bounds = tileBounds(MAP_TILE_ZOOM, origin.x, origin.y);
  const midLng = (bounds.minLng + bounds.maxLng) / 2;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const route: LngLat[] = [
    [midLng - 0.0005, midLat - 0.0005],
    [midLng, midLat],
    [midLng + 0.0005, midLat + 0.0005],
  ];

  const runs = clipLineToBounds(route, bounds, { marginFraction: 0 });
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], route);
});

test('clipLineToBounds: rota inteiramente fora do tile não produz nenhum trecho', () => {
  const origin = lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM);
  const bounds = tileBounds(MAP_TILE_ZOOM, origin.x, origin.y);
  const farAway: LngLat[] = [
    [bounds.maxLng + 1, bounds.maxLat + 1],
    [bounds.maxLng + 2, bounds.maxLat + 2],
  ];
  assert.deepEqual(clipLineToBounds(farAway, bounds, { marginFraction: 0 }), []);
});

test('clipLineToBounds: rota que atravessa o tile uma vez é cortada nos dois pontos de borda', () => {
  const bounds = { minLng: -43.11, minLat: -22.91, maxLng: -43.1, maxLat: -22.9 };
  // Reta horizontal que entra pela esquerda e sai pela direita, passando pelo meio.
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const route: LngLat[] = [
    [bounds.minLng - 0.01, midLat],
    [bounds.maxLng + 0.01, midLat],
  ];

  const runs = clipLineToBounds(route, bounds, { marginFraction: 0 });
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.length, 2);
  assert.ok(Math.abs(runs[0]![0]![0] - bounds.minLng) < 1e-9);
  assert.ok(Math.abs(runs[0]![1]![0] - bounds.maxLng) < 1e-9);
});

test('clipLineToBounds: rota que sai e volta a entrar no tile produz dois trechos', () => {
  const bounds = { minLng: -43.11, minLat: -22.91, maxLng: -43.1, maxLat: -22.9 };
  const y1 = bounds.minLat + (bounds.maxLat - bounds.minLat) * 0.3;
  const y2 = bounds.minLat + (bounds.maxLat - bounds.minLat) * 0.7;
  // Zigue-zague: entra pela esquerda em y1, sai pela direita, volta a entrar pela direita em
  // y2 (outro ponto), sai pela esquerda de novo — dois cruzamentos distintos do retângulo.
  const route: LngLat[] = [
    [bounds.minLng - 0.01, y1],
    [bounds.maxLng + 0.01, y1],
    [bounds.maxLng + 0.01, y2],
    [bounds.minLng - 0.01, y2],
  ];

  const runs = clipLineToBounds(route, bounds, { marginFraction: 0 });
  assert.equal(runs.length, 2);
  for (const run of runs) assert.ok(run.length >= 2);
});

test('tilesForLine: segmento curto dentro de um único tile devolve só aquele tile', () => {
  const z = MAP_TILE_ZOOM;
  const tile = lngLatToTile(ICARAI[0], ICARAI[1], z);
  const bounds = tileBounds(z, tile.x, tile.y);
  const midLng = (bounds.minLng + bounds.maxLng) / 2;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const route: LngLat[] = [
    [midLng - 0.0001, midLat],
    [midLng + 0.0001, midLat],
  ];

  const tiles = tilesForLine(route, z);
  assert.deepEqual(tiles, [tile]);
});

test('tilesForLine: rota entre os centros de dois tiles vizinhos cruza exatamente os dois', () => {
  const z = MAP_TILE_ZOOM;
  const origin = lngLatToTile(ICARAI[0], ICARAI[1], z);
  const boundsA = tileBounds(z, origin.x, origin.y);
  const boundsB = tileBounds(z, origin.x + 1, origin.y);
  const centerOf = (b: typeof boundsA): LngLat => [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
  const route: LngLat[] = [centerOf(boundsA), centerOf(boundsB)];

  const tiles = tilesForLine(route, z);
  const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
  assert.equal(keys.size, 2);
  assert.ok(keys.has(`${origin.x},${origin.y}`));
  assert.ok(keys.has(`${origin.x + 1},${origin.y}`));
});

test('tilesForLine: rota em anel pelos 4 tiles de um bloco 2×2 cruza exatamente os 4', () => {
  // Uma reta ÚNICA não consegue tocar o INTERIOR de 4 quadrantes ao mesmo tempo — só o canto
  // compartilhado (caso "de pinça", ambíguo em ponto flutuante, já reconhecido como tal em
  // coverage-grid.ts). Por isso o teste usa uma polyline em anel pelos 4 centros: cada
  // segmento cruza só uma fronteira (nunca o canto), sem ambiguidade nenhuma.
  const z = MAP_TILE_ZOOM;
  const origin = lngLatToTile(ICARAI[0], ICARAI[1], z);
  const center = (b: TileBoundsRect): LngLat => [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
  const nw = center(tileBounds(z, origin.x, origin.y));
  const ne = center(tileBounds(z, origin.x + 1, origin.y));
  const se = center(tileBounds(z, origin.x + 1, origin.y + 1));
  const sw = center(tileBounds(z, origin.x, origin.y + 1));
  const route: LngLat[] = [nw, ne, se, sw, nw];

  const tiles = tilesForLine(route, z);
  const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
  assert.equal(keys.size, 4);
  for (const dx of [0, 1]) {
    for (const dy of [0, 1]) {
      assert.ok(keys.has(`${origin.x + dx},${origin.y + dy}`), `faltou o tile (${dx},${dy})`);
    }
  }
});

test('tileSegmentsForLine: um item por tile atravessado, cada um com a geometria recortada', () => {
  const z = MAP_TILE_ZOOM;
  const origin = lngLatToTile(ICARAI[0], ICARAI[1], z);
  const boundsA = tileBounds(z, origin.x, origin.y);
  const boundsB = tileBounds(z, origin.x + 1, origin.y);
  const centerOf = (b: typeof boundsA): LngLat => [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
  const route: LngLat[] = [centerOf(boundsA), centerOf(boundsB)];

  const segments = tileSegmentsForLine({ type: 'LineString', coordinates: route }, z);
  assert.equal(segments.length, 2);
  for (const segment of segments) {
    assert.ok(segment.coordinates.length >= 2);
  }
});
