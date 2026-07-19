import { useEffect, useMemo, useState } from 'react';
import { loadResourceWorkspaceSnapshot } from '../services/resourceApi';
import type { PhysicalResource, LogicalResource } from '../services/resourceApi';
import { isCableResource } from '../utils/geoHierarchy';

export type ResourceInventory = {
  physical: PhysicalResource[];
  logical: LogicalResource[];
  // Todos os recursos com place, para a hierarquia de Locais.
  all: Array<PhysicalResource | LogicalResource>;
  // Recursos posicionáveis no mapa (têm place).
  located: Array<PhysicalResource | LogicalResource>;
  loading: boolean;
  error: string | null;
};

/**
 * Hook que carrega o inventário de recursos (equipamentos + cabos).
 *
 * O endpoint /v1/resource/workspace sempre devolve as listas completas de
 * `physicalResources` e `logicalResources`, independentemente da aba pedida —
 * então uma única chamada basta.
 */
export function useResourceInventory(): ResourceInventory {
  const [physical, setPhysical] = useState<PhysicalResource[]>([]);
  const [logical, setLogical] = useState<LogicalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snapshot = await loadResourceWorkspaceSnapshot({ tab: 'PhysicalResource', limit: 1, offset: 0 });
        if (cancelled) return;
        setPhysical(snapshot.physicalResources ?? []);
        setLogical(snapshot.logicalResources ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar recursos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoizados: sem isto, `all`/`located` teriam referência nova a cada render,
  // invalidando o useMemo de `hierarchyRoots` no GeoPage e reconstruindo a árvore
  // de 6 níveis a cada pan/seleção/tecla.
  const all = useMemo(() => [...physical, ...logical], [physical, logical]);
  const located = useMemo(() => all.filter((resource) => resource.place?.id), [all]);

  return { physical, logical, all, located, loading, error };
}

/**
 * Mantido por compatibilidade: expõe apenas os equipamentos posicionáveis no
 * mapa (PhysicalResource com place), como o hook original.
 */
export function useEquipmentInventory(): { equipment: PhysicalResource[]; loading: boolean; error: string | null } {
  const { physical, loading, error } = useResourceInventory();
  const equipment = physical.filter((resource) => resource.place?.id).slice(0, 500);
  return { equipment, loading, error };
}

/**
 * Identificar tipo de equipamento a partir de resourceType, resourceSpecificationId ou name.
 */
export function identifyEquipmentType(resource: { name?: string; resourceType?: string; resourceSpecificationId?: string }): string {
  const type = resource.resourceType?.toLowerCase() || '';
  const name = resource.name?.toLowerCase() || '';
  const specId = resource.resourceSpecificationId?.toLowerCase() || '';
  const haystack = `${type} ${name} ${specId}`;

  if (haystack.includes('splitter')) return 'Splitter';
  if (haystack.includes('pole') || haystack.includes('poste')) return 'Pole';
  if (haystack.includes('olt')) return 'OLT';
  if (haystack.includes('ont')) return 'ONT';
  if (haystack.includes('cto')) return 'CTO';
  if (haystack.includes('cpe')) return 'CPE';

  return 'Unknown';
}

// Reexporta o classificador de cabo para consumidores do inventário.
export { isCableResource };

/**
 * Obter cor de equipamento por tipo.
 */
export const equipmentTypeColor: Record<string, string> = {
  Splitter: '#004E89',  // Azul escuro
  Pole: '#8B7500',      // Marrom
  OLT: '#FF6B35',       // Laranja
  ONT: '#1A9E7D',       // Verde
  CTO: '#1A9E7D',       // Verde
  CPE: '#9B59B6',       // Roxo
  Unknown: '#6B7280',   // Cinza
};

/**
 * Obter label curto de equipamento por tipo.
 */
export const equipmentTypeLabel: Record<string, string> = {
  Splitter: 'SPL',
  Pole: 'POL',
  OLT: 'OLT',
  ONT: 'ONT',
  CTO: 'CTO',
  CPE: 'CPE',
  Unknown: '?',
};
