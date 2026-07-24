// Regras puras da árvore de navegação de Locais.
//
// A montagem da hierarquia deixou de ser feita aqui: o acervo tem dezenas de
// milhares de recursos, e a árvore agora é servida um nível por vez por
// `/v1/geo/tree/*` (ver `services/geoTreeApi.ts` e `hooks/useGeoTree.ts`). O que
// sobra neste arquivo é o que continua sendo decisão do cliente e se testa sem
// React: como achatar o que está carregado em linhas visíveis, e o que abrir por
// padrão.

import type { GeoTreeNode } from '../services/geoTreeApi';

// Recorte do estado da árvore que interessa ao achatamento.
export type GeoTreeState = {
  nodesById: Record<string, GeoTreeNode>;
  childIds: Record<string, string[]>;
  totals: Record<string, number>;
  rootIds: string[];
};

export type GeoTreeRow = {
  // Chave por caminho, não por nó: o mesmo recurso pode aparecer sob dois pais
  // (um cabo conectado dos dois lados), e cada aparição expande separadamente.
  rowKey: string;
  node: GeoTreeNode;
  depth: number;
  expanded: boolean;
  loading: boolean;
  // Total de filhos diretos conhecido do servidor — só existe depois que o nó é
  // aberto ao menos uma vez (vem de `GeoTreeChildrenPage.total`).
  total?: number;
  // Filhos que ainda não vieram — vira a linha "Carregar mais (N)".
  remaining: number;
};

/**
 * Achata a árvore carregada nas linhas visíveis, em ordem de leitura.
 *
 * Guarda de ciclo: `connectedTo` é aresta de rede, não de contenção, e pode voltar
 * para um ancestral (porta → cabo → splitter → cabo). Repetir um item que já está
 * no próprio caminho geraria recursão infinita, então ele é omitido.
 */
export function flattenTreeRows(
  state: GeoTreeState,
  expandedRows: Set<string>,
  loadingNodes: Set<string>,
): GeoTreeRow[] {
  const rows: GeoTreeRow[] = [];

  const walk = (nodeId: string, parentKey: string, depth: number, ancestors: Set<string>) => {
    const node = state.nodesById[nodeId];
    if (!node) return;
    const identity = node.refId ?? node.id;
    if (ancestors.has(identity)) return;

    const rowKey = `${parentKey}/${nodeId}`;
    const expanded = expandedRows.has(rowKey);
    const loaded = state.childIds[nodeId] ?? [];
    const knownTotal = state.totals[nodeId];
    const total = knownTotal ?? loaded.length;

    rows.push({
      rowKey,
      node,
      depth,
      expanded,
      loading: loadingNodes.has(nodeId),
      total: knownTotal,
      remaining: expanded ? Math.max(0, total - loaded.length) : 0,
    });

    if (!expanded) return;
    const nextAncestors = new Set(ancestors).add(identity);
    for (const childId of loaded) walk(childId, rowKey, depth + 1, nextAncestors);
  };

  for (const rootId of state.rootIds) walk(rootId, '', 0, new Set());
  return rows;
}

// Nada nasce aberto: o usuário navega abrindo cada nível pelo "+". As estações
// continuam aparecendo no mapa mesmo fechadas (ver `mapNodes` em useGeoTree).
const AUTO_EXPAND: Array<GeoTreeNode['kind']> = [];

export function defaultExpandedRows(state: Pick<GeoTreeState, 'rootIds' | 'childIds' | 'nodesById'>): Set<string> {
  const expanded = new Set<string>();
  const walk = (nodeId: string, parentKey: string) => {
    const rowKey = `${parentKey}/${nodeId}`;
    const kind = state.nodesById[nodeId]?.kind;
    if (!kind || !AUTO_EXPAND.includes(kind)) return;
    expanded.add(rowKey);
    for (const childId of state.childIds[nodeId] ?? []) walk(childId, rowKey);
  };
  for (const rootId of state.rootIds) walk(rootId, '');
  return expanded;
}

// Fechar um ramo leva junto o que estava aberto abaixo dele: senão, reabrir
// devolveria a subárvore inteira à árvore e ao mapa de uma vez só.
export function collapseBranch(expandedRows: Set<string>, rowKey: string): Set<string> {
  const next = new Set(expandedRows);
  for (const key of expandedRows) {
    if (key === rowKey || key.startsWith(`${rowKey}/`)) next.delete(key);
  }
  return next;
}

// Códigos/keywords que caracterizam Cabo (category Cable.* do catálogo Resource).
const CABLE_KEYWORDS = ['cabo', 'cable', 'fiber', 'fibra', 'drop', 'feeder', 'jumper', 'patch', 'backbone', 'distribution'];

// Classifica um recurso como Cabo a partir do resourceType/spec/nome.
export function isCableResource(resource: {
  resourceType?: string;
  resourceSpecification?: { name?: string };
  name?: string;
}): boolean {
  const haystack = [resource.resourceType, resource.resourceSpecification?.name, resource.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return CABLE_KEYWORDS.some((keyword) => haystack.includes(keyword));
}
