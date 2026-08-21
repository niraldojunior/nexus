// Mesma coordenada de referência de test/geo.map-tile.unit.spec.ts (backend) — Icaraí,
// Niterói. Os dois módulos implementam a mesma fórmula independentemente (bundles
// separados, ver comentário de topo em mapTile.ts); estes testes garantem que a cópia do
// cliente tem as mesmas propriedades da do servidor, não que produzem o mesmo valor byte a
// byte (isso exigiria importar um do outro, que é exatamente o que não pode acontecer).
import { describe, expect, it } from 'vitest';
import { lngLatToTile, tileBounds, tileKey, tilesForBounds, MAP_TILE_ZOOM } from './mapTile';

type LngLatTuple = [number, number];
const ICARAI: LngLatTuple = [-43.106, -22.906];

describe('lngLatToTile / tileBounds', () => {
  it('o ponto sempre cai dentro do retângulo do seu próprio tile, em qualquer zoom', () => {
    for (const z of [10, 14, MAP_TILE_ZOOM, 19]) {
      const tile = lngLatToTile(ICARAI[0], ICARAI[1], z);
      const bounds = tileBounds(z, tile.x, tile.y);
      expect(ICARAI[0]).toBeGreaterThanOrEqual(bounds.minLng);
      expect(ICARAI[0]).toBeLessThanOrEqual(bounds.maxLng);
      expect(ICARAI[1]).toBeGreaterThanOrEqual(bounds.minLat);
      expect(ICARAI[1]).toBeLessThanOrEqual(bounds.maxLat);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(2 ** z);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(2 ** z);
    }
  });

  it('um ponto do lado oposto de uma borda de tile cai no tile vizinho', () => {
    const z = MAP_TILE_ZOOM;
    const tile = lngLatToTile(ICARAI[0], ICARAI[1], z);
    const bounds = tileBounds(z, tile.x, tile.y);

    expect(lngLatToTile(bounds.maxLng - 1e-7, ICARAI[1], z)).toEqual(tile);
    expect(lngLatToTile(bounds.maxLng + 1e-7, ICARAI[1], z).x).toBe(tile.x + 1);
    // y cresce para o sul: um pouco abaixo de minLat cai no tile de baixo (y+1).
    expect(lngLatToTile(ICARAI[0], bounds.minLat - 1e-7, z).y).toBe(tile.y + 1);
  });
});

describe('tilesForBounds', () => {
  it('cobre exatamente o retângulo de 2×2 tiles vizinhos', () => {
    const z = MAP_TILE_ZOOM;
    const origin = lngLatToTile(ICARAI[0], ICARAI[1], z);
    const center = (b: ReturnType<typeof tileBounds>): LngLatTuple => [
      (b.minLng + b.maxLng) / 2,
      (b.minLat + b.maxLat) / 2,
    ];
    const nwCenter = center(tileBounds(z, origin.x, origin.y));
    const seCenter = center(tileBounds(z, origin.x + 1, origin.y + 1));
    const tiles = tilesForBounds(
      {
        minLng: nwCenter[0],
        maxLng: seCenter[0],
        minLat: seCenter[1],
        maxLat: nwCenter[1],
      },
      z,
    );
    const keys = new Set(tiles.map((tile) => tileKey(tile)));
    expect(keys.size).toBe(4);
    for (const dx of [0, 1]) {
      for (const dy of [0, 1]) {
        expect(keys.has(`${z}:${origin.x + dx}:${origin.y + dy}`)).toBe(true);
      }
    }
  });

  it('um único ponto cai num único tile', () => {
    const tiles = tilesForBounds({
      minLng: ICARAI[0],
      maxLng: ICARAI[0],
      minLat: ICARAI[1],
      maxLat: ICARAI[1],
    });
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual(lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM));
  });

  it('default de zoom é MAP_TILE_ZOOM', () => {
    const withDefault = tilesForBounds({
      minLng: ICARAI[0],
      maxLng: ICARAI[0],
      minLat: ICARAI[1],
      maxLat: ICARAI[1],
    });
    expect(withDefault[0]?.z).toBe(MAP_TILE_ZOOM);
  });
});

describe('tileKey', () => {
  it('é estável e distingue tiles diferentes', () => {
    expect(tileKey({ z: 16, x: 1, y: 2 })).toBe('16:1:2');
    expect(tileKey({ z: 16, x: 1, y: 2 })).not.toBe(tileKey({ z: 16, x: 2, y: 1 }));
  });
});
