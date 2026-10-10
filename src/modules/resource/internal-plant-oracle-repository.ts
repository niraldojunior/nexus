import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { ResourceKind, ResourceStatus } from './domain.js';
import type {
  InternalPlantLocationChildrenPage,
  InternalPlantLocationNode,
  InternalPlantLocationRootNode,
  InternalPlantResourcePage,
  InternalPlantResourceQuery,
  InternalPlantResourceRow,
  InternalPlantVisualIdentity,
} from './internal-plant-domain.js';
import type { IInternalPlantRepository } from './internal-plant-repository-interface.js';

const LIKE_ESCAPE = '!';
// Ramificação sintética (não persistida): Sites raiz sem município canônico.
const UNREGISTERED = 'none';

const placeholders = (values: unknown[]): string => values.map(() => '?').join(', ');

// Escapa metacaracteres de LIKE (e o próprio caractere de escape) para busca literal.
export const escapeLike = (value: string): string => value.replace(/[!%_]/g, (char) => `!${char}`);

type PageRow = {
  id: string;
  entity_type: ResourceKind;
  name: string;
  spec_id: string;
  status: ResourceStatus;
  place_id: string | null;
  total?: number | string;
};

type PageOptions = { tenantId: string; limit: number; offset: number };

const toNumber = (value: unknown): number => Number(value ?? 0);

export class OracleInternalPlantRepository implements IInternalPlantRepository {
  public constructor(private readonly db: DatabaseClient) {}

  /**
   * Diretório Brasil/UF/município num único carregamento, lido de `geo_administrative_city`.
   * Lê somente o diretório (tabela pequena, sem tocar em endereços/sites): o custo por
   * município fica para a expansão do nó, que é lazy.
   */
  public async roots(_tenantId: string): Promise<InternalPlantLocationRootNode[]> {
    const cities = await this.db.all<{
      id: string;
      country_code: string;
      country_name: string;
      state_code: string;
      city_name: string;
    }>(
      `SELECT c.id AS id, c.country_code AS country_code, c.country_name AS country_name,
              c.state_code AS state_code, c.city_name AS city_name
         FROM geo_administrative_city c
        ORDER BY c.country_code, c.state_code, c.city_key, c.id`,
    );

    const nodes: InternalPlantLocationRootNode[] = [];
    const countries = new Set<string>();
    const ufs = new Set<string>();
    for (const city of cities) {
      const countryId = `country:${city.country_code}`;
      const ufId = `uf:${city.country_code}|${city.state_code}`;
      if (!countries.has(countryId)) {
        countries.add(countryId);
        nodes.push({
          id: countryId,
          kind: 'country',
          label: city.country_name,
          hasChildren: true,
          parentId: null,
        });
      }
      if (!ufs.has(ufId)) {
        ufs.add(ufId);
        nodes.push({
          id: ufId,
          kind: 'uf',
          label: city.state_code,
          hasChildren: true,
          parentId: countryId,
        });
      }
      nodes.push({
        id: `city:${city.id}`,
        kind: 'city',
        label: city.city_name,
        sublabel: city.state_code,
        hasChildren: true,
        parentId: ufId,
      });
    }
    {
      // Ramo sintético sempre presente: checar se existem Sites sem município custaria uma
      // varredura de milhões de linhas; se estiver vazio, a expansão devolve página vazia.
      const countryId = 'country:BR';
      if (!countries.has(countryId)) {
        nodes.push({
          id: countryId,
          kind: 'country',
          label: 'Brasil',
          hasChildren: true,
          parentId: null,
        });
      }
      nodes.push(
        {
          id: `uf:${UNREGISTERED}`,
          kind: 'uf',
          label: 'Sem UF',
          hasChildren: true,
          parentId: countryId,
        },
        {
          id: `city:${UNREGISTERED}`,
          kind: 'city',
          label: 'Sem município',
          hasChildren: true,
          parentId: `uf:${UNREGISTERED}`,
        },
      );
    }
    return nodes;
  }

