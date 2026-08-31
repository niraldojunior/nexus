import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPhysicalResourceDetail,
  type PhysicalResourceDetail,
} from '../services/resourceApi';

export type ResourceDetailState = {
  detail: PhysicalResourceDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const inFlight = new Map<string, Promise<PhysicalResourceDetail>>();

export function useResourceDetail(resourceId: string | null): ResourceDetailState {
  const [detail, setDetail] = useState<PhysicalResourceDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(resourceId));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!resourceId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let pending = inFlight.get(resourceId);
      if (!pending) {
        pending = fetchPhysicalResourceDetail(resourceId);
        inFlight.set(resourceId, pending);
      }
      const result = await pending;
      if (!mountedRef.current) return;
      setDetail(result);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o recurso.');
      }
    } finally {
      inFlight.delete(resourceId);
      if (mountedRef.current) setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return { detail, loading, error, reload };
}
