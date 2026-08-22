import { MapPin, Network, Layers, Building2 } from 'lucide-react';
import { usePlaceLabel } from '../hooks/usePlaceLabel';
import type { PlaceReference } from '../utils/placeLabel';

export type PlaceLabelProps = {
  place: PlaceReference;
};

/**
 * Renderiza um rótulo amigável para um local (site ou endereço).
 * Nunca expõe o UUID: mostra Ícone + Nome + Tipo · Endereço.
 * O ID técnico fica apenas no title/tooltip.
 */
export function PlaceLabel({ place }: PlaceLabelProps) {
  const { resolved, loading } = usePlaceLabel(place);
  if (loading) {
    return <span className="text-app-muted">Carregando…</span>;
  }
  if (!resolved) {
    return <span className="text-app-muted">—</span>;
  }

  const IconForKind =
    resolved.kind === 'PI'
      ? MapPin
      : resolved.kind === 'CTO'
        ? Network
        : resolved.kind === 'POP'
          ? Layers
          : resolved.kind === 'CO'
            ? Building2
            : undefined;

  const colorForKind =
    resolved.kind === 'CTO'
      ? '#1A9E7D'
      : resolved.kind === 'PI'
        ? '#8B7500'
        : resolved.kind === 'POP'
          ? '#004E89'
          : resolved.kind === 'CO'
            ? '#9B59B6'
            : '#5A5A5A';

  // Linha secundária = Tipo · Endereço, mesmo formato do `sublabel` de PlaceOption.
  const sublabel = [resolved.typeLabel, resolved.address].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-2" title={`ID: ${resolved.id}`}>
      {IconForKind && (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] text-white text-[0.7rem] font-bold"
          style={{ background: colorForKind }}
        >
          <IconForKind className="h-3 w-3" />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-[0.88rem] font-semibold text-app-text">{resolved.name}</div>
        {sublabel && <div className="truncate text-[0.75rem] text-app-muted">{sublabel}</div>}
      </div>
    </div>
  );
}

/**
 * Renderiza apenas um rótulo de tipo + endereço (sem ícone, sem nome).
 * Útil para colunas de tabela.
 */
export function PlaceLabelCompact({ place }: PlaceLabelProps) {
  const { resolved, loading } = usePlaceLabel(place);
  if (loading) {
    return <span className="text-app-muted">…</span>;
  }
  if (!resolved) {
    return <span className="text-app-muted">—</span>;
  }

  return (
    <span className="text-[0.88rem] text-app-text" title={`${resolved.name}\nID: ${resolved.id}`}>
      {resolved.typeLabel && resolved.address
        ? `${resolved.typeLabel} · ${resolved.address}`
        : resolved.typeLabel || resolved.address || resolved.name || '—'}
    </span>
  );
}
