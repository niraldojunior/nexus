#!/usr/bin/env node
/**
 * Seed de infraestrutura pública na instância Nexus DEMO — Energia (ANEEL SIGEL).
 *
 * Baixa subestações e linhas de transmissão reais do serviço ArcGIS público do SIGEL, restringe a
 * UFs (default RJ+SP) e grava subestações, linhas e sistemas isolados no modelo que o Nexus já tem:
 * `GeographicSiteSpecification` + `ResourceType` + `ResourceSpecification` no catálogo, e
 * `GeographicLocation` / `GeographicSite` / `PhysicalResource` nas instâncias. Nada de modelo paralelo,
 * nada de coluna nova: atributos da fonte e UF entram como `characteristic` de instância (C1), e a
 * procedência como `_origin.*` (C5).
 *
 * Uso:
 *   npm run seed-demo-infra -- --limit 20                  # ensaio (dry-run), não grava
 *   npm run seed-demo-infra -- --apply --states RJ,SP      # carga real
 *   npm run seed-demo-infra -- --apply --build-features    # carga + índice de tiles do mapa
 *
 * Escreve por SQL direto (padrão dos loaders do repo) e não pelo `ResourceService`: o guarda
 * `assertOriginWriteAllowed` rejeita `_origin.*` sem `MIGRATION_ROLE`, e `_origin` é requisito da
 * entrega. A única exceção é a fase 5, que publica o catálogo do Studio GEO pelo serviço de domínio
 * para herdar a validação do adapter.
 *
 * Ambiente: `ORACLE_CONNECTION_STRING`, `ORACLE_USER`, `ORACLE_PASSWORD` e `ORACLE_OBJECT_PREFIX`
 * (ex.: `NX_DEMO_`) no `.env`. Oracle-only (C10).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import oracledb, { type Connection } from 'oracledb';
import {
  bulkMergeRows,
  configureOracleClient,
  makeTablePrefixer,
  merge,
  type TablePrefixer,
} from '../../src/scripts/netwin-migration-kit.js';
import { loadConfig } from '../../src/shared/config/env.js';
import { createDatabaseClient } from '../../src/shared/persistence/database-factory.js';
import { createNexusRuntime } from '../../src/shared/runtime/nexus-runtime.js';
import { parseCliArgs, type CliOptions } from './cli.js';
import {
  ISOLATED_SYSTEM_LAYER_ID,
  SUBSTATION_LAYER_ID,
  TRANSMISSION_LINE_LAYER_ID,
  countFeatures,
  fetchLayerFeatures,
} from './aneel.js';
import {
  IBGE_GAS_PIPELINE_LAYER,
  IBGE_RAIL_SEGMENT_LAYER,
  IBGE_RAIL_STATION_LAYER,
  countIbgeFeatures,
  fetchIbgeFeatures,
} from './ibge.js';
import { enrichGasPipelines, fetchAnpGasAuthorizations } from './anp.js';
import {
  DEMO_INFRA_NAMESPACE,
  GAS_PIPELINE_RESOURCE_TYPE_CODE,
  ISOLATED_SYSTEM_RESOURCE_TYPE_CODE,
  ISOLATED_SYSTEM_SITE_SPEC_CODE,
  ORIGIN_SYSTEM,
  RAIL_SEGMENT_RESOURCE_TYPE_CODE,
  RAIL_STATION_RESOURCE_TYPE_CODE,
  RAIL_STATION_SITE_SPEC_CODE,
  SUBSTATION_RESOURCE_TYPE_CODE,
  SUBSTATION_SITE_SPEC_CODE,
  TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
  bboxForStates,
  dedupeById,
  deterministicUuid,
  mapGasPipeline,
  mapIsolatedSystem,
  mapRailSegment,
  mapRailStation,
  mapSubstation,
  mapTransmissionLine,
  type Domain,
  type MappedLine,
  type MappedPointSite,
  type MappedSubstation,
  type SigelFeature,
} from './mapper.js';
import { publishDomainLayers } from './studio-geo.js';

loadEnv();
oracledb.fetchAsString = [oracledb.CLOB];
// No-op quando `ORACLE_CLIENT_LIB_DIR` não está definido (modo Thin); obrigatório nas máquinas que
// dependem do Instant Client, igual aos demais scripts Oracle do repo.
configureOracleClient();

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

const catalogId = (suffix: string): string =>
  deterministicUuid(DEMO_INFRA_NAMESPACE, `CATALOG:${suffix}`);

type ResourceTypeDef = {
  code: string;
  name: string;
  description: string;
  geometryKind: 'POINT' | 'LINE';
  domain: Domain;
};

type SiteSpecDef = {
  code: string;
  name: string;
  description: string;
  domain: Domain;
};

const SITE_SPECS: SiteSpecDef[] = [
  {
    code: SUBSTATION_SITE_SPEC_CODE,
    name: 'Subestação de Energia',
    description: 'Subestação de transmissão de energia elétrica (ANEEL SIGEL).',
    domain: 'energy',
  },
  {
    code: ISOLATED_SYSTEM_SITE_SPEC_CODE,
    name: 'Sistema Isolado de Energia',
    description: 'Sistema isolado de energia elétrica (ANEEL SIGEL/ONS).',
    domain: 'energy',
  },
  {
    code: RAIL_STATION_SITE_SPEC_CODE,
    name: 'Estação Ferroviária',
    description: 'Estação ferroviária ou metroviária (IBGE BCIM).',
    domain: 'rail',
  },
];

const RESOURCE_TYPES: ResourceTypeDef[] = [
  {
    code: SUBSTATION_RESOURCE_TYPE_CODE,
    name: 'Subestação de Energia',
    description: 'Subestação de transmissão de energia elétrica (ANEEL SIGEL).',
    geometryKind: 'POINT',
    domain: 'energy',
  },
  {
    code: ISOLATED_SYSTEM_RESOURCE_TYPE_CODE,
    name: 'Sistema Isolado de Energia',
    description: 'Sistema isolado de energia elétrica (ANEEL SIGEL/ONS).',
    geometryKind: 'POINT',
    domain: 'energy',
  },
  {
    code: TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
    name: 'Linha de Transmissão',
    description: 'Linha de transmissão de energia elétrica (ANEEL SIGEL).',
    geometryKind: 'LINE',
    domain: 'energy',
  },
  {
    code: GAS_PIPELINE_RESOURCE_TYPE_CODE,
    name: 'Gasoduto',
    description: 'Trecho de duto de gás e derivados (IBGE BC250).',
    geometryKind: 'LINE',
    domain: 'gas',
  },
  {
    code: RAIL_SEGMENT_RESOURCE_TYPE_CODE,
    name: 'Trecho Ferroviário',
    description: 'Trecho de via férrea (IBGE BC250).',
    geometryKind: 'LINE',
    domain: 'rail',
  },
  {
    code: RAIL_STATION_RESOURCE_TYPE_CODE,
    name: 'Estação Ferroviária',
    description: 'Estação ferroviária ou metroviária (IBGE BCIM).',
    geometryKind: 'POINT',
    domain: 'rail',
  },
];

/** Grupo do catálogo de recursos por domínio — faz a árvore aparecer no Inventário. */
const CATALOG_GROUPS: Record<Domain, { code: string; name: string; sortOrder: number }> = {
  energy: { code: 'grp-energia', name: 'Energia', sortOrder: 100 },
  gas: { code: 'grp-gas', name: 'Gás', sortOrder: 110 },
  rail: { code: 'grp-ferrovia', name: 'Ferrovia', sortOrder: 120 },
};

