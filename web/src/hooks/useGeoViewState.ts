// Cola React de utils/geoViewState.ts (issue #182): grava a posição e o contexto do mapa Geo
// em URL + localStorage para sobreviver a um reload. Câmera e contexto vivem em REFS, não em
// `useState` — um `idle` do mapa dispara a cada pan/zoom, e reportar isso como state
// re-renderizaria GeoPage inteira a cada gesto (mesmo cuidado de `focusRequest` só mudar de
// identidade quando há um voo novo).
//
// `initialView` é a única peça lida via `useState`, e só uma vez por ambiente: é o valor que
// `GeoPage` usa para nascer o mapa já no lugar certo (ver GoogleMapPanel `initialView`).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  geoViewSearchParams,
  resolveInitialViewState,
  writeGeoViewParams,
  writeStoredViewState,
  type GeoViewContext,
  type GeoViewState,
  type MapCamera,
} from '../utils/geoViewState';

const COMMIT_DEBOUNCE_MS = 500;

export type UseGeoViewState = {
  initialView: GeoViewState | null;
  reportCamera: (camera: MapCamera) => void;
  setContext: (context: GeoViewContext) => void;
};

export function useGeoViewState(environmentId: string | null): UseGeoViewState {
  const [initialView, setInitialView] = useState<GeoViewState | null>(() =>
    environmentId ? resolveInitialViewState(environmentId) : null,
  );
  const environmentIdRef = useRef(environmentId);
  const cameraRef = useRef<MapCamera | null>(initialView?.camera ?? null);
  const contextRef = useRef<GeoViewContext>(initialView?.context ?? { kind: 'none' });
  const lastCommittedRef = useRef<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // O catálogo chega depois do primeiro render. Quando sua identidade muda, troca todo o estado
  // efêmero antes de o painel com key própria criar o mapa daquele ambiente.
  if (environmentIdRef.current !== environmentId) {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    environmentIdRef.current = environmentId;
    const restored = environmentId ? resolveInitialViewState(environmentId) : null;
    cameraRef.current = restored?.camera ?? null;
    contextRef.current = restored?.context ?? { kind: 'none' };
    lastCommittedRef.current = null;
    timerRef.current = undefined;
    setInitialView(restored);
  }

  const commit = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const currentEnvironmentId = environmentIdRef.current;
    const camera = cameraRef.current;
    if (!currentEnvironmentId || !camera) return;
    const state: GeoViewState = { v: 1, camera, context: contextRef.current };
    const serialized = geoViewSearchParams(state).toString();
    if (serialized === lastCommittedRef.current) return;
    lastCommittedRef.current = serialized;
    writeGeoViewParams(state);
    writeStoredViewState(state, currentEnvironmentId);
  }, []);

  const schedule = useCallback(() => {
    if (!environmentIdRef.current) return;
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(commit, COMMIT_DEBOUNCE_MS);
  }, [commit]);

  const reportCamera = useCallback(
    (camera: MapCamera) => {
      cameraRef.current = camera;
      schedule();
    },
    [schedule],
  );

  const setContext = useCallback(
    (context: GeoViewContext) => {
      contextRef.current = context;
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) commit();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      commit();
    };
  }, [commit]);

  return { initialView, reportCamera, setContext };
}
