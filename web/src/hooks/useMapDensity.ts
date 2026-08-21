// Densidade agregada da planta na viewport (Fase 4, issue #69) — a camada que entra quando a
// feature individual sai, acima de PASSIVE_INFRA_MAX_SCALE_METERS.
//
// Segue o mesmo padrão de useGponCoverage, e não o de useMapTiles, porque a leitura é por bbox:
// em zoom aberto a viewport cobre poucas células grossas e pedir uma a uma custaria mais em
// ida-e-volta do que a consulta inteira. Daí também o reuso do truque de folga: o bbox pedido é
// 25% maior que a viewport e arredondado a uma grade por nível, então um pan pequeno dentro da
// área já carregada não reabre requisição.
//
// As duas camadas são mutuamente exclusivas por construção (`densityVisibleAtScale` usa `>`,
// `useMapTiles` usa `<=`, ambos sobre PASSIVE_INFRA_MAX_SCALE_METERS): nunca desenham juntas.

import { useEffect, useRef, useState } from 'react';
import { fetchMapDensity, type MapDensityResponse } from '../services/geoMapDensityApi';
import type { MapBounds } from '../services/geoTreeApi';
import { densityVisibleAtScale, densityZoomForScale, type MapDensityZoom } from '../utils/mapScale';

const inFlight = new Map<string, Promise<MapDensityResponse>>();

const requestKey = (bounds: MapBounds, z: MapDensityZoom): string =>
  [
    z,
    bounds.minLng.toFixed(3),
    bounds.minLat.toFixed(3),
    bounds.maxLng.toFixed(3),
    bounds.maxLat.toFixed(3),
  ].join(',');

// Grade (graus) a que o bbox pedido é arredondado, por zoom — maior nos níveis mais abertos,
// onde um pan cobre muito mais chão. Mesma ideia (e mesmos valores) de REQUEST_GRID_DEG em
// useGponCoverage, já que os degraus de escala são os mesmos.
const REQUEST_GRID_DEG: Record<MapDensityZoom, number> = {
  13: 0.05,
  10: 0.5,
  7: 2,
};

function paddedBounds(bounds: MapBounds, z: MapDensityZoom): MapBounds {
  const grid = REQUEST_GRID_DEG[z];
  const padLng = (bounds.maxLng - bounds.minLng) * 0.25;
  const padLat = (bounds.maxLat - bounds.minLat) * 0.25;
  return {
    minLng: Math.floor((bounds.minLng - padLng) / grid) * grid,
    minLat: Math.floor((bounds.minLat - padLat) / grid) * grid,
    maxLng: Math.ceil((bounds.maxLng + padLng) / grid) * grid,
    maxLat: Math.ceil((bounds.maxLat + padLat) / grid) * grid,
  };
}

function contains(outer: MapBounds, inner: MapBounds): boolean {
  return (
    outer.minLng <= inner.minLng &&
    outer.maxLng >= inner.maxLng &&
    outer.minLat <= inner.minLat &&
    outer.maxLat >= inner.maxLat
  );
}

export function useMapDensity(
  bounds: MapBounds | null,
  scaleMeters: number | null,
): { data: MapDensityResponse | null; loading: boolean } {
  const [density, setDensity] = useState<MapDensityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);
  const lastZoomRef = useRef<MapDensityZoom | null>(null);
  const lastFetchedBoundsRef = useRef<MapBounds | null>(null);

  useEffect(() => {
    if (!densityVisibleAtScale(scaleMeters) || !bounds || scaleMeters === null) {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
      lastKeyRef.current = null;
      lastZoomRef.current = null;
      lastFetchedBoundsRef.current = null;
      setDensity(null);
      setLoading(false);
      return;
    }

    const zoom = densityZoomForScale(scaleMeters);
    if (
      zoom === lastZoomRef.current &&
      lastFetchedBoundsRef.current &&
      contains(lastFetchedBoundsRef.current, bounds)
    ) {
      return;
    }

    const requestBounds = paddedBounds(bounds, zoom);
    const key = requestKey(requestBounds, zoom);
    if (key === lastKeyRef.current) return;

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastKeyRef.current = key;
      const token = ++tokenRef.current;
      setLoading(true);
      const pending = inFlight.get(key) ?? fetchMapDensity(zoom, requestBounds);
      inFlight.set(key, pending);
      pending
        .then((result) => {
          if (tokenRef.current !== token) return;
          setDensity(result);
          lastZoomRef.current = zoom;
          lastFetchedBoundsRef.current = requestBounds;
        })
        .catch(() => {
          if (tokenRef.current === token) setDensity(null);
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

  return { data: density, loading };
}
