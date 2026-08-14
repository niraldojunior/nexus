import { useEffect, useRef, useState } from 'react';

// Atraso antes de a barra aparecer: uma carga que resolve em menos que isto (cache, resposta
// instantânea) nunca chega a piscar na tela.
const APPEAR_DELAY_MS = 120;
// Uma vez visível, a barra fica no mínimo este tempo — sem isto ela estrobaria a cada pan,
// já que a busca por viewport dispara a cada `idle` e costuma resolver rápido.
const MIN_VISIBLE_MS = 320;

// Barra fina de progresso indeterminado no topo do mapa (estilo YouTube/GitHub): acende
// enquanto qualquer camada do mapa está carregando (cobertura GPON, catálogo de locais,
// recursos por viewport, hierarquia, script do Google Maps — ver `mapDataLoading` em
// GeoPage) e some quando tudo termina. É chrome do mapa, irmã de MapLocateButton e
// MapBaseLayerSelector — só desenha, não sabe o que está sendo carregado.
//
// O segmento é `app-ink`, não amarelo: a faixa de marca amarela fixa no topo da janela
// (body::before) fica logo acima, e uma barra amarela aqui viraria uma segunda linha
// amarela colada nela.
export function MapLoadingBar({
  busy,
  label = 'Carregando dados do mapa',
}: {
  busy: boolean;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  const appearTimerRef = useRef<number | undefined>(undefined);
  const hideTimerRef = useRef<number | undefined>(undefined);
  // Quando a barra ficou visível pela última vez — garante a duração mínima antes de sumir.
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (busy) {
      // Uma carga já em curso cancela qualquer ocultação pendente.
      if (hideTimerRef.current !== undefined) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = undefined;
      }
      if (visible || appearTimerRef.current !== undefined) return;
      appearTimerRef.current = window.setTimeout(() => {
        appearTimerRef.current = undefined;
        shownAtRef.current = Date.now();
        setVisible(true);
      }, APPEAR_DELAY_MS);
      return;
    }

    // Carga terminou antes de a barra aparecer: cancela e nunca mostra.
    if (appearTimerRef.current !== undefined) {
      window.clearTimeout(appearTimerRef.current);
      appearTimerRef.current = undefined;
    }
    if (!visible || hideTimerRef.current !== undefined) return;
    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = undefined;
      setVisible(false);
    }, remaining);
  }, [busy, visible]);

  useEffect(
    () => () => {
      if (appearTimerRef.current !== undefined) window.clearTimeout(appearTimerRef.current);
      if (hideTimerRef.current !== undefined) window.clearTimeout(hideTimerRef.current);
    },
    [],
  );

  if (!visible) return null;

  return (
    // `top-[3px]` posiciona a barra logo ABAIXO da faixa de marca amarela — que é fixa no
    // topo da janela (body::before), tem 3px e z-index 1000. Em `top-0` a barra ficava
    // escondida atrás dela (foi o que fez parecer que o indicador não aparecia).
    <div
      role="progressbar"
      aria-label={label}
      aria-busy="true"
      className="pointer-events-none absolute inset-x-0 top-[3px] z-30 h-[3px] overflow-hidden bg-app-ink/10"
    >
      <div className="h-full w-full bg-app-ink/70 animate-vt-map-progress" />
    </div>
  );
}
