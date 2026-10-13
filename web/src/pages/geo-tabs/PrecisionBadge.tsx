import type { StatusTone } from '../../utils/geoLabels';
import { TonePill } from './TonePill';

// Classifica o `location_type` cru do Google Geocoder em uma qualidade legível —
// não existe mapeamento equivalente em nenhum outro lugar do repositório.
type PrecisionQuality = 'alta' | 'media' | 'baixa' | 'desconhecida';

const QUALITY_BY_LOCATION_TYPE: Record<string, PrecisionQuality> = {
  ROOFTOP: 'alta',
  RANGE_INTERPOLATED: 'media',
  GEOMETRIC_CENTER: 'baixa',
  APPROXIMATE: 'baixa',
};

const QUALITY_LABEL: Record<PrecisionQuality, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  desconhecida: 'Desconhecida',
};

const QUALITY_TONE: Record<PrecisionQuality, StatusTone> = {
  alta: 'green',
  media: 'amber',
  baixa: 'red',
  desconhecida: 'neutral',
};

export function PrecisionBadge({ locationType }: { locationType?: string }) {
  const quality = locationType
    ? (QUALITY_BY_LOCATION_TYPE[locationType] ?? 'desconhecida')
    : 'desconhecida';
  const text = locationType
    ? `${QUALITY_LABEL[quality]} - ${locationType}`
    : QUALITY_LABEL[quality];
  return <TonePill label={text} tone={QUALITY_TONE[quality]} />;
}
