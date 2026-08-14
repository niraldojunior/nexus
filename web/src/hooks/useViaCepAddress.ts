import { useCallback, useEffect, useState } from 'react';
import { fetchViaCep, type ViaCepAddress } from '../services/viaCepApi';
import { normalizeCep } from '../utils/cep';

export type ViaCepLookupStatus = 'idle' | 'loading' | 'ready' | 'not_found' | 'error';

export type UseViaCepAddressResult = {
  status: ViaCepLookupStatus;
  address: ViaCepAddress | null;
  error: string | null;
  retry: () => void;
};

// Consulta o DNE (ViaCEP) para o CEP informado. Mesmo desenho de useGeonetAddress: flag
// `active` no cleanup para descartar respostas obsoletas, e `retry` por contador.
export function useViaCepAddress(cep: string | null): UseViaCepAddressResult {
  const normalized = normalizeCep(cep);
  const [status, setStatus] = useState<ViaCepLookupStatus>('idle');
  const [address, setAddress] = useState<ViaCepAddress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setAddress(null);
    setError(null);
    if (!normalized) {
      setStatus('idle');
      return () => {
        active = false;
      };
    }
    setStatus('loading');
    void fetchViaCep(normalized)
      .then((result) => {
        if (!active) return;
        if (result.status === 'not_found') {
          setStatus('not_found');
          return;
        }
        setAddress(result.address);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Não foi possível consultar o CEP.');
      });
    return () => {
      active = false;
    };
  }, [normalized, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { status, address, error, retry };
}