  public async children(
    nodeId: string,
    options: PageOptions,
  ): Promise<InternalPlantLocationChildrenPage> {
    const separator = nodeId.indexOf(':');
    const kind = separator < 0 ? '' : nodeId.slice(0, separator);
    const rest = separator < 0 ? '' : nodeId.slice(separator + 1);

    if (kind === 'city') return await this.siteTypes(nodeId, rest, options);
    if (kind === 'site-type') {
      const [cityId = '', specId = ''] = rest.split('|');
      return await this.rootSites(nodeId, cityId, specId, options);
    }
    if (kind === 'site') return await this.subSites(nodeId, rest, options);
    // País e UF vêm completos do diretório (`roots`); nada a expandir no servidor.
    return { nodeId, nodes: [], total: 0, limit: options.limit, offset: options.offset };
  }

  // Predicado do município sobre Sites raiz; `none` = Sites sem município canônico.
  private rootScope(cityId: string, tenantId: string): { sql: string; params: unknown[] } {
    if (cityId === UNREGISTERED) {
      return {
        sql: `s.tenant_id = ? AND s.parent_site_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM tmf_geographic_address a
                               WHERE a.id = s.geographic_address_id AND a.administrative_city_id IS NOT NULL)`,
        params: [tenantId],
      };
    }
    return {
      sql: `s.tenant_id = ? AND s.parent_site_id IS NULL
            AND s.geographic_address_id IN (SELECT a.id FROM tmf_geographic_address a
                                             WHERE a.administrative_city_id = ?)`,
      params: [tenantId, cityId],
    };
  }

  // Município → tipos de Site raiz, com a quantidade de Sites raiz de cada tipo.
  private async siteTypes(
    nodeId: string,
    cityId: string,
    options: PageOptions,
  ): Promise<InternalPlantLocationChildrenPage> {
    const scope = this.rootScope(cityId, options.tenantId);
    const rows = await this.db.all<{
      id: string;
      name: string;
      n: number | string;
      total: number | string;
    }>(
      `SELECT sp.id AS id, sp.name AS name, count(*) AS n, count(*) OVER() AS total
         FROM tmf_geographic_site s
         JOIN tmf_geographic_site_specification sp ON sp.id = s.site_specification_id
        WHERE ${scope.sql}
        GROUP BY sp.id, sp.name
        ORDER BY LOWER(sp.name), sp.id
        LIMIT ? OFFSET ?`,
      [...scope.params, options.limit, options.offset],
    );
    const identities = await this.identityMap(
      options.tenantId,
      rows.map((row) => row.id),
    );
    const nodes: InternalPlantLocationNode[] = rows.map((row) => ({
      id: `site-type:${cityId}|${row.id}`,
      kind: 'site-type',
      label: row.name,
      refId: row.id,
      hasChildren: true,
      childCount: toNumber(row.n),
      ...(identities.has(row.id) ? { visualIdentity: identities.get(row.id)! } : {}),
    }));
    return {
      nodeId,
      nodes,
      total: await this.totalOrFallback(rows[0]?.total, options.offset, rows.length, () =>
        this.scalar(
          `SELECT count(*) AS n FROM (
             SELECT s.site_specification_id FROM tmf_geographic_site s
              WHERE ${scope.sql} GROUP BY s.site_specification_id) g`,
          scope.params,
        ),
      ),
      limit: options.limit,
      offset: options.offset,
    };
  }

  // Tipo de Site → Sites raiz do município com aquela especificação.
  private async rootSites(
    nodeId: string,
    cityId: string,
    specId: string,
    options: PageOptions,
  ): Promise<InternalPlantLocationChildrenPage> {
    const scope = this.rootScope(cityId, options.tenantId);
    const rows = await this.db.all<{
      id: string;
      name: string;
      status: string;
      total: number | string;
    }>(
      `SELECT s.id AS id, s.name AS name, s.status AS status,
              s.site_specification_id AS spec_id, count(*) OVER() AS total
         FROM tmf_geographic_site s
        WHERE ${scope.sql} AND s.site_specification_id = ?
        ORDER BY LOWER(s.name), s.id
        LIMIT ? OFFSET ?`,
      [...scope.params, specId, options.limit, options.offset],
    );
    return {
      nodeId,
      nodes: await this.siteNodes(rows, options.tenantId),
      total: await this.totalOrFallback(rows[0]?.total, options.offset, rows.length, () =>
        this.scalar(
          `SELECT count(*) AS n FROM tmf_geographic_site s
            WHERE ${scope.sql} AND s.site_specification_id = ?`,
          [...scope.params, specId],
        ),
      ),
      limit: options.limit,
      offset: options.offset,
    };
  }

