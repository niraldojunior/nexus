import type { DraftAddress } from '../../utils/googleMaps';
import { haversineMeters } from '../../utils/googleRoutes';
import type { GeonetAddressDetail } from '../../services/geonetAddressApi';

export type AddressPinLocation = {
  coordinates: [number, number];
  source: 'google' | 'geonet';
  precision: string;
};

export type AddressLocationResolution =
  | { mode: 'automatic'; selected: AddressPinLocation }
  | {
      mode: 'conflict';
      google: AddressPinLocation;
      geonet: AddressPinLocation;
      distanceMeters: number;
      selectedSource: AddressPinLocation['source'] | null;
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

export function selectPinLocation(
  address: DraftAddress,
  geonet: GeonetAddressDetail | null,
): AddressPinLocation {
  const google: AddressPinLocation = {
    coordinates: address.coordinates,
    source: 'google',
    precision: address.precision ?? 'Desconhecida',
  };
  const geonetInfo = geonetPrecision(geonet?.geolocationMethod);
  if (
    geonet?.coordinates &&
    geonetInfo.rank > (GOOGLE_PRECISION_RANK[address.precision ?? ''] ?? 0)
  ) {
    return { coordinates: geonet.coordinates, source: 'geonet', precision: geonetInfo.text };
  }
  return google;
}

export function resolveAddressLocation(
  address: DraftAddress,
  geonet: GeonetAddressDetail | null,
  selectedSource: AddressPinLocation['source'] | null = null,
): AddressLocationResolution {
  const automatic = selectPinLocation(address, geonet);
  if (!geonet?.coordinates) return { mode: 'automatic', selected: automatic };
  const google: AddressPinLocation = {
    coordinates: address.coordinates,
    source: 'google',
    precision: address.precision ?? 'Desconhecida',
  };
  const geonetLocation: AddressPinLocation = {
    coordinates: geonet.coordinates,
    source: 'geonet',
    precision: geonetPrecision(geonet.geolocationMethod).text,
  };
  const distanceMeters = haversineMeters(google.coordinates, geonetLocation.coordinates);
  if (distanceMeters <= ADDRESS_COORDINATE_CONFLICT_METERS)
    return { mode: 'automatic', selected: automatic };
  return { mode: 'conflict', google, geonet: geonetLocation, distanceMeters, selectedSource };
}
