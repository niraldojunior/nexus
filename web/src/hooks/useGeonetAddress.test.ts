import { describe, expect, it } from 'vitest';
import { geonetRequestOf } from './useGeonetAddress';
import type { DraftAddress } from '../utils/googleMaps';

const cepAddress = (sourceQuery: string): DraftAddress => ({
  street: 'CEP 24220-401',
  postcode: '24220-401',
  country: 'BR',
  coordinates: [-43.1, -22.9],
  label: '24220-401, Niterói - RJ, Brasil',
  sourceQuery,
});

describe('geonetRequestOf', () => {
  it.each(['24220-401, 155', 'cep 24220401 numero 155', '24220401 nº155'])
  ('preserva o número digitado junto com o CEP: %s', (sourceQuery) => {
    expect(geonetRequestOf(cepAddress(sourceQuery))).toMatchObject({
      address: sourceQuery,
      number: '155',
    });
  });

  it('prioriza o número estruturado devolvido pelo Google', () => {
    expect(geonetRequestOf({ ...cepAddress('24220-401, 155'), streetNr: '157' })).toMatchObject({
      number: '157',
    });
  });
});
