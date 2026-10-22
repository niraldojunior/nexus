/**
 * Gravação no Oracle compartilhada pelos loaders de infraestrutura (seed DEMO, cabos submarinos).
 *
 * Tudo aqui é SQL direto sobre as tabelas que o Nexus já tem — `MERGE` via kit de migração —, sem
 * modelo paralelo. Cada loader passa o próprio namespace UUID v5: os espaços de id ficam disjuntos e
 * reexecutar um loader atualiza as mesmas linhas, nunca duplica.
 */

import oracledb, { type Connection } from 'oracledb';
import { merge, type TablePrefixer } from '../../src/scripts/netwin-migration-kit.js';
import {
  ORIGIN_SYSTEM,
  deterministicUuid,
  type MappedLine,
  type MappedPointSite,
  type MappedPolygon,
} from './mapper.js';

export type ResourceTypeDef = {
  code: string;
  name: string;
  description: string;
  geometryKind: 'POINT' | 'LINE' | 'POLYGON';
};

export type SiteSpecDef = {
  code: string;
  name: string;
  description: string;
};

export type CatalogGroupDef = { code: string; name: string; sortOrder: number };

export async function idByColumns(
  conn: Connection,
  t: TablePrefixer,
  table: string,
  where: Record<string, string>,
): Promise<string | undefined> {
  const keys = Object.keys(where);
  const predicate = keys.map((key, index) => `${key}=:${index + 1}`).join(' AND ');
  const result = await conn.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t(table)} WHERE ${predicate} FETCH FIRST 1 ROWS ONLY`,
    Object.values(where),
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return result.rows?.[0]?.ID;
}

/**
 * Reconcilia uma `GeographicSiteSpecification`.
 *
 * Não usa `ensureSiteSpec` do kit, que grava `name = code` e devolve sem atualizar. O id existente
 * é resolvido antes do MERGE porque `mergeSql` atualiza toda coluna fora da chave: repontar o `id`
 * de uma spec já referenciada quebraria a FK de `geographic_site`.
 */
export async function ensureSiteSpec(
  conn: Connection,
  t: TablePrefixer,
  definition: SiteSpecDef,
  namespace: string,
): Promise<string> {
  const existing = await idByColumns(conn, t, 'geographic_site_specification', {
    code: definition.code,
  });
  const id = existing ?? deterministicUuid(namespace, `SITE_SPEC:${definition.code}`);
  await merge(conn, t, 'geographic_site_specification', ['code'], {
    id,
    name: definition.name,
    code: definition.code,
    // `category:'Site'` é o que o `SITE_SOURCE` do indexador exige para desenhar o ponto;
    // `site_role:'network'` é o eixo funcional de infraestrutura de rede (C11), igual a CO/POP.
    category: 'Site',
    site_role: 'network',
    lifecycle_status: 'Active',
    description: definition.description,
    is_bootstrap: 0,
    // `characteristics` só no INSERT: o MERGE atualiza toda coluna listada, e incluí-la aqui
    // zeraria, a cada reexecução, as definitions configuradas no Studio.
    ...(existing ? {} : { characteristics: '[]' }),
  });
  return id;
}

/**
 * Reconcilia um `ResourceType` com os campos que o mapa exige.
 *
 * Não usa `ensureResourceType` do kit: ele grava só `{id,tenant_id,code,name,status}` e deixaria
 * `geometry_kind` nulo, o que reprova o `materialize` do Studio com
 * `STUDIO_GEO_RESOURCE_GEOMETRY_INVALID`. `map_presence` vai como inteiro `1`, nunca `'true'` —
 * a coluna é `INTEGER` e o JOIN do indexador compara com o literal 1 (ORA-00932 se for texto).
 */
export async function ensureResourceTypeForMap(
  conn: Connection,
  t: TablePrefixer,
  definition: ResourceTypeDef,
  tenantId: string,
  namespace: string,
): Promise<string> {
  const existing = await idByColumns(conn, t, 'resource_type', {
    tenant_id: tenantId,
    code: definition.code,
  });
  const id = existing ?? deterministicUuid(namespace, `RESOURCE_TYPE:${definition.code}`);
  await merge(conn, t, 'resource_type', ['tenant_id', 'code'], {
    id,
    tenant_id: tenantId,
    code: definition.code,
    name: definition.name,
    description: definition.description,
    status: 'active',
    map_presence: 1,
    geometry_kind: definition.geometryKind,
    nature: 'PhysicalResource',
  });
  return id;
}

/** Uma `ResourceSpecification` por type: variações da fonte são characteristic de instância. */
export async function ensureResourceSpec(
  conn: Connection,
  t: TablePrefixer,
  definition: ResourceTypeDef,
  resourceTypeId: string,
  tenantId: string,
  namespace: string,
): Promise<string> {
  const existing = await idByColumns(conn, t, 'resource_specification', {
    tenant_id: tenantId,
    name: definition.name,
    resource_type_id: resourceTypeId,
  });
  const id = existing ?? deterministicUuid(namespace, `RESOURCE_SPEC:${definition.code}`);
  await merge(conn, t, 'resource_specification', ['id'], {
    id,
    tenant_id: tenantId,
    name: definition.name,
    resource_type_id: resourceTypeId,
    description: definition.description,
    ...(existing ? {} : { characteristics: '[]' }),
  });
  return id;
}

/** Resolve o catálogo de recursos padrão do tenant, criando-o se o ambiente ainda não tiver nenhum. */
export async function ensureResourceCatalog(
  conn: Connection,
  t: TablePrefixer,
  tenantId: string,
  namespace: string,
): Promise<string> {
  const preferred = await conn.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('resource_catalog')}
      WHERE tenant_id=:1
      ORDER BY is_default DESC, sort_order ASC
      FETCH FIRST 1 ROWS ONLY`,
    [tenantId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const found = preferred.rows?.[0]?.ID;
  if (found) return found;

  const id = deterministicUuid(namespace, `CATALOG:${tenantId}`);
  await merge(conn, t, 'resource_catalog', ['id'], {
    id,
    tenant_id: tenantId,
    code: 'default-catalog',
    name: 'Catálogo de Recursos',
    description: 'Catálogo principal de recursos de rede',
    status: 'active',
    is_default: 1,
    sort_order: 0,
  });
  return id;
}

