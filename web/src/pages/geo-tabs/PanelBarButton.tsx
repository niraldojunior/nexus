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
      className={`flex min-w-[64px] flex-col items-center gap-1 rounded-[14px] px-2 py-1.5 text-center transition ${
        active ? 'text-app-text' : 'text-app-muted hover:text-app-text'
      }`}
    >
      <span
        className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition ${
          active ? 'border-app-accent-border bg-app-accent' : 'border-app-border bg-app-accent-soft'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {badge ? (
          <span className="absolute -right-1 -top-1 rounded-[999px] bg-white px-1 text-[0.6rem] font-semibold text-app-muted shadow-soft">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="whitespace-nowrap text-[0.66rem] font-semibold leading-tight">{label}</span>
    </button>
  );
});
