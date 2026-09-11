import { describe, expect, it } from 'vitest';
import {
  COVERAGE_CITY_MAX_SCALE_METERS,
  COVERAGE_NEIGHBORHOOD_MAX_SCALE_METERS,
  coverageLevelForScale,
  resourceIconSizeForScale,
  siteIconSizeForScale,
} from './mapScale';

describe('régua de escala do mapa Geo', () => {
  it('não contém cortes globais de visibilidade de infraestrutura ou cobertura', async () => {
    const module = await import('./mapScale');

    expect('PASSIVE_INFRA_MAX_SCALE_METERS' in module).toBe(false);
    expect('COVERAGE_MIN_SCALE_METERS' in module).toBe(false);
    expect('coverageVisibleAtScale' in module).toBe(false);
  });

  it('recurso: reduz o ícone pela escala, mas nunca o oculta', () => {
    expect(resourceIconSizeForScale(5)).toBe(30);
    expect(resourceIconSizeForScale(10)).toBe(25);
    expect(resourceIconSizeForScale(20)).toBe(20);
    expect(resourceIconSizeForScale(50)).toBe(15);
    expect(resourceIconSizeForScale(100)).toBe(10);
    expect(resourceIconSizeForScale(200)).toBe(10);
    expect(resourceIconSizeForScale(500)).toBe(10);
    expect(resourceIconSizeForScale(null)).toBe(30);
  });

  it('site: 25 px até 10 km, 20 px de 10 a 50 km, 15 px de 50 km para cima — nunca oculta', () => {
    expect(siteIconSizeForScale(200)).toBe(25);
    expect(siteIconSizeForScale(5_000)).toBe(25);
    expect(siteIconSizeForScale(10_000)).toBe(20);
    expect(siteIconSizeForScale(20_000)).toBe(20);
    expect(siteIconSizeForScale(50_000)).toBe(15);
    expect(siteIconSizeForScale(100_000)).toBe(15);
    expect(siteIconSizeForScale(null)).toBe(25);
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
