import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoverage } from './useCoverage';
import type { CoverageLayerRef, CoverageResponse } from '../services/geoCoverageApi';
import type { MapBounds } from '../services/geoTreeApi';

const mocks = vi.hoisted(() => ({ fetchCoverage: vi.fn() }));

vi.mock('../services/geoCoverageApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geoCoverageApi')>();
  return { ...actual, fetchCoverage: mocks.fetchCoverage };
});

const BOUNDS: MapBounds = { minLng: -43.11, minLat: -22.91, maxLng: -43.1, maxLat: -22.9 };

const REGION_LAYER: CoverageLayerRef = {
  sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
  sourceId: 'GPON_COVERAGE',
};
const SPATIAL_LAYER: CoverageLayerRef = { sourceType: 'SPATIAL_COVERAGE', sourceId: 'spatial-1' };

const response = (overrides: Partial<CoverageResponse> = {}): CoverageResponse => ({
  level: 'neighborhood',
  grid: { sizeMeters: 50, projection: 'EPSG:3857' },
  cells: [],
  areas: [],
  neighborhoods: [],
  truncated: false,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchCoverage.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCoverage', () => {
  it('busca a cobertura da viewport após o debounce, passando a camada ao cliente', async () => {
    mocks.fetchCoverage.mockResolvedValue(response());
    const { result } = renderHook(() => useCoverage(BOUNDS, 200, true, REGION_LAYER));

    expect(result.current.data).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.data).not.toBeNull();
    expect(mocks.fetchCoverage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchCoverage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      REGION_LAYER,
    );
  });

  it('duas camadas na mesma viewport não compartilham entrada de dedupe/cache — cada uma refaz o fetch', async () => {
    mocks.fetchCoverage.mockResolvedValue(response());
    const { rerender } = renderHook(
      ({ layer }: { layer: CoverageLayerRef | null }) => useCoverage(BOUNDS, 200, true, layer),
      { initialProps: { layer: REGION_LAYER } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.fetchCoverage).toHaveBeenCalledTimes(1);

    // Mesmo bbox/nível, camada diferente: chave de dedupe muda, refaz o fetch.
    rerender({ layer: SPATIAL_LAYER });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.fetchCoverage).toHaveBeenCalledTimes(2);
  });

  it('mesma camada e mesma viewport (dentro da folga) não refaz o fetch', async () => {
    mocks.fetchCoverage.mockResolvedValue(response());
    const { rerender } = renderHook(
      ({ layer }: { layer: CoverageLayerRef | null }) => useCoverage(BOUNDS, 200, true, layer),
      { initialProps: { layer: REGION_LAYER } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.fetchCoverage).toHaveBeenCalledTimes(1);

    rerender({ layer: REGION_LAYER });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.fetchCoverage).toHaveBeenCalledTimes(1);
  });

  it('camada null (bootstrap legado) busca sem sourceType/sourceId', async () => {
    mocks.fetchCoverage.mockResolvedValue(response());
    renderHook(() => useCoverage(BOUNDS, 200, true, null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.fetchCoverage).toHaveBeenCalledWith(expect.anything(), expect.anything(), null);
  });

  it('desligar a camada (visible=false) limpa os dados e não busca', async () => {
    mocks.fetchCoverage.mockResolvedValue(response());
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useCoverage(BOUNDS, 200, visible, REGION_LAYER),
      { initialProps: { visible: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.data).not.toBeNull();

    rerender({ visible: false });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
