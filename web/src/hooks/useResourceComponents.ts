import { useCallback, useEffect, useState } from 'react';
import {
  fetchResourceComponents,
  type ResourceComponentConnection,
  type ResourceComponentNode,
  type ResourceComponentsView,
} from '../services/resourceApi';

const inFlight = new Map<string, Promise<ResourceComponentsView>>();
const cached = new Map<string, ResourceComponentsView>();

const cacheKeyOf = (resourceId: string, maxDepth?: number): string =>
  `${resourceId}:${maxDepth ?? 8}`;

const loadComponents = (
  resourceId: string,
  maxDepth?: number,
  options?: { bypassCache?: boolean },
): Promise<ResourceComponentsView> => {
  const cacheKey = cacheKeyOf(resourceId, maxDepth);
  if (!options?.bypassCache) {
    const cachedView = cached.get(cacheKey);
    if (cachedView) return Promise.resolve(cachedView);
  }
  const current = inFlight.get(cacheKey);
  if (current) return current;
  const request = fetchResourceComponents(resourceId, { maxDepth })
    .then((view) => {
      cached.set(cacheKey, view);
      return view;
    })
    .finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, request);
  return request;
};

/** Invalida a árvore após uma mutação de recurso ou relacionamento. */
export function invalidateResourceComponents(resourceId: string): void {
  for (const key of cached.keys()) {
    if (key.startsWith(`${resourceId}:`)) cached.delete(key);
  }
}

/**
 * Carrega a árvore recursiva de componentes do recurso (containsAsChild),
 * deduplicada em nível de módulo para suportar React StrictMode.
 */
export function useResourceComponents(
  resourceId: string,
  options?: { maxDepth?: number; enabled?: boolean },
): {
  components: ResourceComponentNode[];
  connections: ResourceComponentConnection[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const maxDepth = options?.maxDepth;
  const enabled = options?.enabled ?? true;
  const [components, setComponents] = useState<ResourceComponentNode[]>([]);
  const [connections, setConnections] = useState<ResourceComponentConnection[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => {
    invalidateResourceComponents(resourceId);
    setRevision((current) => current + 1);
  }, [resourceId]);

  useEffect(() => {
    if (!enabled) {
      setComponents([]);
      setConnections([]);
      setTruncated(false);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setComponents([]);
    setTruncated(false);
    setLoading(true);
    setError(null);

    void loadComponents(resourceId, maxDepth, { bypassCache: revision > 0 })
      .then((data) => {
        if (!cancelled) {
          setComponents(data.components);
          setConnections(data.connections);
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
  }, [resourceId, maxDepth, enabled, revision]);

  return { components, connections, truncated, loading, error, reload };
}
