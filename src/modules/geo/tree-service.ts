// Read-model da árvore de navegação do módulo Geo (sidebar Hierarquia).
//
//   UF → Município → Estações → Estação → (sub-local | recurso) → recurso → …
//
// Existe separado de `GeoService`/`IGeoRepository` de propósito: a consulta cruza
// os módulos Geo (Site/Address/Location) e Resource (planta e grafo de
// relacionamentos), e é uma projeção de leitura — não faz parte do contrato TMF de
// nenhum dos dois. Por isso fala com o `DatabaseClient` direto, como os demais
// `Postgres*Repository`, e o `GeoRepository` em memória dos testes unitários não
// precisa implementá-la.
//
// A regra que rege tudo aqui é: **um nível por chamada**. A árvore inteira tem
// dezenas de milhares de recursos; a UI só pede os filhos diretos do nó que o
// usuário expandiu, e `hasChildren` sai de um EXISTS para o "+" custar barato.
//
// Dois itens são "internos" — têm existência própria no acervo, mas não no mapa nem
// na árvore: Splitter (reaproveita a Location da caixa que o contém, C2) e Sub-Site
// (sala/andar dentro de uma Estação). Os dois continuam acessíveis pelo painel de
// detalhe (`scope: 'all'`); a navegação (`scope: 'tree'`, o default) esconde os
// dois — e, para o Splitter, faz *pass-through*: o que pende dele (cabo secundário,
// CTO…) sobe um nível, para nada ficar inalcançável pela árvore.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { GeoJSONGeometry } from './domain.js';

export type GeoTreeNodeKind = 'uf' | 'city' | 'group' | 'site' | 'resource';

// 'tree' (default) — navegação: esconde item interno (Splitter, Sub-Site).
// 'all' — painel de detalhe: devolve tudo, sem filtro.
export type GeoTreeScope = 'tree' | 'all';

export type GeoTreeNode = {
  // Chave estável e auto-descritiva — é ela que a UI devolve em `nodeId` para
  // expandir. Formatos: `uf:RJ`, `city:RJ|Niterói`, `group:RJ|Niterói|stations`,
  // `site:<uuid>`, `resource:<uuid>`.
  id: string;
  kind: GeoTreeNodeKind;
  label: string;
  // Tipo do item, para a linha secundária e o balão do mapa ("CDOE", "Estação").
  sublabel?: string;
  refId?: string;
  referredType?: 'GeographicSite' | 'PhysicalResource' | 'LogicalResource';
  // Categoria TMF674 da spec do local (Region | FunctionalGroup | Site | SubSite).
  // Com o nome do tipo (`sublabel`), é o que resolve o ícone do local no front.
  siteCategory?: string;
  // Code do catálogo de ResourceType (TMF634) — resolve o ícone no front.
  resourceType?: string;
  status?: string;
  hasChildren: boolean;
  // Filhos diretos. Só vem preenchido onde é barato contar (níveis geográficos);
  // para Estação, só chega depois de expandida (ver `GeoTreeChildrenPage.total`).
  childCount?: number;
  geometry?: GeoJSONGeometry;
  detail?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    address?: string;
    // Detalhe do estado do recurso (ds_estado_controle na origem Netwin) —
    // extensão V.tal (C1), guardada como characteristic e exibida no painel.
    substatus?: string;
    // Sistema legado de origem do recurso (`_origin.system`, C5) — ex.: "Netwin".
    sourceSystem?: string;
  };
};

export type GeoTreeChildrenPage = {
  nodeId: string;
  nodes: GeoTreeNode[];
  total: number;
  offset: number;
  limit: number;
};

// Arestas que compõem a hierarquia de planta. `containsAsChild` é contenção
// (caixa → splitter, placa → porta) e `connectedTo` é o encadeamento da rede
// (porta → cabo primário → splitter → cabo secundário → CTO → drop → ONT).
// `mountedOn` fica de fora: o poste sustenta o CDOE, não é filho dele.
const TREE_EDGE_TYPES = ['containsAsChild', 'connectedTo'] as const;

// Code do catálogo TMF634 (ver `src/modules/resource/catalog.ts`) que não tem
// existência própria na navegação: o Splitter reaproveita a Location da caixa que
// o contém, então um pin dele no mapa cairia em cima do pin da caixa. Se algum dia
// entrar um segundo tipo interno, os predicados abaixo (marcados "— Splitter")
// precisam virar um IN (...) em vez do `= 'Splitter'` literal.
const INTERNAL_RESOURCE_TYPE = 'Splitter';

// Profundidade máxima da cadeia de itens internos ao fazer pass-through (splitter →
// splitter → …). Splitter encadeado direto em outro splitter é exceção de dado, não
// a regra — a guarda existe só para a CTE recursiva nunca rodar sem teto.
const PASS_THROUGH_MAX_DEPTH = 4;

// Teto de saltos ao subir o grafo em `pathTo` — porta→cabo→splitter→cabo→CTO→drop→ONT
// já é uma cadeia longa de verdade; isto é só a válvula contra um `connectedTo` cíclico
// nos dados fazendo a recursão nunca terminar.
const PATH_MAX_DEPTH = 100;

const SEM_UF = 'Sem UF';
const SEM_MUNICIPIO = 'Sem município';
const GROUP_STATIONS = 'stations';

export const DEFAULT_TREE_PAGE_SIZE = 500;
const MAX_TREE_PAGE_SIZE = 2000;

// Teto do viewport do mapa: alto de propósito. Em escala de detalhe (≤ 200 m) a área é
// pequena, mas um bairro denso já passa de mil recursos (o mais denso do acervo bate ~1,3k
// em ~2 km²); truncar cedo deixava buracos no mapa. É só uma válvula contra bbox anômalo.
const VIEWPORT_MAX_RESULTS = 10000;

