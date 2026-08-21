// Infra passiva (recursos + Sites não-CO + cabos) da região visível do mapa, buscada por TILE
// — não por bbox — com cache LRU no cliente (Fase 2-frontend/3 da reengenharia de performance
// do mapa, issue #69). Substitui useViewportInfra no caminho quente do mapa: aquele hook só
// deduplicava o que estava *em voo* por bbox arredondado (nunca repete num pan contínuo); este
// cacheia o RESULTADO por tile (z:x:y fixo em MAP_TILE_ZOOM), então panning dentro do mesmo
// conjunto de tiles fica com ZERO ida ao servidor. Some acima de
// PASSIVE_INFRA_MAX_SCALE_METERS (100 m), mesma régua de sempre.
//
// O endpoint de tile (GET /v1/geo/map/tile) não tem `include` — é leitura pura por PK, sem
// filtro. O que o controle de camadas do mapa (RF-011) liga/desliga (Sites, Caixas, Cabos)
// vira um filtro NO CLIENTE, aqui, sobre o resultado já montado — barato, o teto por tile é
// de centenas de features.

import { useEffect, useRef, useState } from 'react';
import { fetchMapTile, type MapTileFeature } from '../services/geoMapTileApi';
import { tilesForBounds, tileKey, MAP_TILE_ZOOM } from '../utils/mapTile';
import { PASSIVE_INFRA_MAX_SCALE_METERS } from '../utils/mapScale';
import { isMapFeatureVisible, type MapLayerVisibility, type ViewportShape } from '../utils/mapLayers';
import { MAP_TILES_INVALIDATED_EVENT } from '../utils/mapTileCache';
import type { MapBounds } from '../services/geoTreeApi';

// Cap do cache local: generoso o bastante para um pan longo numa área densa sem crescer sem
// limite. LRU real (recência bump no hit via reinserção — Map preserva ordem de inserção), não
// só dedupe do que está em voo.
const TILE_CACHE_LIMIT = 400;

const tileCache = new Map<string, MapTileFeature[]>();
const inFlightTiles = new Map<string, Promise<MapTileFeature[]>>();

function isIncluded(feature: MapTileFeature, include: ViewportShape[] | undefined): boolean {
  if (include === undefined) return true;
  if (feature.kind === 'site') return include.includes('sites');
  if (feature.shape === 'point') return include.includes('resource-points');
  return include.includes('resource-lines');
}

function cacheGet(key: string): MapTileFeature[] | undefined {
  const value = tileCache.get(key);
  if (value === undefined) return undefined;
  tileCache.delete(key);
  tileCache.set(key, value);
  return value;
}

function cacheSet(key: string, value: MapTileFeature[]): void {
  tileCache.delete(key);
  tileCache.set(key, value);
  if (tileCache.size > TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
}

export function useMapTiles(
  bounds: MapBounds | null,
  scaleMeters: number | null,
  include: ViewportShape[] | undefined,
  visibility?: MapLayerVisibility,
): { data: MapTileFeature[]; loading: boolean } {
  const [data, setData] = useState<MapTileFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [cacheRevision, setCacheRevision] = useState(0);
  const debounceRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const invalidate = () => {
      tileCache.clear();
      lastKeyRef.current = null;
      setCacheRevision((current) => current + 1);
    };
    window.addEventListener(MAP_TILES_INVALIDATED_EVENT, invalidate);
    return () => window.removeEventListener(MAP_TILES_INVALIDATED_EVENT, invalidate);
  }, []);

  useEffect(() => {
    const outOfScale =
      scaleMeters === null || scaleMeters > PASSIVE_INFRA_MAX_SCALE_METERS || !bounds;
    // `include` array vazio = todas as camadas de infra desligadas: nada a buscar.
    const nothingRequested = Array.isArray(include) && include.length === 0;
    if (outOfScale || nothingRequested) {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
      lastKeyRef.current = null;
      setData([]);
      setLoading(false);
      return;
    }

    const tiles = tilesForBounds(bounds, MAP_TILE_ZOOM);
    // A visibilidade tambÃ©m Ã© parte da chave do resultado, mas nÃ£o da chave do
    // tile: trocar um switch reaplica o filtro ao cache local, sem novo fetch.
    const visibilityKey = visibility
      ? Object.entries(visibility)
          .map(([layer, visible]) => `${layer}:${visible ? '1' : '0'}`)
          .join(',')
      : include?.join(',') ?? 'all';
    const key = `${tiles.map(tileKey).join(',')}|${visibilityKey}`;
    if (key === lastKeyRef.current) return;

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastKeyRef.current = key;
      const token = ++tokenRef.current;
      setLoading(true);

      const perTile = tiles.map((tile) => {
        const tk = tileKey(tile);
        const cached = cacheGet(tk);
        if (cached !== undefined) return Promise.resolve(cached);
        const pending =
          inFlightTiles.get(tk) ??
          fetchMapTile(tile)
            .then((features) => {
              cacheSet(tk, features);
              return features;
            })
            .finally(() => inFlightTiles.delete(tk));
        inFlightTiles.set(tk, pending);
        return pending;
      });

      Promise.all(perTile)
        .then((results) => {
          if (tokenRef.current !== token) return;
          const merged = results
            .flat()
            .filter(
              (feature) =>
                isIncluded(feature, include) &&
                (visibility ? isMapFeatureVisible(feature, visibility) : true),
            );
          setData(merged);
        })
        .catch(() => {
          if (tokenRef.current === token) setData([]);
        })
        .finally(() => {
          if (tokenRef.current === token) setLoading(false);
        });
    }, 250);

    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [bounds, scaleMeters, include, visibility, cacheRevision]);

  return { data, loading };
}
