// Dados da aba Esquemático (painel de Recurso, módulo Geo): o "traceroute" da fibra do
// equipamento selecionado até a Estação (ver GeoTreeService.schematicPath).
//
// Mesmo padrão de useAddressViability.ts: React.StrictMode monta o componente duas vezes
// e o backend de dev atende em série — sem deduplicar por nodeId, abrir a aba custa o
// dobro.

import { useEffect, useRef, useState } from 'react';
import { fetchResourceSchematic, type GeoSchematicPath } from '../services/geoTreeApi';

export type ResourceSchematicStatus = 'idle' | 'loading' | 'ready' | 'error';

export type UseResourceSchematicResult = {
  status: ResourceSchematicStatus;
  path: GeoSchematicPath | null;
  error: string | null;
};

const inFlight = new Map<string, Promise<GeoSchematicPath>>();

export function useResourceSchematic(nodeId: string | null): UseResourceSchematicResult {
  const [status, setStatus] = useState<ResourceSchematicStatus>('idle');
  const [path, setPath] = useState<GeoSchematicPath | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nodeIdRef = useRef(nodeId);
  nodeIdRef.current = nodeId;

  useEffect(() => {
    if (!nodeId) {
      setStatus('idle');
      setPath(null);
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    const pending = inFlight.get(nodeId) ?? fetchResourceSchematic(nodeId);
    inFlight.set(nodeId, pending);

    pending
      .then((result) => {
        if (!active) return;
        setPath(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setPath(null);
        setError(err instanceof Error ? err.message : 'Falha ao consultar o esquemático');
        setStatus('error');
      })
      .finally(() => {
        inFlight.delete(nodeId);
      });

    return () => {
      active = false;
    };
  }, [nodeId]);

  return { status, path, error };
}