// Teto da busca por nome (barra de pesquisa) — é autocomplete, não listagem; poucos
// resultados bastam para o usuário reconhecer o item e clicar.
const SEARCH_MAX_RESULTS = 20;

type SiteRow = {
  id: string;
  name: string;
  status: string;
  spec_name: string | null;
  spec_category: string | null;
  geographic_location_id: string | null;
  geometry_type: string | null;
  geometry: string | null;
  city: string | null;
  uf: string | null;
  street: string | null;
};

type ResourceRow = {
  id: string;
  name: string;
  entity_type: 'PhysicalResource' | 'LogicalResource';
  resource_type: string | null;
  status: string | null;
  spec_name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  substatus: string | null;
  source_system: string | null;
  geometry_type: string | null;
  geometry: string | null;
};

export class GeoTreeService {
  public constructor(private readonly db: DatabaseClient) {}

  /**
   * Abertura da página: UF → Município → pasta Estações → Estação, de uma vez.
   * São poucas dezenas de nós e é exatamente o que o mapa desenha na abertura —
   * pedir isso em quatro idas ao servidor só adicionaria latência. Vem em lista
   * plana com `parentId`, para o cliente indexar sem recursão.
   */
  public async roots(): Promise<Array<GeoTreeNode & { parentId: string | null }>> {
    const stations = await this.listStationRows();

    const byUf = new Map<string, Map<string, SiteRow[]>>();
    for (const station of stations) {
      const uf = station.uf?.trim() || SEM_UF;
      const city = station.city?.trim() || SEM_MUNICIPIO;
      const cities = byUf.get(uf) ?? new Map<string, SiteRow[]>();
      const list = cities.get(city) ?? [];
      list.push(station);
      cities.set(city, list);
      byUf.set(uf, cities);
    }

    const nodes: Array<GeoTreeNode & { parentId: string | null }> = [];

    for (const uf of sortKeys([...byUf.keys()])) {
      const cities = byUf.get(uf)!;
      const ufId = `uf:${uf}`;
      nodes.push({
        id: ufId,
        kind: 'uf',
        label: uf,
        hasChildren: cities.size > 0,
        childCount: cities.size,
        parentId: null,
      });

      for (const city of sortKeys([...cities.keys()])) {
        const stationsOfCity = cities.get(city)!;
        const cityId = `city:${uf}|${city}`;
        const groupId = `group:${uf}|${city}|${GROUP_STATIONS}`;
        nodes.push({
          id: cityId,
          kind: 'city',
          label: city,
          hasChildren: true,
          childCount: 1,
          parentId: ufId,
        });
        nodes.push({
          id: groupId,
          kind: 'group',
          label: 'Estações',
          hasChildren: stationsOfCity.length > 0,
          childCount: stationsOfCity.length,
          parentId: cityId,
        });

        for (const station of sortRows(stationsOfCity)) {
          nodes.push({
            ...this.toSiteNode(station, { hasChildren: true }),
            parentId: groupId,
          });
        }
      }
    }

    return nodes;
  }

  /**
   * Infra passiva (recursos Physical/Logical, pontuais ou cabos) dentro de um bbox do
   * mapa — a fonte do mapa quando a escala está em zoom de detalhe (≤ 200 m), em vez da
   * expansão da árvore. Um cabo entra se qualquer vértice da rota cair no bbox; um ponto
   * entra se a própria coordenada cair. `status = 'terminated'` fica de fora (C6), e
   * Splitter também — ele não tem ponto próprio no mapa (mora na Location da caixa).
   */
  public async resourcesInViewport(
    bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
    options: { limit?: number } = {},
  ): Promise<GeoTreeNode[]> {
    // Diferente da árvore (paginada de 500), o viewport devolve TUDO que cai na área
    // visível: um bairro denso passa de mil caixas, e truncar em 500 deixava regiões
    // inteiras vazias no mapa. Como a busca só roda em escala de detalhe (≤ 200 m), a
    // própria área limita o volume; VIEWPORT_MAX_RESULTS é só uma válvula de segurança.
    const limit = clamp(options.limit ?? VIEWPORT_MAX_RESULTS, 1, VIEWPORT_MAX_RESULTS);
    // Um jogo de 4 (minLng, maxLng, minLat, maxLat) por bloco do UNION ALL em
    // VIEWPORT_RESOURCE_SOURCE: Physical-ponto, Physical-cabo, Logical-ponto, Logical-cabo
    // — daí os 4 jogos. Ponto e cabo ficam em blocos separados (não num OR) para o bloco de
    // ponto poder usar o índice de expressão idx_tmf_geographic_location_point_lnglat.
    const bboxQuad = [bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat];

    // Sem ORDER BY: o mapa não precisa de ordem, e ordenar por nome enviesava o corte do
    // LIMIT (devolvia os 500 primeiros nomes, sumindo com bairros inteiros).
    const rows = await this.db.all<ResourceRow>(
      `SELECT * FROM (${VIEWPORT_RESOURCE_SOURCE}) AS t LIMIT ?`,
      [...bboxQuad, ...bboxQuad, ...bboxQuad, ...bboxQuad, limit],
    );

    return await this.toResourceNodes(rows, 'tree');
  }

