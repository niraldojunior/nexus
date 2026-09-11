import { useEffect, useState } from 'react';
import { getPublishedMapLayerCatalog, type StudioGeoCatalog } from '../services/studioGeoApi';
import { MAP_LAYER_CATALOG_FALLBACK } from '../utils/mapLayers';

export type UseMapLayerCatalog = {
  catalog: StudioGeoCatalog;
  loading: boolean;
  error: string | null;
};

/**
 * The map starts with the canonical fallback, then swaps atomically to the published Studio
 * catalog. The service owns a module-level in-flight promise, so StrictMode does not duplicate
 * the request against the serial local backend.
 */
export function useMapLayerCatalog(): UseMapLayerCatalog {
  const [catalog, setCatalog] = useState<StudioGeoCatalog>(MAP_LAYER_CATALOG_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPublishedMapLayerCatalog()
      .then((published) => {
        if (cancelled) return;
        setCatalog(published);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setCatalog(MAP_LAYER_CATALOG_FALLBACK);
        setError(reason instanceof Error ? reason.message : 'Falha ao carregar catálogo de camadas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, loading, error };
}
