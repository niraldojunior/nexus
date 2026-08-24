// Cobertura GPON da viewport, buscada por bbox + nível de escala (ver GeoCoverageService).
//
// Segue o padrão dos demais hooks de mapa (useGeoTree/useAddressViability): debounce de 250 ms,
// dedupe da requisição em voo por chave (o backend de dev atende em série e o StrictMode monta
// duas vezes) e um token para descartar respostas fora de ordem. Só busca acima de 100 m — em
// escala de detalhe a mancha não aparece e a planta individual toma conta.
//
// O nível (bairro/município/estado) segue a escala — coverageLevelForScale — em vez de sempre
// pedir polígono de bairro: pedir os ~12 mil polígonos de bairro numa visão de país inteiro é o
// que levava a cobertura nacional a ~10 s (REQ-MOD01-014). O bbox pedido ao servidor tem folga
// (~25 %) e é arredondado a uma grade por nível (paddedBounds), então um pan pequeno dentro da
// área já carregada não reabre fetch — só quando a viewport sai da área com folga ou o nível
// muda (ver `contains`).

import { useEffect, useRef, useState } from 'react';
import { fetchCoverage, type CoverageResponse } from '../services/geoCoverageApi';
import type { MapBounds } from '../services/geoTreeApi';
import { coverageLevelForScale, coverageVisibleAtScale, type CoverageLevel } from '../utils/mapScale';

const inFlight = new Map<string, Promise<CoverageResponse>>();

const requestKey = (bounds: MapBounds, level: CoverageLevel): string =>
  [
    level,
    bounds.minLng.toFixed(3),
    bounds.minLat.toFixed(3),
    bounds.maxLng.toFixed(3),
    bounds.maxLat.toFixed(3),
  ].join(',');

// Grade (graus) a que o bbox pedido é arredondado, por nível — maior nos níveis mais abertos,
// onde um pan cobre muito mais chão. Não precisa ser exata: só estabiliza a chave entre pans
// vizinhos para o hook reconhecer "ainda estou na mesma área" sem refazer o fetch.
const REQUEST_GRID_DEG: Record<CoverageLevel, number> = {
  neighborhood: 0.05,
  city: 0.5,
  uf: 2,
};

// Expande o bbox real por 25% de folga e arredonda para fora na grade do nível — o bbox
// efetivamente pedido ao servidor, maior que a viewport visível de propósito.
function paddedBounds(bounds: MapBounds, level: CoverageLevel): MapBounds {
  const grid = REQUEST_GRID_DEG[level];
  const padLng = (bounds.maxLng - bounds.minLng) * 0.25;
  const padLat = (bounds.maxLat - bounds.minLat) * 0.25;
  return {
    minLng: Math.floor((bounds.minLng - padLng) / grid) * grid,
    minLat: Math.floor((bounds.minLat - padLat) / grid) * grid,
    maxLng: Math.ceil((bounds.maxLng + padLng) / grid) * grid,
    maxLat: Math.ceil((bounds.maxLat + padLat) / grid) * grid,
  };
}

// `outer` (a área já carregada, com folga) contém `inner` (a viewport atual)?
function contains(outer: MapBounds, inner: MapBounds): boolean {
  return (
    outer.minLng <= inner.minLng &&
    outer.maxLng >= inner.maxLng &&
    outer.minLat <= inner.minLat &&
    outer.maxLat >= inner.maxLat
  );
}

export function useGponCoverage(
  bounds: MapBounds | null,
  scaleMeters: number | null,
): { data: CoverageResponse | null; loading: boolean } {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  // Só é `true` quando uma requisição de fato está em voo — vira a barra de carga do mapa
  // (ver MapLoadingBar). Marcado dentro do debounce, não no início do efeito: durante o
  // arraste o debounce reinicia a cada frame e a barra piscaria sem haver requisição.
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);
  // Nível e bbox (com folga) da última busca concluída — usados para decidir se a nova
  // viewport já está coberta, sem precisar refazer o fetch a cada `idle` do arrasto.
  const lastLevelRef = useRef<CoverageLevel | null>(null);
  const lastFetchedBoundsRef = useRef<MapBounds | null>(null);

  useEffect(() => {
    if (!coverageVisibleAtScale(scaleMeters) || !bounds || scaleMeters === null) {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
      lastKeyRef.current = null;
      lastLevelRef.current = null;
      lastFetchedBoundsRef.current = null;
      setCoverage(null);
      setLoading(false);
      return;
    }

    const level = coverageLevelForScale(scaleMeters);
    if (
      level === lastLevelRef.current &&
      lastFetchedBoundsRef.current &&
      contains(lastFetchedBoundsRef.current, bounds)
    ) {
      return;
    }

    const requestBounds = paddedBounds(bounds, level);
    const key = requestKey(requestBounds, level);
    if (key === lastKeyRef.current) return;

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastKeyRef.current = key;
      const token = ++tokenRef.current;
      setLoading(true);
      const pending = inFlight.get(key) ?? fetchCoverage(requestBounds, level);
      inFlight.set(key, pending);
      pending
        .then((result) => {
          if (tokenRef.current !== token) return;
          setCoverage(result);
          lastLevelRef.current = level;
          lastFetchedBoundsRef.current = requestBounds;
        })
        .catch(() => {
          if (tokenRef.current === token) setCoverage(null);
        })
        .finally(() => {
          inFlight.delete(key);
          if (tokenRef.current === token) setLoading(false);
        });
    }, 250);

    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [bounds, scaleMeters]);

  return { data: coverage, loading };
}
