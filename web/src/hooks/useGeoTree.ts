// Estado da árvore de navegação do módulo Geo, com carga sob demanda.
//
// A árvore não cabe em memória: são dezenas de milhares de recursos. Aqui só vive
// o que o usuário abriu — a abertura traz UF → Município → Estações → Estação, e
// cada expansão busca no servidor apenas os filhos diretos do nó clicado.
//
// Duas saídas alimentam a tela: `rows` (as linhas visíveis, já achatadas e
// indentadas) e `mapNodes` (o que vai para o mapa). Estações sempre aparecem no
// mapa, mesmo com o ramo fechado na árvore; recursos e cabos seguem a expansão.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTreeChildren,
  fetchTreeRoots,
  TREE_PAGE_SIZE,
  type GeoTreeNode,
} from '../services/geoTreeApi';
import {
  collapseBranch,
  defaultExpandedRows,
  flattenTreeRows,
  type GeoTreeRow,
  type GeoTreeState,
} from '../utils/geoHierarchy';

export type { GeoTreeRow };

const EMPTY_STATE: GeoTreeState = { nodesById: {}, childIds: {}, totals: {}, rootIds: [] };

export type GeoTree = {
  rows: GeoTreeRow[];
  mapNodes: GeoTreeNode[];
  loading: boolean;
  error: string | null;
  isExpanded: (rowKey: string) => boolean;
  toggle: (row: GeoTreeRow) => void;
  loadMore: (row: GeoTreeRow) => void;
  reload: () => void;
  // Para a visão em combos, que navega por nó e não por linha.
  childrenOf: (nodeId: string) => GeoTreeNode[];
  ensureChildren: (nodeId: string) => void;
  nodeById: (nodeId: string) => GeoTreeNode | undefined;
  // Expande um nó e toda a cadeia de ancestrais até a raiz (nunca recolhe) — usado
  // ao selecionar uma estação, já que nada nasce aberto por padrão.
  expandNode: (nodeId: string) => void;
};

export function useGeoTree(): GeoTree {
  const [state, setState] = useState<GeoTreeState>(EMPTY_STATE);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Dedupe de requisição em voo. O backend atende em série e o StrictMode monta o
  // efeito duas vezes: sem isto, a mesma expansão custaria o dobro do tempo.
  const inFlight = useRef(new Map<string, Promise<void>>());

  const loadChildren = useCallback(async (nodeId: string, offset: number): Promise<void> => {
    const key = `${nodeId}@${offset}`;
    const running = inFlight.current.get(key);
    if (running) return running;

    const request = (async () => {
      setLoadingNodes((current) => new Set(current).add(nodeId));
      try {
        const page = await fetchTreeChildren(nodeId, { offset, limit: TREE_PAGE_SIZE });
        setState((current) => {
          const nodesById = { ...current.nodesById };
          for (const node of page.nodes) nodesById[node.id] = node;
          const previous = offset === 0 ? [] : current.childIds[nodeId] ?? [];
          const merged = [...previous];
          for (const node of page.nodes) if (!merged.includes(node.id)) merged.push(node.id);
          return {
            ...current,
            nodesById,
            childIds: { ...current.childIds, [nodeId]: merged },
            totals: { ...current.totals, [nodeId]: page.total },
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar a hierarquia.');
      } finally {
        setLoadingNodes((current) => {
          const next = new Set(current);
          next.delete(nodeId);
          return next;
        });
        inFlight.current.delete(key);
      }
    })();

    inFlight.current.set(key, request);
    return request;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchTreeRoots()
      .then((nodes) => {
        if (cancelled) return;
        const nodesById: Record<string, GeoTreeNode> = {};
        const childIds: Record<string, string[]> = {};
        const rootIds: string[] = [];
        for (const node of nodes) {
          const { parentId, ...rest } = node;
          nodesById[node.id] = rest;
          if (parentId) childIds[parentId] = [...(childIds[parentId] ?? []), node.id];
          else rootIds.push(node.id);
        }
        const totals: Record<string, number> = {};
        for (const [parentId, ids] of Object.entries(childIds)) totals[parentId] = ids.length;

        setState({ nodesById, childIds, totals, rootIds });
        setExpandedRows(defaultExpandedRows({ rootIds, childIds, nodesById }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar a hierarquia.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const rows = useMemo(
    () => flattenTreeRows(state, expandedRows, loadingNodes),
    [state, expandedRows, loadingNodes],
  );

  const mapNodes = useMemo(() => {
    const byId = new Map<string, GeoTreeNode>();
    // Estações sempre no mapa: todas já vieram na resposta de raízes, independente
    // do que está aberto na árvore.
    for (const node of Object.values(state.nodesById)) {
      if (node.kind === 'site' && node.geometry) byId.set(node.id, node);
    }
    // Recursos e cabos seguem a árvore: só aparecem quando o ramo está aberto.
    for (const row of rows) {
      if (row.node.geometry) byId.set(row.node.id, row.node);
    }
    return [...byId.values()];
  }, [state.nodesById, rows]);

  const toggle = useCallback(
    (row: GeoTreeRow) => {
      const opening = !expandedRows.has(row.rowKey);
      setExpandedRows((current) => {
        if (!opening) return collapseBranch(current, row.rowKey);
        return new Set(current).add(row.rowKey);
      });
      if (opening && !state.childIds[row.node.id]) void loadChildren(row.node.id, 0);
    },
    [expandedRows, loadChildren, state.childIds],
  );

  const loadMore = useCallback(
    (row: GeoTreeRow) => {
      void loadChildren(row.node.id, (state.childIds[row.node.id] ?? []).length);
    },
    [loadChildren, state.childIds],
  );

  const ensureChildren = useCallback(
    (nodeId: string) => {
      if (!state.childIds[nodeId]) void loadChildren(nodeId, 0);
    },
    [loadChildren, state.childIds],
  );

  const childrenOf = useCallback(
    (nodeId: string) => (state.childIds[nodeId] ?? []).map((id) => state.nodesById[id]).filter(Boolean),
    [state],
  );

  // Filho → pai, invertendo childIds — usado para subir a cadeia de ancestrais
  // ao expandir um nó selecionado direto (árvore ou mapa).
  const parentOf = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [parentId, childIds] of Object.entries(state.childIds)) {
      for (const childId of childIds) map[childId] = parentId;
    }
    return map;
  }, [state.childIds]);

  const expandNode = useCallback(
    (nodeId: string) => {
      const chain: string[] = [nodeId];
      let current = nodeId;
      while (parentOf[current]) {
        current = parentOf[current];
        chain.unshift(current);
      }
      setExpandedRows((prev) => {
        const next = new Set(prev);
        let rowKey = '';
        for (const id of chain) {
          rowKey = `${rowKey}/${id}`;
          next.add(rowKey);
        }
        return next;
      });
      if (!state.childIds[nodeId]) void loadChildren(nodeId, 0);
    },
    [parentOf, state.childIds, loadChildren],
  );

  return {
    rows,
    mapNodes,
    loading,
    error,
    isExpanded: (rowKey: string) => expandedRows.has(rowKey),
    toggle,
    loadMore,
    reload: () => {
      setState(EMPTY_STATE);
      setExpandedRows(new Set());
      setReloadToken((token) => token + 1);
    },
    childrenOf,
    ensureChildren,
    nodeById: (nodeId: string) => state.nodesById[nodeId],
    expandNode,
  };
}

