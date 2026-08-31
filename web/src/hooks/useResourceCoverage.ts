// Cobertura GPON de um Resource pontual (REQ-MOD01-014). A busca é ativada somente pela aba
// selecionada e deduplicada por id: o backend local atende em série e React StrictMode pode montar
// o mesmo painel duas vezes. O token descarta respostas de um Resource que já não está aberto.

import { useEffect, useRef, useState } from 'react';
import { fetchCoverageByResource, type CoveragePointResult } from '../services/geoCoverageApi';

const inFlight = new Map<string, Promise<CoveragePointResult | undefined>>();

export function useResourceCoverage(
  resourceId: string,
  enabled: boolean,
): { coverage: CoveragePointResult | undefined; loading: boolean; error: string | null } {
  const [coverage, setCoverage] = useState<CoveragePointResult | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    setCoverage(undefined);
    setLoading(true);
    setError(null);
    const pending = inFlight.get(resourceId) ?? fetchCoverageByResource(resourceId);
    inFlight.set(resourceId, pending);

    pending
      .then((result) => {
        if (tokenRef.current === token) setCoverage(result);
      })
      .catch(() => {
        if (tokenRef.current === token) {
          setCoverage(undefined);
          setError('Não foi possível consultar a cobertura deste recurso.');
        }
      })
      .finally(() => {
        inFlight.delete(resourceId);
        if (tokenRef.current === token) setLoading(false);
      });
  }, [enabled, resourceId]);

  return { coverage, loading, error };
}
