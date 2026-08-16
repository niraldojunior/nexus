import { statusBadgeMeta, type StatusTone } from '../../utils/geoLabels';

// Selo de status do campo "Status" nas abas Visão geral de Site e Recurso —
// mesmo padrão visual do PrecisionBadge no painel de Endereço (borda + fundo
// suave na cor do estado), para que os três painéis fiquem consistentes.
// Aceita tanto o vocabulário de GeoProject (planned/active/suspended/terminated)
// quanto o de GeographicSite (Planned/InConstruction/Active/InDeactivation/Retired)
// — statusBadgeMeta cobre os dois sem o chamador precisar saber qual é qual.
const TONE_CLASS: Record<StatusTone, string> = {
  green: 'border-status-green/30 bg-status-green-soft text-status-green',
  red: 'border-status-red/30 bg-status-red-soft text-status-red',
  amber: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  neutral: 'border-app-border bg-app-sidebar text-app-muted',
};

export function StatusBadge({ status }: { status: string }) {
  const { label, tone } = statusBadgeMeta(status);
  return (
    <span
      className={`inline-flex items-center rounded-[999px] border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.02em] ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