async function idByColumns(
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
 * Reconcilia a `GeographicSiteSpecification` da subestação.
 *
 * Não usa `ensureSiteSpec` do kit, que grava `name = code` e devolve sem atualizar. O id existente
 * é resolvido antes do MERGE porque `mergeSql` atualiza toda coluna fora da chave: repontar o `id`
 * de uma spec já referenciada quebraria a FK de `tmf_geographic_site`.
 */
async function ensureSiteSpec(
  conn: Connection,
  t: TablePrefixer,
  definition: SiteSpecDef,
): Promise<string> {
  const existing = await idByColumns(conn, t, 'tmf_geographic_site_specification', {
    code: definition.code,
  });
  const id = existing ?? deterministicUuid(DEMO_INFRA_NAMESPACE, `SITE_SPEC:${definition.code}`);
  await merge(conn, t, 'tmf_geographic_site_specification', ['code'], {
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
async function ensureResourceTypeForMap(
  conn: Connection,
  t: TablePrefixer,
  definition: ResourceTypeDef,
  tenantId: string,
): Promise<string> {
  const existing = await idByColumns(conn, t, 'tmf_resource_type', {
    tenant_id: tenantId,
    code: definition.code,
  });
  const id =
    existing ?? deterministicUuid(DEMO_INFRA_NAMESPACE, `RESOURCE_TYPE:${definition.code}`);
  await merge(conn, t, 'tmf_resource_type', ['tenant_id', 'code'], {
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

/**
 * Uma `ResourceSpecification` por type — duas no total.
 *
 * As 11 tensões distintas do escopo **não** viram specification: `tensaoKv` é characteristic de
 * instância. É o que atende "não criar centenas de specifications desnecessariamente".
 */
async function ensureResourceSpec(
  conn: Connection,
  t: TablePrefixer,
  definition: ResourceTypeDef,
  resourceTypeId: string,
  tenantId: string,
): Promise<string> {
  const existing = await idByColumns(conn, t, 'tmf_resource_specification', {
    tenant_id: tenantId,
    name: definition.name,
    resource_type_id: resourceTypeId,
  });
  const id =
    existing ?? deterministicUuid(DEMO_INFRA_NAMESPACE, `RESOURCE_SPEC:${definition.code}`);
  await merge(conn, t, 'tmf_resource_specification', ['id'], {
    id,
    tenant_id: tenantId,
    name: definition.name,
    resource_type_id: resourceTypeId,
    description: definition.description,
    ...(existing ? {} : { characteristics: '[]' }),
  });
  return id;
}

/** Resolve o catálogo de recursos padrão do tenant, criando-o se a DEMO ainda não tiver nenhum. */
async function ensureResourceCatalog(
  conn: Connection,
  t: TablePrefixer,
  tenantId: string,
): Promise<string> {
  const preferred = await conn.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('tmf_resource_catalog')}
      WHERE tenant_id=:1
      ORDER BY is_default DESC, sort_order ASC
      FETCH FIRST 1 ROWS ONLY`,
    [tenantId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const found = preferred.rows?.[0]?.ID;
  if (found) return found;

  const id = catalogId(tenantId);
  await merge(conn, t, 'tmf_resource_catalog', ['id'], {
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
 * Árvore ENERGIA no catálogo de recursos.
 *
 * Nós existentes são pré-mapeados por `code` e por `resource_type_id`: `UNIQUE(tenant_id,
 * catalog_id, code)` e a folha de um type que já tenha nó precisam reusar o id, senão o MERGE por
 * `['id']` tenta inserir um segundo nó para o mesmo código.
 */
async function ensureCatalogNodes(
  conn: Connection,
  t: TablePrefixer,
  resourceTypeIdByCode: Map<string, string>,
  tenantId: string,
  domains: readonly Domain[],
): Promise<void> {
  const catalog = await ensureResourceCatalog(conn, t, tenantId);

  const existing = await conn.execute<{
    ID: string;
    CODE: string;
    RESOURCE_TYPE_ID: string | null;
  }>(
    `SELECT id AS "ID", code AS "CODE", resource_type_id AS "RESOURCE_TYPE_ID"
       FROM ${t('tmf_resource_catalog_node')} WHERE tenant_id=:1 AND catalog_id=:2`,
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
    deterministicUuid(DEMO_INFRA_NAMESPACE, `CATALOG_NODE:${tenantId}:${catalog}:${code}`);

  for (const domain of domains) {
    const group = CATALOG_GROUPS[domain];
    const groupId = nodeId(group.code);
    await merge(conn, t, 'tmf_resource_catalog_node', ['id'], {
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
    for (const definition of RESOURCE_TYPES.filter((type) => type.domain === domain)) {
      const resourceTypeId = resourceTypeIdByCode.get(definition.code);
      if (!resourceTypeId) continue;
      await merge(conn, t, 'tmf_resource_catalog_node', ['id'], {
        id: idByTypeId.get(resourceTypeId) ?? nodeId(definition.code),
        tenant_id: tenantId,
        catalog_id: catalog,
        parent_node_id: groupId,
        code: definition.code,
        name: definition.name,
        kind: 'RESOURCE_TYPE',
        resource_type_id: resourceTypeId,
        status: 'active',
        sort_order: sortOrder,
      });
      sortOrder += 10;
    }
  }
}

// ---------------------------------------------------------------------------
// Carga das instâncias
// ---------------------------------------------------------------------------

const LOCATION_COLUMNS = [
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

const SITE_COLUMNS = [
  'id',
  'tenant_id',
  'name',
  'site_specification_id',
  'status',
  'geographic_location_id',
  'related_party',
  'characteristics',
];

const RESOURCE_COLUMNS = [
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
async function existingIds(
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

type LoadPlan = {
  locations: Array<Record<string, unknown>>;
  sites: Array<Record<string, unknown>>;
  resources: Array<Record<string, unknown>>;
};

const relatedPartyJson = (ownerPartyId: string): string =>
  JSON.stringify([{ id: ownerPartyId, '@referredType': 'Organization' }]);

function pointSiteRows(
  items: readonly MappedPointSite[],
  context: { tenantId: string; ownerPartyId: string; siteSpecId: string; resourceSpecId: string },
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

/** Recurso linear (linha de transmissão, gasoduto, trecho ferroviário): Location → Resource. */
function lineResourceRows(
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

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

/**
 * Resolve o tenant e a party dona a partir do próprio namespace.
 *
 * `nexus_environment.tenant_id` é o tenant que o provisionador gravou ao criar o ambiente — o mesmo
 * que o token da sessão carrega. Um default fixo `'default'` gravaria dados que nenhuma tela lê: a
 * DEMO provisionada registra `vtal`, e `tmf_resource_type` tem linhas em **ambos** os tenants, então
 * nem a presença de catálogo distingue um do outro. As flags só entram como override explícito.
 */
async function resolveTenant(
  conn: Connection,
  t: TablePrefixer,
  options: CliOptions,
): Promise<{ tenantId: string; ownerPartyId: string }> {
  if (options.tenantId) {
    return { tenantId: options.tenantId, ownerPartyId: options.ownerPartyId ?? options.tenantId };
  }
  const environment = await conn.execute<{ TENANT_ID: string | null }>(
    `SELECT tenant_id AS "TENANT_ID" FROM ${t('nexus_environment')}
      WHERE tenant_id IS NOT NULL FETCH FIRST 1 ROWS ONLY`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const tenantId = environment.rows?.[0]?.TENANT_ID;
  if (!tenantId) {
    throw new Error(
      `Não foi possível resolver o tenant: ${t('nexus_environment')} não tem linha com tenant_id. ` +
        'Informe --tenant-id explicitamente.',
    );
  }
  return { tenantId, ownerPartyId: options.ownerPartyId ?? tenantId };
}

async function runSeed(options: CliOptions): Promise<void> {
  const prefix = process.env.ORACLE_OBJECT_PREFIX;
  const connectString = process.env.ORACLE_CONNECTION_STRING;
  const user = process.env.ORACLE_USER;
  const password = process.env.ORACLE_PASSWORD;

  console.log('[0] Pré-flight');
  if (!prefix) {
    throw new Error('ORACLE_OBJECT_PREFIX obrigatório (ex.: NX_DEMO_).');
  }
  if (!connectString || !user || !password) {
    throw new Error('ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD são obrigatórios.');
  }
  console.log(`    modo: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`    namespace: ${prefix}`);
  console.log(
    `    UFs: ${options.states.join(', ')}${options.limit ? ` · limite: ${options.limit}` : ''}`,
  );
  console.log(`    domínios: ${options.domains.join(', ')}`);

  const t = makeTablePrefixer(prefix);
  const bbox = bboxForStates(options.states);

  const pool = await oracledb.createPool({ connectString, user, password, poolMin: 1, poolMax: 2 });
  let conn: Connection | null = null;
  // Resolvido dentro do `try`, mas usado pelas fases 5 e 6, que rodam depois de a conexão fechar.
  let tenantId = '';

  try {
    conn = await pool.getConnection();

    const resolved = await resolveTenant(conn, t, options);
    tenantId = resolved.tenantId;
    const { ownerPartyId } = resolved;
    const source = options.tenantId ? '--tenant-id' : `${prefix}nexus_environment`;
    console.log(`    tenant: ${tenantId} · owner party: ${ownerPartyId} (de ${source})`);

    const party = await conn.execute<{ ID: string }>(
      `SELECT id AS "ID" FROM ${t('tmf_party')} WHERE id=:1`,
      [ownerPartyId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (!party.rows?.[0]) {
      // Falha cedo: sem a party, `related_party` referenciaria uma Organization inexistente e os
      // painéis mostrariam o dono em branco em todo recurso carregado.
      throw new Error(
        `Party "${ownerPartyId}" não existe em ${prefix}tmf_party. ` +
          'Informe --owner-party-id de uma Organization existente (normalmente o próprio tenant).',
      );
    }

    // --- [1] Catálogo -------------------------------------------------------
    console.log('[1] Catálogo');
    const siteSpecIdByCode = new Map<string, string>();
    const wants = (domain: Domain): boolean => options.domains.includes(domain);
    const siteSpecs = SITE_SPECS.filter((definition) => wants(definition.domain));
    const resourceTypes = RESOURCE_TYPES.filter((definition) => wants(definition.domain));
    for (const definition of siteSpecs) {
      siteSpecIdByCode.set(definition.code, await ensureSiteSpec(conn, t, definition));
    }
    const resourceTypeIdByCode = new Map<string, string>();
    const resourceSpecIdByCode = new Map<string, string>();
    for (const definition of resourceTypes) {
      const typeId = await ensureResourceTypeForMap(conn, t, definition, tenantId);
      resourceTypeIdByCode.set(definition.code, typeId);
      resourceSpecIdByCode.set(
        definition.code,
        await ensureResourceSpec(conn, t, definition, typeId, tenantId),
      );
    }
    await ensureCatalogNodes(conn, t, resourceTypeIdByCode, tenantId, options.domains);

    const catalogSummary =
      `${siteSpecs.length} site specs · ${resourceTypes.length} resource types · ` +
      `${resourceTypes.length} specifications · árvores ${options.domains.join('+')}`;
    if (options.apply) {
      await conn.execute('COMMIT');
      console.log(`    ${catalogSummary}`);
    } else {
      await conn.execute('ROLLBACK');
      console.log(`    ${catalogSummary} (não gravado)`);
    }

    // --- [2] Extração -------------------------------------------------------
    console.log('[2] Extração');
    const limitOption = options.limit === undefined ? {} : { limit: options.limit };
    const energy = wants('energy');

    const fetchAneel = async (label: string, layerId: number): Promise<SigelFeature[]> => {
      if (!energy) return [];
      console.log(`    Fetching ANEEL ${label}...`);
      const count = await countFeatures({ layerId, bbox });
      const features = await fetchLayerFeatures({ layerId, bbox, ...limitOption });
      console.log(`    Found: ${features.length} (envelope: ${count})`);
      return features;
    };
    const fetchIbge = async (
      label: string,
      typeName: string,
      domain: Domain,
    ): Promise<SigelFeature[]> => {
      if (!wants(domain)) return [];
      console.log(`    Fetching IBGE ${label}...`);
      const count = await countIbgeFeatures(typeName);
      const features = await fetchIbgeFeatures({ typeName, ...limitOption });
      console.log(`    Found: ${features.length} (nacional: ${count})`);
      return features;
    };

    const substationFeatures = await fetchAneel('substations', SUBSTATION_LAYER_ID);
    const isolatedSystemFeatures = await fetchAneel('isolated systems', ISOLATED_SYSTEM_LAYER_ID);
    const lineFeatures = await fetchAneel('transmission lines', TRANSMISSION_LINE_LAYER_ID);
    const gasFeatures = await fetchIbge('gas pipelines', IBGE_GAS_PIPELINE_LAYER, 'gas');
    const railSegmentFeatures = await fetchIbge('rail segments', IBGE_RAIL_SEGMENT_LAYER, 'rail');
    const railStationFeatures = await fetchIbge('rail stations', IBGE_RAIL_STATION_LAYER, 'rail');

    // --- [3] Mapeamento -----------------------------------------------------
    console.log('[3] Mapeamento');
    const substations: MappedSubstation[] = [];
    let substationsSkipped = 0;
    for (const feature of substationFeatures) {
      try {
        const mapped = mapSubstation(feature, options.states);
        if (mapped) substations.push(mapped);
        else substationsSkipped += 1;
      } catch (error) {
        // Erro por registro nunca aborta a carga — ver requisito de logs da entrega.
        console.warn(`    ! subestação OID ${String(feature.properties.OID)}: ${String(error)}`);
        substationsSkipped += 1;
      }
    }

    const isolatedSystems: MappedPointSite[] = [];
    let isolatedSystemsSkipped = 0;
    for (const feature of isolatedSystemFeatures) {
      try {
        const mapped = mapIsolatedSystem(feature, options.states);
        if (mapped) isolatedSystems.push(mapped);
        else isolatedSystemsSkipped += 1;
      } catch (error) {
        console.warn(
          `    ! sistema isolado OID ${String(feature.properties.OID)}: ${String(error)}`,
        );
        isolatedSystemsSkipped += 1;
      }
    }

    const lines: MappedLine[] = [];
    let linesSkipped = 0;
    for (const feature of lineFeatures) {
      try {
        const mapped = mapTransmissionLine(feature, options.states);
        if (mapped.length === 0) linesSkipped += 1;
        else lines.push(...mapped);
      } catch (error) {
        console.warn(`    ! linha OID ${String(feature.properties.OID)}: ${String(error)}`);
        linesSkipped += 1;
      }
    }

    // Gás e ferrovia: mesmo laço tolerante a erro por registro.
    const mapLinear = (
      features: SigelFeature[],
      map: (feature: SigelFeature, states: readonly string[]) => MappedLine[],
      label: string,
    ): { items: MappedLine[]; skipped: number } => {
      const items: MappedLine[] = [];
      let skipped = 0;
      for (const feature of features) {
        try {
          const mapped = map(feature, options.states);
          if (mapped.length === 0) skipped += 1;
          else items.push(...mapped);
        } catch (error) {
          console.warn(`    ! ${label} ${String(feature.properties.OID)}: ${String(error)}`);
          skipped += 1;
        }
      }
      return { items, skipped };
    };
    const gas = mapLinear(gasFeatures, mapGasPipeline, 'gasoduto');
    const railSegments = mapLinear(railSegmentFeatures, mapRailSegment, 'trecho ferroviário');

    const railStations: MappedPointSite[] = [];
    let railStationsSkipped = 0;
    for (const feature of railStationFeatures) {
      try {
        const mapped = mapRailStation(feature, options.states);
        if (mapped) railStations.push(mapped);
        else railStationsSkipped += 1;
      } catch (error) {
        console.warn(
          `    ! estação ferroviária ${String(feature.properties.OID)}: ${String(error)}`,
        );
        railStationsSkipped += 1;
      }
    }

    const uniqueSubstations = dedupeById(substations);
    const uniqueIsolatedSystems = dedupeById(isolatedSystems);
    const uniqueLines = dedupeById(lines);
    let uniqueGas = dedupeById(gas.items);
    if (wants('gas') && uniqueGas.length > 0) {
      try {
        console.log('    Fetching ANP autorizações de gás natural...');
        const enrichment = enrichGasPipelines(uniqueGas, await fetchAnpGasAuthorizations());
        uniqueGas = enrichment.lines;
        const r = enrichment.report;
        console.log(
          `    ANP: ${r.authorizations} autorizações (${r.pipelineAuthorizations} de duto) · enriquecidos: ${r.enriched} · sem correspondência: ${r.noMatch} · ambíguos: ${r.ambiguous} · campos em conflito: ${r.conflictingFields}`,
        );
      } catch (error) {
        // Enriquecimento é opcional: sem a ANP o gasoduto segue só com atributos do IBGE.
        console.warn(`    ! ANP indisponível, gasodutos sem enriquecimento: ${String(error)}`);
      }
    }
    const uniqueRailSegments = dedupeById(railSegments.items);
    const uniqueRailStations = dedupeById(railStations);
    const countVertices = (items: readonly MappedLine[]): number =>
      items.reduce((total, line) => total + line.line.coordinates.length, 0);
    if (energy) {
      console.log(
        `    Subestações no escopo: ${uniqueSubstations.length} (fora: ${substationsSkipped})`,
      );
      console.log(
        `    Sistemas isolados no escopo: ${uniqueIsolatedSystems.length} (fora: ${isolatedSystemsSkipped})`,
      );
      console.log(
        `    Linhas no escopo: ${uniqueLines.length} (fora: ${linesSkipped}) · ${countVertices(uniqueLines)} vértices preservados`,
      );
    }
    if (wants('gas')) {
      console.log(
        `    Gasodutos no escopo: ${uniqueGas.length} (fora: ${gas.skipped}) · ${countVertices(uniqueGas)} vértices preservados`,
      );
    }
    if (wants('rail')) {
      console.log(
        `    Trechos ferroviários no escopo: ${uniqueRailSegments.length} (fora: ${railSegments.skipped}) · ${countVertices(uniqueRailSegments)} vértices preservados`,
      );
      console.log(
        `    Estações ferroviárias no escopo: ${uniqueRailStations.length} (fora: ${railStationsSkipped})`,
      );
    }

    // --- [4] Carga ----------------------------------------------------------
    console.log('[4] Carga');
    const substationPlan = pointSiteRows(uniqueSubstations, {
      tenantId,
      ownerPartyId,
      siteSpecId: siteSpecIdByCode.get(SUBSTATION_SITE_SPEC_CODE) ?? '',
      resourceSpecId: resourceSpecIdByCode.get(SUBSTATION_RESOURCE_TYPE_CODE) ?? '',
    });
    const isolatedSystemPlan = pointSiteRows(uniqueIsolatedSystems, {
      tenantId,
      ownerPartyId,
      siteSpecId: siteSpecIdByCode.get(ISOLATED_SYSTEM_SITE_SPEC_CODE) ?? '',
      resourceSpecId: resourceSpecIdByCode.get(ISOLATED_SYSTEM_RESOURCE_TYPE_CODE) ?? '',
    });
    const linePlanFor = (items: readonly MappedLine[], typeCode: string): LoadPlan =>
      lineResourceRows(items, {
        tenantId,
        ownerPartyId,
        resourceSpecId: resourceSpecIdByCode.get(typeCode) ?? '',
      });
    const linePlan = linePlanFor(uniqueLines, TRANSMISSION_LINE_RESOURCE_TYPE_CODE);
    const gasPlan = linePlanFor(uniqueGas, GAS_PIPELINE_RESOURCE_TYPE_CODE);
    const railSegmentPlan = linePlanFor(uniqueRailSegments, RAIL_SEGMENT_RESOURCE_TYPE_CODE);
    const railStationPlan = pointSiteRows(uniqueRailStations, {
      tenantId,
      ownerPartyId,
      siteSpecId: siteSpecIdByCode.get(RAIL_STATION_SITE_SPEC_CODE) ?? '',
      resourceSpecId: resourceSpecIdByCode.get(RAIL_STATION_RESOURCE_TYPE_CODE) ?? '',
    });

    const plans = [
      substationPlan,
      isolatedSystemPlan,
      linePlan,
      gasPlan,
      railSegmentPlan,
      railStationPlan,
    ];
    const locations = plans.flatMap((plan) => plan.locations);
    const sites = plans.flatMap((plan) => plan.sites);
    const resources = plans.flatMap((plan) => plan.resources);

    const alreadyThere = await existingIds(
      conn,
      t,
      'tmf_physical_resource',
      resources.map((row) => String(row.id)),
    );
    const updated = alreadyThere.size;
    const imported = resources.length - updated;

    if (options.apply) {
      // Ordem obrigatória: Location antes de Site (FK geographic_location_id) e Site antes de
      // Resource (place_id). `bulkMergeRows` particiona o lote por largura de bind, o que mantém a
      // geometria curta no caminho VARCHAR2 (bind CLOB custa ~400x).
      await bulkMergeRows(
        conn,
        t,
        'tmf_geographic_location',
        ['id'],
        LOCATION_COLUMNS,
        locations,
        BATCH_SIZE,
      );
      console.log(`    Locations: ${locations.length}`);
      await bulkMergeRows(conn, t, 'tmf_geographic_site', ['id'], SITE_COLUMNS, sites, BATCH_SIZE);
      console.log(`    Sites: ${sites.length}`);
      await bulkMergeRows(
        conn,
        t,
        'tmf_physical_resource',
        ['id'],
        RESOURCE_COLUMNS,
        resources,
        BATCH_SIZE,
      );
      await conn.execute('COMMIT');
      console.log(`    Imported: ${imported}`);
      console.log(`    Updated: ${updated}`);
    } else {
      console.log(
        `    (dry-run) ${locations.length} locations · ${sites.length} sites · ${resources.length} recursos`,
      );
      console.log(`    Imported: ${imported} (previsto) · Updated: ${updated} (previsto)`);
    }
  } finally {
    if (conn) {
      try {
        if (!options.apply) await conn.execute('ROLLBACK');
      } catch {
        // Rollback de cortesia no dry-run; a conexão pode já ter sido encerrada pelo erro acima.
      }
      await conn.close();
    }
    await pool.close(5);
  }

  // --- [5] Studio GEO -------------------------------------------------------
  console.log('[5] Studio GEO');
  if (options.apply) {
    // As fases 1–4 já commitaram. Uma falha aqui não invalida a carga: ela só deixa o mapa sem as
    // camadas, e o remédio é republicar — por isso vira aviso acionável em vez de derrubar o run.
    try {
      await publishLayers(tenantId, options.domains);
    } catch (error) {
      console.warn(`    ! publicação do catálogo GEO falhou: ${String(error)}`);
      console.warn(
        '      Os dados foram gravados, mas o mapa só desenha depois de publicar as camadas ' +
          'ENERGIA no Studio → GEO (ou reexecutar o seed com --apply).',
      );
      process.exitCode = 1;
    }
  } else {
    console.log('    (dry-run) publicação do catálogo GEO não executada');
  }

  // --- [6] Índice do mapa ---------------------------------------------------
  console.log('[6] Índice do mapa');
  // Sem `--uf/--city`: aqueles filtros dependem do endereço da Location, e a fonte não tem
  // endereço — um rebuild escopado deixaria tudo de fora.
  const indexCommand = `node scripts/build-map-features.mjs --environment ${prefix} --apply --tenant ${tenantId}`;
  if (options.apply && options.buildFeatures) {
    await runIndexer(tenantId, prefix);
  } else {
    console.log(`    pendente — rode: ${indexCommand}`);
  }

  console.log('Done.');
}

/**
 * Publica as camadas ENERGIA pelo `studioService` do runtime.
 *
 * Único trecho que sobe o runtime completo. `DATABASE_AUTO_SCHEMA:'false'` porque o seed não é o
 * lugar de criar schema — a DEMO já está provisionada.
 */
async function publishLayers(tenantId: string, domains: readonly Domain[]): Promise<void> {
  const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
  const db = createDatabaseClient(config.database);
  await db.initialize();
  try {
    const runtime = await createNexusRuntime(db);
    const result = await publishDomainLayers(
      runtime.studioService,
      {
        actorSub: 'seed-demo-infra',
        tenantId,
        // O adapter consulta Resource/Geo por conta própria durante o publish; `studio.admin`
        // sozinho não satisfaz o papel de leitura daqueles serviços.
        roles: ['studio.admin', 'platform.admin'],
        traceId: 'seed-demo-infra',
      },
      domains,
    );
    console.log(
      `    Published: ${domains.join(' + ')} · versão ${result.versionNumber} · ${result.nodeCount} nós`,
    );
  } finally {
    await db.close();
  }
}

/** Dispara o indexador existente em vez de reimplementar a geração de tiles. */
async function runIndexer(tenantId: string, environment: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'scripts/build-map-features.mjs',
        '--environment',
        environment,
        '--apply',
        '--tenant',
        tenantId,
      ],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`build-map-features saiu com código ${code}.`)),
    );
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runSeed(parseCliArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  });
}

export { runSeed };
