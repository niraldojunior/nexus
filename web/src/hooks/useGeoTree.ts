// Estado da árvore de navegação do módulo Geo, com carga sob demanda.
//
// A árvore não cabe em memória: são dezenas de milhares de recursos. Aqui só vive
// o que o usuário abriu — a abertura traz UF → Município → Estações → Estação, e
// cada expansão busca no servidor apenas os filhos diretos do nó clicado.
//
// Duas saídas alimentam a tela e mantêm a invariante "o mapa mostra o que a árvore
// mostra": `rows` (as linhas visíveis, já achatadas e indentadas) e `mapNodes`
// (as mesmas linhas que têm geometria).

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
        // UF, Município e a pasta Estações já vieram nesta resposta: abri-los não
        // custa rede e é o que põe as estações no mapa desde a abertura.
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

  const mapNodes = useMemo(() => rows.map((row) => row.node).filter((node) => node.geometry), [rows]);

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
  };
}

