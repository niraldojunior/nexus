import { describe, expect, it } from 'vitest';
import {
  COVERAGE_ALPHA_MAX,
  COVERAGE_ALPHA_MIN,
  COVERAGE_DENSITY_SATURATION,
  coverageAlpha,
  coverageFill,
  coverageHue,
} from './coverageColor';

describe('coverageHue', () => {
  it('vai de vermelho (indisponível) a verde (disponível), passando por âmbar no meio', () => {
    expect(coverageHue(0)).toEqual([239, 68, 68]); // --status-red
    expect(coverageHue(0.5)).toEqual([245, 158, 11]); // --status-amber
    expect(coverageHue(1)).toEqual([16, 185, 129]); // --status-green
  });

  it('interpola dentro de cada metade da rampa', () => {
    const quarter = coverageHue(0.25); // entre vermelho e âmbar
    expect(quarter[0]).toBeGreaterThan(239 - 1); // R fica alto perto do vermelho
    expect(quarter[1]).toBeGreaterThan(68); // G sobe rumo ao âmbar
    const threeQuarters = coverageHue(0.75); // entre âmbar e verde
    expect(threeQuarters[2]).toBeGreaterThan(11); // B sobe rumo ao verde
  });

  it('satura fora de [0,1] em vez de estourar', () => {
    expect(coverageHue(-1)).toEqual([239, 68, 68]);
    expect(coverageHue(2)).toEqual([16, 185, 129]);
  });
});

describe('coverageAlpha', () => {
  it('cresce com a densidade entre o piso e o teto', () => {
    expect(coverageAlpha(0)).toBeCloseTo(COVERAGE_ALPHA_MIN, 5);
    expect(coverageAlpha(COVERAGE_DENSITY_SATURATION)).toBeCloseTo(COVERAGE_ALPHA_MAX, 5);
    const mid = coverageAlpha(COVERAGE_DENSITY_SATURATION / 2);
    expect(mid).toBeGreaterThan(COVERAGE_ALPHA_MIN);
    expect(mid).toBeLessThan(COVERAGE_ALPHA_MAX);
  });

  it('não passa do teto por mais densa que a célula seja', () => {
    expect(coverageAlpha(COVERAGE_DENSITY_SATURATION * 10)).toBeCloseTo(COVERAGE_ALPHA_MAX, 5);
  });
});

describe('coverageFill', () => {
  it('monta um rgba() com matiz pela disponibilidade e alfa pela densidade', () => {
    expect(coverageFill(1, COVERAGE_DENSITY_SATURATION)).toBe(
      `rgba(16, 185, 129, ${COVERAGE_ALPHA_MAX.toFixed(3)})`,
    );
    expect(coverageFill(0, 0)).toBe(`rgba(239, 68, 68, ${COVERAGE_ALPHA_MIN.toFixed(3)})`);
  });

  it('modo sólido ignora a densidade e usa o teto de alfa (nível de bairro)', () => {
    expect(coverageFill(1, 0, { solid: true })).toBe(
      `rgba(16, 185, 129, ${COVERAGE_ALPHA_MAX.toFixed(3)})`,
    );
  });
});
