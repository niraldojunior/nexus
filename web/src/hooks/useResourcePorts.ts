import { useCallback, useEffect, useState } from 'react';
import type { GeoTreeNode } from '../services/geoTreeApi';
import {
  fetchResourcePorts,
  type ResourcePortDetail,
  type ResourcePortsView,
} from '../services/resourceApi';

export type ResourcePortGroup = ResourcePortsView['groups'][number];

const inFlight = new Map<string, Promise<ResourcePortsView>>();

const loadPorts = (ctoId: string): Promise<ResourcePortsView> => {
  const current = inFlight.get(ctoId);
  if (current) return current;
  const request = fetchResourcePorts(ctoId).finally(() => inFlight.delete(ctoId));
  inFlight.set(ctoId, request);
  return request;
};

export const comparePorts = (a: ResourcePortDetail, b: ResourcePortDetail): number => {
  if (a.role !== b.role) return a.role === 'FO.I' ? -1 : b.role === 'FO.I' ? 1 : 0;
  return (a.index ?? 0) - (b.index ?? 0);
};

/** Projeção única da CTO, deduplicada para o double-invoke do React StrictMode. */
export function useResourcePorts(ctoNode: GeoTreeNode): {
  groups: ResourcePortGroup[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const ctoId = ctoNode.refId ?? ctoNode.id.replace(/^resource:/, '');
  const [groups, setGroups] = useState<ResourcePortGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setGroups([]);
    setLoading(true);
    setError(null);

    void loadPorts(ctoId)
      .then((view) => {
        if (!cancelled) {
          setGroups(view.groups.map((group) => ({ ...group, ports: [...group.ports].sort(comparePorts) })));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as portas.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ctoId, revision]);

  return { groups, loading, error, reload };
}
