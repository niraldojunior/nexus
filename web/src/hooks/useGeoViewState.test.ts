import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeoViewState } from './useGeoViewState';
import { readStoredViewState } from '../utils/geoViewState';

const CAMERA_1 = { lat: -22.9068, lng: -43.1075, zoom: 15 };
const CAMERA_2 = { lat: -22.91, lng: -43.11, zoom: 17 };
const ENVIRONMENT_A = 'environment-a';
const ENVIRONMENT_B = 'environment-b';

function currentSearchParams(): URLSearchParams {
  return new URL(window.location.href).searchParams;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/geo');
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useGeoViewState', () => {
  it('sem environmentId, não restaura nem persiste', () => {
    const { result } = renderHook(() => useGeoViewState(null));
    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });
    expect(result.current.initialView).toBeNull();
    expect(currentSearchParams().has('ll')).toBe(false);
  });

  it('agrupa múltiplos reportCamera num único commit no ambiente atual', () => {
    const { result } = renderHook(() => useGeoViewState(ENVIRONMENT_A));
    act(() => {
      result.current.reportCamera(CAMERA_1);
      result.current.reportCamera({ ...CAMERA_1, zoom: 16 });
      result.current.reportCamera(CAMERA_2);
      vi.advanceTimersByTime(500);
    });

    expect(currentSearchParams().get('ll')).toBe('-22.91,-43.11');
    expect(readStoredViewState(ENVIRONMENT_A)?.camera).toEqual(CAMERA_2);
  });

  it('setContext agenda um commit junto da câmera', () => {
    const { result } = renderHook(() => useGeoViewState(ENVIRONMENT_A));
    act(() => {
      result.current.reportCamera(CAMERA_1);
      result.current.setContext({ kind: 'site', siteId: 'abc' });
      vi.advanceTimersByTime(500);
    });
    expect(currentSearchParams().get('site')).toBe('abc');
  });

  it('troca de ambiente restaura somente seu estado e não grava no anterior', () => {
    const { result, rerender } = renderHook(
      ({ environmentId }) => useGeoViewState(environmentId),
      { initialProps: { environmentId: ENVIRONMENT_A } },
    );
    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });

    rerender({ environmentId: ENVIRONMENT_B });
    expect(result.current.initialView).toBeNull();
    act(() => {
      result.current.reportCamera(CAMERA_2);
      vi.advanceTimersByTime(500);
    });

    expect(readStoredViewState(ENVIRONMENT_A)?.camera).toEqual(CAMERA_1);
    expect(readStoredViewState(ENVIRONMENT_B)?.camera).toEqual(CAMERA_2);
  });

  it('flush imediato quando a aba fica oculta', () => {
    const { result } = renderHook(() => useGeoViewState(ENVIRONMENT_A));
    act(() => result.current.reportCamera(CAMERA_1));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(currentSearchParams().get('ll')).toBe('-22.9068,-43.1075');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('localStorage indisponível não impede atualização da URL', () => {
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useGeoViewState(ENVIRONMENT_A));
    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });
    expect(currentSearchParams().get('ll')).toBe('-22.9068,-43.1075');
    setItemSpy.mockRestore();
  });
});
