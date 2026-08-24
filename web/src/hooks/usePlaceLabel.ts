import { useEffect, useState } from 'react';
import { getGeoAddress, getGeoLocation, getGeoSite } from '../services/geoApi';
import type { GeoAddress, GeoLocation, GeoSite } from '../services/geoApi';
import {
  buildGeoDirectory,
  resolvePlaceLabel,
  type PlaceReference,
  type ResolvedPlaceLabel,
} from '../utils/placeLabel';
import { useGeoSpecs } from './useGeoSpecs';

// Resolve UM local por id sob demanda (GET /v1/geo/sites|addresses|locations/:id, que já
// existem) em vez de carregar o catálogo inteiro — ver issue #56. Cache de módulo com dedupe
// de requisição em voo, mesmo padrão de useGeoDirectory.ts/useGeoSpecs.ts (necessário pelo
// StrictMode double-mount, ver AGENTS.md §3).
const cache = new Map<string, ResolvedPlaceLabel>();
const inFlight = new Map<
  string,
  Promise<{ site?: GeoSite; address?: GeoAddress; location?: GeoLocation }>
>();

async function fetchPlaceEntities(
  place: NonNullable<PlaceReference>,
): Promise<{ site?: GeoSite; address?: GeoAddress; location?: GeoLocation }> {
  const type = place['@referredType'];

  if (type === 'GeographicAddress') {
    return { address: await getGeoAddress(place.id) };
  }
  if (type === 'GeographicLocation') {
    return { location: await getGeoLocation(place.id) };
  }

  // Site é o caso comum (C2/C4) — tenta primeiro mesmo sem hint de tipo.
  const site = await getGeoSite(place.id);
  if (site) {
    const address = site.address?.id ? await getGeoAddress(site.address.id) : undefined;
    return { site, address };
  }
  const address = await getGeoAddress(place.id);
  if (address) return { address };
  return { location: await getGeoLocation(place.id) };
}

export function usePlaceLabel(place: PlaceReference): {
  resolved: ResolvedPlaceLabel | null;
  loading: boolean;
} {
  const { specs } = useGeoSpecs();
  const id = place?.id;
  const [resolved, setResolved] = useState<ResolvedPlaceLabel | null>(
    id ? (cache.get(id) ?? null) : null,
  );
  const [loading, setLoading] = useState(Boolean(id) && !(id && cache.has(id)));

  useEffect(() => {
    if (!place?.id) {
      setResolved(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(place.id);
    if (cached) {
      setResolved(cached);
      setLoading(false);
      return;
    }
    if (!specs) return;

    let cancelled = false;
    setLoading(true);
    const key = place.id;
    if (!inFlight.has(key)) inFlight.set(key, fetchPlaceEntities(place));
    inFlight
      .get(key)!
      .then((entities) => {
        const directory = buildGeoDirectory(
          entities.site ? [entities.site] : [],
          entities.address ? [entities.address] : [],
          entities.location ? [entities.location] : [],
          specs,
        );
        const result = resolvePlaceLabel(place, directory)!;
        cache.set(key, result);
        if (!cancelled) {
          setResolved(result);
          setLoading(false);
        }
      })
      .catch(() => {
        // Falha ao resolver as entidades do local (rede, 404 em cascata) não pode virar
        // unhandled rejection — o painel só fica sem rótulo amigável, não trava.
        if (!cancelled) setLoading(false);
      })
      .finally(() => {
        inFlight.delete(key);
      });
    return () => {
      cancelled = true;
    };
  }, [place?.id, place?.['@referredType'], specs]);

  return { resolved, loading };
}
