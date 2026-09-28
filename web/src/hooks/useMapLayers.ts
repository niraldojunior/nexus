// Estado React do controle de camadas do mapa. Preferências ficam por ID estável de ENTITY:
// publicações novas preservam escolhas existentes e só aplicam defaultVisible a novos nós.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioGeoCatalog } from '../services/studioGeoApi';
import { useSession } from './useSession';
import {
  defaultMapLayerVisibility,
  groupVisibility,
  mapLayerEntities,
  readStoredLayers,
  setGroupVisibility,
  writeStoredLayers,
  type MapLayerGroupId,
  type MapLayerId,
  type MapLayerVisibility,
} from '../utils/mapLayers';

export type UseMapLayers = {
  layers: MapLayerVisibility;
  toggleLayer: (id: MapLayerId) => void;
  toggleGroup: (groupId: MapLayerGroupId) => void;
  resetLayers: () => void;
  allVisible: boolean;
  groupVisibility: (groupId: MapLayerGroupId) => ReturnType<typeof groupVisibility>;
};

export function useMapLayers(catalog: StudioGeoCatalog): UseMapLayers {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [layers, setLayers] = useState<MapLayerVisibility>(() => readStoredLayers(catalog, userId));
  const catalogKey = catalog.publicationChecksum ?? (catalog.fallback ? 'fallback' : 'unpublished');
  const scopeKey = `${userId ?? 'anonymous'}::${catalog.environmentId}`;
  // Diz a qual usuário+ambiente o objeto `layers` que está na tela pertence. Enquanto o
  // catálogo troca de `pending` para o ambiente publicado, a persistência fica bloqueada até
  // a preferência daquele escopo ter sido lida — nunca gravamos o default provisório por cima
  // da escolha já salva.
  const [hydratedScopeKey, setHydratedScopeKey] = useState(scopeKey);
  const initialMountRef = useRef(true);
  const lastUserIdRef = useRef(userId);
  const lastEnvironmentIdRef = useRef(catalog.environmentId);

  useEffect(() => {
    // Quando o environmentId, o usuário ou o catálogo publicado mudam, reidrata do storage salvo para aquele escopo
    const envChanged = lastEnvironmentIdRef.current !== catalog.environmentId;
    const userChanged = lastUserIdRef.current !== userId;
    lastEnvironmentIdRef.current = catalog.environmentId;
    lastUserIdRef.current = userId;

    setLayers((current) => {
      const stored = readStoredLayers(catalog, userId);
      if (initialMountRef.current || envChanged || userChanged) {
        initialMountRef.current = false;
        return stored;
      }
      const reconciled = { ...stored };
      const activeIds = new Set(mapLayerEntities(catalog).map((node) => node.id));
      for (const id of activeIds) {
        if (typeof current[id] === 'boolean') reconciled[id] = current[id];
      }
      return reconciled;
    });
  }, [catalog, catalogKey, userId]);

  useEffect(() => {
    // Marca a hidratação depois que o novo valor de `layers` foi comprometido. Este efeito vem
    // depois da hidratação acima, portanto a escrita abaixo só libera no render subsequente.
    if (catalog.environmentId !== 'pending') setHydratedScopeKey(scopeKey);
  }, [catalog, scopeKey]);

  useEffect(() => {
    // Não persiste o estado de um escopo anterior (ou do catálogo sentinela) no ambiente atual.
    if (catalog.environmentId === 'pending' || hydratedScopeKey !== scopeKey) return;
    writeStoredLayers(layers, catalog.environmentId, userId);
  }, [layers, catalog.environmentId, hydratedScopeKey, scopeKey, userId]);

  const toggleLayer = useCallback((id: MapLayerId) => {
    setLayers((current) => (id in current ? { ...current, [id]: !current[id] } : current));
  }, []);

  const toggleGroup = useCallback(
    (groupId: MapLayerGroupId) =>
      setLayers((current) => setGroupVisibility(current, groupId, catalog)),
    [catalog],
  );

  const resetLayers = useCallback(() => setLayers(defaultMapLayerVisibility(catalog)), [catalog]);
  const allVisible = Object.values(layers).every(Boolean);

  return {
    layers,
    toggleLayer,
    toggleGroup,
    resetLayers,
    allVisible,
    groupVisibility: (groupId: MapLayerGroupId) => groupVisibility(layers, groupId, catalog),
  };
}
