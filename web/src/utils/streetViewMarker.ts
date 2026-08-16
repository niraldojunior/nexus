import { resourceIconDataUrl, resourceIconFor, type IconResourceLike } from './resourceIcon';
import { selectionPinDataUrl, siteIconDataUrl, siteIconFor } from './siteIcon';
import { siteKindFromSpec } from './placeLabel';
import type { StreetViewMarker } from './streetViewPanorama';

const STREET_VIEW_MARKER_SIZE = 40;

export function siteStreetViewMarker(
  site: { name: string; status?: string },
  spec: { category?: string; name?: string } | undefined,
  point: [number, number],
): StreetViewMarker {
  const icon = siteIconFor(siteKindFromSpec(spec), site.status);
  return {
    point,
    title: site.name,
    iconUrl: siteIconDataUrl(icon, { size: STREET_VIEW_MARKER_SIZE }),
  };
}

// Endereço resolvido pela busca (ver AddressDetailPanel) — usa o mesmo alfinete que
// o mapa crava sobre o ponto encontrado (ver selectionPinDataUrl em GeoPage), em vez
// do ícone de site/recurso, já que um endereço avulso não tem um desses.
export function addressStreetViewMarker(address: {
  label: string;
  coordinates: [number, number];
}): StreetViewMarker {
  return {
    point: address.coordinates,
    title: address.label,
    iconUrl: selectionPinDataUrl(STREET_VIEW_MARKER_SIZE),
  };
}

export function resourceStreetViewMarker(
  resource: IconResourceLike & { label: string },
  point: [number, number],
): StreetViewMarker {
  // Só resourceType + status: resourceSpecification/name ficam de fora de propósito,
  // para a resolução do tipo continuar idêntica à do mapa (ver resourceIconFor nos
  // markers de GeoPage) — só a cor por status é que muda aqui.
  const icon = resourceIconFor({
    resourceType: resource.resourceType ?? '',
    status: resource.status,
  });
  return {
    point,
    title: resource.label,
    iconUrl: resourceIconDataUrl(icon, { size: STREET_VIEW_MARKER_SIZE }),
  };
}
