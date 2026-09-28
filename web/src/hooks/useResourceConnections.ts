import { useCallback, useEffect, useState } from 'react';
import { fetchResourceConnections, type ResourceConnection } from '../services/resourceApi';

const inFlight = new Map<string, Promise<ResourceConnection[]>>();

const loadConnections = (resourceId: string): Promise<ResourceConnection[]> => {
  const current = inFlight.get(resourceId);
  if (current) return current;
  const request = fetchResourceConnections(resourceId)
    .then((view) => view.connections)
    .finally(() => inFlight.delete(resourceId));
  inFlight.set(resourceId, request);
  return request;
};

/**
 * Carrega as conexões incidentes no recurso (não-contenção, nos dois sentidos),
 * deduplicadas em nível de módulo para suportar React StrictMode.
 */
export function useResourceConnections(
  resourceId: string,
  options?: { enabled?: boolean },
): {
  connections: ResourceConnection[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const enabled = options?.enabled ?? true;
  const [connections, setConnections] = useState<ResourceConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setConnections([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setConnections([]);
    setLoading(true);
    setError(null);

    void loadConnections(resourceId)
      .then((data) => {
        if (!cancelled) {
          setConnections(data);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Não foi possível carregar as conexões do recurso.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resourceId, enabled, revision]);

  return { connections, loading, error, reload };
}
