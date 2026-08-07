import { describe, expect, it } from 'vitest';
import { dropLabelDataUrl, formatDropDistance, pathMidpoint } from './dropSimulation';

describe('pathMidpoint', () => {
  it('devolve o meio do comprimento, não o vértice do meio', () => {
    // Três vértices, mas o primeiro segmento é dez vezes mais longo que o segundo: o
    // meio do caminho cai dentro dele, longe do vértice central.
    const midpoint = pathMidpoint([
      [-43.1, -22.9],
      [-43.1, -22.91],
      [-43.1, -22.911],
    ]);
    expect(midpoint).not.toBeNull();
    expect(midpoint![1]).toBeCloseTo(-22.9055, 4);
  });

  it('interpola no meio de um segmento único', () => {
    const midpoint = pathMidpoint([
      [-43.1, -22.9],
      [-43.1, -22.902],
    ]);
    expect(midpoint![0]).toBeCloseTo(-43.1, 6);
    expect(midpoint![1]).toBeCloseTo(-22.901, 6);
  });

  it('lida com traçado vazio e com ponto único', () => {
    expect(pathMidpoint([])).toBeNull();
    expect(pathMidpoint([[-43.1, -22.9]])).toEqual([-43.1, -22.9]);
  });

  it('não quebra quando todos os vértices coincidem', () => {
    expect(
      pathMidpoint([
        [-43.1, -22.9],
        [-43.1, -22.9],
      ]),
    ).toEqual([-43.1, -22.9]);
  });
});

describe('formatDropDistance', () => {
  it('arredonda para metros inteiros abaixo de 1 km', () => {
    expect(formatDropDistance(123.4)).toBe('123 m');
    expect(formatDropDistance(999.6)).toBe('1 km');
  });

  it('usa km com uma casa e vírgula decimal em pt-BR', () => {
    expect(formatDropDistance(1234)).toBe('1,2 km');
  });

  it('devolve "-" para valor inválido', () => {
    expect(formatDropDistance(Number.NaN)).toBe('-');
  });
});

describe('dropLabelDataUrl', () => {
  it('gera um SVG em data-URL com o texto da distância', () => {
    const url = dropLabelDataUrl('123 m');
    expect(url.startsWith('data:image/svg+xml;charset=UTF-8,')).toBe(true);
    expect(decodeURIComponent(url)).toContain('123 m');
  });
});
