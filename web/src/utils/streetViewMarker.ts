import type { GeoStatus } from '../services/geoApi';
import { resourceIconDataUrl, resourceIconFor, type IconResourceLike } from './resourceIcon';
import { siteIconDataUrl, siteIconFor } from './siteIcon';
import { siteKindFromSpec } from './placeLabel';
import type { StreetViewMarker } from './streetViewPanorama';

const STREET_VIEW_MARKER_SIZE = 40;

export function siteStreetViewMarker(
  site: { name: string; status?: GeoStatus },
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

export function resourceStreetViewMarker(
  resource: IconResourceLike & { label: string },
  point: [number, number],
): StreetViewMarker {
  const icon = resourceIconFor(resource.resourceType ?? '');
  return {
    point,
    title: resource.label,
    iconUrl: resourceIconDataUrl(icon, { size: STREET_VIEW_MARKER_SIZE }),
  };
}
