import { useEffect, useRef, useState, type ReactNode } from 'react';

export type PanelTabBarProps = {
  children: ReactNode;
  /** Valor da aba ativa — só usado para disparar o auto-scroll (`data-tab-active` no botão
   *  filho localiza o alvo); não filtra nem ordena `children`. */
  activeTab: string;
  className?: string;
  role?: string;
  ariaLabel?: string;
};

/**
 * Faixa de abas dos painéis de detalhe (Recurso, Local, Endereço, Projeto) — mantém os botões
 * (`PanelBarButton`) numa linha só em vez de quebrar em múltiplas linhas quando não cabem, sem
 * expor scroll manual (nada de barra arrastável): a aba ativa é trazida para a área visível via
 * `scrollIntoView` e as bordas cortadas ganham um esmaecimento (`mask-image`) como pista de que
 * há mais abas para aquele lado — o mesmo padrão das abas de detalhe do Google Maps.
 */
export function PanelTabBar({ children, activeTab, className, role, ariaLabel }: PanelTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });

  const updateFade = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // Tolerância de 1px para não oscilar em zoom fracionário / subpixel rounding.
    setFade({
      start: scrollLeft > 1,
      end: scrollLeft + clientWidth < scrollWidth - 1,
    });
  };

  useEffect(() => {
    updateFade();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateFade, { passive: true });
    // `ResizeObserver` não existe no jsdom (testes) — mesmo guard de OverlayScrollArea.tsx.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateFade);
      observer.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', updateFade);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[data-tab-active="true"]');
    // `scrollIntoView` também não existe no jsdom (testes).
    el?.scrollIntoView?.({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    // O scroll suave demora para assentar; reavalia o esmaecimento depois que ele termina
    // (também coberto pelo listener de 'scroll' acima, mas o timeout cobre o frame final).
    const timeout = window.setTimeout(updateFade, 260);
    return () => window.clearTimeout(timeout);
  }, [activeTab]);

  const EDGE_FADE = 28; // px — um pouco maior que a largura do PanelBarButton (72px) / 2 não é necessário, só o suficiente para sinalizar corte.
  const maskImage =
    fade.start && fade.end
      ? `linear-gradient(to right, transparent, black ${EDGE_FADE}px, black calc(100% - ${EDGE_FADE}px), transparent)`
      : fade.end
        ? `linear-gradient(to right, black calc(100% - ${EDGE_FADE}px), transparent)`
        : fade.start
          ? `linear-gradient(to right, transparent, black ${EDGE_FADE}px)`
          : undefined;

  return (
    <div
      ref={scrollRef}
      role={role}
      aria-label={ariaLabel}
      className={`flex flex-nowrap gap-1 overflow-x-hidden ${className ?? ''}`}
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
    >
      {children}
    </div>
  );
}
