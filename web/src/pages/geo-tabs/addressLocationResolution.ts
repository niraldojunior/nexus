import type { DraftAddress } from '../../utils/googleMaps';
import { haversineMeters } from '../../utils/googleRoutes';
import type { GeonetAddressDetail } from '../../services/geonetAddressApi';

export type AddressPinLocation = {
  coordinates: [number, number];
  source: 'google' | 'geonet';
  precision: string;
  // Endereço formatado da própria fonte — alimenta a barra de pesquisa ao trocar a base
  // (ver GeoPage/onAddressLocationResolved). Google traz o `label`; GEONET, o `formattedAddress`.
  label: string;
};

export type AddressLocationResolution =
  | { mode: 'automatic'; selected: AddressPinLocation }
  | {
      mode: 'conflict';
      google: AddressPinLocation;
      geonet: AddressPinLocation;
      distanceMeters: number;
      // Em conflito a chave já nasce marcada na base vencedora (GEONET por padrão), nunca
      // nula — o painel não trava e a aba Viabilidade fica sempre disponível.
      selectedSource: AddressPinLocation['source'];
    };

export const ADDRESS_COORDINATE_CONFLICT_METERS = 30;

const GOOGLE_PRECISION_RANK: Record<string, number> = {
  ROOFTOP: 3,
  RANGE_INTERPOLATED: 2,
  GEOMETRIC_CENTER: 1,
  APPROXIMATE: 1,
};

const geonetPrecision = (method?: string): { rank: number; text: string } => {
  const normalized = method?.trim().toUpperCase();
  const values: Record<string, { rank: number; text: string }> = {
    'ENDEREÇO COMPLETO': { rank: 3, text: 'Alta - Endereço Completo' },
    'ENDERECO COMPLETO': { rank: 3, text: 'Alta - Endereço Completo' },
    'ENDEREÇO INTERPOLAÇÃO': { rank: 2, text: 'Média - Endereço Interpolação' },
    'ENDERECO INTERPOLACAO': { rank: 2, text: 'Média - Endereço Interpolação' },
    BAIRRO: { rank: 1, text: 'Baixa - Ponto no Centro do Bairro' },
    MUNICÍPIO: { rank: 1, text: 'Baixa - Ponto no Centro do Município' },
    MUNICIPIO: { rank: 1, text: 'Baixa - Ponto no Centro do Município' },
    'CEP + INTERPOLAÇÃO': { rank: 2, text: 'Média - CEP + Interpolação' },
    'CEP + INTERPOLACAO': { rank: 2, text: 'Média - CEP + Interpolação' },
    'CEP + NÚMERO DE PORTA': { rank: 3, text: 'Alta - Endereço Completo' },
    'CEP + NUMERO DE PORTA': { rank: 3, text: 'Alta - Endereço Completo' },
  };
  return values[normalized ?? ''] ?? { rank: 0, text: method ?? 'Desconhecida' };
};

const googleLocation = (address: DraftAddress): AddressPinLocation => ({
  coordinates: address.coordinates,
  source: 'google',
  precision: address.precision ?? 'Desconhecida',
  label: address.label,
});

const geonetLocation = (
  address: DraftAddress,
  geonet: GeonetAddressDetail,
): AddressPinLocation => ({
  coordinates: geonet.coordinates as [number, number],
  source: 'geonet',
  precision: geonetPrecision(geonet.geolocationMethod).text,
  label: geonet.formattedAddress || address.label,
});

/**
 * Base preferencial é o GEONET (base própria da V.tal). Ele vence sempre que tem coordenada
 * e precisão IGUAL OU MELHOR que a do Google — o empate é dele. O Google só vence quando o
 * GEONET não encontrou o endereço (sem coordenada) ou tem precisão pior.
 */
export function selectPinLocation(
  address: DraftAddress,
  geonet: GeonetAddressDetail | null,
): AddressPinLocation {
  const googleRank = GOOGLE_PRECISION_RANK[address.precision ?? ''] ?? 0;
  const geonetInfo = geonetPrecision(geonet?.geolocationMethod);
  if (geonet?.coordinates && geonetInfo.rank >= googleRank) {
    return geonetLocation(address, geonet);
  }
  return googleLocation(address);
}

// Normaliza o texto cru de precisão de qualquer fonte (Google ou GEONET) para o vocabulário
// de `GeoAccuracyLevel` gravado em `tmf_geographic_location.accuracy_level` — reaproveita os
// mesmos ranques de GOOGLE_PRECISION_RANK/geonetPrecision já usados para decidir a base
// vencedora, em vez de manter um terceiro dicionário de precisão.
export function accuracyLevelOf(
  source: 'google' | 'geonet',
  rawAccuracy: string | undefined,
): 'high' | 'medium' | 'low' | 'unknown' {
  const rank =
    source === 'google'
      ? (GOOGLE_PRECISION_RANK[rawAccuracy ?? ''] ?? 0)
      : geonetPrecision(rawAccuracy).rank;
  if (rank >= 3) return 'high';
  if (rank >= 2) return 'medium';
  if (rank >= 1) return 'low';
  return 'unknown';
}

export function resolveAddressLocation(
  address: DraftAddress,
  geonet: GeonetAddressDetail | null,
  selectedSource: AddressPinLocation['source'] | null = null,
): AddressLocationResolution {
  const automatic = selectPinLocation(address, geonet);
  if (!geonet?.coordinates) return { mode: 'automatic', selected: automatic };
  const google = googleLocation(address);
  const geonetPin = geonetLocation(address, geonet);
  const distanceMeters = haversineMeters(google.coordinates, geonetPin.coordinates);
  if (distanceMeters <= ADDRESS_COORDINATE_CONFLICT_METERS)
    return { mode: 'automatic', selected: automatic };
  return {
    mode: 'conflict',
    google,
    geonet: geonetPin,
    distanceMeters,
    selectedSource: selectedSource ?? automatic.source,
  };
}

/** Distância da divergência em pt-BR: metros inteiros com separador de milhar (ex.: `1.240 m`). */
export function formatDivergenceMeters(meters: number): string {
  if (!Number.isFinite(meters)) return '-';
  return `${Math.round(meters).toLocaleString('pt-BR')} m`;
}
