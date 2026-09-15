// Mesma coordenada de referência de test/geo.map-tile.unit.spec.ts (backend) — Icaraí,
// Niterói. Os dois módulos implementam a mesma fórmula independentemente (bundles
// separados, ver comentário de topo em mapTile.ts); estes testes garantem que a cópia do
// cliente tem as mesmas propriedades da do servidor, não que produzem o mesmo valor byte a
// byte (isso exigiria importar um do outro, que é exatamente o que não pode acontecer).
import { describe, expect, it } from 'vitest';
import {
  lngLatToTile,
  tileBounds,
  tileKey,
  tilesForBounds,
  MAP_TILE_ZOOM,
  MAX_TILES_PER_VIEWPORT,
} from './mapTile';

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

  // Regressão: um viewport de escala nacional (ver BRAZIL_CENTER/BRAZIL_DEFAULT_ZOOM em
  // geoViewState.ts) cruza tiles z16 demais para o duplo laço enumerar sem estourar a memória
  // da aba (Out of Memory no Edge/Chrome). Acima do teto, devolve vazio em vez de alocar a
  // grade inteira — useMapTiles trata isso como "nada requisitado" (sem infra passiva por tile
  // nessa escala, igual Sites já fazem por faixa própria).
  it('devolve vazio (sem alocar a grade) quando o bbox cruza tiles demais', () => {
    const brazilWide = tilesForBounds({
      minLng: -74,
      maxLng: -34,
      minLat: -34,
      maxLat: 5,
    });
    expect(brazilWide).toHaveLength(0);
  });

  it('respeita o teto exato de MAX_TILES_PER_VIEWPORT', () => {
    // Uma faixa estreita de 1 tile de altura cujo width*height passa exatamente do teto.
    // z alto o bastante (MAP_TILE_ZOOM) para a grade 2^z não clampar o índice x antes disso.
    const z = MAP_TILE_ZOOM;
    const width = MAX_TILES_PER_VIEWPORT + 1;
    const nw = tileBounds(z, 0, 0);
    const se = tileBounds(z, width - 1, 0);
    const tiles = tilesForBounds(
      { minLng: nw.minLng, maxLng: se.maxLng, minLat: se.minLat, maxLat: nw.maxLat },
      z,
    );
    expect(tiles).toHaveLength(0);
  });
});

describe('tileKey', () => {
  it('é estável e distingue tiles diferentes', () => {
    expect(tileKey({ z: 16, x: 1, y: 2 })).toBe('16:1:2');
    expect(tileKey({ z: 16, x: 1, y: 2 })).not.toBe(tileKey({ z: 16, x: 2, y: 1 }));
  });
});
