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
import type { ViewportShape } from '../utils/mapLayers';

export type GeoTreeNodeKind = 'uf' | 'city' | 'group' | 'site' | 'resource';

// 'tree' (default) — navegação (mapa + Hierarquia): esconde item interno (Splitter,
// Sub-Site). 'all' — painéis de detalhe: devolve tudo, sem filtro.
export type GeoTreeScope = 'tree' | 'all';

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
  // Id da GeographicSiteSpecification do local (só em nó de Site) — pré-seleciona o tipo
  // salvo no combo de edição de um local de projeto (REQ-MOD01-015).
  siteSpecificationId?: string;
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
    // Detalhe do estado (ds_estado_controle na origem) — só vem em recurso Bloqueado.
    substatus?: string;
    // Sistema legado de origem do recurso (`_origin.system`) — ex.: "Netwin".
    sourceSystem?: string;
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
  options: { limit?: number; offset?: number; scope?: GeoTreeScope } = {},
): Promise<GeoTreeChildrenPage> => {
  const params = new URLSearchParams({ nodeId });
  params.set('limit', String(options.limit ?? TREE_PAGE_SIZE));
  params.set('offset', String(options.offset ?? 0));
  // Só serializa quando 'all': o caminho quente é a navegação (scope 'tree', o
  // default do servidor), e não vale sujar a URL dele.
  if (options.scope === 'all') params.set('scope', 'all');
  return getJson<GeoTreeChildrenPage>(`/v1/geo/tree/children?${params.toString()}`);
};

export type MapBounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };

// Infra passiva (recursos + cabos) dentro da região visível do mapa — usada em escala de
// detalhe (≤ 50 m), no lugar da expansão da árvore de Hierarquia. `include` restringe o que o
// servidor busca (RF-011, controle de camadas do mapa — ver utils/mapLayers.viewportInclude);
// omitido, busca tudo (compatibilidade — o caminho quente da maioria dos chamadores).
export const fetchViewportResources = (
  bounds: MapBounds,
  options: { limit?: number; include?: ViewportShape[] } = {},
): Promise<GeoTreeNode[]> => {
  const params = new URLSearchParams({
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
  });
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.include !== undefined) params.set('include', options.include.join(','));
  return getJson<GeoTreeNode[]>(`/v1/geo/tree/viewport?${params.toString()}`);
};

// Busca por nome para a barra de pesquisa — Estações e Recursos do inventário (nunca
// sub-locais/salas). Devolve nós de árvore, então o resultado se seleciona e desenha
// exatamente como qualquer outro nó (ver selectNode em GeoPage).
export const fetchTreeSearch = (
  q: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<GeoTreeNode[]> => {
  const term = q.trim();
  if (!term) return Promise.resolve([]);
  const params = new URLSearchParams({ q: term });
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  return getJson<GeoTreeNode[]>(`/v1/geo/tree/search?${params.toString()}`, {
    signal: options.signal,
  });
};

// Nó por id, já hidratado (geometria inteira + `detail`) — completa a seleção feita a partir
// de uma feature do InfraOverlay (canvas do mapa, ver useMapTiles): o índice de tile só carrega
// o essencial pra desenhar, sem `detail` nem, para cabo, a rota inteira (só o trecho recortado
// no tile clicado). Lança em 404 (recurso/site terminado entre o build do índice e o clique,
// por exemplo) — quem chama decide se mantém o stub parcial (ver selectNodeFromInfraOverlay).
export const fetchTreeNode = (nodeId: string): Promise<GeoTreeNode> =>
  getJson<GeoTreeNode>(`/v1/geo/tree/node?id=${encodeURIComponent(nodeId)}`);

// Caminho da raiz até um nó (`['uf:RJ', 'city:RJ|Niterói', 'group:…', 'site:…', 'resource:…']`).
// Estação já vem inteira em `roots`, mas Recurso não: selecionado pelo mapa ou pela busca,
// ele não tem ancestral nenhum carregado no cliente — é isto que diz onde ele mora para a
// árvore poder expandir até ele. `null` quando o nó não pende de Site nem de outro recurso.
export const fetchTreePath = (nodeId: string): Promise<string[] | null> =>
  getJson<{ nodeId: string; path: string[] | null }>(
    `/v1/geo/tree/path?nodeId=${encodeURIComponent(nodeId)}`,
  ).then((result) => result.path);

// "Traceroute" da fibra: do equipamento (aba Esquemático do painel de Recurso) até a
// Estação, alternando equipamento e cabo — o mesmo grafo que a carga OSP do Netwin grava
// (ver GeoTreeService.schematicPath).
export type GeoSchematicHopRole = 'equipment' | 'cable' | 'site';

export type GeoSchematicHop = {
  index: number;
  role: GeoSchematicHopRole;
  node: GeoTreeNode;
  spans?: { types: string[]; count: number };
};

export type GeoSchematicPath = {
  nodeId: string;
  hops: GeoSchematicHop[];
  reachedSite: boolean;
  truncated: boolean;
};

export const fetchResourceSchematic = (nodeId: string): Promise<GeoSchematicPath> =>
  getJson<GeoSchematicPath>(`/v1/geo/tree/schematic?nodeId=${encodeURIComponent(nodeId)}`);

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