  // Site → filhos imediatos (Sub-Sites). Recursos aparecem só na tabela, nunca na árvore.
  private async subSites(
    nodeId: string,
    siteId: string,
    options: PageOptions,
  ): Promise<InternalPlantLocationChildrenPage> {
    const { tenantId, limit, offset } = options;
    const rows = await this.db.all<{
      id: string;
      name: string;
      status: string;
      total: number | string;
    }>(
      `SELECT id, name, status, site_specification_id AS spec_id, count(*) OVER() AS total
         FROM tmf_geographic_site
        WHERE tenant_id = ? AND parent_site_id = ? AND id <> ?
        ORDER BY LOWER(name), id
        LIMIT ? OFFSET ?`,
      [tenantId, siteId, siteId, limit, offset],
    );
    return {
      nodeId,
      nodes: await this.siteNodes(rows, tenantId),
      total: await this.totalOrFallback(rows[0]?.total, offset, rows.length, () =>
        this.scalar(
          'SELECT count(*) AS n FROM tmf_geographic_site WHERE tenant_id = ? AND parent_site_id = ? AND id <> ?',
          [tenantId, siteId, siteId],
        ),
      ),
      limit,
      offset,
    };
  }

  // hasChildren/childCount em lote (sem N+1): Sub-Sites imediatos de cada site da página.
  private async siteNodes(
    rows: Array<{ id: string; name: string; status: string; spec_id?: string | null }>,
    tenantId: string,
  ): Promise<InternalPlantLocationNode[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const counted = await this.db.all<{ id: string; n: number | string }>(
      `SELECT parent_site_id AS id, count(*) AS n FROM tmf_geographic_site
        WHERE tenant_id = ? AND parent_site_id IN (${placeholders(ids)}) AND id <> parent_site_id
        GROUP BY parent_site_id`,
      [tenantId, ...ids],
    );
    const counts = new Map(counted.map((item) => [item.id, toNumber(item.n)]));
    const identities = await this.identityMap(
      tenantId,
      rows.map((row) => row.spec_id).filter((id): id is string => Boolean(id)),
    );
    return rows.map((row) => {
      const childCount = counts.get(row.id) ?? 0;
      const identity = row.spec_id ? identities.get(row.spec_id) : undefined;
      return {
        id: `site:${row.id}`,
        kind: 'site',
        label: row.name,
        refId: row.id,
        referredType: 'GeographicSite',
        status: row.status,
        hasChildren: childCount > 0,
        childCount,
        ...(row.spec_id ? { siteSpecificationId: row.spec_id } : {}),
        ...(identity ? { visualIdentity: identity } : {}),
      };
    });
  }

  // Ícone configurado no Studio GEO para cada especificação de Site.
  private async identityMap(tenantId: string, specIds: string[]) {
    const ids = [...new Set(specIds)];
    const map = new Map<string, InternalPlantVisualIdentity>();
    if (ids.length === 0) return map;
    const rows = await this.db.all<{
      site_specification_id: string;
      icon_code: string | null;
      icon_asset_id: string | null;
    }>(
      `SELECT site_specification_id, icon_code, icon_asset_id
         FROM tmf_geo_site_spec_visual_identity
        WHERE tenant_id = ? AND site_specification_id IN (${placeholders(ids)})`,
      [tenantId, ...ids],
    );
    for (const row of rows) {
      if (row.icon_code) {
        map.set(row.site_specification_id, { kind: 'system', iconCode: row.icon_code });
      } else if (row.icon_asset_id) {
        map.set(row.site_specification_id, { kind: 'asset', assetId: row.icon_asset_id });
      }
    }
    return map;
  }

