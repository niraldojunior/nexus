import { describe, expect, it } from 'vitest';
import { isValidStreetViewPoint, streetViewTargetsForGeometry } from './streetViewTargets';

describe('isValidStreetViewPoint', () => {
  it('aceita somente longitude e latitude finitas dentro dos limites geográficos', () => {
    expect(isValidStreetViewPoint([-43.1108, -22.9108])).toBe(true);
    expect(isValidStreetViewPoint(null)).toBe(false);
    expect(isValidStreetViewPoint([Number.NaN, -22.9])).toBe(false);
    expect(isValidStreetViewPoint([-43.1, Number.POSITIVE_INFINITY])).toBe(false);
    expect(isValidStreetViewPoint([181, 0])).toBe(false);
    expect(isValidStreetViewPoint([0, 91])).toBe(false);
  });
});

describe('streetViewTargetsForGeometry', () => {
  it('retorna um único alvo para geometria pontual', () => {
    expect(
      streetViewTargetsForGeometry({ type: 'Point', coordinates: [-43.1108, -22.9108] }),
    ).toEqual([{ point: [-43.1108, -22.9108] }]);
  });

  it('retorna início e fim para um recurso linear', () => {
    expect(
      streetViewTargetsForGeometry({
        type: 'LineString',
        coordinates: [
          [-43.11, -22.91],
          [-43.12, -22.92],
          [-43.13, -22.93],
        ],
      }),
    ).toEqual([
      { label: 'Início', point: [-43.11, -22.91] },
      { label: 'Fim', point: [-43.13, -22.93] },
    ]);
  });

  it('não oferece Street View para geometria sem ponto utilizável', () => {
    expect(streetViewTargetsForGeometry(undefined)).toEqual([]);
    expect(
      streetViewTargetsForGeometry({ type: 'LineString', coordinates: [[-43.11, -22.91]] }),
    ).toEqual([]);
    expect(
      streetViewTargetsForGeometry({
        type: 'Polygon',
        coordinates: [
          [
            [-43.11, -22.91],
            [-43.12, -22.92],
            [-43.11, -22.91],
          ],
        ],
      }),
    ).toEqual([]);
  });
});
