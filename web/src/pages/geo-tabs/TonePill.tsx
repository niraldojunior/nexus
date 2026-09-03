import { TONE_CLASS, type StatusTone } from '../../utils/geoLabels';

// Mesmo "pill" visual do StatusBadge, mas para quem já resolveu o tom (verde/âmbar/
// vermelho/cinza) fora do vocabulário de GeoProject/GeographicSite — caso dos eixos
// SID (administrativeState/operationalState/usageState) e do `behavior` do catálogo
// de status de recurso, usados em ResourceOverviewTab.
export function TonePill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-[999px] border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.02em] ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