  /**
   * Busca por nome para a barra de pesquisa: Estações (Site, nunca SubSite — sala/andar
   * não é alvo de busca) e Recursos (physical/logical, Splitter incluso — diferente do
   * mapa e da árvore, buscar pelo nome do splitter continua encontrando-o), por substring
   * case-insensitive. Devolve `GeoTreeNode[]` para reaproveitar o mesmo desenho de
   * mapa/detalhe/seleção que a árvore já usa — quem chama trata o resultado como um nó
   * qualquer.
   */
  public async search(term: string, options: { limit?: number } = {}): Promise<GeoTreeNode[]> {
    const trimmed = term.trim();
    if (!trimmed) return [];
    const limit = clamp(options.limit ?? SEARCH_MAX_RESULTS, 1, SEARCH_MAX_RESULTS);
    const like = `%${trimmed}%`;

    const siteRows = await this.db.all<SiteRow>(
      `${SITE_SELECT}
       WHERE sp.category = 'Site' AND s.status NOT IN ('Retired', 'terminated') AND LOWER(s.name) LIKE LOWER(?)
       ORDER BY s.name
       LIMIT ?`,
      [like, limit],
    );

    const resourceRows = await this.db.all<ResourceRow>(
      `SELECT * FROM (${SEARCH_RESOURCE_SOURCE}) AS t ORDER BY name LIMIT ?`,
      [like, like, limit],
    );

    const nodes: GeoTreeNode[] = [
      ...siteRows.map((row) => this.toSiteNode(row, { hasChildren: true })),
      ...(await this.toResourceNodes(resourceRows, 'tree')),
    ];
    nodes.sort((left, right) => collator.compare(left.label, right.label));

    return nodes.slice(0, limit);
  }

  /**
   * Caminho da raiz até um nó (`uf → city → group → site → resource → …`), na forma que
   * o cliente devolve em `expandedRows` para revelar o nó na árvore.
   *
   * Existe porque `roots()` pré-carrega o caminho inteiro de toda Estação (é a mesma
   * consulta que monta UF/Município/grupo), mas Recurso nunca vem pré-carregado — só
   * entra no estado do cliente quando um nível é expandido manualmente. Selecionar um
   * recurso pelo mapa ou pela busca não passa por isso, então sem este método o cliente
   * não tem como saber a que Estação (e a que cadeia de recursos) ele pertence.
   *
   * Sobe o grafo de posse: `place`/`servingSite` para achar o Site dono, ou a aresta de
   * entrada (`containsAsChild`/`connectedTo`) para achar o recurso pai — e recursa. Um
   * ancestral interno (Splitter) é pulado do caminho devolvido, espelhando o
   * *pass-through* de `childrenOfResource` em `scope: 'tree'`: o cliente nunca precisa
   * expandir um nó que a árvore não mostra.
   */
  public async pathTo(nodeId: string, depth = 0): Promise<string[] | null> {
    if (depth > PATH_MAX_DEPTH) return null;
    const parsed = parseNodeId(nodeId);

    if (parsed.kind === 'site') {
      return await this.sitePathPrefix(parsed.rest);
    }

    if (parsed.kind === 'resource') {
      const resourceId = parsed.rest;
      const directSite = await this.findDirectOwningSite(resourceId);
      if (directSite) {
        const prefix = await this.sitePathPrefix(directSite);
        return prefix ? [...prefix, nodeId] : null;
      }

      const parentEdge = await this.db.get<{ resource_from_id: string }>(
        `SELECT resource_from_id FROM tmf_resource_relationship
          WHERE resource_to_id = ? AND relationship_type IN ('containsAsChild', 'connectedTo')
          LIMIT 1`,
        [resourceId],
      );
      if (!parentEdge) return null; // órfão — nenhum Site nem recurso pai o sustenta

      const parentPath = await this.pathTo(`resource:${parentEdge.resource_from_id}`, depth + 1);
      if (!parentPath) return null;
      const parentIsInternal = await this.isInternalResource(parentEdge.resource_from_id);
      const base = parentIsInternal ? parentPath.slice(0, -1) : parentPath;
      return [...base, nodeId];
    }

    return null;
  }

  public async children(
    nodeId: string,
    options: { limit?: number; offset?: number; scope?: GeoTreeScope } = {},
  ): Promise<GeoTreeChildrenPage> {
    const limit = clamp(options.limit ?? DEFAULT_TREE_PAGE_SIZE, 1, MAX_TREE_PAGE_SIZE);
    const offset = Math.max(0, options.offset ?? 0);
    const scope: GeoTreeScope = options.scope ?? 'tree';
    const parsed = parseNodeId(nodeId);

    const page = await (async (): Promise<{ nodes: GeoTreeNode[]; total: number }> => {
      switch (parsed.kind) {
        case 'uf':
          return await this.citiesOfUf(parsed.rest);
        case 'city':
          return await this.groupsOfCity(parsed.rest);
        case 'group':
          return await this.stationsOfGroup(parsed.rest, limit, offset);
        case 'site':
          return await this.childrenOfSite(parsed.rest, limit, offset, scope);
        case 'resource':
          return await this.childrenOfResource(parsed.rest, limit, offset, scope);
        default:
          return { nodes: [], total: 0 };
      }
    })();

    return { nodeId, nodes: page.nodes, total: page.total, offset, limit };
  }

  // ------------------------------------------------------------- níveis geo ---

  private async citiesOfUf(uf: string): Promise<{ nodes: GeoTreeNode[]; total: number }> {
    const stations = (await this.listStationRows()).filter(
      (row) => (row.uf?.trim() || SEM_UF) === uf,
    );
    const cities = new Map<string, number>();
    for (const station of stations) {
      const city = station.city?.trim() || SEM_MUNICIPIO;
      cities.set(city, (cities.get(city) ?? 0) + 1);
    }

    const nodes = sortKeys([...cities.keys()]).map((city) => ({
      id: `city:${uf}|${city}`,
      kind: 'city' as const,
      label: city,
      hasChildren: true,
      childCount: 1,
    }));

    return { nodes, total: nodes.length };
  }

  private async groupsOfCity(rest: string): Promise<{ nodes: GeoTreeNode[]; total: number }> {
    const [uf, city] = splitPair(rest);
    const stations = (await this.listStationRows()).filter(
      (row) => (row.uf?.trim() || SEM_UF) === uf && (row.city?.trim() || SEM_MUNICIPIO) === city,
    );

    return {
      nodes: [
        {
          id: `group:${uf}|${city}|${GROUP_STATIONS}`,
          kind: 'group',
          label: 'Estações',
          hasChildren: stations.length > 0,
          childCount: stations.length,
        },
      ],
      total: 1,
    };
  }

