// Cola React de utils/geoViewState.ts (issue #182): grava a posição e o contexto do mapa Geo
// em URL + localStorage para sobreviver a um reload. Câmera e contexto vivem em REFS, não em
// `useState` — um `idle` do mapa dispara a cada pan/zoom, e reportar isso como state
// re-renderizaria GeoPage inteira a cada gesto (mesmo cuidado de `focusRequest` só mudar de
// identidade quando há um voo novo).
//
// `initialView` é a única peça lida via `useState`, e só uma vez: é o valor que `GeoPage` usa
// para nascer o mapa já no lugar certo (ver GoogleMapPanel `initialView`) — não pode mudar depois
// que o mapa foi criado.

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

// Debounce entre o `idle` do mapa e a escrita em URL/storage — o mesmo espírito do debounce de
// busca (GeoSearchBar), só que aqui é para não escrever a cada frame de um pan contínuo.
const COMMIT_DEBOUNCE_MS = 500;

export type UseGeoViewState = {
  // Câmera/contexto no momento em que a página abriu — `null` quando não havia nada salvo
  // (primeira visita, storage indisponível). Consumido uma única vez, na criação do mapa.
  initialView: GeoViewState | null;
  // Chamado a cada `idle` do mapa (ver reportViewport em GeoPage) com a câmera atual.
  reportCamera: (camera: MapCamera) => void;
  // Chamado quando a seleção/endereço aberto muda (ver `viewContext` em GeoPage).
  setContext: (context: GeoViewContext) => void;
};

export function useGeoViewState(): UseGeoViewState {
  // Inicializador preguiçoso: roda uma única vez, no primeiro render — mesmo padrão de
  // `useState(readStoredLayers)` em `useMapLayers.ts`. Precisa ser lido antes da criação do
  // mapa (ver GoogleMapPanel `initialView`), então não pode vir de um efeito.
  const [initialView] = useState<GeoViewState | null>(() => resolveInitialViewState());

  const cameraRef = useRef<MapCamera | null>(initialView?.camera ?? null);
  const contextRef = useRef<GeoViewContext>(initialView?.context ?? { kind: 'none' });
  // Última querystring de viewport efetivamente escrita — evita reescrever URL/storage quando
  // nada mudou (ex.: o primeiro `idle` pós-restauração reporta a mesma câmera que já nasceu lá).
  const lastCommittedRef = useRef<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const commit = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const camera = cameraRef.current;
    // Sem câmera reportada ainda (mapa não terminou de carregar) não há o que gravar.
    if (!camera) return;
    const state: GeoViewState = { v: 1, camera, context: contextRef.current };
    const serialized = geoViewSearchParams(state).toString();
    if (serialized === lastCommittedRef.current) return;
    lastCommittedRef.current = serialized;
    writeGeoViewParams(state);
    writeStoredViewState(state);
  }, []);

  const schedule = useCallback(() => {
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
    // Flush imediato ao trocar de aba/minimizar: é exatamente o cenário do bug original (busca
    // um endereço, troca de aba, o estado precisa já estar salvo quando o usuário volta) — não
    // dá para confiar no debounce de 500ms sobreviver a uma aba em segundo plano.
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
