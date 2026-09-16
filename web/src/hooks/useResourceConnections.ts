import { useCallback, useEffect, useState } from 'react';
import {
  fetchResourceConnections,
  type ResourceConnection,
} from '../services/resourceApi';

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
export function useResourceConnections(resourceId: string): {
  connections: ResourceConnection[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [connections, setConnections] = useState<ResourceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
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
  }, [resourceId, revision]);

  return { connections, loading, error, reload };
}