  private async stationsOfGroup(
    rest: string,
    limit: number,
    offset: number,
  ): Promise<{ nodes: GeoTreeNode[]; total: number }> {
    const [uf, city] = splitPair(rest);
    const all = sortRows(
      (await this.listStationRows()).filter(
        (row) => (row.uf?.trim() || SEM_UF) === uf && (row.city?.trim() || SEM_MUNICIPIO) === city,
      ),
    );
    const page = all.slice(offset, offset + limit);

    return {
      nodes: page.map((row) => this.toSiteNode(row, { hasChildren: true })),
      total: all.length,
    };
  }

  // ------------------------------------------------------ filhos de um Site ---

  /**
   * Filhos diretos de um local: os sub-locais dele (sala, andar) e os recursos
   * que moram nele. "Morar nele" tem três formas no acervo:
   *   (a) `place` = o próprio Site (planta interna, C2 — do rack para dentro);
   *   (b) `place` = a Location do Site;
   *   (c) planta externa da estação (`servingSite`) que ainda não é filha de
   *       outro recurso — é a raiz de cada ramo da rede na rua.
   *
   * Em `scope: 'tree'`, sub-locais nem entram na consulta — são um item interno,
   * acessíveis só pela aba "Sub-locais" do painel de detalhe (`scope: 'all'`).
   */
  private async childrenOfSite(
    siteId: string,
    limit: number,
    offset: number,
    scope: GeoTreeScope,
  ): Promise<{ nodes: GeoTreeNode[]; total: number }> {
    const site = await this.db.get<{ id: string; geographic_location_id: string | null }>(
      'SELECT id, geographic_location_id FROM tmf_geographic_site WHERE id = ?',
      [siteId],
    );
    if (!site) return { nodes: [], total: 0 };

    const subSites =
      scope === 'tree'
        ? []
        : await this.db.all<SiteRow>(
            `${SITE_SELECT}
             WHERE s.parent_site_id = ? AND s.status NOT IN ('Retired', 'terminated')
             ORDER BY s.name`,
            [siteId],
          );

    const resourceSource = siteResourceSource(scope);
    const resourceParams = [siteId, site.geographic_location_id ?? '', siteId];
    const total =
      subSites.length +
      ((
        await this.db.get<{ n: number }>(`SELECT count(*) AS n FROM (${resourceSource}) AS t`, [
          ...resourceParams,
          ...resourceParams,
        ])
      )?.n ?? 0);

    // Sub-locais primeiro (o interior do local), depois a planta. A janela de
    // paginação atravessa os dois grupos, por isso o offset desconta os sites.
    const siteSlice = subSites.slice(offset, offset + limit);
    const resourceOffset = Math.max(0, offset - subSites.length);
    const resourceLimit = limit - siteSlice.length;

    const nodes: GeoTreeNode[] = [];
    if (siteSlice.length > 0) {
      const withChildren = await this.sitesWithChildren(siteSlice);
      for (const row of siteSlice) {
        nodes.push(this.toSiteNode(row, { hasChildren: withChildren.has(row.id) }));
      }
    }

    if (resourceLimit > 0) {
      const rows = await this.db.all<ResourceRow>(
        `SELECT * FROM (${resourceSource}) AS t ORDER BY name, id LIMIT ? OFFSET ?`,
        [...resourceParams, ...resourceParams, resourceLimit, resourceOffset],
      );
      nodes.push(...(await this.toResourceNodes(rows, scope)));
    }

    return { nodes, total };
  }

  // -------------------------------------------------- filhos de um Recurso ---

  /**
   * Filhos diretos de um recurso. Em `scope: 'tree'`, faz *pass-through* sobre
   * cadeias de item interno (splitter → splitter → …): o primeiro descendente
   * visível de cada ramo sobe para este nível, para a árvore nunca ficar com um
   * "+" que abre em nada.
   */
  private async childrenOfResource(
    resourceId: string,
    limit: number,
    offset: number,
    scope: GeoTreeScope,
  ): Promise<{ nodes: GeoTreeNode[]; total: number }> {
    // DISTINCT só entra em 'tree': o pass-through pode alcançar o mesmo descendente por
    // mais de um splitter da cadeia (diamante raro, mas possível), e as colunas vêm
    // idênticas nas duas vezes — dedup por igualdade de linha basta.
    const source =
      scope === 'tree'
        ? `SELECT DISTINCT * FROM (${RESOURCE_CHILD_TREE_SOURCE}) AS dedup`
        : RESOURCE_CHILD_SOURCE;
    const countParams = scope === 'tree' ? [resourceId] : [resourceId, resourceId];
    const rowParams = scope === 'tree' ? [resourceId] : [resourceId, resourceId];

    const total =
      (await this.db.get<{ n: number }>(`SELECT count(*) AS n FROM (${source}) AS t`, countParams))
        ?.n ?? 0;

    const rows = await this.db.all<ResourceRow>(
      `SELECT * FROM (${source}) AS t ORDER BY name, id LIMIT ? OFFSET ?`,
      [...rowParams, limit, offset],
    );

    return { nodes: await this.toResourceNodes(rows, scope), total };
  }

  // ----------------------------------------------------------- montagem -----

  private toSiteNode(row: SiteRow, options: { hasChildren: boolean }): GeoTreeNode {
    const node: GeoTreeNode = {
      id: `site:${row.id}`,
      kind: 'site',
      label: row.name,
      refId: row.id,
      referredType: 'GeographicSite',
      status: row.status,
      hasChildren: options.hasChildren,
    };
    if (row.spec_name) node.sublabel = row.spec_name;
    if (row.spec_category) node.siteCategory = row.spec_category;
    const geometry = parseGeometry(row.geometry);
    if (geometry) node.geometry = geometry;
    if (row.street) node.detail = { address: row.street };
    return node;
  }

