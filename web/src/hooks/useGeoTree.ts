// Estado da árvore de navegação do módulo Geo, com carga sob demanda.
//
// A árvore não cabe em memória: são dezenas de milhares de recursos. Aqui só vive
// o que o usuário abriu — a abertura traz UF → Município → Estações → Estação, e
// cada expansão busca no servidor apenas os filhos diretos do nó clicado.
//
// Duas saídas alimentam a tela: `rows` (as linhas visíveis, já achatadas e
// indentadas) e `mapNodes` (as Estações/CO, único tipo de Site com visibilidade em
// qualquer escala — ver siteKindFromSpec e mapScale.ts). Qualquer outro tipo de Site
// (POP, CDO, Ponto de Instalação…), Recursos e cabos (infra passiva) não vêm mais
// daqui — GeoPage os busca pela região visível do mapa em escala de detalhe (ver
// fetchViewportResources em geoTreeApi.ts), independente do que está aberto na árvore.

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
import { siteKindFromSpec } from '../utils/placeLabel';

export type { GeoTreeRow };

const EMPTY_STATE: GeoTreeState = { nodesById: {}, childIds: {}, totals: {}, rootIds: [] };

export type GeoTree = {
  rows: GeoTreeRow[];
  mapNodes: GeoTreeNode[];
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

  // Só CO/Estação é visível no mapa em qualquer escala — é o único tipo de Site com essa
  // regra; qualquer outro tipo (POP, CDO, Ponto de Instalação…) segue a régua de escala de
  // um Recurso e só entra pelo viewport do mapa (ver GeoPage.viewportInfra e
  // GeoTreeService.sitesInViewport). Todo CO já vem na resposta de raízes, independente do
  // que está aberto na árvore.
  const mapNodes = useMemo(
    () =>
      Object.values(state.nodesById).filter(
        (node) =>
          node.kind === 'site' &&
          node.geometry &&
          siteKindFromSpec({ category: node.siteCategory, name: node.sublabel }) === 'CO',
      ),
    [state.nodesById],
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
      void (async () => {
        let chain = await fetchTreePath(nodeId).catch(() => null);

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
        // pai foi buscado, então não dá para disparar os níveis em paralelo.
        for (let index = 0; index < chain.length - 1; index += 1) {
          const parentId = chain[index]!;
          if (!stateRef.current.childIds[parentId]) await loadChildren(parentId, 0);
        }
        if (options.expandSelf && !stateRef.current.childIds[nodeId]) {
          await loadChildren(nodeId, 0);
        }

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

  const isExpanded = useCallback(
    (rowKey: string) => expandedRows.has(rowKey),
    [expandedRows],
  );

  const reload = useCallback(() => {
    setState(EMPTY_STATE);
    setExpandedRows(new Set());
    setReloadToken((token) => token + 1);
  }, []);

  const nodeById = useCallback(
    (nodeId: string) => state.nodesById[nodeId],
    [state.nodesById],
  );

  const busy = loading || loadingNodes.size > 0;

  // Memoizado: sem isto, o objeto de retorno muda de identidade a todo render (mesmo sem
  // nada relevante ter mudado), o que torna instável qualquer `useCallback` do chamador que
  // dependa de `tree` inteiro (ver GeoPage.selectNode) e pode reexecutar efeitos que
  // dependem dessas funções em loop.
  return useMemo(
    () => ({
      rows,
      mapNodes,
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
    [rows, mapNodes, loading, busy, error, isExpanded, toggle, loadMore, reload, nodeById, revealNode],
  );
}
