// Read-model da árvore de navegação do módulo Geo (sidebar Hierarquia).
//
//   UF → Município → Estações → Estação → (sub-local | recurso) → recurso → …
//
// Existe separado de `GeoService`/`IGeoRepository` de propósito: a consulta cruza
// os módulos Geo (Site/Address/Location) e Resource (planta e grafo de
// relacionamentos), e é uma projeção de leitura — não faz parte do contrato TMF de
// nenhum dos dois. Por isso fala com o `PostgresDatabase` direto, como os demais
// `Postgres*Repository`, e o `GeoRepository` em memória dos testes unitários não
// precisa implementá-la.
//
// A regra que rege tudo aqui é: **um nível por chamada**. A árvore inteira tem
// dezenas de milhares de recursos; a UI só pede os filhos diretos do nó que o
// usuário expandiu, e `hasChildren` sai de um EXISTS para o "+" custar barato.

import type { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import type { GeoJSONGeometry } from './domain.js';

export type GeoTreeNodeKind = 'uf' | 'city' | 'group' | 'site' | 'resource';

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

const SEM_UF = 'Sem UF';
const SEM_MUNICIPIO = 'Sem município';
const GROUP_STATIONS = 'stations';

export const DEFAULT_TREE_PAGE_SIZE = 500;
const MAX_TREE_PAGE_SIZE = 2000;

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
  geometry_type: string | null;
  geometry: string | null;
};

export class GeoTreeService {
  public constructor(private readonly db: PostgresDatabase) {}

