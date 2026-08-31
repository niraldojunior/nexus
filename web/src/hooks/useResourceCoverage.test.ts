import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResourceCoverage } from './useResourceCoverage';

const mocks = vi.hoisted(() => ({ fetchCoverageByResource: vi.fn() }));

vi.mock('../services/geoCoverageApi', () => ({
  fetchCoverageByResource: mocks.fetchCoverageByResource,
}));

const coverage = {
  point: { lng: -43.1, lat: -22.9 },
  cell: { gridX: 1, gridY: 2, cdoTotal: 35, cdoAvailable: 22, sizeMeters: 50 },
  areas: [],
};

afterEach(() => {
  mocks.fetchCoverageByResource.mockReset();
});

describe('useResourceCoverage', () => {
  it('busca a cobertura quando habilitado e devolve a resposta', async () => {
    mocks.fetchCoverageByResource.mockResolvedValue(coverage);
    const { result } = renderHook(() => useResourceCoverage('cto-1', true));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.coverage).toEqual(coverage);
    expect(result.current.error).toBeNull();
  });

  it('trata 404 como ausência funcional de cobertura', async () => {
    mocks.fetchCoverageByResource.mockResolvedValue(undefined);
    const { result } = renderHook(() => useResourceCoverage('sem-ponto', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.coverage).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('deduplica requisições simultâneas do mesmo Resource', async () => {
    let resolve!: (value: typeof coverage) => void;
    mocks.fetchCoverageByResource.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = renderHook(() => useResourceCoverage('cto-1', true));
    const second = renderHook(() => useResourceCoverage('cto-1', true));

    expect(mocks.fetchCoverageByResource).toHaveBeenCalledTimes(1);
    resolve(coverage);
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.coverage).toEqual(coverage));
  });

  it('descarta resposta que chegou após trocar de Resource', async () => {
    let resolveFirst!: (value: typeof coverage) => void;
    mocks.fetchCoverageByResource
      .mockReturnValueOnce(
        new Promise((done) => {
          resolveFirst = done;
        }),
      )
      .mockResolvedValueOnce({ ...coverage, point: { lng: -43.2, lat: -22.8 } });
    const { result, rerender } = renderHook(({ id }) => useResourceCoverage(id, true), {
      initialProps: { id: 'cto-1' },
    });

    rerender({ id: 'cto-2' });
    resolveFirst(coverage);
    await waitFor(() => expect(result.current.coverage?.point.lng).toBe(-43.2));
  });
});
