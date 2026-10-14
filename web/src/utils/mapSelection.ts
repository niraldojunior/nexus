// Geometria comum do destaque de um recurso pontual no mapa Geo. Recursos são
// ancorados no canto inferior-esquerdo da coordenada; o alfinete e o halo devem
// usar a mesma medida do ícone para convergir no seu centro visual.

export const SELECTED_MARKER_GROWTH_PX = 6;

export function selectedResourceMarkerSize(
  resourceMarkerSize: number,
  publishedSizePx?: number,
): number {
  return (publishedSizePx ?? resourceMarkerSize) + SELECTED_MARKER_GROWTH_PX;
}

export function selectedResourceHighlightGeometry(
  markerSize: number,
  pinWidth: number,
  pinHeight: number,
): {
  pinAnchorX: number;
  pinAnchorY: number;
  haloScale: number;
  haloAnchorX: number;
  haloAnchorY: number;
} {
  const haloScale = markerSize / 2 + 8;
  const centerShift = markerSize / 2;

  return {
    // A ponta do alfinete cai no centro visual do ícone que nasceu no canto
    // inferior-esquerdo da coordenada.
    pinAnchorX: pinWidth / 2 - centerShift,
    pinAnchorY: pinHeight + centerShift,
    haloScale,
    // SymbolPath.CIRCLE mede a âncora em unidades do símbolo, não em pixels.
    haloAnchorX: -centerShift / haloScale,
    haloAnchorY: centerShift / haloScale,
  };
}