  /**
   * Abertura da página: UF → Município → pasta Estações → Estação, de uma vez.
   * São poucas dezenas de nós e é exatamente o que o mapa desenha na abertura —
   * pedir isso em quatro idas ao servidor só adicionaria latência. Vem em lista
   * plana com `parentId`, para o cliente indexar sem recursão.
   */
  public roots(): Array<GeoTreeNode & { parentId: string | null }> {
    const stations = this.listStationRows();

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

  public children(nodeId: string, options: { limit?: number; offset?: number } = {}): GeoTreeChildrenPage {
    const limit = clamp(options.limit ?? DEFAULT_TREE_PAGE_SIZE, 1, MAX_TREE_PAGE_SIZE);
    const offset = Math.max(0, options.offset ?? 0);
    const parsed = parseNodeId(nodeId);

    const page = ((): { nodes: GeoTreeNode[]; total: number } => {
      switch (parsed.kind) {
        case 'uf':
          return this.citiesOfUf(parsed.rest);
        case 'city':
          return this.groupsOfCity(parsed.rest);
        case 'group':
          return this.stationsOfGroup(parsed.rest, limit, offset);
        case 'site':
          return this.childrenOfSite(parsed.rest, limit, offset);
        case 'resource':
          return this.childrenOfResource(parsed.rest, limit, offset);
        default:
          return { nodes: [], total: 0 };
      }
    })();

    return { nodeId, nodes: page.nodes, total: page.total, offset, limit };
  }

  // ------------------------------------------------------------- níveis geo ---

  private citiesOfUf(uf: string): { nodes: GeoTreeNode[]; total: number } {
    const stations = this.listStationRows().filter((row) => (row.uf?.trim() || SEM_UF) === uf);
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

  private groupsOfCity(rest: string): { nodes: GeoTreeNode[]; total: number } {
    const [uf, city] = splitPair(rest);
    const stations = this.listStationRows().filter(
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

  private stationsOfGroup(rest: string, limit: number, offset: number): { nodes: GeoTreeNode[]; total: number } {
    const [uf, city] = splitPair(rest);
    const all = sortRows(
      this.listStationRows().filter(
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
   */
  private childrenOfSite(siteId: string, limit: number, offset: number): { nodes: GeoTreeNode[]; total: number } {
    const site = this.db.get<{ id: string; geographic_location_id: string | null }>(
      'SELECT id, geographic_location_id FROM tmf_geographic_site WHERE id = ?',
      [siteId],
    );
    if (!site) return { nodes: [], total: 0 };

    const subSites = this.db.all<SiteRow>(
      `${SITE_SELECT}
       WHERE s.parent_site_id = ? AND s.status <> 'terminated'
       ORDER BY s.name`,
      [siteId],
    );

    const resourceParams = [siteId, site.geographic_location_id ?? '', siteId];
    const total =
      subSites.length +
      (this.db.get<{ n: number }>(
        `SELECT count(*) AS n FROM (${SITE_RESOURCE_SOURCE}) AS t`,
        [...resourceParams, ...resourceParams],
      )?.n ?? 0);

    // Sub-locais primeiro (o interior do local), depois a planta. A janela de
    // paginação atravessa os dois grupos, por isso o offset desconta os sites.
    const siteSlice = subSites.slice(offset, offset + limit);
    const resourceOffset = Math.max(0, offset - subSites.length);
    const resourceLimit = limit - siteSlice.length;

    const nodes: GeoTreeNode[] = [];
    if (siteSlice.length > 0) {
      const withChildren = this.sitesWithChildren(siteSlice);
      for (const row of siteSlice) {
        nodes.push(this.toSiteNode(row, { hasChildren: withChildren.has(row.id) }));
      }
    }

    if (resourceLimit > 0) {
      const rows = this.db.all<ResourceRow>(
        `SELECT * FROM (${SITE_RESOURCE_SOURCE}) AS t ORDER BY name, id LIMIT ? OFFSET ?`,
        [...resourceParams, ...resourceParams, resourceLimit, resourceOffset],
      );
      nodes.push(...this.toResourceNodes(rows));
    }

    return { nodes, total };
  }

  // -------------------------------------------------- filhos de um Recurso ---

  private childrenOfResource(resourceId: string, limit: number, offset: number): { nodes: GeoTreeNode[]; total: number } {
    const total =
      this.db.get<{ n: number }>(
        `SELECT count(*) AS n FROM (${RESOURCE_CHILD_SOURCE}) AS t`,
        [resourceId, resourceId],
      )?.n ?? 0;

    const rows = this.db.all<ResourceRow>(
      `SELECT * FROM (${RESOURCE_CHILD_SOURCE}) AS t ORDER BY name, id LIMIT ? OFFSET ?`,
      [resourceId, resourceId, limit, offset],
    );

    return { nodes: this.toResourceNodes(rows), total };
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

  private toResourceNodes(rows: ResourceRow[]): GeoTreeNode[] {
    const childCounts = this.countResourceChildren(rows.map((row) => row.id));

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
      if (Object.keys(detail).length > 0) node.detail = detail;
      return node;
    });
  }

  // ------------------------------------------------------------ consultas ---

  // Estação = GeographicSite de categoria 'Site' (Região é caminho, Sub-local é
  // interior). UF/Município saem do endereço da própria estação; sem endereço,
  // ela cai nos baldes "Sem …" em vez de sumir da navegação.
  private listStationRows(): SiteRow[] {
    return this.db.all<SiteRow>(
      `${SITE_SELECT}
       WHERE sp.category = 'Site' AND s.status <> 'terminated'
       ORDER BY s.name`,
    );
  }

  /**
   * Quais destes locais têm ao menos um filho — é o que decide o "+" na árvore.
   * Responde a página inteira em três consultas (uma por forma de filiação), e
   * não uma por local: uma estação com 12 salas não pode custar 24 idas ao banco.
   */
  private sitesWithChildren(sites: SiteRow[]): Set<string> {
    const withChildren = new Set<string>();
    if (sites.length === 0) return withChildren;

    const siteIds = sites.map((site) => site.id);
    const siteByLocationId = new Map<string, string>();
    for (const site of sites) {
      if (site.geographic_location_id) siteByLocationId.set(site.geographic_location_id, site.id);
    }

    // (1) sub-locais
    for (const row of this.db.all<{ id: string }>(
      `SELECT DISTINCT parent_site_id AS id FROM tmf_geographic_site
        WHERE parent_site_id IN (${placeholders(siteIds)}) AND status <> 'terminated'`,
      siteIds,
    )) {
      withChildren.add(row.id);
    }

    // (2) recursos cujo place é o próprio local ou a Location dele
    const placeIds = [...siteIds, ...siteByLocationId.keys()];
    for (const row of this.db.all<{ id: string }>(
      `SELECT DISTINCT place_id AS id FROM tmf_physical_resource WHERE place_id IN (${placeholders(placeIds)})
       UNION
       SELECT DISTINCT place_id AS id FROM tmf_logical_resource WHERE place_id IN (${placeholders(placeIds)})`,
      [...placeIds, ...placeIds],
    )) {
      withChildren.add(siteByLocationId.get(row.id) ?? row.id);
    }

    // (3) planta externa da estação que ainda não pende de outro recurso
    for (const row of this.db.all<{ id: string }>(
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

  private countResourceChildren(resourceIds: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    if (resourceIds.length === 0) return counts;
    const rows = this.db.all<{ resource_from_id: string; n: number }>(
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

const SITE_RESOURCE_SOURCE = `
  SELECT r.id, r.name, 'PhysicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, r.manufacturer, r.model, r.serial_number,
         l.geometry_type, l.geometry
    FROM tmf_physical_resource r
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE ${RESOURCE_AT_SITE_WHERE}
  UNION ALL
  SELECT r.id, r.name, 'LogicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, NULL AS manufacturer, NULL AS model, NULL AS serial_number,
         l.geometry_type, l.geometry
    FROM tmf_logical_resource r
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE ${RESOURCE_AT_SITE_WHERE}`;

// Filhos de um recurso: o outro lado das arestas de contenção e conexão.
const RESOURCE_CHILD_SOURCE = `
  SELECT r.id, r.name, 'PhysicalResource' AS entity_type, r.resource_type, r.status,
         rs.name AS spec_name, r.manufacturer, r.model, r.serial_number,
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
         l.geometry_type, l.geometry
    FROM tmf_resource_relationship e
    JOIN tmf_logical_resource r ON r.id = e.resource_to_id
    LEFT JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    LEFT JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE e.resource_from_id = ?
     AND e.relationship_type IN ('containsAsChild', 'connectedTo')`;

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