  private async toResourceNodes(rows: ResourceRow[], scope: GeoTreeScope): Promise<GeoTreeNode[]> {
    const childCounts = await this.countResourceChildren(
      rows.map((row) => row.id),
      scope,
    );

    return rows.map((row) => {
      const node: GeoTreeNode = {
        id: `resource:${row.id}`,
        kind: 'resource',
        label: row.name,
        refId: row.id,
        referredType: row.entity_type,
        hasChildren: (childCounts.get(row.id) ?? 0) > 0,
      };
      if (row.resource_type) node.resourceType = row.resource_type;
      if (row.spec_name) node.sublabel = row.spec_name;
      if (row.status) node.status = row.status;
      const geometry = parseGeometry(row.geometry);
      if (geometry) node.geometry = geometry;
      const detail: NonNullable<GeoTreeNode['detail']> = {};
      if (row.manufacturer) detail.manufacturer = row.manufacturer;
      if (row.model) detail.model = row.model;
      if (row.serial_number) detail.serialNumber = row.serial_number;
      if (row.substatus) detail.substatus = row.substatus;
      if (row.source_system) detail.sourceSystem = row.source_system;
      if (Object.keys(detail).length > 0) node.detail = detail;
      return node;
    });
  }

  // ------------------------------------------------------------ consultas ---

  // Estação = GeographicSite de categoria 'Site' (Região é caminho, Sub-local é
  // interior). UF/Município saem do endereço da própria estação; sem endereço,
  // ela cai nos baldes "Sem …" em vez de sumir da navegação.
  private async listStationRows(): Promise<SiteRow[]> {
    return await this.db.all<SiteRow>(
      `${SITE_SELECT}
       WHERE sp.category = 'Site' AND s.status NOT IN ('Retired', 'terminated')
       ORDER BY s.name`,
    );
  }

  // Trecho fixo do caminho — igual ao que roots()/citiesOfUf constroem — para o Site
  // (Estação) dono da UF/Município dele. Usado por pathTo tanto para o próprio Site
  // quanto como base de qualquer recurso que pertença a ele.
  private async sitePathPrefix(siteId: string): Promise<string[] | null> {
    const row = await this.db.get<{ id: string; city: string | null; uf: string | null }>(
      `SELECT s.id, a.city, a.state_or_province AS uf
         FROM tmf_geographic_site s
         LEFT JOIN tmf_geographic_address a ON a.id = s.geographic_address_id
        WHERE s.id = ?`,
      [siteId],
    );
    if (!row) return null;
    const uf = row.uf?.trim() || SEM_UF;
    const city = row.city?.trim() || SEM_MUNICIPIO;
    return [
      `uf:${uf}`,
      `city:${uf}|${city}`,
      `group:${uf}|${city}|${GROUP_STATIONS}`,
      `site:${row.id}`,
    ];
  }

  // Site dono do recurso, se a filiação for direta (mesmas três formas de
  // RESOURCE_AT_SITE_WHERE, na direção inversa: dado o recurso, qual é o Site).
  // `null` quando o recurso pende de outro recurso — pathTo então sobe pela aresta.
  private async findDirectOwningSite(resourceId: string): Promise<string | null> {
    const resource =
      (await this.db.get<{ place_id: string | null; serving_site_id: string | null }>(
        'SELECT place_id, serving_site_id FROM tmf_physical_resource WHERE id = ?',
        [resourceId],
      )) ??
      (await this.db.get<{ place_id: string | null; serving_site_id: string | null }>(
        'SELECT place_id, serving_site_id FROM tmf_logical_resource WHERE id = ?',
        [resourceId],
      ));
    if (!resource) return null;

    if (resource.place_id) {
      const byOwnId = await this.db.get<{ id: string }>(
        'SELECT id FROM tmf_geographic_site WHERE id = ?',
        [resource.place_id],
      );
      if (byOwnId) return byOwnId.id;
      const byLocationId = await this.db.get<{ id: string }>(
        'SELECT id FROM tmf_geographic_site WHERE geographic_location_id = ?',
        [resource.place_id],
      );
      if (byLocationId) return byLocationId.id;
    }

    if (resource.serving_site_id) {
      const incoming = await this.db.get<{ n: number }>(
        `SELECT count(*) AS n FROM tmf_resource_relationship
          WHERE resource_to_id = ? AND relationship_type IN ('containsAsChild', 'connectedTo')`,
        [resourceId],
      );
      if (!incoming || Number(incoming.n) === 0) return resource.serving_site_id;
    }

    return null;
  }

  // Splitter é sempre PhysicalResource (categoria Infrastructure.Passive no catálogo).
  private async isInternalResource(resourceId: string): Promise<boolean> {
    const row = await this.db.get<{ n: number }>(
      `SELECT count(*) AS n FROM tmf_physical_resource WHERE id = ? AND resource_type = ?`,
      [resourceId, INTERNAL_RESOURCE_TYPE],
    );
    return Number(row?.n ?? 0) > 0;
  }

