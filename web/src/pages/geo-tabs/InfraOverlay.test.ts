// O hit-test de linha do InfraOverlay em si só é exercitável ponta a ponta com um mapa real
// (google.maps.OverlayView) — mesma régua de CoverageOverlay.test.ts, que também só testa a
// função pura de geometria (traceSmoothRing), não o `draw()`/hitTest completo da classe.
import { describe, expect, it } from 'vitest';
import { distanceToSegment, resourcePointHitCenter } from './InfraOverlay';

describe('distanceToSegment', () => {
  it('é zero quando o ponto está sobre o segmento', () => {
    expect(distanceToSegment(5, 0, [0, 0], [10, 0])).toBe(0);
  });

  it('mede a distância perpendicular quando a projeção cai dentro do segmento', () => {
    expect(distanceToSegment(5, 3, [0, 0], [10, 0])).toBe(3);
  });

  it('clampa em t=0: ponto "atrás" do início mede a distância até o início, não a reta infinita', () => {
    expect(distanceToSegment(-5, 4, [0, 0], [10, 0])).toBe(Math.hypot(5, 4));
  });

  it('clampa em t=1: ponto "além" do fim mede a distância até o fim', () => {
    expect(distanceToSegment(15, 4, [0, 0], [10, 0])).toBe(Math.hypot(5, 4));
  });

  it('segmento degenerado (a === b) cai na distância euclidiana simples', () => {
    expect(distanceToSegment(3, 4, [0, 0], [0, 0])).toBe(5);
  });
});

describe('resourcePointHitCenter', () => {
  it('alinha o alvo ao centro visual do ícone ancorado no canto inferior-esquerdo', () => {
    expect(resourcePointHitCenter(100, 200, 26)).toEqual([113, 187]);
  });

  it('mantém o alinhamento no ícone reduzido', () => {
    expect(resourcePointHitCenter(100, 200, 16)).toEqual([108, 192]);
  });
});
