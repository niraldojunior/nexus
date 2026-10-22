#!/usr/bin/env node
/**
 * Importação dos cabos submarinos V.tal (KML/KMZ) para uma instância Nexus.
 *
 * Lê `legacy-data/cabos_submarinos/` (GlobeNet e Malbec), converte rotas e equipamentos para o
 * modelo que o Nexus já tem — `ResourceType`/`ResourceSpecification`/`GeographicSiteSpecification` no
 * catálogo; `GeographicLocation`/`GeographicSite`/`PhysicalResource` nas instâncias — e grava por SQL
 * `MERGE` com ids UUID v5 determinísticos (reexecutar atualiza, nunca duplica; sem DELETE, C6).
 * Atributos da fonte entram como `characteristic` (C1) e a procedência como `_origin.*` (C5).
 *
 * Uso:
 *   npm run import-submarine-cables -- --environment NX_DEV21_                      # dry-run
 *   npm run import-submarine-cables -- --environment NX_DEV21_ --apply             # carga
 *   npm run import-submarine-cables -- --environment NX_DEV21_ --apply --build-features
 *
 * Ambiente: `ORACLE_CONNECTION_STRING`, `ORACLE_USER` e `ORACLE_PASSWORD` no `.env`. A instância
 * de destino vem de `--environment` (ou `ORACLE_OBJECT_PREFIX`). Oracle-only (C10).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import oracledb, { type Connection } from 'oracledb';
import {
  bulkMergeRows,
  configureOracleClient,
  makeTablePrefixer,
} from '../../src/scripts/netwin-migration-kit.js';
import { loadConfig } from '../../src/shared/config/env.js';
import { createDatabaseClient } from '../../src/shared/persistence/database-factory.js';
import { createNexusRuntime } from '../../src/shared/runtime/nexus-runtime.js';
import {
  LOCATION_COLUMNS,
  RESOURCE_COLUMNS,
  SITE_COLUMNS,
  ensureCatalogGroup,
  ensureResourceSpec,
  ensureResourceTypeForMap,
  ensureSiteSpec,
  existingIds,
  lineResourceRows,
  pointSiteRows,
  resolveTenant,
  type ResourceTypeDef,
  type SiteSpecDef,
} from '../seed-demo-infrastructure/oracle-load.js';
import { publishNodes } from '../seed-demo-infrastructure/studio-geo.js';
import { parseCliArgs, type CliOptions } from './cli.js';
import { readSourceDir } from './kml.js';
import {
  BMH_SITE_SPEC_CODE,
  BRANCHING_UNIT_RESOURCE_TYPE_CODE,
  BRANCHING_UNIT_SITE_SPEC_CODE,
  EQUALIZER_RESOURCE_TYPE_CODE,
  EQUALIZER_SITE_SPEC_CODE,
  POINT_ENTITIES,
  REPEATER_RESOURCE_TYPE_CODE,
  REPEATER_SITE_SPEC_CODE,
  SUBMARINE_CABLE_RESOURCE_TYPE_CODE,
  SUBMARINE_POSITION_SITE_SPEC_CODE,
  ORIGIN_SYSTEM,
  SUBMARINE_NAMESPACE,
  convertDocuments,
  type PointEntity,
} from './mapper.js';
import { submarineNodes } from './studio-geo.js';

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

const SITE_SPECS: SiteSpecDef[] = [
  {
    code: BMH_SITE_SPEC_CODE,
    name: 'Beach Manhole (BMH)',
    description:
      'Caixa de praia onde o cabo submarino chega à costa e encontra o trecho terrestre.',
  },
  {
    code: SUBMARINE_POSITION_SITE_SPEC_CODE,
    name: 'Posição Submarina',
    description:
      'Posição no leito marinho de uma Branching Unit, repetidor ou equalizador de cabo submarino.',
  },
];

const RESOURCE_TYPES: ResourceTypeDef[] = [
  {
    code: SUBMARINE_CABLE_RESOURCE_TYPE_CODE,
    name: 'Cabo Submarino',
    description: 'Segmento de cabo óptico submarino (rota do plano de lançamento).',
    geometryKind: 'LINE',
  },
  {
    code: BRANCHING_UNIT_RESOURCE_TYPE_CODE,
    name: 'Branching Unit (BU)',
    description: 'Unidade de derivação de cabo submarino.',
    geometryKind: 'POINT',
  },
  {
    code: REPEATER_RESOURCE_TYPE_CODE,
    name: 'Repetidor Submarino',
    description: 'Repetidor óptico submerso de cabo submarino.',
    geometryKind: 'POINT',
  },
  {
    code: EQUALIZER_RESOURCE_TYPE_CODE,
    name: 'Equalizador Submarino',
    description: 'Equalizador de ganho submerso de cabo submarino.',
    geometryKind: 'POINT',
  },
];

const CATALOG_GROUP = { code: 'grp-cabos-submarinos', name: 'Cabos Submarinos', sortOrder: 140 };

/** Entidade pontual → site spec e (exceto BMH, que é só Local) resource type. */
const POINT_TARGETS: Record<
  PointEntity,
  { siteSpec: string; resourceType?: string; label: string }
