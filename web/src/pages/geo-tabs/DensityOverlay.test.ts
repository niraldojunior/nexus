// Como em CoverageOverlay.test.ts / InfraOverlay.test.ts, só a geometria pura é testável sem um
// mapa real (google.maps.OverlayView) — aqui, a escala do raio do disco.
import { describe, expect, it } from 'vitest';
import { densityRadiusPx } from './DensityOverlay';

describe('densityRadiusPx', () => {
  it('a célula mais densa recebe o raio máximo', () => {
    expect(densityRadiusPx(100, 100)).toBeCloseTo(26);
  });

  it('célula vazia (ou máximo zero) não desenha', () => {
    expect(densityRadiusPx(0, 100)).toBe(0);
    expect(densityRadiusPx(10, 0)).toBe(0);
  });

  it('cresce pela RAIZ, não linearmente — é a ÁREA que deve ser proporcional à contagem', () => {
    // Com escala linear, 1/4 da contagem daria 1/4 do raio (e 1/16 da área), esmagando o
    // contraste. Com raiz, 1/4 da contagem dá metade do raio acima do piso.
    const max = densityRadiusPx(100, 100);
    const quarter = densityRadiusPx(25, 100);
    const floor = 4;
    expect(quarter - floor).toBeCloseTo((max - floor) * 0.5, 5);
  });

  it('respeita o piso: uma única entidade ainda é visível', () => {
    expect(densityRadiusPx(1, 1_000_000)).toBeGreaterThanOrEqual(4);
  });

  it('contagem acima do máximo satura em vez de estourar o raio', () => {
    expect(densityRadiusPx(500, 100)).toBeCloseTo(densityRadiusPx(100, 100));
  });
});
