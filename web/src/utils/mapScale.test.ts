import { describe, expect, it } from 'vitest';
import {
  COVERAGE_CITY_MAX_SCALE_METERS,
  COVERAGE_MIN_SCALE_METERS,
  COVERAGE_NEIGHBORHOOD_MAX_SCALE_METERS,
  NETWIN_POLE_MAX_SCALE_METERS,
  PASSIVE_INFRA_MAX_SCALE_METERS,
  coverageLevelForScale,
  coverageVisibleAtScale,
  poleVisibleAtScale,
  resourceIconSizeForScale,
  siteIconSizeForScale,
} from './mapScale';

describe('régua de escala do mapa Geo', () => {
  it('infra passiva some a partir de 200 m', () => {
    expect(PASSIVE_INFRA_MAX_SCALE_METERS).toBe(200);
  });

  it('cobertura só aparece acima de 100 m (nada de mancha em ≤ 100 m)', () => {
    expect(COVERAGE_MIN_SCALE_METERS).toBe(100);
    expect(coverageVisibleAtScale(200)).toBe(true);
    expect(coverageVisibleAtScale(101)).toBe(true);
    expect(coverageVisibleAtScale(100)).toBe(false);
    expect(coverageVisibleAtScale(50)).toBe(false);
    expect(coverageVisibleAtScale(null)).toBe(false);
  });

  it('poste (netwinPole) só é visível em escala de detalhe (≤ 20 m)', () => {
    expect(NETWIN_POLE_MAX_SCALE_METERS).toBe(20);
    expect(poleVisibleAtScale(20)).toBe(true);
    expect(poleVisibleAtScale(10)).toBe(true);
    expect(poleVisibleAtScale(21)).toBe(false);
    expect(poleVisibleAtScale(null)).toBe(false);
  });

  it('recurso: 30/25/20/15/10 px abaixo de 200 m, e oculto a partir de 200 m', () => {
    expect(resourceIconSizeForScale(5)).toBe(30);
    expect(resourceIconSizeForScale(10)).toBe(25);
    expect(resourceIconSizeForScale(20)).toBe(20);
    expect(resourceIconSizeForScale(50)).toBe(15);
    expect(resourceIconSizeForScale(100)).toBe(10);
    expect(resourceIconSizeForScale(200)).toBeNull();
    expect(resourceIconSizeForScale(500)).toBeNull();
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
