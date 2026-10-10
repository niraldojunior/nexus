import { describe, expect, it } from 'vitest';
import {
  administrativeCityNaturalKey,
  cityKeyOf,
  normalizeAdministrativeCity,
  normalizeCountryCode,
  normalizeStateCode,
} from '../src/modules/geo/administrative-city.js';

describe('administrative city normalization', () => {
  it('maps Brazil aliases to BR and rejects other countries', () => {
    for (const alias of ['BR', 'bra', ' Brasil ', 'Brazil']) {
      expect(normalizeCountryCode(alias)).toBe('BR');
    }
    expect(normalizeCountryCode('AR')).toBeNull();
    expect(normalizeCountryCode('')).toBeNull();
  });

  it('accepts only the 27 valid UF acronyms and strips trailing junk', () => {
    expect(normalizeStateCode('rj')).toBe('RJ');
    expect(normalizeStateCode('ES 7585677')).toBe('ES');
    expect(normalizeStateCode('PR 0 FOZ DO IGUACU')).toBe('PR');
    expect(normalizeStateCode('XX')).toBeNull();
    expect(normalizeStateCode('RIO')).toBeNull();
    expect(normalizeStateCode(null)).toBeNull();
  });

  it('builds accent- and case-insensitive city keys', () => {
    expect(cityKeyOf('  Niterói ')).toBe('NITEROI');
    expect(cityKeyOf('Niteroi')).toBe('NITEROI');
    expect(cityKeyOf('São   José')).toBe('SAO JOSE');
  });

  it('collapses accent variants into one natural key and keeps the display name', () => {
    const a = normalizeAdministrativeCity({ stateOrProvince: 'RJ', city: ' Niterói ' });
    const b = normalizeAdministrativeCity({
      country: 'Brasil',
      stateOrProvince: 'rj',
      city: 'NITEROI',
    });
    expect(a?.cityName).toBe('Niterói');
    expect(a && b && administrativeCityNaturalKey(a)).toBe(b && administrativeCityNaturalKey(b));
    expect(a && administrativeCityNaturalKey(a)).toBe('BR|RJ|NITEROI');
  });

  it('returns null for incomplete or invalid tuples', () => {
    expect(normalizeAdministrativeCity({ stateOrProvince: 'RJ', city: '' })).toBeNull();
    expect(normalizeAdministrativeCity({ stateOrProvince: 'ZZ', city: 'Niterói' })).toBeNull();
    expect(normalizeAdministrativeCity({ stateOrProvince: null, city: 'Niterói' })).toBeNull();
    expect(
      normalizeAdministrativeCity({ country: 'AR', stateOrProvince: 'RJ', city: 'Niterói' }),
    ).toBeNull();
  });
});
