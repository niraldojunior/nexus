import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { ResourceKind, ResourceStatus } from './domain.js';
import type {
  InternalPlantLocationChildrenPage,
  InternalPlantLocationNode,
  InternalPlantLocationRootNode,
  InternalPlantResourcePage,
  InternalPlantResourceQuery,
  InternalPlantResourceRow,
  InternalPlantSiteContext,
  InternalPlantSitePage,
  InternalPlantSiteQuery,
  InternalPlantSiteRow,
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
  status_code?: string | null;
  place_id: string | null;
  total?: number | string;
};

type PageOptions = { tenantId: string; limit: number; offset: number };

const toNumber = (value: unknown): number => Number(value ?? 0);

export class OracleInternalPlantRepository implements IInternalPlantRepository {
  public constructor(private readonly db: DatabaseClient) {}

  /**
   * Diretório Brasil/UF/município num único carregamento, lido de `geographic_administrative_city`.
   * Lê somente o diretório (tabela pequena, sem tocar em endereços/sites): o custo por
   * município fica para a expansão do nó, que é lazy.
   */
  public async roots(tenantId: string): Promise<InternalPlantLocationRootNode[]> {
    const cities = await this.db.all<{
      id: string;
      country_code: string;
      country_name: string;
      state_code: string;
      city_name: string;
    }>(
      `SELECT c.id AS id, c.country_code AS country_code, c.country_name AS country_name,
              c.state_code AS state_code, c.city_name AS city_name
         FROM geographic_administrative_city c
         JOIN geographic_administrative_city_tenant k
           ON k.administrative_city_id = c.id AND k.tenant_id = ? AND k.active_site_count > 0
        ORDER BY c.country_code, c.state_code, c.city_key, c.id`,
      [tenantId],
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
    // Ramo sintético só quando o tenant tem Site raiz ativo sem município (existência, não contagem).
    const withoutCity = await this.scalar(
      `SELECT count(*) AS n FROM (
         SELECT 1 FROM geographic_site
          WHERE tenant_id = ? AND administrative_city_id IS NULL
            AND parent_site_id IS NULL AND status <> 'Retired'
          FETCH FIRST 1 ROWS ONLY)`,
      [tenantId],
    );
    if (withoutCity > 0) {
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

  // Predicado do município sobre Sites raiz; `none` = Sites sem município. O município é uma
  // coluna do Site (issue #339): igualdade direta, resolvida por (tenant_id, administrative_city_id).
  private rootScope(cityId: string, tenantId: string): { sql: string; params: unknown[] } {
    if (cityId === UNREGISTERED) {
      return {
        sql: `s.tenant_id = ? AND s.administrative_city_id IS NULL
              AND s.parent_site_id IS NULL AND s.status <> 'Retired'`,
        params: [tenantId],
      };
    }
    return {
      sql: `s.tenant_id = ? AND s.administrative_city_id = ?
            AND s.parent_site_id IS NULL AND s.status <> 'Retired'`,
      params: [tenantId, cityId],
    };
  }

  public async getSiteContext(
    siteId: string,
    tenantId: string,
  ): Promise<InternalPlantSiteContext | undefined> {
    const rows = await this.db.all<{
      id: string;
      name: string;
      specification_name: string;
      site_specification_id: string;
      geographic_address_id: string | null;
      street_type: string | null;
      street_name: string | null;
      street_nr: string | null;
      locality: string | null;
      city: string | null;
      state_or_province: string | null;
      postcode: string | null;
      lvl: number | string;
      administrative_city_id: string | null;
      country_code: string | null;
      state_code: string | null;
    }>(
      `SELECT x.id, x.name, sp.name AS specification_name,
              x.site_specification_id AS site_specification_id, x.geographic_address_id,
              a.street_type, a.street_name, a.street_nr, a.locality, a.city,
              a.state_or_province, a.postcode, LEVEL AS lvl,
              x.administrative_city_id AS administrative_city_id,
              ac.country_code AS country_code, ac.state_code AS state_code
         FROM geographic_site x
         JOIN geographic_site_specification sp ON sp.id = x.site_specification_id
         LEFT JOIN geographic_address a ON a.id = x.geographic_address_id
         LEFT JOIN geographic_administrative_city ac ON ac.id = x.administrative_city_id
        START WITH x.id = ? AND x.tenant_id = ? AND x.status <> 'Retired'
      CONNECT BY NOCYCLE PRIOR x.parent_site_id = x.id
        ORDER BY LEVEL DESC`,
      [siteId, tenantId],
    );
    const selected = rows[rows.length - 1];
    if (!selected) return undefined;
    const hierarchy = rows.map((row) => ({
      id: row.id,
      name: row.name,
      specificationName: row.specification_name,
    }));
    const address = [
      selected.street_type,
      selected.street_name,
      selected.street_nr,
      selected.locality,
      selected.city,
      selected.state_or_province,
      selected.postcode,
    ].some(Boolean)
      ? {
          ...(selected.street_type ? { streetType: selected.street_type } : {}),
          ...(selected.street_name ? { streetName: selected.street_name } : {}),
          ...(selected.street_nr ? { streetNr: selected.street_nr } : {}),
          ...(selected.locality ? { locality: selected.locality } : {}),
          ...(selected.city ? { city: selected.city } : {}),
          ...(selected.state_or_province ? { stateOrProvince: selected.state_or_province } : {}),
          ...(selected.postcode ? { postcode: selected.postcode } : {}),
        }
      : undefined;
    const visualIdentity = (await this.identityMap(tenantId, [selected.site_specification_id])).get(
      selected.site_specification_id,
    );
    // Caminho na árvore de Locais: o Site raiz define município e tipo (ver `rootScope`).
    const root = rows[0]!;
    const hasCity = Boolean(root.administrative_city_id && root.country_code && root.state_code);
    const cityKey = hasCity ? root.administrative_city_id! : UNREGISTERED;
    const treePath = [
      hasCity ? `country:${root.country_code}` : 'country:BR',
      hasCity ? `uf:${root.country_code}|${root.state_code}` : `uf:${UNREGISTERED}`,
      `city:${cityKey}`,
      `site-type:${cityKey}|${root.site_specification_id}`,
      ...rows.map((row) => `site:${row.id}`),
    ];
    return {
      site: {
        ...hierarchy[hierarchy.length - 1]!,
        ...(visualIdentity ? { visualIdentity } : {}),
      },
      hierarchy,
      ...(address ? { address } : {}),
      treePath,
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
         FROM geographic_site s
         JOIN geographic_site_specification sp ON sp.id = s.site_specification_id
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
             SELECT s.site_specification_id FROM geographic_site s
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
         FROM geographic_site s
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
          `SELECT count(*) AS n FROM geographic_site s
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
         FROM geographic_site
        WHERE tenant_id = ? AND parent_site_id = ? AND id <> ? AND status <> 'Retired'
        ORDER BY LOWER(name), id
        LIMIT ? OFFSET ?`,
      [tenantId, siteId, siteId, limit, offset],
    );
    return {
      nodeId,
      nodes: await this.siteNodes(rows, tenantId),
      total: await this.totalOrFallback(rows[0]?.total, offset, rows.length, () =>
        this.scalar(
          "SELECT count(*) AS n FROM geographic_site WHERE tenant_id = ? AND parent_site_id = ? AND id <> ? AND status <> 'Retired'",
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
      `SELECT parent_site_id AS id, count(*) AS n FROM geographic_site
        WHERE tenant_id = ? AND parent_site_id IN (${placeholders(ids)}) AND id <> parent_site_id AND status <> 'Retired'
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
         FROM geographic_site_spec_visual_identity
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

  // Busca de Sites por nome: prefixo (indexável) primeiro; sem resultado, cai para substring.
  public async listSites(query: InternalPlantSiteQuery): Promise<InternalPlantSitePage> {
    const q = escapeLike(query.q.toLowerCase());
    const byPrefix = await this.querySites(query, `${q}%`);
    if (byPrefix.total > 0 || query.offset > 0) return byPrefix;
    return await this.querySites(query, `%${q}%`);
  }

  private async querySites(
    query: InternalPlantSiteQuery,
    likePattern: string,
  ): Promise<InternalPlantSitePage> {
    const { tenantId, limit, offset } = query;
    const where = `tenant_id = ? AND status <> 'Retired' AND LOWER(name) LIKE ? ESCAPE '${LIKE_ESCAPE}'`;
    const rows = await this.db.all<{
      id: string;
      name: string;
      status: string;
      spec_id: string;
      spec_name: string;
      street_type: string | null;
      street_name: string | null;
      street_nr: string | null;
      locality: string | null;
      city: string | null;
      state_or_province: string | null;
      postcode: string | null;
      total: number | string;
    }>(
      `SELECT p.id, p.name, p.status, p.spec_id, sp.name AS spec_name, p.total,
              a.street_type, a.street_name, a.street_nr, a.locality, a.city,
              a.state_or_province, a.postcode
         FROM (
           SELECT id, name, status, site_specification_id AS spec_id, geographic_address_id,
                  count(*) OVER() AS total
             FROM geographic_site
            WHERE ${where}
            ORDER BY LOWER(name), id
            LIMIT ? OFFSET ?
         ) p
         JOIN geographic_site_specification sp ON sp.id = p.spec_id
         LEFT JOIN geographic_address a ON a.id = p.geographic_address_id
        ORDER BY LOWER(p.name), p.id`,
      [tenantId, likePattern, limit, offset],
    );
    const total = await this.totalOrFallback(rows[0]?.total, offset, rows.length, () =>
      this.scalar(`SELECT count(*) AS n FROM geographic_site WHERE ${where}`, [
        tenantId,
        likePattern,
      ]),
    );
    if (rows.length === 0) return { items: [], total, limit, offset };

    const [identities, cities] = await Promise.all([
      this.identityMap(
        tenantId,
        rows.map((row) => row.spec_id),
      ),
      this.rootCityMap(
        tenantId,
        rows.map((row) => row.id),
      ),
    ]);
    const items: InternalPlantSiteRow[] = rows.map((row) => {
      const identity = identities.get(row.spec_id);
      const address = [
        [row.street_type, row.street_name].filter(Boolean).join(' '),
        row.street_nr ? `nº ${row.street_nr}` : '',
        row.locality,
        row.city,
        row.state_or_province,
        row.postcode,
      ]
        .filter(Boolean)
        .join(', ');
      const location = cities.get(row.id);
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        siteSpecification: { id: row.spec_id, name: row.spec_name },
        ...(identity ? { visualIdentity: identity } : {}),
        ...(address ? { address } : {}),
        ...(location?.stateOrProvince ? { stateOrProvince: location.stateOrProvince } : {}),
        ...(location?.city ? { city: location.city } : {}),
      };
    });
    return { items, total, limit, offset };
  }

  // Município do Site raiz da cadeia de cada Site (Sub-Sites herdam o município da raiz).
  private async rootCityMap(tenantId: string, siteIds: string[]) {
    const ids = [...new Set(siteIds)];
    const map = new Map<string, { stateOrProvince?: string; city?: string }>();
    if (ids.length === 0) return map;
    const rows = await this.db.all<{
      site_id: string;
      state_code: string | null;
      city_name: string | null;
    }>(
      `SELECT r.site_id AS site_id, c.state_code AS state_code, c.city_name AS city_name
         FROM (
           SELECT CONNECT_BY_ROOT x.id AS site_id, x.administrative_city_id AS city_id,
                  x.parent_site_id AS parent_site_id
             FROM geographic_site x
            START WITH x.tenant_id = ? AND x.id IN (${placeholders(ids)})
          CONNECT BY NOCYCLE x.id = PRIOR x.parent_site_id
         ) r
         JOIN geographic_administrative_city c ON c.id = r.city_id
        WHERE r.parent_site_id IS NULL`,
      [tenantId, ...ids],
    );
    for (const row of rows) {
      map.set(row.site_id, {
        ...(row.state_code ? { stateOrProvince: row.state_code } : {}),
        ...(row.city_name ? { city: row.city_name } : {}),
      });
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
    const filters: string[] = ['tenant_id = ?', "status <> 'terminated'"];
    const filterParams: unknown[] = [tenantId];
    if (likePattern !== undefined) {
      filters.push(`LOWER(name) LIKE ? ESCAPE '${LIKE_ESCAPE}'`);
      filterParams.push(likePattern);
    }
    if (siteId) {
      // Somente o Site selecionado, sem descendentes: `place_id` é o GeographicSite onde o recurso
      // está instalado (C2). `serving_site_id` é a estação abastecedora — conceito distinto, que
      // pode ser outro Site. Recursos internos (porta, splitter) não têm `place_id` — são
      // alcançados pelo recurso que os contém.
      filters.push('place_id = ?');
      filterParams.push(siteId);
    }
    if (resourceTypeIdIn && resourceTypeIdIn.length > 0) {
      filters.push(
        `resource_specification_id IN (SELECT id FROM resource_specification
           WHERE resource_type_id IN (${placeholders(resourceTypeIdIn)}))`,
      );
      filterParams.push(...resourceTypeIdIn);
    }
    const where = filters.join(' AND ');
    const union = `SELECT u.id, u.entity_type, u.name, u.spec_id, u.status, u.status_code, u.place_id FROM (
        SELECT id, 'PhysicalResource' AS entity_type, name, resource_specification_id AS spec_id, status, status_code, place_id
          FROM resource_physical WHERE ${where}
        UNION ALL
        SELECT id, 'LogicalResource' AS entity_type, name, resource_specification_id AS spec_id, status, CAST(NULL AS VARCHAR(100)) AS status_code, place_id
          FROM resource_logical WHERE ${where}
      ) u`;
    const unionParams = [...filterParams, ...filterParams];

    const rows = await this.db.all<PageRow>(
      `SELECT p.id, p.entity_type, p.name, p.spec_id, p.status, p.status_code, p.place_id, p.total FROM (
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

    const [specs, placeAdministrativeLocations] = await Promise.all([
      this.specMap(rows.map((row) => row.spec_id)),
      this.placeAdministrativeLocationMap(
        tenantId,
        rows.flatMap((row) => (row.place_id ? [row.place_id] : [])),
      ),
    ]);
    const items: InternalPlantResourceRow[] = [];
    for (const row of rows) {
      const spec = specs.get(row.spec_id);
      if (!spec) continue;
      const location = row.place_id ? placeAdministrativeLocations.get(row.place_id) : undefined;
      items.push({
        id: row.id,
        '@type': row.entity_type,
        name: row.name,
        status: row.status,
        ...(row.status_code ? { statusCode: row.status_code } : {}),
        resourceType: spec.type,
        resourceSpecification: {
          id: row.spec_id,
          name: spec.name,
          ...(spec.manufacturer ? { manufacturer: spec.manufacturer } : {}),
        },
        ...(location?.stateOrProvince ? { stateOrProvince: location.stateOrProvince } : {}),
        ...(location?.city ? { city: location.city } : {}),
      });
    }
    return { items, total, limit, offset };
  }

  private async placeAdministrativeLocationMap(tenantId: string, placeIds: string[]) {
    const ids = [...new Set(placeIds)];
    const locations = new Map<string, { stateOrProvince?: string; city?: string }>();
    if (ids.length === 0) return locations;
    const rows = await this.db.all<{
      id: string;
      state_code: string | null;
      city_name: string | null;
    }>(
      `SELECT s.id, c.state_code, c.city_name
         FROM geographic_site s
         JOIN geographic_administrative_city c ON c.id = s.administrative_city_id
        WHERE s.tenant_id = ? AND s.id IN (${placeholders(ids)})`,
      [tenantId, ...ids],
    );
    for (const row of rows) {
      locations.set(row.id, {
        ...(row.state_code ? { stateOrProvince: row.state_code } : {}),
        ...(row.city_name ? { city: row.city_name } : {}),
      });
    }
    return locations;
  }

  private async specMap(specIds: string[]) {
    const ids = [...new Set(specIds)];
    const map = new Map<
      string,
      {
        name: string;
        manufacturer?: { id: string; name?: string };
        type: { id: string; code: string; name: string; iconCode?: string; iconAssetId?: string };
      }
    >();
    if (ids.length === 0) return map;
    const rows = await this.db.all<{
      spec_id: string;
      spec_name: string;
      related_party: string | null;
      type_id: string;
      type_code: string;
      type_name: string;
      icon_code: string | null;
      icon_asset_id: string | null;
    }>(
      `SELECT rs.id AS spec_id, rs.name AS spec_name, rs.related_party AS related_party,
              rt.id AS type_id, rt.code AS type_code, rt.name AS type_name,
              rt.icon_code AS icon_code, rt.icon_asset_id AS icon_asset_id
         FROM resource_specification rs
         JOIN resource_type rt ON rt.id = rs.resource_type_id
        WHERE rs.id IN (${placeholders(ids)})`,
      ids,
    );
    for (const row of rows) {
      const relatedParty = JSON.parse(row.related_party || '[]') as Array<{
        id: string;
        name?: string;
        role?: string;
      }>;
      const manufacturer = relatedParty.find((party) => party.role === 'manufacturer');
      map.set(row.spec_id, {
        name: row.spec_name,
        ...(manufacturer
          ? {
              manufacturer: {
                id: manufacturer.id,
                ...(manufacturer.name ? { name: manufacturer.name } : {}),
              },
            }
          : {}),
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
