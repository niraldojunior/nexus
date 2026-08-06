import { useRef, useState } from 'react';
import { PersonStanding } from 'lucide-react';
import { isValidStreetViewPoint } from '../utils/streetViewTargets';
import { PanelBarButton } from '../pages/geo-tabs/PanelBarButton';
import { GoogleStreetViewModal, type StreetViewMarker } from './GoogleStreetViewModal';

export function GoogleStreetViewButton({
  marker,
  variant = 'circle',
  label = 'Street View',
}: {
  marker: StreetViewMarker;
  // 'circle': botão redondo isolado (usado dentro do hero). 'bar': ícone +
  // rótulo embaixo, para conviver na barra de ações abaixo do título dos
  // painéis de detalhe (ver PanelBarButton).
  variant?: 'circle' | 'bar';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!isValidStreetViewPoint(marker.point)) return null;

  const close = () => {
    triggerRef.current?.focus();
    setOpen(false);
  };

  if (variant === 'bar') {
    return (
      <>
        <PanelBarButton
          ref={triggerRef}
          icon={PersonStanding}
          label={label}
          onClick={() => setOpen(true)}
          ariaLabel={`Abrir Streetview de ${marker.title}`}
        />
        {open ? <GoogleStreetViewModal marker={marker} onClose={close} /> : null}
      </>
    );
  }

  return (
    <>
      <span className="group relative inline-flex shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Abrir Streetview de ${marker.title}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-app-accent-border bg-app-accent text-app-text shadow-soft transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-app-focus/30"
        >
          <PersonStanding className="h-4 w-4" aria-hidden="true" />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-app-text px-2 py-1 text-[0.7rem] font-semibold text-white opacity-0 shadow-soft transition group-hover:opacity-100 group-focus-within:opacity-100"
        >
          Streetview
        </span>
      </span>
      {open ? <GoogleStreetViewModal marker={marker} onClose={close} /> : null}
    </>
  );
}
