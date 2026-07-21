import { useEffect, useMemo, useState } from 'react';
import { loadResourceWorkspaceSnapshot } from '../services/resourceApi';
import type { PhysicalResource, LogicalResource, ResourceWorkspaceSnapshot } from '../services/resourceApi';
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

// Requisição em voo compartilhada.
//
// O workspace de recursos é uma leitura cara (varre todo o inventário) e o
// backend atende requisições em série: duas chamadas idênticas concorrentes
// custam o dobro do tempo, não o mesmo. Como o StrictMode monta o efeito duas
// vezes em dev, sem isto a primeira resposta chegava já descartada por
// `cancelled` e a árvore só aparecia quando a segunda terminasse — o dobro da
// espera. Compartilhar a promessa faz as duas montagens usarem a mesma ida à
// rede, e a montagem que sobrevive recebe o resultado.
let inFlightInventory: Promise<ResourceWorkspaceSnapshot> | null = null;

function loadInventoryOnce(): Promise<ResourceWorkspaceSnapshot> {
  if (!inFlightInventory) {
    inFlightInventory = loadResourceWorkspaceSnapshot({ tab: 'PhysicalResource', limit: 1, offset: 0 }).finally(() => {
      // Solta a referência para que um remount posterior releia o inventário —
      // isto é dedupe de concorrência, não cache de dados.
      inFlightInventory = null;
    });
  }
  return inFlightInventory;
}

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
        const snapshot = await loadInventoryOnce();
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

// Reexporta o classificador de cabo para consumidores do inventário.
// A classificação por tipo de recurso (ícone, cor, rótulo) vive em
// `utils/resourceIcon.ts`, que é a fonte única usada pela árvore e pelo mapa.
export { isCableResource };