/**
 * Um grupo do catálogo de recursos com as folhas dos types — faz a árvore aparecer no Inventário.
 *
 * Nós existentes são pré-mapeados por `code` e por `resource_type_id`: `UNIQUE(tenant_id,
 * catalog_id, code)` e a folha de um type que já tenha nó precisam reusar o id, senão o MERGE por
 * `['id']` tenta inserir um segundo nó para o mesmo código.
 */
export async function ensureCatalogGroup(
  conn: Connection,
  t: TablePrefixer,
  tenantId: string,
  namespace: string,
  group: CatalogGroupDef,
  types: ReadonlyArray<{ code: string; name: string; resourceTypeId: string }>,
): Promise<void> {
  const catalog = await ensureResourceCatalog(conn, t, tenantId, namespace);

  const existing = await conn.execute<{
    ID: string;
    CODE: string;
    RESOURCE_TYPE_ID: string | null;
  }>(
    `SELECT id AS "ID", code AS "CODE", resource_type_id AS "RESOURCE_TYPE_ID"
       FROM ${t('resource_catalog_node')} WHERE tenant_id=:1 AND catalog_id=:2`,
    [tenantId, catalog],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const idByCode = new Map<string, string>();
  const idByTypeId = new Map<string, string>();
  for (const row of existing.rows ?? []) {
    if (row.CODE) idByCode.set(row.CODE, row.ID);
    if (row.RESOURCE_TYPE_ID) idByTypeId.set(row.RESOURCE_TYPE_ID, row.ID);
  }

  const nodeId = (code: string): string =>
    idByCode.get(code) ??
    deterministicUuid(namespace, `CATALOG_NODE:${tenantId}:${catalog}:${code}`);

  const groupId = nodeId(group.code);
  await merge(conn, t, 'resource_catalog_node', ['id'], {
    id: groupId,
    tenant_id: tenantId,
    catalog_id: catalog,
    parent_node_id: null,
    code: group.code,
    name: group.name,
    kind: 'GROUP',
    resource_type_id: null,
    status: 'active',
    sort_order: group.sortOrder,
  });

  let sortOrder = 10;
  for (const type of types) {
    await merge(conn, t, 'resource_catalog_node', ['id'], {
      id: idByTypeId.get(type.resourceTypeId) ?? nodeId(type.code),
      tenant_id: tenantId,
      catalog_id: catalog,
      parent_node_id: groupId,
      code: type.code,
      name: type.name,
      kind: 'RESOURCE_TYPE',
      resource_type_id: type.resourceTypeId,
      status: 'active',
      sort_order: sortOrder,
    });
    sortOrder += 10;
  }
}

// ---------------------------------------------------------------------------
// Instâncias
// ---------------------------------------------------------------------------

export const LOCATION_COLUMNS = [
  'id',
  'tenant_id',
  'geometry_type',
  'geometry',
  'spatial_ref',
  'reference_point',
  'characteristics',
  'source_system',
  'source_ref',
];

export const SITE_COLUMNS = [
  'id',
  'tenant_id',
  'name',
  'site_specification_id',
  'status',
  'geographic_location_id',
  'related_party',
  'characteristics',
];

export const RESOURCE_COLUMNS = [
  'id',
  'tenant_id',
  'name',
  'resource_specification_id',
  'status',
  'place_id',
  'place_type',
  'administrative_state',
  'operational_state',
  'usage_state',
  'related_party',
  'characteristics',
];

/** Quais dos ids já existem — só para separar "Imported" de "Updated" no log. */
export async function existingIds(
  conn: Connection,
  t: TablePrefixer,
  table: string,
  ids: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 900) {
    const chunk = ids.slice(offset, offset + 900);
    const binds = chunk.map((_, index) => `:${index + 1}`).join(',');
    const result = await conn.execute<{ ID: string }>(
      `SELECT id AS "ID" FROM ${t(table)} WHERE id IN (${binds})`,
      [...chunk],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of result.rows ?? []) found.add(row.ID);
  }
  return found;
}