  /**
   * Quais destes locais têm ao menos um filho — é o que decide o "+" na árvore.
   * Responde a página inteira em três consultas (uma por forma de filiação), e
   * não uma por local: uma estação com 12 salas não pode custar 24 idas ao banco.
   *
   * Só é chamada para sub-locais já carregados (`scope: 'all'` — em `'tree'` a
   * lista de sub-locais nunca é buscada), então não precisa filtrar item interno.
   */
  private async sitesWithChildren(sites: SiteRow[]): Promise<Set<string>> {
    const withChildren = new Set<string>();
    if (sites.length === 0) return withChildren;

    const siteIds = sites.map((site) => site.id);
    const siteByLocationId = new Map<string, string>();
    for (const site of sites) {
      if (site.geographic_location_id) siteByLocationId.set(site.geographic_location_id, site.id);
    }

    // (1) sub-locais
    for (const row of await this.db.all<{ id: string }>(
      `SELECT DISTINCT parent_site_id AS id FROM tmf_geographic_site
        WHERE parent_site_id IN (${placeholders(siteIds)}) AND status NOT IN ('Retired', 'terminated')`,
      siteIds,
    )) {
      withChildren.add(row.id);
    }

    // (2) recursos cujo place é o próprio local ou a Location dele
    const placeIds = [...siteIds, ...siteByLocationId.keys()];
    for (const row of await this.db.all<{ id: string }>(
      `SELECT DISTINCT place_id AS id FROM tmf_physical_resource WHERE place_id IN (${placeholders(placeIds)})
       UNION
       SELECT DISTINCT place_id AS id FROM tmf_logical_resource WHERE place_id IN (${placeholders(placeIds)})`,
      [...placeIds, ...placeIds],
    )) {
      withChildren.add(siteByLocationId.get(row.id) ?? row.id);
    }

    // (3) planta externa da estação que ainda não pende de outro recurso
    for (const row of await this.db.all<{ id: string }>(
      `SELECT DISTINCT r.serving_site_id AS id
         FROM tmf_physical_resource r
        WHERE r.serving_site_id IN (${placeholders(siteIds)})
          AND NOT EXISTS (
            SELECT 1 FROM tmf_resource_relationship e
             WHERE e.resource_to_id = r.id
               AND e.relationship_type IN ('containsAsChild', 'connectedTo')
          )`,
      siteIds,
    )) {
      withChildren.add(row.id);
    }

    return withChildren;
  }

  private async countResourceChildren(
    resourceIds: string[],
    scope: GeoTreeScope,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (resourceIds.length === 0) return counts;

    if (scope === 'all') {
      const rows = await this.db.all<{ resource_from_id: string; n: number }>(
        `SELECT resource_from_id, count(*) AS n
         FROM tmf_resource_relationship
         WHERE resource_from_id IN (${placeholders(resourceIds)})
           AND relationship_type IN (${placeholders([...TREE_EDGE_TYPES])})
         GROUP BY resource_from_id`,
        [...resourceIds, ...TREE_EDGE_TYPES],
      );
      for (const row of rows) counts.set(row.resource_from_id, Number(row.n));
      return counts;
    }

    // scope 'tree': mesmo pass-through de childrenOfResource, mas em lote — anda a
    // partir de cada id da lista e, sempre que o nó alcançado for interno (Splitter),
    // continua descendo a partir dele; o que sobra na fronteira (visível, depth ≥ 1)
    // é o que conta como filho de cada raiz.
    const rows = await this.db.all<{ root_id: string; n: number }>(
      `WITH RECURSIVE frontier(root_id, node_id, depth) AS (
         SELECT v.id, v.id, 0 FROM (VALUES ${resourceIds.map(() => '(?)').join(', ')}) AS v(id)
         UNION ALL
         SELECT f.root_id, e.resource_to_id, f.depth + 1
           FROM frontier f
           JOIN tmf_resource_relationship e
             ON e.resource_from_id = f.node_id
            AND e.relationship_type IN (${placeholders([...TREE_EDGE_TYPES])})
          WHERE f.depth < ${PASS_THROUGH_MAX_DEPTH}
            AND (
              f.depth = 0
              OR EXISTS (
                SELECT 1 FROM tmf_physical_resource p
                 WHERE p.id = f.node_id AND p.resource_type = '${INTERNAL_RESOURCE_TYPE}'
              )
            )
       )
       SELECT root_id, count(DISTINCT node_id) AS n
         FROM frontier
        WHERE depth >= 1
          AND NOT EXISTS (
            SELECT 1 FROM tmf_physical_resource p
             WHERE p.id = frontier.node_id AND p.resource_type = '${INTERNAL_RESOURCE_TYPE}'
          )
        GROUP BY root_id`,
      [...resourceIds, ...TREE_EDGE_TYPES],
    );
    for (const row of rows) counts.set(row.root_id, Number(row.n));
    return counts;
  }
}

// ----------------------------------------------------------------- SQL ------

const SITE_SELECT = `
  SELECT s.id, s.name, s.status, s.geographic_location_id,
         sp.name AS spec_name, sp.category AS spec_category,
         l.geometry_type, l.geometry,
         a.city, a.state_or_province AS uf, a.street_name AS street
    FROM tmf_geographic_site s
    JOIN tmf_geographic_site_specification sp ON sp.id = s.site_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = s.geographic_location_id
    LEFT JOIN tmf_geographic_address a ON a.id = s.geographic_address_id`;

// Recursos que pendem diretamente de um Site. Os três parâmetros são, em ordem:
// id do site, id da Location do site, id do site (servingSite). A união repete o
// bloco para PhysicalResource e LogicalResource — daí os parâmetros irem em dobro.
const RESOURCE_AT_SITE_WHERE = `
  r.place_id = ?
  OR r.place_id = ?
  OR (
    r.serving_site_id = ?
    AND NOT EXISTS (
      SELECT 1 FROM tmf_resource_relationship e
       WHERE e.resource_to_id = r.id
         AND e.relationship_type IN ('containsAsChild', 'connectedTo')
    )
  )`;

// Predicado que exclui item interno (Splitter — ver INTERNAL_RESOURCE_TYPE) da
// fonte. Só entra em `scope: 'tree'`; em `scope: 'all'` fica vazio.
const hideInternalResourceSql = (scope: GeoTreeScope): string =>
  scope === 'tree' ? `AND r.resource_type IS DISTINCT FROM 'Splitter'` : '';

