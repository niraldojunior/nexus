import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  MAP_DENSITY_ZOOMS,
  coarsenTile,
  densityFactor,
  densityZoomForScale,
  isMapDensityZoom,
} from '../src/modules/geo/map-density.js';
import { MAP_TILE_ZOOM, lngLatToTile } from '../src/modules/geo/map-tile.js';

// Icaraí, Niterói — mesma coordenada de referência dos demais specs de geo.
const ICARAI: [number, number] = [-43.106, -22.906];

test('todo nível de densidade é mais grosso que o zoom de armazenamento', () => {
  // A redução só sabe dividir. Um nível >= MAP_TILE_ZOOM exigiria interpolar, que a agregação
  // não faz — e o build produziria células vazias silenciosamente.
  for (const zoom of MAP_DENSITY_ZOOMS) {
    assert.ok(zoom < MAP_TILE_ZOOM, `z${zoom} não é mais grosso que z${MAP_TILE_ZOOM}`);
  }
});

test('densityFactor é potência de 2 e casa com a diferença de zoom', () => {
  assert.equal(densityFactor(13), 8);
  assert.equal(densityFactor(10), 64);
  assert.equal(densityFactor(7), 512);
  for (const zoom of MAP_DENSITY_ZOOMS) {
    assert.equal(densityFactor(zoom), 2 ** (MAP_TILE_ZOOM - zoom));
  }
});

test('coarsenTile leva o tile fino para a célula que o contém, em todos os níveis', () => {
  const fine = lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM);
  for (const zoom of MAP_DENSITY_ZOOMS) {
    const coarse = coarsenTile(fine, zoom);
    const factor = densityFactor(zoom);
    assert.equal(coarse.z, zoom);
    // O tile fino tem de cair dentro do bloco factor×factor que a célula grossa representa.
    assert.ok(coarse.x * factor <= fine.x && fine.x < (coarse.x + 1) * factor);
    assert.ok(coarse.y * factor <= fine.y && fine.y < (coarse.y + 1) * factor);
  }
});

test('tiles finos vizinhos caem na mesma célula grossa; distantes, em células diferentes', () => {
  const fine = lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM);
  const neighbour = { z: fine.z, x: fine.x + 1, y: fine.y };
  const faraway = { z: fine.z, x: fine.x + densityFactor(13) * 2, y: fine.y };

  const cell = coarsenTile(fine, 13);
  // +1 tile fino (~570 m) fica na mesma célula de ~4,6 km, a menos que caia exatamente na borda
  // do bloco de 8 — por isso a asserção é sobre a distância, não sobre igualdade cega.
  assert.ok(Math.abs(coarsenTile(neighbour, 13).x - cell.x) <= 1);
  assert.notEqual(coarsenTile(faraway, 13).x, cell.x);
});

test('densityZoomForScale segue os mesmos degraus da cobertura GPON', () => {
  assert.equal(densityZoomForScale(100), 13);
  assert.equal(densityZoomForScale(500), 13);
  assert.equal(densityZoomForScale(501), 10);
  assert.equal(densityZoomForScale(10_000), 10);
  assert.equal(densityZoomForScale(10_001), 7);
  assert.equal(densityZoomForScale(500_000), 7);
});

test('densityZoomForScale só devolve nível que o build gera', () => {
  for (const scale of [51, 200, 499, 1000, 9999, 50_000, 1_000_000]) {
    assert.ok(isMapDensityZoom(densityZoomForScale(scale)), `escala ${scale}`);
  }
});

test('isMapDensityZoom recusa zoom não gerado', () => {
  assert.equal(isMapDensityZoom(16), false);
  assert.equal(isMapDensityZoom(12), false);
  assert.equal(isMapDensityZoom(0), false);
});
