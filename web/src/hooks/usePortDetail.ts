import { useEffect, useState } from 'react';
import { fetchResourcePortDetail, type ResourcePortDetail } from '../services/resourceApi';

const inFlight = new Map<string, Promise<ResourcePortDetail>>();

const load = (portId: string) => {
  const existing = inFlight.get(portId);
  if (existing) return existing;
  const request = fetchResourcePortDetail(portId).finally(() => inFlight.delete(portId));
  inFlight.set(portId, request);
  return request;
};

export function usePortDetail(portId: string, enabled = true): {
  detail: ResourcePortDetail | null;
  loading: boolean;
  error: string | null;
} {
  const [detail, setDetail] = useState<ResourcePortDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setLoading(true);
    setError(null);
    void load(portId)
      .then((result) => !cancelled && setDetail(result))
      .catch((reason: unknown) => !cancelled && setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a porta.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [enabled, portId]);

  return { detail, loading, error };
}
