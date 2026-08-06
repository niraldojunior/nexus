import type { StreetViewMarker } from '../../utils/streetViewPanorama';

// Campo "Localização" dos painéis de detalhe (Site, Recurso, Endereço): coordenada
// `[lng, lat]` com 5 casas. O botão de Street View mora na barra de ações abaixo
// do título (ver PanelBarButton), não mais aqui.
export function CoordinateStreetView({ marker }: { marker: StreetViewMarker }) {
  const { point } = marker;
  return (
    <span className="font-mono">
      [{point[0].toFixed(5)}, {point[1].toFixed(5)}]
    </span>
  );
}
