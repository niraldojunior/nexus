import { createElement, StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeoViewState, type UseGeoViewState } from './useGeoViewState';
import { readStoredViewState } from '../utils/geoViewState';

// O app real monta sob React.StrictMode (web/src/main.tsx), que invoca cada render DUAS vezes.
// TODA esta suíte roda sob StrictMode de propósito: a regressão de viewport que ela existe para
// travar (o mapa voltando ao Brasil em vez do último lugar navegado) passava em 100% dos testes
// justamente porque nenhum deles exercitava o double-invoke — o ajuste em fase de render de
// useGeoViewState era gated por um ref que a primeira invocação já satisfazia. Não monte um
// renderHook sem este wrapper aqui.
const strictModeWrapper = ({ children }: { children: ReactNode }) =>
  createElement(StrictMode, null, children);

const renderViewState = <P extends { environmentId: string | null }>(
  initialProps: P,
): ReturnType<typeof renderHook<UseGeoViewState, P>> =>
  renderHook<UseGeoViewState, P>(({ environmentId }) => useGeoViewState(environmentId), {
    initialProps,
    wrapper: strictModeWrapper,
  });

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
    const { result } = renderViewState({ environmentId: null as string | null });
    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });
    expect(result.current.initialView).toBeNull();
    expect(currentSearchParams().has('ll')).toBe(false);
  });

  it('agrupa múltiplos reportCamera num único commit no ambiente atual', () => {
    const { result } = renderViewState({ environmentId: ENVIRONMENT_A as string | null });
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
    const { result } = renderViewState({ environmentId: ENVIRONMENT_A as string | null });
    act(() => {
      result.current.reportCamera(CAMERA_1);
      result.current.setContext({ kind: 'site', siteId: 'abc' });
      vi.advanceTimersByTime(500);
    });
    expect(currentSearchParams().get('site')).toBe('abc');
  });

  // Reproduz o fluxo real de GeoPage: no primeiro render, `environmentId` é `null`
  // (useMapLayerCatalog ainda carregando — ver EMPTY_PENDING_CATALOG); só depois de um
  // efeito assíncrono resolver o catálogo é que o ambiente real chega. Os outros testes desta
  // suíte montam o hook já com um environmentId concreto, o que nunca exercita essa transição
  // null → real. Se a restauração via URL (`ll`/`z`) só funcionasse no `useState` inicial (que
  // roda com environmentId ainda null) e não no ramo de correção em fase de render, isto pegaria.
  it('URL com ll/z é restaurada quando o environmentId chega depois (null → real, como em GeoPage)', () => {
    window.history.replaceState({}, '', `/geo?ll=${CAMERA_1.lat},${CAMERA_1.lng}&z=${CAMERA_1.zoom}`);
    const { result, rerender } = renderViewState({ environmentId: null as string | null });
    expect(result.current.initialView).toBeNull();

    rerender({ environmentId: ENVIRONMENT_A });

    expect(result.current.initialView?.camera).toEqual(CAMERA_1);
  });

  it('troca de ambiente restaura somente seu estado e não grava no anterior', () => {
    const { result, rerender } = renderViewState({ environmentId: ENVIRONMENT_A as string | null });
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
    const { result } = renderViewState({ environmentId: ENVIRONMENT_A as string | null });
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
    const { result } = renderViewState({ environmentId: ENVIRONMENT_A as string | null });
    act(() => {
      result.current.reportCamera(CAMERA_1);
      vi.advanceTimersByTime(500);
    });
    expect(currentSearchParams().get('ll')).toBe('-22.9068,-43.1075');
    setItemSpy.mockRestore();
  });
});
