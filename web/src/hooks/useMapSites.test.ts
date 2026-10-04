import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapSites } from './useMapSites';
import { fetchMapSites } from '../services/geoMapSiteApi';

vi.mock('../services/geoMapSiteApi', () => ({ fetchMapSites: vi.fn() }));

const bounds = { minLng: -43.2, minLat: -22.95, maxLng: -43.1, maxLat: -22.9 };
const feature = {
  entityId: 's1',
  kind: 'site',
  entityType: 'GeographicSite',
  shape: 'point',
  label: 'S',
  lng: -43.15,
  lat: -22.92,
};

describe('useMapSites', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchMapSites).mockReset();
    vi.mocked(fetchMapSites).mockResolvedValue({ features: [feature as never], truncated: false });
  });
  afterEach(() => vi.useRealTimers());

  it('não busca sem specifications visíveis', async () => {
    renderHook(() => useMapSites(bounds, []));
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapSites).not.toHaveBeenCalled();
  });

  it('faz uma única requisição por viewport estabilizada e reaproveita pan contido', async () => {
    const { result, rerender } = renderHook(({ b }) => useMapSites(b, ['CO']), {
      initialProps: { b: bounds },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapSites).toHaveBeenCalledTimes(1);
    expect(result.current.features).toHaveLength(1);
    rerender({ b: { ...bounds, minLng: bounds.minLng + 0.001, maxLng: bounds.maxLng + 0.001 } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapSites).toHaveBeenCalledTimes(1);
  });

  it('refaz a busca ao mudar as specifications e limpa ao desligar tudo', async () => {
    const { result, rerender } = renderHook(({ ids }) => useMapSites(bounds, ids), {
      initialProps: { ids: ['CO'] },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    rerender({ ids: ['CO', 'ENERGY_SUBSTATION'] });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapSites).toHaveBeenCalledTimes(2);
    rerender({ ids: [] });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(result.current.features).toHaveLength(0);
  });
});