  public async listResources(
    query: InternalPlantResourceQuery,
  ): Promise<InternalPlantResourcePage> {
    const { q, offset } = query;
    if (q) {
      const byPrefix = await this.queryResources(query, `${escapeLike(q.toLowerCase())}%`);
      if (byPrefix.total > 0 || offset > 0) return byPrefix;
      // Só quando o prefixo (indexável) não retorna nada, cai para substring escapada.
      return await this.queryResources(query, `%${escapeLike(q.toLowerCase())}%`);
    }
    return await this.queryResources(query, undefined);
  }

  private async queryResources(
    query: InternalPlantResourceQuery,
    likePattern: string | undefined,
  ): Promise<InternalPlantResourcePage> {
    const { tenantId, siteId, resourceTypeIdIn, limit, offset } = query;
    const filters: string[] = ['tenant_id = ?'];
    const filterParams: unknown[] = [tenantId];
    if (likePattern !== undefined) {
      filters.push(`LOWER(name) LIKE ? ESCAPE '${LIKE_ESCAPE}'`);
      filterParams.push(likePattern);
    }
    if (siteId) {
      // Somente o Site selecionado, sem descendentes: `serving_site_id` é o Site onde o recurso
      // está instalado. Recursos internos (porta, splitter) não têm essa coluna — são
      // alcançados pelo recurso que os contém.
      filters.push('serving_site_id = ?');
      filterParams.push(siteId);
    }
    if (resourceTypeIdIn && resourceTypeIdIn.length > 0) {
      filters.push(
        `resource_specification_id IN (SELECT id FROM tmf_resource_specification
           WHERE resource_type_id IN (${placeholders(resourceTypeIdIn)}))`,
      );
      filterParams.push(...resourceTypeIdIn);
    }
    const where = filters.join(' AND ');
    const union = `SELECT u.id, u.entity_type, u.name, u.spec_id, u.status, u.place_id FROM (
        SELECT id, 'PhysicalResource' AS entity_type, name, resource_specification_id AS spec_id, status, serving_site_id AS place_id
          FROM tmf_physical_resource WHERE ${where}
        UNION ALL
        SELECT id, 'LogicalResource' AS entity_type, name, resource_specification_id AS spec_id, status, serving_site_id AS place_id
          FROM tmf_logical_resource WHERE ${where}
      ) u`;
    const unionParams = [...filterParams, ...filterParams];

    const rows = await this.db.all<PageRow>(
      `SELECT p.id, p.entity_type, p.name, p.spec_id, p.status, p.place_id, p.total FROM (
         SELECT x.*, count(*) OVER() AS total FROM (${union}) x
       ) p
       ORDER BY LOWER(p.name), p.entity_type, p.id
       LIMIT ? OFFSET ?`,
      [...unionParams, limit, offset],
    );

    const total = await this.totalOrFallback(rows[0]?.total, offset, rows.length, () =>
      this.scalar(`SELECT count(*) AS n FROM (${union}) c`, unionParams),
    );
    if (rows.length === 0) return { items: [], total, limit, offset };

    const [specs, places] = await Promise.all([
      this.specMap(rows.map((row) => row.spec_id)),
      this.placeMap(rows.map((row) => row.place_id).filter((id): id is string => Boolean(id))),
    ]);
    const items: InternalPlantResourceRow[] = [];
    for (const row of rows) {
      const spec = specs.get(row.spec_id);
      if (!spec) continue;
      const place = row.place_id ? places.get(row.place_id) : undefined;
      items.push({
        id: row.id,
        '@type': row.entity_type,
        name: row.name,
        status: row.status,
        resourceType: spec.type,
        resourceSpecification: { id: row.spec_id, name: spec.name },
        ...(place ? { place: { id: place.id, name: place.name } } : {}),
        ...(place?.uf ? { stateOrProvince: place.uf } : {}),
        ...(place?.city ? { city: place.city } : {}),
      });
    }
    return { items, total, limit, offset };
  }

