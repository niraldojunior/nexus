import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DraftAddress } from '../utils/googleMaps';
import {
  fetchGeonetCandidates,
  fetchGeonetDetail,
  type GeonetAddressCandidate,
  type GeonetAddressDetail,
} from '../services/geonetAddressApi';

export type GeonetLookupStatus =
  'idle' | 'loading' | 'ready' | 'empty' | 'not_configured' | 'error';

export type UseGeonetAddressResult = {
  status: GeonetLookupStatus;
  candidates: GeonetAddressCandidate[];
  selectedId: string | null;
  detail: GeonetAddressDetail | null;
  locationPending: boolean;
  error: string | null;
  select: (addressId: string) => void;
  retry: () => void;
};

const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof fetchGeonetCandidates>>>>();

const CEP_PATTERN = '\\b\\d{5}-?\\d{3}\\b';

const numberFromQuery = (query?: string): string | undefined => {
  if (!query) return undefined;
  const explicit = query.match(/\b(?:n(?:ú|u)?m(?:ero)?\.?|n[º°]|#)\s*[-,:]?\s*(\d+[a-z]?)\b/i);
  if (explicit?.[1]) return explicit[1];
  const afterPostcode = query.match(new RegExp(`${CEP_PATTERN}\\s*,\\s*(\\d+[a-z]?)\\b`, 'i'));
  return afterPostcode?.[1];
};

export const geonetRequestOf = (address: DraftAddress): { address: string; number?: string } => {
  const number = address.streetNr ?? numberFromQuery(address.sourceQuery);
  return {
    // Para Enter em texto livre, a busca externa recebe exatamente o que foi digitado;
    // a forma estruturada é só o fallback para escolha do autocomplete/clique no mapa.
    address:
      address.sourceQuery?.trim() ||
      [address.street, address.city, address.stateOrProvince, address.postcode]
        .filter(Boolean)
        .join(', '),
    ...(number ? { number } : {}),
  };
};

export function useGeonetAddress(address: DraftAddress, enabled: boolean): UseGeonetAddressResult {
  const [status, setStatus] = useState<GeonetLookupStatus>('idle');
  const [candidates, setCandidates] = useState<GeonetAddressCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GeonetAddressDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => geonetRequestOf(address), [address]);
  const key = `${request.address}|${request.number ?? ''}`;
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  useEffect(() => {
    let active = true;
    setCandidates([]);
    setSelectedId(null);
    setDetail(null);
    setError(null);
    setLocationPending(false);
    if (!enabled || !request.address) {
      setStatus('idle');
      return () => {
        active = false;
      };
    }
    setStatus('loading');
    const pending = inFlight.get(key) ?? fetchGeonetCandidates(request.address, request.number);
    inFlight.set(key, pending);
    void pending
      .then((result) => {
        if (!active) return;
        if (result.status === 'not_configured') {
          setStatus('not_configured');
          return;
        }
        setCandidates(result.candidates);
        const first = result.candidates.find((candidate) => candidate.addressId);
        if (!first?.addressId) {
          setStatus('empty');
          return;
        }
        setLocationPending(true);
        setSelectedId(first.addressId);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Não foi possível consultar o Geonet.');
      })
      .finally(() => inFlight.delete(key));
    return () => {
      active = false;
    };
  }, [attempt, enabled, key, request.address, request.number]);

  useEffect(() => {
    let active = true;
    setDetail(null);
    if (!selectedId) {
      setLocationPending(false);
      return () => {
        active = false;
      };
    }
    void fetchGeonetDetail(selectedId)
      .then((result) => {
        if (!active || result.status !== 'ready') return;
        setDetail(result.address);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setStatus('error');
        setError(
          reason instanceof Error ? reason.message : 'Não foi possível carregar o endereço Geonet.',
        );
      })
      .finally(() => {
        if (active) setLocationPending(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const select = useCallback((addressId: string) => {
    setLocationPending(true);
    setSelectedId(addressId);
  }, []);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { status, candidates, selectedId, detail, error, locationPending, select, retry };
}
