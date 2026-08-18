import { describe, expect, it } from 'vitest';
import {
  COVERAGE_CITY_MAX_SCALE_METERS,
  COVERAGE_MIN_SCALE_METERS,
  COVERAGE_NEIGHBORHOOD_MAX_SCALE_METERS,
  PASSIVE_INFRA_MAX_SCALE_METERS,
  RESOURCE_SMALL_MIN_SCALE_METERS,
  coverageLevelForScale,
  coverageVisibleAtScale,
  resourceTierForScale,
} from './mapScale';

describe('régua de escala do mapa Geo', () => {
  it('cobertura, infra passiva e o tier de recurso trocam no mesmo degrau (50 m)', () => {
    expect(PASSIVE_INFRA_MAX_SCALE_METERS).toBe(50);
    expect(COVERAGE_MIN_SCALE_METERS).toBe(50);
    expect(RESOURCE_SMALL_MIN_SCALE_METERS).toBe(50);
  });

  it('cobertura fica visível de 50 m para cima e some em escala de detalhe (≤ 20 m)', () => {
    expect(coverageVisibleAtScale(50)).toBe(true);
    expect(coverageVisibleAtScale(100)).toBe(true);
    expect(coverageVisibleAtScale(20)).toBe(false);
    expect(coverageVisibleAtScale(null)).toBe(false);
  });

  it('recurso reduz em 50 m e volta ao tamanho cheio em escala de detalhe (≤ 20 m)', () => {
    expect(resourceTierForScale(50)).toBe('small');
    expect(resourceTierForScale(100)).toBe('small');
    expect(resourceTierForScale(20)).toBe('full');
    expect(resourceTierForScale(null)).toBe('full');
  });

  it('nível de cobertura sobe de bairro para município e depois estado, por escala (LOD)', () => {
    expect(coverageLevelForScale(50)).toBe('neighborhood');
    expect(coverageLevelForScale(COVERAGE_NEIGHBORHOOD_MAX_SCALE_METERS)).toBe('neighborhood');
    expect(coverageLevelForScale(COVERAGE_NEIGHBORHOOD_MAX_SCALE_METERS + 1)).toBe('city');
    expect(coverageLevelForScale(COVERAGE_CITY_MAX_SCALE_METERS)).toBe('city');
    expect(coverageLevelForScale(COVERAGE_CITY_MAX_SCALE_METERS + 1)).toBe('uf');
    expect(coverageLevelForScale(1_000_000)).toBe('uf');
  });
});
