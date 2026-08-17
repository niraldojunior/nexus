// Infra passiva (recursos + Sites não-CO) da região visível do mapa, buscada por bbox — some
// acima de PASSIVE_INFRA_MAX_SCALE_METERS (50 m), mesma régua da cobertura GPON (ver
// useGponCoverage, mesmo padrão de debounce/dedupe/token).
//
// Extraído de GeoPage (antes vivia dentro de handleViewportChange) para o controle de camadas
// (RF-011, REQ-MOD01-011) poder religar uma camada SEM o usuário mexer no mapa: com o fetch
// preso ao callback de `idle`, religar caía no dedupe por bbox e o mapa ficava vazio até o
// próximo pan/zoom. Aqui a chave de dedupe inclui `include`, então a mudança de camadas por si
// só dispara um novo fetch.

import { useEffect, useRef, useState } from 'react';
import { fetchViewportResources, type GeoTreeNode, type MapBounds } from '../services/geoTreeApi';
import { PASSIVE_INFRA_MAX_SCALE_METERS } from '../utils/mapScale';
import type { ViewportShape } from '../utils/mapLayers';

const inFlight = new Map<string, Promise<GeoTreeNode[]>>();

const requestKey = (bounds: MapBounds, include: ViewportShape[] | undefined): string =>
  [
    include ? include.slice().sort().join('+') : 'all',
    bounds.minLng.toFixed(4),
    bounds.minLat.toFixed(4),
    bounds.maxLng.toFixed(4),
    bounds.maxLat.toFixed(4),
  ].join(',');

export function useViewportInfra(
  bounds: MapBounds | null,
  scaleMeters: number | null,
  include: ViewportShape[] | undefined,
): { data: GeoTreeNode[]; loading: boolean } {
  const [data, setData] = useState<GeoTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const outOfScale =
      scaleMeters === null || scaleMeters > PASSIVE_INFRA_MAX_SCALE_METERS || !bounds;
    // `include` array vazio = todas as camadas de viewport desligadas: nada a buscar.
    const nothingRequested = Array.isArray(include) && include.length === 0;
    if (outOfScale || nothingRequested) {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
      lastKeyRef.current = null;
      setData([]);
      setLoading(false);
      return;
    }

    const key = requestKey(bounds, include);
    if (key === lastKeyRef.current) return;

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastKeyRef.current = key;
      const token = ++tokenRef.current;
      setLoading(true);
      const pending = inFlight.get(key) ?? fetchViewportResources(bounds, { include });
      inFlight.set(key, pending);
      pending
        .then((result) => {
          if (tokenRef.current === token) setData(result);
        })
        .catch(() => {
          if (tokenRef.current === token) setData([]);
        })
        .finally(() => {
          inFlight.delete(key);
          if (tokenRef.current === token) setLoading(false);
        });
    }, 250);

    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [bounds, scaleMeters, include]);

  return { data, loading };
}
