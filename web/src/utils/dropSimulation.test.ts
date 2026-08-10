import { describe, expect, it } from 'vitest';
import {
  dropLabelDataUrl,
  formatDropDistance,
  pathMidpoint,
  pathSpanMeters,
  stitchDropPath,
} from './dropSimulation';
import { haversineMeters, type LngLat } from './googleRoutes';

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

describe('stitchDropPath', () => {
  const origin: LngLat = [-43.1, -22.9];
  const destination: LngLat = [-43.102, -22.902];

  it('prefixa a origem e sufixa o destino quando as pontas da rota estão deslocadas', () => {
    // A rota vem encaixada na via, sem passar pela fachada nem pela caixa.
    const routePath: LngLat[] = [
      [-43.1005, -22.9004],
      [-43.1015, -22.9016],
    ];
    const path = stitchDropPath(origin, routePath, destination);
    expect(path[0]).toEqual(origin);
    expect(path[path.length - 1]).toEqual(destination);
    expect(path).toHaveLength(4);
  });

  it('não duplica o vértice quando a ponta da rota já coincide com o ponto real', () => {
    const routePath: LngLat[] = [origin, [-43.101, -22.901], destination];
    const path = stitchDropPath(origin, routePath, destination);
    expect(path[0]).toEqual(origin);
    expect(path[path.length - 1]).toEqual(destination);
    // As pontas coincidentes são puladas: origem + meio + destino, sem repetição.
    expect(path).toHaveLength(3);
  });

  it('devolve o segmento direto quando a rota vem vazia', () => {
    expect(stitchDropPath(origin, [], destination)).toEqual([origin, destination]);
  });
});

describe('pathSpanMeters', () => {
  it('mede o maior lado do bbox do traçado', () => {
    // ~0,02° de longitude na latitude -22.9 é bem maior que ~0,001° de latitude.
    const span = pathSpanMeters([
      [-43.1, -22.9],
      [-43.08, -22.901],
    ]);
    const width = haversineMeters([-43.1, -22.9], [-43.08, -22.9]);
    expect(span).toBeCloseTo(width, 0);
  });

  it('devolve 0 para traçado vazio ou de ponto único', () => {
    expect(pathSpanMeters([])).toBe(0);
    expect(pathSpanMeters([[-43.1, -22.9]])).toBe(0);
  });
});
