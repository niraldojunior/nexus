import type { StreetViewMarker } from '../../utils/streetViewPanorama';

// Formato canônico do campo "Localização" dos painéis de detalhe (Site, Recurso,
// Endereço): coordenada `[lng, lat]` com 5 casas. Reusado também pela linha
// "Localização" de ResourceOverviewTab, que não passa por um StreetViewMarker.
export function formatCoordinatePoint(point: [number, number]): string {
  return `[${point[0].toFixed(5)}, ${point[1].toFixed(5)}]`;
}

// A porta para o Street View é a própria foto no topo do painel (ver StreetViewHero),
// não mais um botão aqui no campo.
export function CoordinateStreetView({ marker }: { marker: StreetViewMarker }) {
  return <span className="font-mono">{formatCoordinatePoint(marker.point)}</span>;
}
