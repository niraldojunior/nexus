import { usePlaceLabel } from '../hooks/usePlaceLabel';
import type { PlaceReference } from '../utils/placeLabel';

export type PlaceLabelProps = {
  place: PlaceReference;
};

/**
 * Renderiza um rótulo amigável para um local (site ou endereço).
 * Nunca expõe o UUID: mostra Nome + Tipo · Endereço.
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
  // Linha secundária = Tipo · Endereço, mesmo formato do `sublabel` de PlaceOption.
  const sublabel = [resolved.typeLabel, resolved.address].filter(Boolean).join(' · ');

  return (
    <div className="min-w-0" title={`ID: ${resolved.id}`}>
      <div className="truncate text-[0.88rem] font-semibold text-app-text">{resolved.name}</div>
      {sublabel && <div className="truncate text-[0.75rem] text-app-muted">{sublabel}</div>}
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
