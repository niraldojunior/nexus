import { useEffect, useRef, useState } from 'react';

// Atraso antes de a barra aparecer: uma carga que resolve em menos que isto (cache, resposta
// instantânea) nunca chega a piscar na tela.
const APPEAR_DELAY_MS = 120;
// Uma vez visível, a barra fica no mínimo este tempo — sem isto ela estrobaria a cada pan,
// já que a busca por viewport dispara a cada `idle` e costuma resolver rápido.
const MIN_VISIBLE_MS = 320;

// Nome da classe que aciona a animação da faixa de marca (ver body.geo-map-loading::before
// em index.css). Ligada em document.body enquanto há carga, removida ao terminar.
const BODY_LOADING_CLASS = 'geo-map-loading';

// Indicador de carregamento do mapa: reaproveita a própria faixa de marca amarela fixa no
// topo da janela (body::before) — enquanto qualquer camada carrega (cobertura GPON, catálogo
// de locais, recursos por viewport, hierarquia, script do Google Maps — ver `mapDataLoading`
// em GeoPage), a linha amarela ganha um brilho que a percorre; ao terminar, volta ao amarelo
// sólido. Não desenha barra própria: só liga/desliga a classe na faixa existente e mantém um
// anúncio acessível (sr-only) para leitores de tela.
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

  // Liga a animação na faixa de marca enquanto o indicador está visível. A limpeza remove a
  // classe em qualquer troca de `visible` e no desmonte (sair da página Geo), para a faixa
  // não ficar animando fora de um carregamento.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const { body } = document;
    if (visible) body.classList.add(BODY_LOADING_CLASS);
    else body.classList.remove(BODY_LOADING_CLASS);
    return () => body.classList.remove(BODY_LOADING_CLASS);
  }, [visible]);

  if (!visible) return null;

  // O visual é a própria faixa de marca (via classe no body); aqui fica só o anúncio para
  // leitores de tela, fora da tela mas na árvore de acessibilidade.
  return (
    <span role="progressbar" aria-label={label} aria-busy="true" className="sr-only">
      {label}
    </span>
  );
}
