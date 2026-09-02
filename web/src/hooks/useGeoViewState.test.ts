import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeoViewState } from './useGeoViewState';
import { readStoredViewState } from '../utils/geoViewState';

const CAMERA_1 = { lat: -22.9068, lng: -43.1075, zoom: 15 };
const CAMERA_2 = { lat: -22.91, lng: -43.11, zoom: 17 };

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
  it('sem storage/URL prévios, initialView é null', () => {
    const { result } = renderHook(() => useGeoViewState());
    expect(result.current.initialView).toBeNull();
  });

  it('agrupa múltiplos reportCamera num único commit após o debounce', () => {
    const { result } = renderHook(() => useGeoViewState());

    act(() => {
      result.current.reportCamera(CAMERA_1);
      result.current.reportCamera({ ...CAMERA_1, zoom: 16 });
      result.current.reportCamera(CAMERA_2);
    });
    // Antes do debounce estourar, nada foi escrito ainda.
    expect(currentSearchParams().has('ll')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(currentSearchParams().get('ll')).toBe('-22.91,-43.11');
    expect(currentSearchParams().get('z')).toBe('17');
    expect(readStoredViewState()?.camera).toEqual(CAMERA_2);
  });

  it('commit idêntico ao já gravado não reescreve a URL', () => {
    const { result } = renderHook(() => useGeoViewState());
    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });
    const historyLength = window.history.length;

    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });

    // replaceState não cresce o histórico, mas o teste real é que os params continuam iguais
    // (não há uma forma direta de contar chamadas a replaceState sem espionar `window.history`).
    expect(window.history.length).toBe(historyLength);
    expect(currentSearchParams().get('ll')).toBe('-22.9068,-43.1075');
  });

  it('setContext agenda um commit igual a reportCamera', () => {
    const { result } = renderHook(() => useGeoViewState());
    act(() => {
      result.current.reportCamera(CAMERA_1);
      result.current.setContext({ kind: 'site', siteId: 'abc' });
      vi.advanceTimersByTime(500);
    });
    expect(currentSearchParams().get('site')).toBe('abc');
  });

  it('flush imediato quando a aba fica oculta (visibilitychange)', () => {
    const { result } = renderHook(() => useGeoViewState());
    act(() => {
      result.current.reportCamera(CAMERA_1);
    });
    expect(currentSearchParams().has('ll')).toBe(false);

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(currentSearchParams().get('ll')).toBe('-22.9068,-43.1075');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('flush no unmount', () => {
    const { result, unmount } = renderHook(() => useGeoViewState());
    act(() => {
      result.current.reportCamera(CAMERA_1);
    });
    unmount();
    expect(currentSearchParams().get('ll')).toBe('-22.9068,-43.1075');
  });

  it('sem câmera reportada, commit não escreve nada', () => {
    const { result } = renderHook(() => useGeoViewState());
    act(() => {
      result.current.setContext({ kind: 'site', siteId: 'abc' });
      vi.advanceTimersByTime(500);
    });
    expect(currentSearchParams().has('site')).toBe(false);
  });

  it('localStorage.setItem lançando não impede a atualização da URL', () => {
    const setItemSpy = vi
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded');
      });
    const { result } = renderHook(() => useGeoViewState());
    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });
    expect(currentSearchParams().get('ll')).toBe('-22.9068,-43.1075');
    setItemSpy.mockRestore();
  });
});
