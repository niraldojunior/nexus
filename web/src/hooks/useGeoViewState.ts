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
  readStoredViewState,
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

// Estado da restauração, indexado pelo ambiente a que ele pertence. Precisa ser `useState` (e
// não refs) porque é o GATE do ajuste em fase de render abaixo: sob `React.StrictMode`
// (web/src/main.tsx) cada render é invocado DUAS vezes, e um gate baseado em ref seria
// satisfeito pela primeira invocação — a segunda não reentraria e o `setState` da primeira iria
// embora junto com o render descartado, deixando `initialView` nulo para sempre. Com o gate em
// state, as duas invocações leem o mesmo valor, fazem o mesmo trabalho (idempotente) e o
// re-render acontece.
type ResolvedView = {
  /** Ambiente a que `view` corresponde — `null` enquanto o catálogo não resolveu. */
  environmentId: string | null;
  view: GeoViewState | null;
  /**
   * Se algum ambiente concreto já foi resolvido antes. A partir do segundo, os parâmetros da
   * URL pertencem ao ambiente ANTERIOR e não devem ser reusados — só o localStorage do novo.
   */
  hasResolvedEnvironment: boolean;
};

const resolveFor = (environmentId: string | null, previous: ResolvedView | null): ResolvedView => {
  const hadEnvironment = previous?.hasResolvedEnvironment ?? false;
  const view = environmentId
    ? hadEnvironment
      ? readStoredViewState(environmentId)
      : resolveInitialViewState(environmentId)
    : null;
  return {
    environmentId,
    view,
    hasResolvedEnvironment: hadEnvironment || environmentId !== null,
  };
};

export function useGeoViewState(environmentId: string | null): UseGeoViewState {
  const [resolved, setResolved] = useState<ResolvedView>(() => resolveFor(environmentId, null));
  const environmentIdRef = useRef(environmentId);
  const cameraRef = useRef<MapCamera | null>(resolved.view?.camera ?? null);
  const contextRef = useRef<GeoViewContext>(resolved.view?.context ?? { kind: 'none' });
  const lastCommittedRef = useRef<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // O catálogo chega depois do primeiro render. Quando sua identidade muda, troca todo o estado
  // efêmero antes de o painel com key própria criar o mapa daquele ambiente. As escritas em ref
  // aqui são idempotentes de propósito (mesmos valores nas duas invocações do StrictMode) — o
  // gate é `resolved.environmentId`, nunca um dos refs.
  if (resolved.environmentId !== environmentId) {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    const next = resolveFor(environmentId, resolved);
    environmentIdRef.current = environmentId;
    cameraRef.current = next.view?.camera ?? null;
    contextRef.current = next.view?.context ?? { kind: 'none' };
    lastCommittedRef.current = null;
    timerRef.current = undefined;
    setResolved(next);
  }

  const initialView = resolved.environmentId === environmentId ? resolved.view : null;

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
