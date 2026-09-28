import type { IconResourceLike } from './resourceIcon';
import type { VisualIdentity } from '../services/studioGeoApi';
import { resolveOperationalIcon } from './pointIconPreview';
import { selectionPinDataUrl } from './siteIcon';
import type { StreetViewMarker } from './streetViewPanorama';

const STREET_VIEW_MARKER_SIZE = 40;

export function siteStreetViewMarker(
  site: { name: string; status?: string },
  spec: { category?: string; name?: string; visualIdentity?: VisualIdentity } | undefined,
  point: [number, number],
): StreetViewMarker {
  const icon = resolveOperationalIcon(
    {
      kind: 'site',
      siteCategory: spec?.category,
      name: site.name,
      sublabel: spec?.name,
      status: site.status,
    },
    spec?.visualIdentity,
    { size: STREET_VIEW_MARKER_SIZE },
  );
  return { point, title: site.name, iconUrl: icon.url! };
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
  visualIdentity?: VisualIdentity,
): StreetViewMarker {
  const icon = resolveOperationalIcon(
    {
      kind: 'resource',
      resourceType: resource.resourceType,
      status: resource.status,
      name: resource.label,
      sublabel: resource.sublabel,
    },
    visualIdentity,
    { size: STREET_VIEW_MARKER_SIZE },
  );
  return { point, title: resource.label, iconUrl: icon.url! };
}
