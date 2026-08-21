// Estado React do controle de camadas do mapa (RF-011, REQ-MOD01-011) — grava a preferência do
// usuário em localStorage (ver mapLayers.ts) para sobreviver a um F5: quem desligou Recursos
// para ganhar performance não quer a camada de volta a cada recarga.

import { useCallback, useEffect, useState } from 'react';
import {
  ALL_MAP_LAYERS_VISIBLE,
  groupVisibility,
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
  // Verdadeiro só quando todas as camadas estão ligadas — alimenta o indicador de "mapa
  // filtrado" no botão fechado do controle.
  allVisible: boolean;
  groupVisibility: (groupId: MapLayerGroupId) => ReturnType<typeof groupVisibility>;
};

export function useMapLayers(): UseMapLayers {
  const [layers, setLayers] = useState<MapLayerVisibility>(readStoredLayers);

  useEffect(() => {
    writeStoredLayers(layers);
  }, [layers]);

  const toggleLayer = useCallback((id: MapLayerId) => {
    setLayers((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const toggleGroup = useCallback((groupId: MapLayerGroupId) => {
    setLayers((current) => setGroupVisibility(current, groupId));
  }, []);

  const resetLayers = useCallback(() => setLayers(ALL_MAP_LAYERS_VISIBLE), []);

  const allVisible = Object.values(layers).every(Boolean);

  return {
    layers,
    toggleLayer,
    toggleGroup,
    resetLayers,
    allVisible,
    groupVisibility: (groupId: MapLayerGroupId) => groupVisibility(layers, groupId),
  };
}