// Substatus é extensão V.tal (C1): vive numa characteristic de topo (sem grupo),
// não em coluna. Extraímos SÓ o valor como escalar — payload minúsculo — em vez
// de trafegar o blob inteiro de `characteristics` em cada linha da árvore/mapa. O
// worker Postgres deixa `::jsonb`/`jsonb_array_elements` passarem intactos (mesmo
// caminho do bloco de viewport); NULLIF protege contra characteristics vazio.
const RESOURCE_SUBSTATUS_SQL =
  `(SELECT ce->>'value' FROM jsonb_array_elements(NULLIF(r.characteristics, '')::jsonb) AS ce ` +
  `WHERE ce->>'name' = 'substatus' AND ce->>'group' IS NULL LIMIT 1)`;

// Sistema de origem do recurso (C5): vive no grupo `_origin` (`_origin.system`),
// gravado pelas cargas de migração — "Netwin" hoje, outros no futuro. Mesmo
// padrão escalar do substatus (só o valor, não o blob de characteristics).
const RESOURCE_SOURCE_SYSTEM_SQL =
  `(SELECT ce->>'value' FROM jsonb_array_elements(NULLIF(r.characteristics, '')::jsonb) AS ce ` +
  `WHERE ce->>'name' = 'system' AND ce->>'group' = '_origin' LIMIT 1)`;

// Recursos pendendo direto de um Site, por escopo — mesmas colunas e parâmetros nas
// duas variantes, só muda o filtro de item interno (sem placeholder extra).
const siteResourceSource = (scope: GeoTreeScope): string => {
  const extra = hideInternalResourceSql(scope);
  return `
  SELECT r.id, r.name, 'PhysicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, r.manufacturer, r.model, r.serial_number,
         ${RESOURCE_SUBSTATUS_SQL} AS substatus,
         ${RESOURCE_SOURCE_SYSTEM_SQL} AS source_system,
         l.geometry_type, l.geometry
    FROM tmf_physical_resource r
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE (${RESOURCE_AT_SITE_WHERE}) ${extra}
  UNION ALL
  SELECT r.id, r.name, 'LogicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, NULL AS manufacturer, NULL AS model, NULL AS serial_number,
         NULL AS substatus,
         ${RESOURCE_SOURCE_SYSTEM_SQL} AS source_system,
         l.geometry_type, l.geometry
    FROM tmf_logical_resource r
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE (${RESOURCE_AT_SITE_WHERE}) ${extra}`;
};

// Recursos cuja geometria cai num bbox do mapa. Ponto e cabo ficam em blocos separados
// (não num OR) de propósito: só assim o Postgres consegue usar o índice de expressão
// idx_tmf_geographic_location_point_lnglat no bloco de ponto — com o OR ele cai num seq
// scan de toda a tabela de Locations parseando JSON linha a linha. Ponto casa pela própria
// coordenada; cabo (LineString) casa se qualquer vértice da rota cair no bbox. `l.geometry`
// é GeoJSON em texto; o worker Postgres deixa os operadores `::jsonb` passarem intactos (só
// reescreve `json_extract`). Cada bloco leva 4 parâmetros: minLng, maxLng, minLat, maxLat.
// Splitter fica de fora dos dois blocos: não tem ponto próprio no mapa (mora na Location
// da caixa que o contém) e usado só aqui — a busca (`SEARCH_NAME_WHERE`) não herda o filtro.
const VIEWPORT_POINT_WHERE = `
  l.geometry_type = 'Point'
  AND r.resource_type IS DISTINCT FROM 'Splitter'
  AND (l.geometry::jsonb->'coordinates'->>0)::float8 BETWEEN ? AND ?
  AND (l.geometry::jsonb->'coordinates'->>1)::float8 BETWEEN ? AND ?`;

const VIEWPORT_LINE_WHERE = `
  l.geometry_type = 'LineString'
  AND r.resource_type IS DISTINCT FROM 'Splitter'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(l.geometry::jsonb->'coordinates') AS v
     WHERE (v->>0)::float8 BETWEEN ? AND ?
       AND (v->>1)::float8 BETWEEN ? AND ?
  )`;

const viewportBlock = (entity: 'PhysicalResource' | 'LogicalResource', where: string): string => {
  const table = entity === 'PhysicalResource' ? 'tmf_physical_resource' : 'tmf_logical_resource';
  const manufacturer = entity === 'PhysicalResource' ? 'r.manufacturer' : 'NULL';
  const model = entity === 'PhysicalResource' ? 'r.model' : 'NULL';
  const serial = entity === 'PhysicalResource' ? 'r.serial_number' : 'NULL';
  const substatus = entity === 'PhysicalResource' ? RESOURCE_SUBSTATUS_SQL : 'NULL';
  return `
  SELECT r.id, r.name, '${entity}' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, ${manufacturer} AS manufacturer, ${model} AS model, ${serial} AS serial_number,
         ${substatus} AS substatus,
         ${RESOURCE_SOURCE_SYSTEM_SQL} AS source_system,
         l.geometry_type, l.geometry
    FROM ${table} r
    JOIN tmf_geographic_location l ON l.id = r.place_id
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
   WHERE r.status <> 'terminated' AND (${where})`;
};

// Ordem dos blocos (e, portanto, dos parâmetros): Physical-ponto, Physical-cabo,
// Logical-ponto, Logical-cabo — ver resourcesInViewport.
const VIEWPORT_RESOURCE_SOURCE = [
  viewportBlock('PhysicalResource', VIEWPORT_POINT_WHERE),
  viewportBlock('PhysicalResource', VIEWPORT_LINE_WHERE),
  viewportBlock('LogicalResource', VIEWPORT_POINT_WHERE),
  viewportBlock('LogicalResource', VIEWPORT_LINE_WHERE),
].join('\n  UNION ALL\n');

