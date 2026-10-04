// Sites do mapa na viewport (issue #314). Todo GeographicSite pontual visível no Studio GEO usa
// este único caminho: uma requisição por viewport estabilizada, sem decompor a área em tiles z16.
//
// Mesmo padrão de useMapDensity/useCoverage: debounce, bbox pedido 25% maior e arredondado a uma
// grade (um pan pequeno dentro da área carregada não reabre requisição), promise em voo
// compartilhada em nível de módulo (React.StrictMode) e token contra resposta obsoleta. Não há
// AbortController porque a promise é compartilhada entre mounts.

import { useEffect, useRef, useState } from 'react';
import { fetchMapSites, type MapSiteResponse } from '../services/geoMapSiteApi';
import type { MapTileFeature } from '../services/geoMapTileApi';
import type { MapBounds } from '../services/geoTreeApi';

const inFlight = new Map<string, Promise<MapSiteResponse>>();
const EMPTY: MapTileFeature[] = [];

// Grade em potência de dez proporcional ao vão da viewport: ~4 a 40 células por eixo.
function gridFor(bounds: MapBounds): number {
  const span = Math.max(bounds.maxLng - bounds.minLng, bounds.maxLat - bounds.minLat, 1e-6);
  return 10 ** Math.floor(Math.log10(span / 4));
}

export function paddedSiteBounds(bounds: MapBounds): MapBounds {
  const grid = gridFor(bounds);
  const padLng = (bounds.maxLng - bounds.minLng) * 0.25;
  const padLat = (bounds.maxLat - bounds.minLat) * 0.25;
  return {
    minLng: Math.floor((bounds.minLng - padLng) / grid) * grid,
    minLat: Math.floor((bounds.minLat - padLat) / grid) * grid,
    maxLng: Math.ceil((bounds.maxLng + padLng) / grid) * grid,
    maxLat: Math.ceil((bounds.maxLat + padLat) / grid) * grid,
  };
}

const contains = (outer: MapBounds, inner: MapBounds): boolean =>
  outer.minLng <= inner.minLng &&
  outer.maxLng >= inner.maxLng &&
  outer.minLat <= inner.minLat &&
  outer.maxLat >= inner.maxLat;

const requestKey = (bounds: MapBounds, ids: readonly string[]): string =>
  [
    bounds.minLng.toFixed(6),
    bounds.minLat.toFixed(6),
    bounds.maxLng.toFixed(6),
    bounds.maxLat.toFixed(6),
    ids.join('|'),
  ].join(',');

export function useMapSites(
  bounds: MapBounds | null,
  sourceModelIds: readonly string[],
): { features: MapTileFeature[]; loading: boolean; truncated: boolean } {
  const [response, setResponse] = useState<MapSiteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);
  const lastIdsRef = useRef<string>('');
  const lastFetchedBoundsRef = useRef<MapBounds | null>(null);
  const idsKey = sourceModelIds.join('|');

  useEffect(() => {
    if (!bounds || sourceModelIds.length === 0) {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
      tokenRef.current += 1;
      lastKeyRef.current = null;
      lastFetchedBoundsRef.current = null;
      lastIdsRef.current = '';
      setResponse(null);
      setLoading(false);
      return;
    }

    if (
      idsKey === lastIdsRef.current &&
      lastFetchedBoundsRef.current &&
      contains(lastFetchedBoundsRef.current, bounds)
    ) {
      return;
    }

    const requestBounds = paddedSiteBounds(bounds);
    const key = requestKey(requestBounds, sourceModelIds);
    if (key === lastKeyRef.current) return;

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastKeyRef.current = key;
      const token = ++tokenRef.current;
      setLoading(true);
      const pending = inFlight.get(key) ?? fetchMapSites(requestBounds, sourceModelIds);
      inFlight.set(key, pending);
      pending
        .then((result) => {
          if (tokenRef.current !== token) return;
          setResponse(result);
          lastIdsRef.current = idsKey;
          lastFetchedBoundsRef.current = requestBounds;
        })
        .catch(() => {
          // Falha transitória preserva o último resultado válido; libera nova tentativa.
          if (tokenRef.current === token) lastKeyRef.current = null;
        })
        .finally(() => {
          inFlight.delete(key);
          if (tokenRef.current === token) setLoading(false);
        });
    }, 250);

    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
    // sourceModelIds é representado por idsKey para estabilidade de identidade.
  }, [bounds, idsKey]);

  return {
    features: response?.features ?? EMPTY,
    loading,
    truncated: response?.truncated ?? false,
  };
}
