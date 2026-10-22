import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapResources } from './useMapResources';
import { fetchMapResources } from '../services/geoMapResourceApi';

vi.mock('../services/geoMapResourceApi', () => ({ fetchMapResources: vi.fn() }));

const feature = {
  entityId: 'r1',
  kind: 'resource',
  entityType: 'PhysicalResource',
  shape: 'point',
  sourceModelType: 'RESOURCE_TYPE',
  sourceModelId: 'REPETIDOR',
  label: 'R',
  lng: -43.15,
  lat: -22.92,
};

describe('useMapResources', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchMapResources).mockReset();
    vi.mocked(fetchMapResources).mockResolvedValue({
      features: [feature as never],
      truncated: false,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('não busca sem camadas pontuais visíveis', async () => {
    const bounds = { minLng: -43.2, minLat: -22.95, maxLng: -43.1, maxLat: -22.9 };
    renderHook(() => useMapResources(bounds, []));
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapResources).not.toHaveBeenCalled();
  });

  it('em escala continental faz UMA requisição por bbox com os tipos visíveis (#416)', async () => {
    // O Brasil inteiro cruzaria centenas de milhões de tiles z16 no caminho antigo.
    const brazil = { minLng: -75, minLat: -34, maxLng: -28, maxLat: 6 };
    const { result } = renderHook(() => useMapResources(brazil, ['DERIVACAO', 'REPETIDOR']));
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapResources).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchMapResources).mock.calls[0]?.[1]).toEqual(['DERIVACAO', 'REPETIDOR']);
    expect(result.current.features).toHaveLength(1);
  });

  it('reaproveita pan contido e refaz a busca ao mudar os tipos', async () => {
    const bounds = { minLng: -43.2, minLat: -22.95, maxLng: -43.1, maxLat: -22.9 };
    const { result, rerender } = renderHook(({ b, ids }) => useMapResources(b, ids), {
      initialProps: { b: bounds, ids: ['REPETIDOR'] },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    rerender({
      b: { ...bounds, minLng: bounds.minLng + 0.001, maxLng: bounds.maxLng + 0.001 },
      ids: ['REPETIDOR'],
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapResources).toHaveBeenCalledTimes(1);
    rerender({ b: bounds, ids: ['EQUALIZADOR', 'REPETIDOR'] });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(fetchMapResources).toHaveBeenCalledTimes(2);
    rerender({ b: bounds, ids: [] });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(result.current.features).toHaveLength(0);
  });
});
