// Cliente da árvore de navegação do módulo Geo (`/v1/geo/tree/*`).
//
// A árvore é carregada um nível por vez: a abertura traz UF → Município →
// Estações → Estação, e cada expansão busca só os filhos diretos do nó clicado.
// O acervo tem dezenas de milhares de recursos — trazer tudo de uma vez foi o
// que derrubava a página.
//
// Cada nó já vem com a geometria resolvida, então o mapa desenha direto do nó,
// sem precisar do diretório completo de Locations.

import { getJson, type GeoGeometry } from './geoApi';

export type GeoTreeNodeKind = 'uf' | 'city' | 'group' | 'site' | 'resource';

export type GeoTreeNode = {
  // Chave estável e auto-descritiva; é ela que se devolve ao servidor para
  // expandir. `uf:RJ`, `city:RJ|Niterói`, `site:<uuid>`, `resource:<uuid>`.
  id: string;
  kind: GeoTreeNodeKind;
  label: string;
  sublabel?: string;
  refId?: string;
  referredType?: 'GeographicSite' | 'PhysicalResource' | 'LogicalResource';
  // Categoria TMF674 da spec do local; com `sublabel` resolve o ícone do local.
  siteCategory?: string;
  // Code do catálogo de ResourceType — resolve o ícone (ver utils/resourceIcon).
  resourceType?: string;
  status?: string;
  hasChildren: boolean;
  // Filhos diretos. Para Estação, só vem depois de expandida (ver `GeoTreeRow.total`).
  childCount?: number;
  geometry?: GeoGeometry;
  detail?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    address?: string;
  };
};

export type GeoTreeRootNode = GeoTreeNode & { parentId: string | null };

export type GeoTreeChildrenPage = {
  nodeId: string;
  nodes: GeoTreeNode[];
  total: number;
  offset: number;
  limit: number;
};

// Mesmo teto do servidor. Uma estação grande tem milhares de caixas; a página
// protege a árvore e o mapa, e o resto vem por "Carregar mais".
export const TREE_PAGE_SIZE = 500;

export const fetchTreeRoots = () => getJson<GeoTreeRootNode[]>('/v1/geo/tree/roots');

export const fetchTreeChildren = (
  nodeId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<GeoTreeChildrenPage> => {
  const params = new URLSearchParams({ nodeId });
  params.set('limit', String(options.limit ?? TREE_PAGE_SIZE));
  params.set('offset', String(options.offset ?? 0));
  return getJson<GeoTreeChildrenPage>(`/v1/geo/tree/children?${params.toString()}`);
};

// Ponto que representa o nó no mapa. Um cabo não é um ponto: sua geometria é a
// rota inteira, e o ponto usado para centralizar e ancorar o balão é o vértice
// do meio dela.
export function treeNodePoint(node: GeoTreeNode): [number, number] | null {
  if (!node.geometry) return null;
  if (node.geometry.type === 'Point') return node.geometry.coordinates;
  if (node.geometry.type === 'LineString') {
    const route = node.geometry.coordinates;
    return route[Math.floor(route.length / 2)] ?? null;
  }
  return null;
}

export function treeNodeRoute(node: GeoTreeNode): Array<[number, number]> | null {
  if (node.geometry?.type !== 'LineString') return null;
  return node.geometry.coordinates.length >= 2 ? node.geometry.coordinates : null;
}
