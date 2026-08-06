// Classifica o `location_type` cru do Google Geocoder em uma qualidade legível —
// não existe mapeamento equivalente em nenhum outro lugar do repositório.
type PrecisionQuality = 'alta' | 'media' | 'baixa' | 'desconhecida';

const QUALITY_BY_LOCATION_TYPE: Record<string, PrecisionQuality> = {
  ROOFTOP: 'alta',
  RANGE_INTERPOLATED: 'media',
  GEOMETRIC_CENTER: 'media',
  APPROXIMATE: 'baixa',
};

const QUALITY_LABEL: Record<PrecisionQuality, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  desconhecida: 'Desconhecida',
};

const QUALITY_CLASS: Record<PrecisionQuality, string> = {
  alta: 'border-status-green/30 bg-status-green-soft text-status-green',
  media: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  baixa: 'border-status-red/30 bg-status-red-soft text-status-red',
  desconhecida: 'border-app-border bg-app-sidebar text-app-muted',
};

export function PrecisionBadge({ locationType }: { locationType?: string }) {
  const quality = locationType ? (QUALITY_BY_LOCATION_TYPE[locationType] ?? 'desconhecida') : 'desconhecida';
  const text = locationType ? `${QUALITY_LABEL[quality]} - ${locationType}` : QUALITY_LABEL[quality];
  return (
    <span
      className={`inline-flex items-center rounded-[999px] border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.02em] ${QUALITY_CLASS[quality]}`}
    >
      {text}
    </span>
  );
}
