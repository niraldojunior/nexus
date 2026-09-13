import { useEffect, useState } from 'react';
import { getPublishedMapLayerCatalog, type StudioGeoCatalog } from '../services/studioGeoApi';

const EMPTY_PENDING_CATALOG: StudioGeoCatalog = {
  schemaVersion: 2,
  nodes: [],
  configured: false,
  environmentId: 'pending',
  fallback: false,
};

export type UseMapLayerCatalog = {
  catalog: StudioGeoCatalog;
  loading: boolean;
  error: string | null;
};

/**
 * The catalog is only available after the operational endpoint responds. The service owns a
 * module-level in-flight promise, so StrictMode does not duplicate the request against the serial
 * local backend.
 */
export function useMapLayerCatalog(): UseMapLayerCatalog {
  const [catalog, setCatalog] = useState<StudioGeoCatalog>(EMPTY_PENDING_CATALOG);
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
