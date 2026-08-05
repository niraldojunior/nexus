import { PersonStanding } from 'lucide-react';
import { buildGoogleMapsStreetViewUrl } from '../utils/googleMapsLink';

export function GoogleStreetViewLink({ point }: { point: [number, number] | null | undefined }) {
  const href = buildGoogleMapsStreetViewUrl(point);
  if (!href) return null;

  return (
    <span className="group relative inline-flex shrink-0">
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Abrir no Streetview"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-app-border bg-white text-app-text shadow-sm transition hover:border-app-accent-border hover:bg-app-accent-soft focus-visible:ring-2 focus-visible:ring-app-focus/30"
      >
        <PersonStanding className="h-4 w-4" aria-hidden="true" />
      </a>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-app-text px-2 py-1 text-[0.7rem] font-semibold text-white opacity-0 shadow-soft transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        Streetview
      </span>
    </span>
  );
}