export type LoadPlan = {
  locations: Array<Record<string, unknown>>;
  sites: Array<Record<string, unknown>>;
  resources: Array<Record<string, unknown>>;
};

export const relatedPartyJson = (ownerPartyId: string): string =>
  JSON.stringify([{ id: ownerPartyId, '@referredType': 'Organization' }]);

/**
 * Ponto com sítio: Location → Site e, quando há spec de recurso, Resource.
 *
 * Sem `resourceSpecId` só o Local é gravado — é o caso de um sítio que não abriga equipamento
 * próprio no inventário (ex.: Beach Manhole).
 */
export function pointSiteRows(
  items: readonly MappedPointSite[],
  context: { tenantId: string; ownerPartyId: string; siteSpecId: string; resourceSpecId?: string },
): LoadPlan {
  const plan: LoadPlan = { locations: [], sites: [], resources: [] };
  for (const item of items) {
    const characteristics = JSON.stringify(item.characteristics);
    plan.locations.push({
      id: item.locationId,
      tenant_id: context.tenantId,
      geometry_type: 'Point',
      geometry: JSON.stringify(item.point),
      spatial_ref: 'EPSG:4326',
      reference_point: item.name,
      characteristics,
      source_system: item.originSystem ?? ORIGIN_SYSTEM,
      source_ref: item.sourceId,
    });
    plan.sites.push({
      id: item.siteId,
      tenant_id: context.tenantId,
      name: item.name,
      site_specification_id: context.siteSpecId,
      status: 'Active',
      geographic_location_id: item.locationId,
      related_party: relatedPartyJson(context.ownerPartyId),
      characteristics,
    });
    if (context.resourceSpecId === undefined) continue;
    plan.resources.push({
      id: item.resourceId,
      tenant_id: context.tenantId,
      name: item.name,
      resource_specification_id: context.resourceSpecId,
      status: 'active',
      // `place` sempre aponta para um GeographicSite (C2): o sítio é Geo, o equipamento é Resource.
      place_id: item.siteId,
      place_type: 'GeographicSite',
      administrative_state: 'unlocked',
      operational_state: 'enabled',
      usage_state: 'idle',
      related_party: relatedPartyJson(context.ownerPartyId),
      characteristics,
      // `serial_number` fica nulo de propósito — é UNIQUE global e a fonte não tem número de série.
    });
  }
  return plan;
}

