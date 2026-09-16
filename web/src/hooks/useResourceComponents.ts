import { useCallback, useEffect, useState } from 'react';
import {
  fetchResourceComponents,
  type ResourceComponentNode,
  type ResourceComponentsView,
} from '../services/resourceApi';

const inFlight = new Map<string, Promise<ResourceComponentsView>>();

const loadComponents = (
  resourceId: string,
  maxDepth?: number,
): Promise<ResourceComponentsView> => {
  const cacheKey = `${resourceId}:${maxDepth ?? 8}`;
  const current = inFlight.get(cacheKey);
  if (current) return current;
  const request = fetchResourceComponents(resourceId, { maxDepth }).finally(() =>
    inFlight.delete(cacheKey),
  );
  inFlight.set(cacheKey, request);
  return request;
};

/**
 * Carrega a árvore recursiva de componentes do recurso (containsAsChild),
 * deduplicada em nível de módulo para suportar React StrictMode.
 */
export function useResourceComponents(
  resourceId: string,
  options?: { maxDepth?: number },
): {
  components: ResourceComponentNode[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const maxDepth = options?.maxDepth;
  const [components, setComponents] = useState<ResourceComponentNode[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setComponents([]);
    setTruncated(false);
    setLoading(true);
    setError(null);

    void loadComponents(resourceId, maxDepth)
      .then((data) => {
        if (!cancelled) {
          setComponents(data.components);
          setTruncated(data.truncated);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Não foi possível carregar os componentes do recurso.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resourceId, maxDepth, revision]);

  return { components, truncated, loading, error, reload };
}