  private async specMap(specIds: string[]) {
    const ids = [...new Set(specIds)];
    const map = new Map<
      string,
      {
        name: string;
        type: { id: string; code: string; name: string; iconCode?: string; iconAssetId?: string };
      }
    >();
    if (ids.length === 0) return map;
    const rows = await this.db.all<{
      spec_id: string;
      spec_name: string;
      type_id: string;
      type_code: string;
      type_name: string;
      icon_code: string | null;
      icon_asset_id: string | null;
    }>(
      `SELECT rs.id AS spec_id, rs.name AS spec_name, rt.id AS type_id, rt.code AS type_code,
              rt.name AS type_name, rt.icon_code AS icon_code, rt.icon_asset_id AS icon_asset_id
         FROM tmf_resource_specification rs
         JOIN tmf_resource_type rt ON rt.id = rs.resource_type_id
        WHERE rs.id IN (${placeholders(ids)})`,
      ids,
    );
    for (const row of rows) {
      map.set(row.spec_id, {
        name: row.spec_name,
        type: {
          id: row.type_id,
          code: row.type_code,
          name: row.type_name,
          ...(row.icon_code ? { iconCode: row.icon_code } : {}),
          ...(row.icon_asset_id ? { iconAssetId: row.icon_asset_id } : {}),
        },
      });
    }
    return map;
  }

  // UF/Município vêm do diretório, a partir do endereço do Site ou do ancestral mais próximo
  // que tenha endereço vinculado (CONNECT BY NOCYCLE em lote: uma consulta para a página toda).
  private async placeMap(siteIds: string[]) {
    const ids = [...new Set(siteIds)];
    const map = new Map<string, { id: string; name: string; uf?: string; city?: string }>();
    if (ids.length === 0) return map;
    const chain = await this.db.all<{
      root_id: string;
      root_name: string;
      lvl: number | string;
      city_id: string | null;
    }>(
      `SELECT CONNECT_BY_ROOT x.id AS root_id, CONNECT_BY_ROOT x.name AS root_name,
              LEVEL AS lvl, a.administrative_city_id AS city_id
         FROM tmf_geographic_site x
         LEFT JOIN tmf_geographic_address a ON a.id = x.geographic_address_id
        START WITH x.id IN (${placeholders(ids)})
      CONNECT BY NOCYCLE PRIOR x.parent_site_id = x.id`,
      ids,
    );
    const nearest = new Map<string, { name: string; lvl: number; cityId: string }>();
    for (const row of chain) {
      const current = nearest.get(row.root_id);
      const lvl = toNumber(row.lvl);
      if (!current) nearest.set(row.root_id, { name: row.root_name, lvl: Infinity, cityId: '' });
      if (!row.city_id) continue;
      const entry = nearest.get(row.root_id)!;
      if (lvl < entry.lvl)
        nearest.set(row.root_id, { name: row.root_name, lvl, cityId: row.city_id });
    }
    const cityIds = [
      ...new Set([...nearest.values()].map((entry) => entry.cityId).filter(Boolean)),
    ];
    const cities = new Map<string, { uf: string; city: string }>();
    if (cityIds.length > 0) {
      const rows = await this.db.all<{ id: string; state_code: string; city_name: string }>(
        `SELECT id, state_code, city_name FROM geo_administrative_city
          WHERE id IN (${placeholders(cityIds)})`,
        cityIds,
      );
      for (const row of rows) cities.set(row.id, { uf: row.state_code, city: row.city_name });
    }
    for (const [id, entry] of nearest) {
      const city = cities.get(entry.cityId);
      map.set(id, {
        id,
        name: entry.name,
        ...(city ? { uf: city.uf, city: city.city } : {}),
      });
    }
    return map;
  }

  private async scalar(sql: string, params: unknown[]): Promise<number> {
    const row = await this.db.get<{ n: number | string }>(sql, params);
    return toNumber(row?.n);
  }

  // Página vazia além do fim não carrega count(*) OVER(); só nesse caso recontamos.
  private async totalOrFallback(
    windowTotal: number | string | undefined,
    offset: number,
    rowCount: number,
    fallback: () => Promise<number>,
  ): Promise<number> {
    if (rowCount > 0) return toNumber(windowTotal);
    if (offset === 0) return 0;
    return await fallback();
  }
}
