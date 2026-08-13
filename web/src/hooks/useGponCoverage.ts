// Cobertura GPON da viewport, buscada por bbox + nível de escala (ver GeoCoverageService).
//
// Segue o padrão dos demais hooks de mapa (useGeoTree/useAddressViability): debounce de 250 ms,
// dedupe da requisição em voo por chave (o backend de dev atende em série e o StrictMode monta
// duas vezes) e um token para descartar respostas fora de ordem. Só busca acima de 100 m — em
// escala de detalhe a mancha não aparece e a planta individual toma conta.

import { useEffect, useRef, useState } from 'react';
import { fetchCoverage, type CoverageResponse } from '../services/geoCoverageApi';
import type { MapBounds } from '../services/geoTreeApi';
import { coverageVisibleAtScale, type CoverageLevel } from '../utils/mapScale';

const inFlight = new Map<string, Promise<CoverageResponse>>();

const requestKey = (bounds: MapBounds, level: CoverageLevel): string =>
  [
    level,
    bounds.minLng.toFixed(3),
    bounds.minLat.toFixed(3),
    bounds.maxLng.toFixed(3),
    bounds.maxLat.toFixed(3),
  ].join(',');

export function useGponCoverage(
  bounds: MapBounds | null,
  scaleMeters: number | null,
): CoverageResponse | null {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coverageVisibleAtScale(scaleMeters) || !bounds || scaleMeters === null) {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
      lastKeyRef.current = null;
      setCoverage(null);
      return;
    }

    // A cobertura é sempre desenhada como polígono de bairro (não mais grade de quadrados),
    // em qualquer escala acima de 100 m — a borda respeita o raio de 300 m das CDOs.
    const level: CoverageLevel = 'area';
    const key = requestKey(bounds, level);
    if (key === lastKeyRef.current) return;

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastKeyRef.current = key;
      const token = ++tokenRef.current;
      const pending = inFlight.get(key) ?? fetchCoverage(bounds, level);
      inFlight.set(key, pending);
      pending
        .then((result) => {
          if (tokenRef.current === token) setCoverage(result);
        })
        .catch(() => {
          if (tokenRef.current === token) setCoverage(null);
        })
        .finally(() => {
          inFlight.delete(key);
        });
    }, 250);

    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [bounds, scaleMeters]);

  return coverage;
}
