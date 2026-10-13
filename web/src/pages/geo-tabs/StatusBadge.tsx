import { statusBadgeMeta } from '../../utils/geoLabels';
import { TonePill } from './TonePill';

// Selo de status do campo "Status" nas abas Visão geral de Site e Recurso —
// mesmo padrão visual do PrecisionBadge no painel de Endereço (borda + fundo
// suave na cor do estado), para que os três painéis fiquem consistentes.
// Aceita tanto o vocabulário de GeoProject (planned/active/suspended/terminated)
// quanto o de GeographicSite (Planned/InConstruction/Active/InDeactivation/Retired)
// — statusBadgeMeta cobre os dois sem o chamador precisar saber qual é qual.
export function StatusBadge({ status }: { status: string }) {
  const { label, tone } = statusBadgeMeta(status);
  return <TonePill label={label} tone={tone} />;
}
