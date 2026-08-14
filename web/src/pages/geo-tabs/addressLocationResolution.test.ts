import { describe, expect, it } from 'vitest';
import type { DraftAddress } from '../../utils/googleMaps';
import {
  ADDRESS_COORDINATE_CONFLICT_METERS,
  formatDivergenceMeters,
  resolveAddressLocation,
  selectPinLocation,
} from './addressLocationResolution';

const address: DraftAddress = {
  street: 'Rua Exemplo',
  country: 'BR',
  coordinates: [-43.1, -22.9],
  label: 'Rua Exemplo, 10',
  precision: 'RANGE_INTERPOLATED',
};

const latitudeAtMeters = (meters: number) => address.coordinates[1] + meters / 111_195;

describe('selectPinLocation — GEONET preferencial', () => {
  it('vence no empate de precisão (mesma qualidade)', () => {
    // Google RANGE_INTERPOLATED (rank 2) × GEONET Endereço Interpolação (rank 2): empate é do GEONET.
    expect(
      selectPinLocation(address, {
        formattedAddress: 'Rua Exemplo, 10',
        coordinates: [-43.2, -22.8],
        geolocationMethod: 'Endereço Interpolação',
      }),
    ).toMatchObject({ source: 'geonet', coordinates: [-43.2, -22.8] });
  });

  it('cede ao Google quando a precisão do GEONET é pior', () => {
    expect(
      selectPinLocation(address, {
        formattedAddress: 'Rua Exemplo, 10',
        coordinates: [-43.2, -22.8],
        geolocationMethod: 'Bairro',
      }),
    ).toMatchObject({ source: 'google', coordinates: address.coordinates });
  });

  it('cede ao Google quando o GEONET não tem coordenada', () => {
    expect(selectPinLocation(address, { formattedAddress: 'Rua Exemplo, 10' })).toMatchObject({
      source: 'google',
    });
  });
});

describe('resolveAddressLocation', () => {
  it('mantém a prioridade automática exatamente no limite de 30 m', () => {
    const resolution = resolveAddressLocation(address, {
      formattedAddress: 'Rua Exemplo, 10',
      coordinates: [-43.1, latitudeAtMeters(ADDRESS_COORDINATE_CONFLICT_METERS - 0.05)],
      geolocationMethod: 'Endereço Completo',
    });
    expect(resolution).toMatchObject({ mode: 'automatic', selected: { source: 'geonet' } });
  });

  it('em conflito, a chave já nasce marcada na base vencedora (GEONET)', () => {
    const resolution = resolveAddressLocation(address, {
      formattedAddress: 'Rua Exemplo, 10',
      coordinates: [-43.1, latitudeAtMeters(ADDRESS_COORDINATE_CONFLICT_METERS + 0.2)],
      geolocationMethod: 'Endereço Completo',
    });
    expect(resolution).toMatchObject({ mode: 'conflict', selectedSource: 'geonet' });
    if (resolution.mode === 'conflict') {
      expect(resolution.distanceMeters).toBeGreaterThan(30);
      expect(resolution.geonet.label).toBe('Rua Exemplo, 10');
    }
  });

  it('respeita a base escolhida explicitamente pelo usuário', () => {
    const resolution = resolveAddressLocation(
      address,
      {
        formattedAddress: 'Rua Exemplo, 10',
        coordinates: [-43.1, latitudeAtMeters(ADDRESS_COORDINATE_CONFLICT_METERS + 0.2)],
        geolocationMethod: 'Endereço Completo',
      },
      'google',
    );
    expect(resolution).toMatchObject({ mode: 'conflict', selectedSource: 'google' });
  });

  it('preserva Google como fallback quando GEONET não tem coordenadas', () => {
    expect(resolveAddressLocation(address, { formattedAddress: 'Rua Exemplo, 10' })).toMatchObject({
      mode: 'automatic',
      selected: { source: 'google', coordinates: address.coordinates },
    });
  });
});

describe('formatDivergenceMeters', () => {
  it('usa separador de milhar pt-BR', () => {
    expect(formatDivergenceMeters(1240)).toBe('1.240 m');
    expect(formatDivergenceMeters(42.4)).toBe('42 m');
  });

  it('devolve traço para valores não finitos', () => {
    expect(formatDivergenceMeters(Number.NaN)).toBe('-');
  });
});
