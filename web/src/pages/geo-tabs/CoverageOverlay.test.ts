import { describe, expect, it, vi } from 'vitest';
import { traceSmoothRing } from './CoverageOverlay';

// Sink de stub: só grava as chamadas, sem canvas real — CoverageOverlay é exercitado à parte
// (via GeoPage.test.tsx, com o mock de google.maps.OverlayView que nunca projeta).
function createSink() {
  return {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
  };
}

describe('traceSmoothRing', () => {
  it('não desenha nada para um anel vazio', () => {
    const sink = createSink();
    traceSmoothRing(sink, []);
    expect(sink.moveTo).not.toHaveBeenCalled();
    expect(sink.quadraticCurveTo).not.toHaveBeenCalled();
  });

  it('cai no lineTo reto quando há menos de 3 pontos', () => {
    const sink = createSink();
    traceSmoothRing(sink, [
      [0, 0],
      [10, 0],
    ]);
    expect(sink.moveTo).toHaveBeenCalledWith(0, 0);
    expect(sink.lineTo).toHaveBeenCalledWith(10, 0);
    expect(sink.quadraticCurveTo).not.toHaveBeenCalled();
  });

  it('quadrado vira 4 quadráticas partindo do ponto médio da última aresta', () => {
    const sink = createSink();
    const square: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    traceSmoothRing(sink, square);

    // Começa no meio da aresta que fecha o quadrado ([0,10] → [0,0]).
    expect(sink.moveTo).toHaveBeenCalledWith(0, 5);
    expect(sink.quadraticCurveTo).toHaveBeenCalledTimes(4);
    // Cada vértice é o ponto de controle; o alvo é o meio da aresta seguinte.
    expect(sink.quadraticCurveTo).toHaveBeenNthCalledWith(1, 0, 0, 5, 0);
    expect(sink.quadraticCurveTo).toHaveBeenNthCalledWith(2, 10, 0, 10, 5);
    expect(sink.quadraticCurveTo).toHaveBeenNthCalledWith(3, 10, 10, 5, 10);
    expect(sink.quadraticCurveTo).toHaveBeenNthCalledWith(4, 0, 10, 0, 5);
  });
});
