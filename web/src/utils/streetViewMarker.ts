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
  // resourceType + status + nome (label/sublabel), igual à resolução dos markers de
  // GeoPage — o nome só entra em jogo para distinguir CDOI de CDOE (ver isCdoiResource em
  // resourceIcon.ts); o resto do tipo continua vindo só de resourceType.
  const icon = resourceIconFor({
    resourceType: resource.resourceType ?? '',
    status: resource.status,
    name: resource.label,
    sublabel: resource.sublabel,
  });
  return {
    point,
    title: resource.label,
    iconUrl: resourceIconDataUrl(icon, { size: STREET_VIEW_MARKER_SIZE }),
  };
}
