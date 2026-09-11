// Estado React do controle de camadas do mapa. Preferências ficam por ID estável de ENTITY:
// publicações novas preservam escolhas existentes e só aplicam defaultVisible a novos nós.

import { useCallback, useEffect, useState } from 'react';
import type { StudioGeoCatalog } from '../services/studioGeoApi';
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
  const [layers, setLayers] = useState<MapLayerVisibility>(() => readStoredLayers(catalog));
  const catalogKey = catalog.publicationChecksum ?? (catalog.fallback ? 'fallback' : 'unpublished');

  useEffect(() => {
    setLayers((current) => {
      const reconciled = readStoredLayers(catalog);
      const activeIds = new Set(mapLayerEntities(catalog).map((node) => node.id));
      for (const id of activeIds) {
        if (typeof current[id] === 'boolean') reconciled[id] = current[id];
      }
      return reconciled;
    });
  }, [catalog, catalogKey]);

  useEffect(() => {
    writeStoredLayers(layers);
  }, [layers]);

  const toggleLayer = useCallback((id: MapLayerId) => {
    setLayers((current) => (id in current ? { ...current, [id]: !current[id] } : current));
  }, []);

  const toggleGroup = useCallback(
    (groupId: MapLayerGroupId) => setLayers((current) => setGroupVisibility(current, groupId, catalog)),
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
