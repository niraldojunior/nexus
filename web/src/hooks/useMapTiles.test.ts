import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapTiles } from './useMapTiles';
import type { MapTileFeature } from '../services/geoMapTileApi';
import type { MapBounds } from '../services/geoTreeApi';
import { ALL_MAP_LAYERS_VISIBLE, type ViewportShape } from '../utils/mapLayers';
import { lngLatToTile, tileBounds, MAP_TILE_ZOOM } from '../utils/mapTile';

// Referências ESTÁVEIS entre renders — o hook (como qualquer hook alimentado por array de
// dependência, ver o comentário de viewportShapesInclude em GeoPage) reentra em loop se
// `include` chegar como um literal `[]`/`[...]` recriado a cada render (deps mudam de
// identidade mesmo com o mesmo conteúdo). GeoPage já resolve isso com useMemo; aqui, como não
// há componente ao redor, a estabilidade vem de declarar a constante uma vez só.
const RESOURCE_POINTS_ONLY: ViewportShape[] = ['resource-points'];
const NOTHING_INCLUDED: ViewportShape[] = [];

const mocks = vi.hoisted(() => ({ fetchMapTile: vi.fn() }));

vi.mock('../services/geoMapTileApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geoMapTileApi')>();
  return { ...actual, fetchMapTile: mocks.fetchMapTile };
});

const feature = (overrides: Partial<MapTileFeature> = {}): MapTileFeature => ({
  entityId: 'r1',
  kind: 'resource',
  entityType: 'PhysicalResource',
  shape: 'point',
  label: 'CDOE 1108',
  lng: -43.108,
  lat: -22.907,
  ...overrides,
});

// `tileCache`/`inFlightTiles` de useMapTiles são estado de MÓDULO, compartilhado entre todos
// os testes deste arquivo (não há como resetar de fora — é exatamente o comportamento
// desejado em produção, um cache que sobrevive a remounts). Cada teste usa uma bbox num tile
// PRÓPRIO (offset grande o bastante pra nunca cair no mesmo tile z16 de outro teste), pra um
// teste não ler o cache aquecido por outro.
//
// A bbox é construída a partir do CENTRO do tile (via lngLatToTile/tileBounds), não de um
// deslocamento arbitrário: um ponto "quase redondo" como (-45, -24) pode cair perto demais de
// uma borda de tile por coincidência, e um nudge de pan mínimo (no teste de cache) atravessaria
// pra um tile vizinho — margem de 1% do lado do tile garante que a bbox e um nudge pequeno
// nunca saem do tile de origem.
let tileOffset = 0;
function freshBounds(): MapBounds {
  tileOffset += 1;
  const anchor: [number, number] = [-43 - tileOffset, -22 - tileOffset];
  const tile = lngLatToTile(anchor[0], anchor[1], MAP_TILE_ZOOM);
  const bounds = tileBounds(MAP_TILE_ZOOM, tile.x, tile.y);
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const marginLng = (bounds.maxLng - bounds.minLng) * 0.01;
  const marginLat = (bounds.maxLat - bounds.minLat) * 0.01;
  return {
    minLng: centerLng - marginLng,
    maxLng: centerLng + marginLng,
    minLat: centerLat - marginLat,
    maxLat: centerLat + marginLat,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchMapTile.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useMapTiles', () => {
  it('busca o(s) tile(s) da viewport após o debounce e devolve as features', async () => {
    mocks.fetchMapTile.mockResolvedValue([feature()]);
    const bounds = freshBounds();
    const { result } = renderHook(() => useMapTiles(bounds, 20, undefined));

    expect(result.current.data).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.data).toHaveLength(1);
    expect(mocks.fetchMapTile).toHaveBeenCalledTimes(1);
  });

  it('reusa o cache: bounds diferentes que caem no mesmo tile não refazem o fetch', async () => {
    mocks.fetchMapTile.mockResolvedValue([feature()]);
    const bounds = freshBounds();
    const { rerender } = renderHook(
      ({ bounds: current }: { bounds: MapBounds }) => useMapTiles(current, 20, undefined),
      { initialProps: { bounds } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.fetchMapTile).toHaveBeenCalledTimes(1);

    // Pan mínimo (bem dentro da margem de 1% do tile que freshBounds já reserva) — não deveria
    // gerar fetch novo: continua no mesmo tile z16 (~570 m de lado).
    const nudge = (bounds.maxLng - bounds.minLng) * 0.05;
    const nudged: MapBounds = {
      minLng: bounds.minLng + nudge,
      minLat: bounds.minLat + nudge,
      maxLng: bounds.maxLng + nudge,
      maxLat: bounds.maxLat + nudge,
    };
    rerender({ bounds: nudged });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.fetchMapTile).toHaveBeenCalledTimes(1);
  });

  it('fora de escala (> PASSIVE_INFRA_MAX_SCALE_METERS) não busca nada e zera os dados', async () => {
    mocks.fetchMapTile.mockResolvedValue([feature()]);
    const bounds = freshBounds();
    const { result, rerender } = renderHook(
      ({ scaleMeters }: { scaleMeters: number | null }) =>
        useMapTiles(bounds, scaleMeters, undefined),
      { initialProps: { scaleMeters: 20 } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.data).toHaveLength(1);

    rerender({ scaleMeters: 5000 });
    expect(result.current.data).toEqual([]);
  });

  it('`include` filtra o resultado no cliente (o endpoint de tile não tem esse parâmetro)', async () => {
    mocks.fetchMapTile.mockResolvedValue([
      feature({ entityId: 'r1', kind: 'resource', shape: 'point' }),
      feature({ entityId: 'r2', kind: 'resource', shape: 'line' }),
      feature({ entityId: 's1', kind: 'site' }),
    ]);
    const bounds = freshBounds();
    const { result } = renderHook(() => useMapTiles(bounds, 20, RESOURCE_POINTS_ONLY));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.data).toEqual([
      expect.objectContaining({ entityId: 'r1', shape: 'point', kind: 'resource' }),
    ]);
  });

  it('`include` vazio (todas as camadas de infra desligadas) não busca nada', async () => {
    const bounds = freshBounds();
    const { result } = renderHook(() => useMapTiles(bounds, 20, NOTHING_INCLUDED));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.data).toEqual([]);
    expect(mocks.fetchMapTile).not.toHaveBeenCalled();
  });

  it('reaplica o filtro de tipo Netwin a partir do cache quando um switch muda', async () => {
    mocks.fetchMapTile.mockResolvedValue([
      feature({ entityId: 'tower', typeCode: 'Tower' }),
      feature({ entityId: 'pole', typeCode: 'Pole' }),
    ]);
    const bounds = freshBounds();
    const { result, rerender } = renderHook(
      ({ visibility }) => useMapTiles(bounds, 20, undefined, visibility),
      { initialProps: { visibility: ALL_MAP_LAYERS_VISIBLE } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.data).toHaveLength(2);

    rerender({ visibility: { ...ALL_MAP_LAYERS_VISIBLE, netwinTower: false } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.data).toEqual([expect.objectContaining({ entityId: 'pole' })]);
    expect(mocks.fetchMapTile).toHaveBeenCalledTimes(1);
  });
});