// Recursos (physical/logical) por substring de nome — a busca da barra de pesquisa não
// se restringe a um site nem a um bbox, então reusa `viewportBlock` só pela forma das
// colunas, com um WHERE de nome no lugar do de geometria. Um parâmetro por bloco. Sem
// filtro de item interno: Splitter continua encontrável pelo nome (ver `search`).
const SEARCH_NAME_WHERE = `LOWER(r.name) LIKE LOWER(?)`;
const SEARCH_RESOURCE_SOURCE = [
  viewportBlock('PhysicalResource', SEARCH_NAME_WHERE),
  viewportBlock('LogicalResource', SEARCH_NAME_WHERE),
].join('\n  UNION ALL\n');

// Filhos de um recurso: o outro lado das arestas de contenção e conexão. Usada em
// `scope: 'all'` (painel de detalhe) — devolve tudo, Splitter incluso.
const RESOURCE_CHILD_SOURCE = `
  SELECT r.id, r.name, 'PhysicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, r.manufacturer, r.model, r.serial_number,
         ${RESOURCE_SUBSTATUS_SQL} AS substatus,
         ${RESOURCE_SOURCE_SYSTEM_SQL} AS source_system,
         l.geometry_type, l.geometry
    FROM tmf_resource_relationship e
    JOIN tmf_physical_resource r ON r.id = e.resource_to_id
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE e.resource_from_id = ?
     AND e.relationship_type IN ('containsAsChild', 'connectedTo')
  UNION ALL
  SELECT r.id, r.name, 'LogicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, NULL AS manufacturer, NULL AS model, NULL AS serial_number,
         NULL AS substatus,
         ${RESOURCE_SOURCE_SYSTEM_SQL} AS source_system,
         l.geometry_type, l.geometry
    FROM tmf_resource_relationship e
    JOIN tmf_logical_resource r ON r.id = e.resource_to_id
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE e.resource_from_id = ?
     AND e.relationship_type IN ('containsAsChild', 'connectedTo')`;

// Filhos de um recurso em `scope: 'tree'`, com *pass-through* sobre item interno: a CTE
// `hidden_chain` anda a partir do recurso pedido (`?`) e só continua descendo enquanto o
// nó alcançado for Splitter (guarda de profundidade PASS_THROUGH_MAX_DEPTH). A consulta
// principal pega os filhos de QUALQUER id da cadeia (o próprio recurso ou um splitter dela)
// e descarta Splitter do resultado — sobra só o primeiro descendente visível de cada ramo.
const RESOURCE_CHILD_TREE_SOURCE = `
  WITH RECURSIVE hidden_chain(id, depth) AS (
    SELECT CAST(? AS text), 0
    UNION ALL
    SELECT e.resource_to_id, h.depth + 1
      FROM hidden_chain h
      JOIN tmf_resource_relationship e
        ON e.resource_from_id = h.id
       AND e.relationship_type IN ('containsAsChild', 'connectedTo')
     WHERE h.depth < ${PASS_THROUGH_MAX_DEPTH}
       AND EXISTS (
         SELECT 1 FROM tmf_physical_resource p
          WHERE p.id = e.resource_to_id AND p.resource_type = '${INTERNAL_RESOURCE_TYPE}'
       )
  )
  SELECT r.id, r.name, 'PhysicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, r.manufacturer, r.model, r.serial_number,
         ${RESOURCE_SUBSTATUS_SQL} AS substatus,
         ${RESOURCE_SOURCE_SYSTEM_SQL} AS source_system,
         l.geometry_type, l.geometry
    FROM tmf_resource_relationship e
    JOIN tmf_physical_resource r ON r.id = e.resource_to_id
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE e.resource_from_id IN (SELECT id FROM hidden_chain)
     AND e.relationship_type IN ('containsAsChild', 'connectedTo')
     AND r.resource_type IS DISTINCT FROM '${INTERNAL_RESOURCE_TYPE}'
  UNION ALL
  SELECT r.id, r.name, 'LogicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, NULL AS manufacturer, NULL AS model, NULL AS serial_number,
         NULL AS substatus,
         ${RESOURCE_SOURCE_SYSTEM_SQL} AS source_system,
         l.geometry_type, l.geometry
    FROM tmf_resource_relationship e
    JOIN tmf_logical_resource r ON r.id = e.resource_to_id
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE e.resource_from_id IN (SELECT id FROM hidden_chain)
     AND e.relationship_type IN ('containsAsChild', 'connectedTo')
     AND r.resource_type IS DISTINCT FROM '${INTERNAL_RESOURCE_TYPE}'`;

// --------------------------------------------------------------- helpers ----

export const parseNodeId = (nodeId: string): { kind: string; rest: string } => {
  const separator = nodeId.indexOf(':');
  if (separator < 0) return { kind: nodeId, rest: '' };
  return { kind: nodeId.slice(0, separator), rest: nodeId.slice(separator + 1) };
};

const placeholders = (values: unknown[]): string => values.map(() => '?').join(', ');

const splitPair = (rest: string): [string, string] => {
  const parts = rest.split('|');
  return [parts[0] ?? '', parts[1] ?? ''];
};

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

// Ordena empurrando os baldes "Sem …" para o fim: eles são exceção de dado, não
// um lugar de verdade, e não devem abrir a lista.
const sortKeys = (keys: string[]): string[] =>
  [...keys].sort((left, right) => {
    const leftPlaceholder = left.startsWith('Sem ');
    const rightPlaceholder = right.startsWith('Sem ');
    if (leftPlaceholder !== rightPlaceholder) return leftPlaceholder ? 1 : -1;
    return collator.compare(left, right);
  });

const sortRows = (rows: SiteRow[]): SiteRow[] =>
  [...rows].sort((left, right) => collator.compare(left.name, right.name));

const parseGeometry = (raw: string | null): GeoJSONGeometry | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as GeoJSONGeometry;
    return parsed?.type ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
