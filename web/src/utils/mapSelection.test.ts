import { describe, expect, it } from 'vitest';
import {
  selectedResourceHighlightGeometry,
  selectedResourceMarkerSize,
} from './mapSelection';

describe('selectedResourceMarkerSize', () => {
  it('usa o tamanho publicado pelo Studio antes de aplicar o crescimento da seleção', () => {
    expect(selectedResourceMarkerSize(30, 44)).toBe(50);
  });

  it('cai para o tamanho do marcador da escala quando não há configuração publicada', () => {
    expect(selectedResourceMarkerSize(24)).toBe(30);
  });
});

describe('selectedResourceHighlightGeometry', () => {
  it('alinha ponta do alfinete e centro do halo ao centro visual do recurso', () => {
    expect(selectedResourceHighlightGeometry(50, 33, 44)).toEqual({
      pinAnchorX: -8.5,
      pinAnchorY: 69,
      haloScale: 33,
      haloAnchorX: -25 / 33,
      haloAnchorY: 25 / 33,
    });
  });
});