> = {
  BMH: { siteSpec: BMH_SITE_SPEC_CODE, label: 'BMH' },
  BU: {
    siteSpec: BRANCHING_UNIT_SITE_SPEC_CODE,
    resourceType: BRANCHING_UNIT_RESOURCE_TYPE_CODE,
    label: 'Branching Units',
  },
  REPEATER: {
    siteSpec: REPEATER_SITE_SPEC_CODE,
    resourceType: REPEATER_RESOURCE_TYPE_CODE,
    label: 'Repetidores',
  },
  EQUALIZER: {
    siteSpec: EQUALIZER_SITE_SPEC_CODE,
    resourceType: EQUALIZER_RESOURCE_TYPE_CODE,
    label: 'Equalizadores',
  },
};

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

async function runImport(options: CliOptions): Promise<void> {
  const prefix = options.environment;
  const connectString = process.env.ORACLE_CONNECTION_STRING;
  const user = process.env.ORACLE_USER;
  const password = process.env.ORACLE_PASSWORD;

  console.log('[0] Pré-flight');
  if (!connectString || !user || !password) {
    throw new Error('ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD são obrigatórios.');
  }
  console.log(`    modo: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`    instância: ${prefix}`);
  console.log(`    origem: ${options.sourceDir}`);

  // Lido antes de abrir conexão: arquivo inválido falha sem tocar no banco.
  const documents = await readSourceDir(options.sourceDir);
  if (documents.length === 0) {
    throw new Error(`Nenhum .kml/.kmz em ${options.sourceDir}.`);
  }

  const t = makeTablePrefixer(prefix);
  const pool = await oracledb.createPool({ connectString, user, password, poolMin: 1, poolMax: 2 });
  let conn: Connection | null = null;
  let tenantId = '';

  try {
    conn = await pool.getConnection();

    const resolved = await resolveTenant(conn, t, options);
    tenantId = resolved.tenantId;
    const { ownerPartyId } = resolved;
    const source = options.tenantId ? '--tenant-id' : `${prefix}environment`;
    console.log(`    tenant: ${tenantId} · owner party: ${ownerPartyId} (de ${source})`);

    // --- [1] Catálogo -------------------------------------------------------
    console.log('[1] Catálogo');
    const siteSpecIdByCode = new Map<string, string>();
    for (const definition of SITE_SPECS) {
      siteSpecIdByCode.set(
        definition.code,
        await ensureSiteSpec(conn, t, definition, SUBMARINE_NAMESPACE),
      );
    }
    const resourceTypeIdByCode = new Map<string, string>();
    const resourceSpecIdByCode = new Map<string, string>();
    for (const definition of RESOURCE_TYPES) {
      const typeId = await ensureResourceTypeForMap(
        conn,
        t,
        definition,
        tenantId,
        SUBMARINE_NAMESPACE,
      );
      resourceTypeIdByCode.set(definition.code, typeId);
      resourceSpecIdByCode.set(
        definition.code,
        await ensureResourceSpec(conn, t, definition, typeId, tenantId, SUBMARINE_NAMESPACE),
      );
    }
    await ensureCatalogGroup(
      conn,
      t,
      tenantId,
      SUBMARINE_NAMESPACE,
      CATALOG_GROUP,
      RESOURCE_TYPES.flatMap((definition) => {
        const resourceTypeId = resourceTypeIdByCode.get(definition.code);
        return resourceTypeId
          ? [{ code: definition.code, name: definition.name, resourceTypeId }]
          : [];
      }),
    );
    const catalogSummary =
      `${SITE_SPECS.length} site specs · ${RESOURCE_TYPES.length} resource types · ` +
      `${RESOURCE_TYPES.length} specifications · árvore ${CATALOG_GROUP.name}`;
    if (options.apply) {
      await conn.execute('COMMIT');
      console.log(`    ${catalogSummary}`);
    } else {
      await conn.execute('ROLLBACK');
      console.log(`    ${catalogSummary} (não gravado)`);
    }

    // --- [2] Leitura --------------------------------------------------------
    console.log('[2] Leitura');
    for (const document of documents) {
      const lines = document.placemarks.filter((placemark) => placemark.kind === 'line').length;
      const points = document.placemarks.length - lines;
      console.log(`    ${document.file}: ${lines} linhas · ${points} pontos`);
    }

    // --- [3] Conversão ------------------------------------------------------
    console.log('[3] Conversão');
    const conversion = convertDocuments(documents);
    for (const report of conversion.reports) {
      const points = POINT_ENTITIES.filter((entity) => report.points[entity])
        .map((entity) => `${entity} ${report.points[entity]}`)
        .join(' · ');
      const discarded = Object.entries(report.discarded)
        .map(([folder, count]) => `${folder} ${count}`)
        .join(' · ');
      console.log(
        `    ${report.file} [${report.system}]: ${report.routes} rota(s)` +
          (points ? ` · ${points}` : '') +
          (discarded ? ` · descartados: ${discarded}` : ''),
      );
    }
    for (const conflict of conversion.conflicts) {
      console.warn(`    ! coordenada divergente, mantida a primeira: ${conflict}`);
    }
    const vertices = conversion.routes.reduce(
      (total, route) => total + route.line.coordinates.length,
      0,
    );
    console.log(`    Rotas: ${conversion.routes.length} · ${vertices} vértices preservados`);
    for (const entity of POINT_ENTITIES) {
      const count = conversion.points.filter((point) => point.entity === entity).length;
      console.log(`    ${POINT_TARGETS[entity].label}: ${count} (únicos)`);
    }

    // --- [4] Carga ----------------------------------------------------------
    console.log('[4] Carga');
    const plans = [
      lineResourceRows(conversion.routes, {
        tenantId,
        ownerPartyId,
        resourceSpecId: resourceSpecIdByCode.get(SUBMARINE_CABLE_RESOURCE_TYPE_CODE) ?? '',
      }),
      ...POINT_ENTITIES.map((entity) => {
        const target = POINT_TARGETS[entity];
        const resourceSpecId = target.resourceType
          ? resourceSpecIdByCode.get(target.resourceType)
          : undefined;
        return pointSiteRows(
          conversion.points.filter((point) => point.entity === entity),
          {
            tenantId,
            ownerPartyId,
            siteSpecId: siteSpecIdByCode.get(target.siteSpec) ?? '',
            ...(resourceSpecId === undefined ? {} : { resourceSpecId }),
          },
        );
      }),
    ];
    const locations = plans.flatMap((plan) => plan.locations);
    const sites = plans.flatMap((plan) => plan.sites);
    const resources = plans.flatMap((plan) => plan.resources);

    const alreadyThere = await existingIds(
      conn,
      t,
      'geographic_location',
      locations.map((row) => String(row.id)),
    );
    const updated = alreadyThere.size;
    const imported = locations.length - updated;

    if (options.apply) {
      // Location antes de Site (FK geographic_location_id) e Site antes de Resource (place_id).
      await bulkMergeRows(
        conn,
        t,
        'geographic_location',
        ['id'],
        LOCATION_COLUMNS,
        locations,
        BATCH_SIZE,
      );
      console.log(`    Locations: ${locations.length}`);
      await bulkMergeRows(conn, t, 'geographic_site', ['id'], SITE_COLUMNS, sites, BATCH_SIZE);
      console.log(`    Sites: ${sites.length}`);
      await bulkMergeRows(
        conn,
        t,
        'resource_physical',
        ['id'],
        RESOURCE_COLUMNS,
        resources,
        BATCH_SIZE,
      );
      console.log(`    Recursos: ${resources.length}`);
      await conn.execute('COMMIT');
      console.log(`    Imported: ${imported} · Updated: ${updated} (por Location)`);
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
    try {
      await publishLayers(tenantId);
    } catch (error) {
      console.warn(`    ! publicação do catálogo GEO falhou: ${String(error)}`);
      console.warn(
        '      Os dados foram gravados, mas o mapa só desenha depois de publicar o grupo ' +
          'Cabos Submarinos no Studio → GEO (ou reexecutar com --apply).',
      );
      process.exitCode = 1;
    }
  } else {
    console.log('    (dry-run) publicação do catálogo GEO não executada');
  }

  // --- [6] Índice do mapa ---------------------------------------------------
  console.log('[6] Índice do mapa');
  // Recorte por origem: indexa só as entidades desta carga, sem apagar/reconstruir o índice do
  // tenant — numa instância com milhões de features, o rebuild completo não é aditivo.
  const indexCommand = `node scripts/build-map-features.mjs --environment ${prefix} --apply --tenant ${tenantId} --source-system ${ORIGIN_SYSTEM}`;
  if (options.apply && options.buildFeatures) {
    await runIndexer(tenantId, prefix);
  } else {
    console.log(`    pendente — rode: ${indexCommand}`);
  }

  console.log('Done.');
}

/** Publica o grupo Cabos Submarinos pelo `studioService` do runtime (mesmo caminho do seed DEMO). */
async function publishLayers(tenantId: string): Promise<void> {
  const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
  const db = createDatabaseClient(config.database);
  await db.initialize();
  try {
    const runtime = await createNexusRuntime(db);
    const result = await publishNodes(
      runtime.studioService,
      {
        actorSub: 'import-submarine-cables',
        tenantId,
        roles: ['studio.admin', 'platform.admin'],
        traceId: 'import-submarine-cables',
      },
      [submarineNodes],
    );
    console.log(`    Published: versão ${result.versionNumber} · ${result.nodeCount} nós`);
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
        '--source-system',
        ORIGIN_SYSTEM,
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
  loadEnv();
  oracledb.fetchAsString = [oracledb.CLOB];
  configureOracleClient();
  try {
    const options = parseCliArgs(process.argv.slice(2));
    // O runtime da fase 5 e o indexador leem o prefixo do ambiente: a flag tem que valer para eles.
    process.env.ORACLE_OBJECT_PREFIX = options.environment;
    runImport(options).catch((error: unknown) => {
      console.error(String(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  }
}

export { runImport };
