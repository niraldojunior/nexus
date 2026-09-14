// Tradução do `strokeStyle` publicado pelo Studio GEO para os dois renderizadores usados no
// mapa: `setLineDash` do canvas (InfraOverlay/CoverageOverlay) e `icons` de google.maps.Polyline.
// Manter a tabela num só lugar garante que a mesma linha desenhada por canvas e por polyline
// nativa tenha o mesmo tracejado.

import type { StudioGeoStrokeStyle } from '../services/studioGeoApi';

/** Padrão de traço/lacuna em px de tela, na proporção da espessura da linha. */
export function strokeDashPattern(style: StudioGeoStrokeStyle, strokeWidth: number): number[] {
  const unit = Math.max(1, strokeWidth);
  if (style === 'dashed') return [unit * 3, unit * 2];
  if (style === 'dotted' || style === 'animated-dotted') return [unit, unit * 2];
  return [];
}

/** Comprimento de um ciclo completo do padrão — passo para animar `lineDashOffset`. */
export function strokeDashCycle(style: StudioGeoStrokeStyle, strokeWidth: number): number {
  const pattern = strokeDashPattern(style, strokeWidth);
  return pattern.reduce((total, part) => total + part, 0);
}

/** Velocidade da marcha do tracejado animado, em px de tela por segundo. */
export const ANIMATED_DASH_SPEED_PX_PER_SECOND = 24;

/**
 * Deslocamento do tracejado no instante `elapsedMs`. Sempre dentro de um ciclo, para o offset
 * não crescer indefinidamente em sessões longas.
 */
export function animatedDashOffset(
  elapsedMs: number,
  style: StudioGeoStrokeStyle,
  strokeWidth: number,
): number {
  const cycle = strokeDashCycle(style, strokeWidth);
  if (cycle <= 0) return 0;
  const traveled = (elapsedMs / 1000) * ANIMATED_DASH_SPEED_PX_PER_SECOND;
  return traveled % cycle;
}

/**
 * Preferência de movimento reduzido do sistema. Quando ativa, `animated-dotted` é desenhado
 * como pontilhado estático — o padrão continua legível sem movimento.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
