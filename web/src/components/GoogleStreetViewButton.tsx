import { useRef, useState } from 'react';
import { PersonStanding } from 'lucide-react';
import { isValidStreetViewPoint } from '../utils/streetViewTargets';
import { GoogleStreetViewModal, type StreetViewMarker } from './GoogleStreetViewModal';

export function GoogleStreetViewButton({ marker }: { marker: StreetViewMarker }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!isValidStreetViewPoint(marker.point)) return null;

  const close = () => {
    triggerRef.current?.focus();
    setOpen(false);
  };

  return (
    <>
      <span className="group relative inline-flex shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Abrir Streetview de ${marker.title}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-app-border bg-white text-app-text shadow-sm transition hover:border-app-accent-border hover:bg-app-accent-soft focus-visible:ring-2 focus-visible:ring-app-focus/30"
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
