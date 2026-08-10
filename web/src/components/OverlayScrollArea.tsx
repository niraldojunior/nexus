import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

// Barra de rolagem SOBREPOSTA ao conteúdo, no espírito das overlay scrollbars. Por que
// não CSS puro: `overflow: overlay` foi descontinuado (o Chromium atual o trata como
// `auto`) e uma barra webkit estilizada sempre reserva a própria largura — era isso que
// deixava a faixa branca à direita do painel quando o conteúdo rolava. Aqui a barra
// nativa é ocultada (o conteúdo ocupa toda a largura) e um polegar próprio é desenhado
// por cima, só no hover e só quando há o que rolar. É arrastável; roda/trackpad/teclado
// continuam rolando pela camada nativa, que segue ativa por baixo.

// Altura mínima do polegar, para ele continuar clicável mesmo em conteúdo muito longo.
const MIN_THUMB_PX = 28;

type Thumb = { top: number; height: number };

export function OverlayScrollArea({
  className = '',
  hostClassName = '',
  children,
}: {
  // Classes do elemento que rola (ex.: `p-3`, `overflow-x-hidden`).
  className?: string;
  // Classes da casca posicionada que ancora o polegar (ex.: alturas do flexbox).
  hostClassName?: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    // Sem transbordo: sem polegar (e o conteúdo já usa toda a largura).
    if (scrollHeight <= clientHeight + 1) {
      setThumb((prev) => (prev === null ? prev : null));
      return;
    }
    const track = clientHeight;
    const height = Math.max((clientHeight / scrollHeight) * track, MIN_THUMB_PX);
    const maxTop = track - height;
    const maxScroll = scrollHeight - clientHeight;
    const top = maxScroll > 0 ? maxTop * (scrollTop / maxScroll) : 0;
    setThumb((prev) =>
      prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.height - height) < 0.5
        ? prev
        : { top, height },
    );
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', scheduleMeasure, { passive: true });
    // Reobserva viewport e conteúdo: trocar de aba (Visão geral ↔ Viabilidade) ou a foto
    // carregar muda a altura rolável. `ResizeObserver` não existe no jsdom (testes) — daí
    // a guarda; nesse caso a medição inicial já basta.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(el);
      if (content) observer.observe(content);
    }
    return () => {
      el.removeEventListener('scroll', scheduleMeasure);
      observer?.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [measure, scheduleMeasure]);

  const onThumbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startY: event.clientY, startScroll: el.scrollTop };
  };
  const onThumbPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const drag = dragRef.current;
    if (!el || !drag || !thumb) return;
    const maxTop = el.clientHeight - thumb.height;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const scrollDelta = maxTop > 0 ? ((event.clientY - drag.startY) / maxTop) * maxScroll : 0;
    el.scrollTop = drag.startScroll + scrollDelta;
  };
  const onThumbPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div className={`overlay-scroll-host relative min-h-0 min-w-0 flex-1 ${hostClassName}`}>
      <div ref={scrollRef} className={`overlay-scroll h-full overflow-y-auto ${className}`}>
        <div ref={contentRef}>{children}</div>
      </div>
      {thumb ? (
        <div
          className="overlay-scroll-thumb"
          style={{ top: thumb.top, height: thumb.height }}
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={onThumbPointerEnd}
          onPointerCancel={onThumbPointerEnd}
        />
      ) : null}
    </div>
  );
}
