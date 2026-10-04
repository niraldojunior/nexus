// Estado da árvore de navegação do módulo Geo, com carga sob demanda.
//
// A árvore não cabe em memória: são dezenas de milhares de recursos. Aqui só vive
// o que o usuário abriu — a abertura traz UF → Município → Estações → Estação, e
// cada expansão busca no servidor apenas os filhos diretos do nó clicado.
//
// A saída que alimenta a tela é `rows` (as linhas visíveis, já achatadas e indentadas). A árvore é
// somente navegação: nenhum Site, Recurso ou cabo do mapa vem daqui — GeoPage os busca pela região
// visível (Sites: useMapSites; Recursos: useMapTiles), independente do que está aberto na árvore.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTreeChildren,
  fetchTreePath,
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
  loading: boolean;
  // Qualquer carga da árvore em voo: raízes (`loading`) ou expansão de algum nó. Alimenta
  // o indicador de carga do mapa (ver MapLoadingBar em GeoPage) — a doca já mostra o seu
  // próprio spinner por linha.
  busy: boolean;
  error: string | null;
  isExpanded: (rowKey: string) => boolean;
  toggle: (row: GeoTreeRow) => void;
  loadMore: (row: GeoTreeRow) => void;
  reload: () => void;
  nodeById: (nodeId: string) => GeoTreeNode | undefined;
  // Revela um nó: carrega e expande toda a cadeia de ancestrais até a raiz (nunca
  // recolhe) — usado ao selecionar um item pelo mapa ou pela busca, já que nada nasce
  // aberto por padrão. `expandSelf` abre também o próprio nó, quando ele tem filhos.
  revealNode: (nodeId: string, options?: { expandSelf?: boolean }) => void;
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

  // Dedupe de `tree/path` por nó — mesma razão acima; `revealNode` é o único chamador, mas
  // um clique duplo rápido no mesmo nó pediria o mesmo caminho duas vezes em voo.
  const pathInFlight = useRef(new Map<string, Promise<string[] | null>>());

  // Cancela a cadeia sequencial de `revealNode` quando um novo clique chega no meio do
  // caminho: sem isto, a cadeia do clique anterior seguia emitindo `tree/children` depois do
  // novo clique, e as novas requisições entravam na fila atrás dela (o backend atende em
  // série — AGENTS.md §3).
  const revealTokenRef = useRef(0);
  const revealControllerRef = useRef<AbortController | null>(null);

  // `revealNode` percorre a cadeia de forma assíncrona e precisa enxergar o que já foi
  // carregado *durante* o próprio percurso — o `state` fechado no callback nasceria
  // velho no primeiro await.
  const stateRef = useRef(state);
  stateRef.current = state;

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
          const previous = offset === 0 ? [] : (current.childIds[nodeId] ?? []);
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
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Falha ao carregar a hierarquia.');
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

  /**
   * Revela um nó na árvore: expande toda a cadeia de ancestrais e carrega, de cima
   * para baixo, os níveis que ainda não vieram — para o nó existir como linha.
   *
   * O caminho vem do servidor (`/v1/geo/tree/path`), não do estado local. Estação dá
   * para resolver aqui, porque `roots()` já traz UF/Município/grupo de todas elas; um
   * Recurso, não: selecionado pelo mapa ou pela busca, ele chega sem nenhum ancestral
   * carregado, e a cadeia (estação → caixa → … → ele) só o banco conhece. A cadeia local
   * fica como fallback para o caso de a chamada falhar.
   */
  const revealNode = useCallback(
    (nodeId: string, options: { expandSelf?: boolean } = {}) => {
      // Um novo reveal sempre supera o anterior — aborta o `tree/path` em voo (se ainda não
      // resolveu) e marca o token, para a cadeia sequencial abaixo parar de emitir
      // `tree/children` assim que notar que não é mais a corrente mais recente.
      revealControllerRef.current?.abort();
      const controller = new AbortController();
      revealControllerRef.current = controller;
      const token = ++revealTokenRef.current;
      const isCurrent = () => revealTokenRef.current === token;

      void (async () => {
        const running = pathInFlight.current.get(nodeId);
        const pathRequest =
          running ??
          fetchTreePath(nodeId, { signal: controller.signal }).finally(() => {
            pathInFlight.current.delete(nodeId);
          });
        pathInFlight.current.set(nodeId, pathRequest);
        let chain = await pathRequest.catch(() => null);
        if (!isCurrent()) return;

        if (!chain?.length) {
          // Fallback: sobe pelo que já está carregado (childIds invertido).
          const parents: Record<string, string> = {};
          for (const [parentId, childIds] of Object.entries(stateRef.current.childIds)) {
            for (const childId of childIds) parents[childId] = parentId;
          }
          const local = [nodeId];
          let current = nodeId;
          while (parents[current]) {
            current = parents[current];
            local.unshift(current);
          }
          chain = local;
        }

        // Sequencial de propósito: o filho seguinte só aparece no estado depois que o
        // pai foi buscado, então não dá para disparar os níveis em paralelo. `isCurrent()`
        // interrompe a cadeia assim que um reveal mais novo chega — sem isto, um clique
        // rápido em dois nós deixava a cadeia do primeiro clique correndo atrás do segundo.
        for (let index = 0; index < chain.length - 1; index += 1) {
          if (!isCurrent()) return;
          const parentId = chain[index]!;
          if (!stateRef.current.childIds[parentId]) await loadChildren(parentId, 0);
        }
        if (!isCurrent()) return;
        if (options.expandSelf && !stateRef.current.childIds[nodeId]) {
          await loadChildren(nodeId, 0);
        }
        if (!isCurrent()) return;

        setExpandedRows((prev) => {
          const next = new Set(prev);
          let rowKey = '';
          for (const id of chain) {
            rowKey = `${rowKey}/${id}`;
            // O próprio nó só abre se tiver filhos; folha fica apenas revelada.
            if (id === nodeId && !options.expandSelf) break;
            next.add(rowKey);
          }
          return next;
        });
      })();
    },
    [loadChildren],
  );

  const isExpanded = useCallback((rowKey: string) => expandedRows.has(rowKey), [expandedRows]);

  const reload = useCallback(() => {
    setState(EMPTY_STATE);
    setExpandedRows(new Set());
    setReloadToken((token) => token + 1);
  }, []);

  const nodeById = useCallback((nodeId: string) => state.nodesById[nodeId], [state.nodesById]);

  const busy = loading || loadingNodes.size > 0;

  // Memoizado: sem isto, o objeto de retorno muda de identidade a todo render (mesmo sem
  // nada relevante ter mudado), o que torna instável qualquer `useCallback` do chamador que
  // dependa de `tree` inteiro (ver GeoPage.selectNode) e pode reexecutar efeitos que
  // dependem dessas funções em loop.
  return useMemo(
    () => ({
      rows,
      loading,
      busy,
      error,
      isExpanded,
      toggle,
      loadMore,
      reload,
      nodeById,
      revealNode,
    }),
    [
      rows,
      loading,
      busy,
      error,
      isExpanded,
      toggle,
      loadMore,
      reload,
      nodeById,
      revealNode,
    ],
  );
}
