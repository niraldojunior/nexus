// Fábrica das leituras pontuais do mapa por bbox (Sites — issue #314; Recursos — issue #416). Uma
// requisição por viewport estabilizada, filtrada no servidor pelas entidades de catálogo visíveis
// no Studio GEO (`sourceModelIds`), sem decompor a área em tiles z16 — o custo acompanha o número
// de pontos das camadas ligadas, não a área da viewport.
//
// Mesmo padrão de useMapDensity/useCoverage: debounce, bbox pedido 25% maior e arredondado a uma
// grade (um pan pequeno dentro da área carregada não reabre requisição), promise em voo
// compartilhada em nível de módulo (React.StrictMode) e token contra resposta obsoleta. Não há
// AbortController porque a promise é compartilhada entre mounts. Cada hook criado pela fábrica tem
// seu próprio mapa de promises em voo, então Sites e Recursos nunca compartilham chave.

import { useEffect, useRef, useState } from 'react';
import type { MapTileFeature } from '../services/geoMapTileApi';
import type { MapBounds } from '../services/geoTreeApi';
import { MAP_TILES_INVALIDATED_EVENT } from '../utils/mapTileCache';

export type MapBboxFeatureResponse = {
  features: MapTileFeature[];
  // Verdadeiro quando o servidor cortou no teto por viewport; o cliente exibe o que veio.
  truncated: boolean;
};

export type MapBboxFeatureFetcher = (
  bounds: MapBounds,
  sourceModelIds: readonly string[],
) => Promise<MapBboxFeatureResponse>;

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

export function createBboxFeatureHook(fetcher: MapBboxFeatureFetcher) {
  const inFlight = new Map<string, Promise<MapBboxFeatureResponse>>();

  return function useMapBboxFeatures(
    bounds: MapBounds | null,
    sourceModelIds: readonly string[],
  ): { features: MapTileFeature[]; loading: boolean; truncated: boolean } {
    const [response, setResponse] = useState<MapBboxFeatureResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<number | undefined>(undefined);
    const tokenRef = useRef(0);
    const lastKeyRef = useRef<string | null>(null);
    const lastIdsRef = useRef<string>('');
    const lastFetchedBoundsRef = useRef<MapBounds | null>(null);
    const idsKey = sourceModelIds.join('|');
    const [revision, setRevision] = useState(0);

    // Edição/remoção de Site ou Recurso invalida o cache da viewport: força nova busca.
    useEffect(() => {
      const invalidate = () => {
        lastKeyRef.current = null;
        lastFetchedBoundsRef.current = null;
        setRevision((value) => value + 1);
      };
      window.addEventListener(MAP_TILES_INVALIDATED_EVENT, invalidate);
      return () => window.removeEventListener(MAP_TILES_INVALIDATED_EVENT, invalidate);
    }, []);

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
        const pending = inFlight.get(key) ?? fetcher(requestBounds, sourceModelIds);
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
    }, [bounds, idsKey, revision]);

    return {
      features: response?.features ?? EMPTY,
      loading,
      truncated: response?.truncated ?? false,
    };
  };
}
