// Linhas do mapa na viewport (issue #317). Uma requisição agregada por viewport estabilizada, com
// exatamente um LOD por camada linear visível — nunca enumera tiles (vazios ou não).
//
// Mesmo padrão de useMapSites: debounce, bbox pedido 25% maior e arredondado a uma grade, promise em
// voo compartilhada em nível de módulo (StrictMode; o backend serializa requisições) e token contra
// resposta obsoleta. Trocar de faixa que muda o LOD muda a chave e refaz a leitura; mudar só estilo
// ou visibilidade de outra camada não.

import { useEffect, useRef, useState } from 'react';
import {
  fetchMapLines,
  type MapLineResponse,
  type MapLineSelection,
} from '../services/geoMapLineApi';
import type { MapTileFeature } from '../services/geoMapTileApi';
import type { MapBounds } from '../services/geoTreeApi';
import { MAP_TILES_INVALIDATED_EVENT } from '../utils/mapTileCache';
import { paddedSiteBounds } from './useMapSites';

const inFlight = new Map<string, Promise<MapLineResponse>>();
const EMPTY: MapTileFeature[] = [];

const contains = (outer: MapBounds, inner: MapBounds): boolean =>
  outer.minLng <= inner.minLng &&
  outer.maxLng >= inner.maxLng &&
  outer.minLat <= inner.minLat &&
  outer.maxLat >= inner.maxLat;

const requestKey = (bounds: MapBounds, selections: string): string =>
  [
    bounds.minLng.toFixed(6),
    bounds.minLat.toFixed(6),
    bounds.maxLng.toFixed(6),
    bounds.maxLat.toFixed(6),
    selections,
  ].join(',');

export function useMapLines(
  bounds: MapBounds | null,
  selections: readonly MapLineSelection[],
): { features: MapTileFeature[]; loading: boolean; truncated: boolean; stale: boolean } {
  const [response, setResponse] = useState<MapLineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const debounceRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);
  const lastSelectionsRef = useRef('');
  const lastFetchedBoundsRef = useRef<MapBounds | null>(null);
  const selectionKey = selections.map((s) => `${s.sourceModelId}:${s.lodKey}`).join('|');

  useEffect(() => {
    const invalidate = () => {
      lastKeyRef.current = null;
      lastFetchedBoundsRef.current = null;
      setRevision((current) => current + 1);
    };
    window.addEventListener(MAP_TILES_INVALIDATED_EVENT, invalidate);
    return () => window.removeEventListener(MAP_TILES_INVALIDATED_EVENT, invalidate);
  }, []);

  useEffect(() => {
    if (!bounds || selections.length === 0) {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
      tokenRef.current += 1;
      lastKeyRef.current = null;
      lastFetchedBoundsRef.current = null;
      lastSelectionsRef.current = '';
      setResponse(null);
      setLoading(false);
      return;
    }

    if (
      selectionKey === lastSelectionsRef.current &&
      lastFetchedBoundsRef.current &&
      contains(lastFetchedBoundsRef.current, bounds)
    ) {
      return;
    }

    const requestBounds = paddedSiteBounds(bounds);
    const key = requestKey(requestBounds, selectionKey);
    if (key === lastKeyRef.current) return;

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    // Invalida a geração anterior já, para uma resposta antiga não sobrescrever a viewport nova.
    const token = ++tokenRef.current;
    debounceRef.current = window.setTimeout(() => {
      lastKeyRef.current = key;
      setLoading(true);
      const pending = inFlight.get(key) ?? fetchMapLines(requestBounds, selections);
      inFlight.set(key, pending);
      pending
        .then((result) => {
          if (tokenRef.current !== token) return;
          setResponse(result);
          lastSelectionsRef.current = selectionKey;
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
    // `selections` é representado por selectionKey para estabilidade de identidade.
  }, [bounds, selectionKey, revision]);

  return {
    features: response?.features ?? EMPTY,
    loading,
    truncated: response?.truncated ?? false,
    stale: response?.selections.some((selection) => selection.stale) ?? false,
  };
}
