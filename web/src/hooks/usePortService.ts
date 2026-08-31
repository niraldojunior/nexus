import { useEffect, useState } from 'react';
import {
  listServices,
  type CustomerFacingService,
  type ResourceFacingService,
} from '../services/serviceApi';

export type PortService = {
  rfs: ResourceFacingService;
  cfs: CustomerFacingService;
};

const inFlight = new Map<string, Promise<PortService | null>>();

const load = (portId: string): Promise<PortService | null> => {
  const existing = inFlight.get(portId);
  if (existing) return existing;
  const request = (async () => {
    const rfs = (await listServices({
      '@type': 'ResourceFacingService', state: 'active', supportingResourceId: portId, limit: 2,
    })).filter((service): service is ResourceFacingService => service['@type'] === 'ResourceFacingService');
    if (rfs.length === 0) return null;
    if (rfs.length > 1) throw new Error('Há mais de um RFS ativo para esta porta.');
    const cfs = (await listServices({
      '@type': 'CustomerFacingService', state: 'active', supportingServiceId: rfs[0].id, limit: 2,
    })).filter((service): service is CustomerFacingService => service['@type'] === 'CustomerFacingService');
    if (cfs.length === 0) return null;
    if (cfs.length > 1) throw new Error('Há mais de um CFS ativo para o RFS desta porta.');
    return { rfs: rfs[0], cfs: cfs[0] };
  })().finally(() => inFlight.delete(portId));
  inFlight.set(portId, request);
  return request;
};

export function usePortService(portId: string, enabled = true): {
  service: PortService | null;
  hasActiveService: boolean;
  loading: boolean;
  error: string | null;
} {
  const [service, setService] = useState<PortService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setService(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setService(null);
    setLoading(true);
    setError(null);
    void load(portId)
      .then((result) => !cancelled && setService(result))
      .catch((reason: unknown) => !cancelled && setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o serviço.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [enabled, portId]);

  return { service, hasActiveService: Boolean(service), loading, error };
}
