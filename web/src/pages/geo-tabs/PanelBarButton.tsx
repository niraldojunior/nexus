import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';

// Botão da barra de ações abaixo do título dos painéis de detalhe (Endereço,
// Site, Recurso) — ícone em cima, rótulo embaixo, estilo Google Maps (Rotas ·
// Salvar · Nearby…). Usado tanto para as abas de navegação do Site quanto para
// o botão de Street View, para os dois lerem como uma única barra.
export const PanelBarButton = forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    badge?: number | null;
    active?: boolean;
    onClick: () => void;
    ariaLabel?: string;
  }
>(function PanelBarButton({ icon: Icon, label, badge, active, onClick, ariaLabel }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      // `data-tab-active` é o alvo que PanelTabBar localiza para o auto-scroll (scrollIntoView)
      // quando a aba muda — sem isso, a faixa não tem como saber qual botão trazer à vista.
      data-tab-active={active ? 'true' : undefined}
      // Aba ativa ganha a barra amarela na base (estilo Google Maps). É um pseudo-elemento porque
      // o reset global `button { border: 0 }` (fora de @layer) vence as utilidades `border-*`.
      className={`relative flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-t-[14px] px-2 pb-2 pt-1.5 text-center transition after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full ${
        active
          ? 'text-app-text after:bg-app-accent'
          : 'text-app-muted after:bg-transparent hover:text-app-text'
      }`}
    >
      <span
        className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition ${
          active ? 'border-app-accent-border bg-app-accent' : 'border-app-border bg-app-accent-soft'
        }`}
      >
        {/* Ativo = círculo em amarelo sólido (bg-app-accent); `--vt-ink` é o token dedicado a
            texto/ícone sobre amarelo sólido (nunca clareia no tema escuro, ao contrário de
            `text-app-text`, que fica branco e ficava ilegível sobre o amarelo). */}
        <Icon className={`h-4 w-4 ${active ? 'text-[var(--vt-ink)]' : ''}`} aria-hidden="true" />
        {badge ? (
          <span className="absolute -right-1 -top-1 rounded-[999px] bg-white px-1 text-[0.6rem] font-semibold text-app-muted shadow-soft">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-[0.66rem] font-semibold leading-tight">{label}</span>
    </button>
  );
});
