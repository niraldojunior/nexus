import { describe, expect, it } from 'vitest';
import type { DraftAddress } from '../../utils/googleMaps';
import {
  ADDRESS_COORDINATE_CONFLICT_METERS,
  resolveAddressLocation,
} from './addressLocationResolution';

const address: DraftAddress = {
  street: 'Rua Exemplo',
  country: 'BR',
  coordinates: [-43.1, -22.9],
  label: 'Rua Exemplo, 10',
  precision: 'RANGE_INTERPOLATED',
};

const latitudeAtMeters = (meters: number) => address.coordinates[1] + meters / 111_195;

describe('resolveAddressLocation', () => {
  it('mantém a prioridade automática exatamente no limite de 30 m', () => {
    const resolution = resolveAddressLocation(address, {
      formattedAddress: 'Rua Exemplo, 10',
      coordinates: [-43.1, latitudeAtMeters(ADDRESS_COORDINATE_CONFLICT_METERS - 0.05)],
      geolocationMethod: 'Endereço Completo',
    });
    expect(resolution).toMatchObject({ mode: 'automatic', selected: { source: 'geonet' } });
  });

  it('exige escolha quando a divergência passa de 30 m', () => {
    const resolution = resolveAddressLocation(address, {
      formattedAddress: 'Rua Exemplo, 10',
      coordinates: [-43.1, latitudeAtMeters(ADDRESS_COORDINATE_CONFLICT_METERS + 0.2)],
      geolocationMethod: 'Endereço Completo',
    });
    expect(resolution).toMatchObject({ mode: 'conflict', selectedSource: null });
    if (resolution.mode === 'conflict') expect(resolution.distanceMeters).toBeGreaterThan(30);
  });

  it('preserva Google como fallback quando GEONET não tem coordenadas', () => {
    expect(resolveAddressLocation(address, { formattedAddress: 'Rua Exemplo, 10' })).toMatchObject({
      mode: 'automatic',
      selected: { source: 'google', coordinates: address.coordinates },
    });
  });
});
