import type { StreetViewMarker } from '../../utils/streetViewPanorama';

// Campo "Localização" dos painéis de detalhe (Site, Recurso, Endereço): coordenada
// `[lng, lat]` com 5 casas. A porta para o Street View é a própria foto no topo do
// painel (ver StreetViewHero), não mais um botão aqui no campo.
export function CoordinateStreetView({ marker }: { marker: StreetViewMarker }) {
  const { point } = marker;
  return (
    <span className="font-mono">
      [{point[0].toFixed(5)}, {point[1].toFixed(5)}]
    </span>
  );
}