/** Recurso linear (linha de transmissão, duto, cabo): Location → Resource. */
export function lineResourceRows(
  items: readonly MappedLine[],
  context: { tenantId: string; ownerPartyId: string; resourceSpecId: string },
): LoadPlan {
  const plan: LoadPlan = { locations: [], sites: [], resources: [] };
  for (const item of items) {
    const characteristics = JSON.stringify(item.characteristics);
    plan.locations.push({
      id: item.locationId,
      tenant_id: context.tenantId,
      geometry_type: 'LineString',
      // Geometria original e completa — nunca reduzida aos extremos.
      geometry: JSON.stringify(item.line),
      spatial_ref: 'EPSG:4326',
      reference_point: item.name,
      characteristics,
      source_system: item.originSystem ?? ORIGIN_SYSTEM,
      source_ref: item.originId,
    });
    plan.resources.push({
      id: item.resourceId,
      tenant_id: context.tenantId,
      name: item.name,
      resource_specification_id: context.resourceSpecId,
      status: 'active',
      // A linha é um recurso linear: o `place` é a própria Location da rota.
      place_id: item.locationId,
      place_type: 'GeographicLocation',
      administrative_state: 'unlocked',
      operational_state: 'enabled',
      usage_state: 'idle',
      related_party: relatedPartyJson(context.ownerPartyId),
      characteristics,
    });
  }
  return plan;
}

/** Recurso em polígono (campo, bloco): Location → Resource, mesmo desenho do recurso linear. */
export function polygonResourceRows(
  items: readonly MappedPolygon[],
  context: { tenantId: string; ownerPartyId: string; resourceSpecId: string },
): LoadPlan {
  const plan: LoadPlan = { locations: [], sites: [], resources: [] };
  for (const item of items) {
    const characteristics = JSON.stringify(item.characteristics);
    plan.locations.push({
      id: item.locationId,
      tenant_id: context.tenantId,
      geometry_type: 'Polygon',
      geometry: JSON.stringify(item.polygon),
      spatial_ref: 'EPSG:4326',
      reference_point: item.name,
      characteristics,
      source_system: item.originSystem ?? ORIGIN_SYSTEM,
      source_ref: item.originId,
    });
    plan.resources.push({
      id: item.resourceId,
      tenant_id: context.tenantId,
      name: item.name,
      resource_specification_id: context.resourceSpecId,
      status: 'active',
      place_id: item.locationId,
      place_type: 'GeographicLocation',
      administrative_state: 'unlocked',
      operational_state: 'enabled',
      usage_state: 'idle',
      related_party: relatedPartyJson(context.ownerPartyId),
      characteristics,
    });
  }
  return plan;
}

/**
 * Resolve o tenant e a party dona a partir do próprio namespace.
 *
 * `environment.tenant_id` é o tenant que o provisionador gravou ao criar o ambiente — o mesmo
 * que o token da sessão carrega. Um default fixo `'default'` gravaria dados que nenhuma tela lê: os
 * ambientes provisionados registram `vtal`, e `resource_type` tem linhas em **ambos** os tenants,
 * então nem a presença de catálogo distingue um do outro. As flags só entram como override explícito.
 *
 * Também confere que a party dona existe: sem ela, `related_party` referenciaria uma Organization
 * inexistente e os painéis mostrariam o dono em branco em todo recurso carregado.
 */
export async function resolveTenant(
  conn: Connection,
  t: TablePrefixer,
  options: { tenantId?: string | undefined; ownerPartyId?: string | undefined },
): Promise<{ tenantId: string; ownerPartyId: string }> {
  let tenantId = options.tenantId;
  if (!tenantId) {
    const environment = await conn.execute<{ TENANT_ID: string | null }>(
      `SELECT tenant_id AS "TENANT_ID" FROM ${t('environment')}
        WHERE tenant_id IS NOT NULL FETCH FIRST 1 ROWS ONLY`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    tenantId = environment.rows?.[0]?.TENANT_ID ?? undefined;
  }
  if (!tenantId) {
    throw new Error(
      `Não foi possível resolver o tenant: ${t('environment')} não tem linha com tenant_id. ` +
        'Informe --tenant-id explicitamente.',
    );
  }
  const ownerPartyId = options.ownerPartyId ?? tenantId;
  const party = await conn.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('party')} WHERE id=:1`,
    [ownerPartyId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (!party.rows?.[0]) {
    throw new Error(
      `Party "${ownerPartyId}" não existe em ${t('party')}. ` +
        'Informe --owner-party-id de uma Organization existente (normalmente o próprio tenant).',
    );
  }
  return { tenantId, ownerPartyId };
}
