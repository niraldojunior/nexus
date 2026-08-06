import type { GeoStatus } from '../../services/geoApi';

// Selo de status do campo "Status" nas abas Visão geral de Site e Recurso —
// mesmo padrão visual do PrecisionBadge no painel de Endereço (borda + fundo
// suave na cor do estado), para que os três painéis fiquem consistentes.
const STATUS_LABEL: Record<GeoStatus, string> = {
  planned: 'Planejado',
  active: 'Ativo',
  suspended: 'Suspenso',
  terminated: 'Terminado',
};

const STATUS_CLASS: Record<GeoStatus, string> = {
  active: 'border-status-green/30 bg-status-green-soft text-status-green',
  suspended: 'border-status-red/30 bg-status-red-soft text-status-red',
  planned: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  terminated: 'border-app-border bg-app-sidebar text-app-muted',
};

export function StatusBadge({ status }: { status: GeoStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-[999px] border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.02em] ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
