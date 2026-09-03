// Fase 6 do projeto "remover coluna href" (issue #169): audita os valores persistidos antes da
// remoção física e só altera o schema com confirmação explícita. Execute uma vez por provider/prefixo.
//
// Uso (somente auditoria, seguro):
//   DATABASE_PROVIDER=postgres npx tsx src/scripts/drop-href-columns.ts
//   DATABASE_PROVIDER=oracle ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-href-columns.ts
//
// Remoção física (irreversível no Oracle):
//   DATABASE_PROVIDER=postgres npx tsx src/scripts/drop-href-columns.ts --apply --confirm-drop-href
//   DATABASE_PROVIDER=oracle ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-href-columns.ts --apply --confirm-drop-href
//
// Se a auditoria encontrar hrefs legados divergentes, revise as amostras e declare a decisão de
// descartá-los com --allow-divergent-hrefs junto das flags acima.
//
// No Oracle, SET UNUSED é metadata-only; a recuperação do espaço exige uma janela posterior:
//   ... --apply --confirm-drop-href --reclaim-space
import { config as loadEnv } from 'dotenv';
import { databaseConfigOf, loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

const HREF_TABLES = [
  ['tmf_geographic_location', '/tmf-api/geographicLocationManagement/v4/geographicLocation', 'id'],
  ['tmf_geographic_address', '/tmf-api/geographicAddressManagement/v4/geographicAddress', 'id'],
  [
    'tmf_geographic_site_specification',
    '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification',
    'id',
  ],
  ['tmf_geographic_site', '/tmf-api/geographicSiteManagement/v4/geographicSite', 'id'],
  ['tmf_geographic_relationship_type', '/v1/geo/relationship-types', 'code'],
  ['tmf_resource_specification', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', 'id'],
  ['tmf_resource_type', '/tmf-api/resourceCatalogManagement/v4/resourceType', 'id'],
  [
    'tmf_resource_function_specification',
    '/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification',
    'id',
  ],
  ['tmf_physical_resource', '/tmf-api/resourceInventoryManagement/v4/resource', 'id'],
  ['tmf_logical_resource', '/tmf-api/resourceInventoryManagement/v4/resource', 'id'],
  ['tmf_service_specification', '/tmf-api/serviceCatalogManagement/v4/serviceSpecification', 'id'],
  ['tmf_service_category', '/tmf-api/serviceCatalogManagement/v4/serviceCategory', 'id'],
  ['tmf_service_candidate', '/tmf-api/serviceCatalogManagement/v4/serviceCandidate', 'id'],
  ['tmf_resource_facing_service', '/tmf-api/serviceInventoryManagement/v4/service', 'id'],
  ['tmf_customer_facing_service', '/tmf-api/serviceInventoryManagement/v4/service', 'id'],
  [
    'tmf_service_qualification',
    '/tmf-api/serviceQualificationManagement/v4/serviceQualification',
    'id',
  ],
  ['tmf_service_order', '/tmf-api/serviceOrderingManagement/v4/serviceOrder', 'id'],
  ['tmf_resource_order', '/tmf-api/resourceOrderingManagement/v4/resourceOrder', 'id'],
  ['tmf_party', '/tmf-api/partyManagement/v4/party', 'id'],
  ['tmf_party_role', '/tmf-api/partyRoleManagement/v4/partyRole', 'id'],
  ['research_session', '/v1/search/sessions', 'id'],
] as const;

type HrefTable = (typeof HREF_TABLES)[number];
type AuditRow = {
  total: number | string;
  nullCount: number | string;
  divergenceCount: number | string;
};
type DivergenceSample = {
  key: string;
  href: string;
  expectedHref: string;
};

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const apply = hasFlag('--apply');
const confirmed = hasFlag('--confirm-drop-href');
const allowDivergentHrefs = hasFlag('--allow-divergent-hrefs');
const reclaimSpace = hasFlag('--reclaim-space');

if (apply && !confirmed) {
  throw new Error('A remoção física exige --apply --confirm-drop-href. Sem flags, o script apenas audita.');
}
if (reclaimSpace && !apply) {
  throw new Error('--reclaim-space exige --apply --confirm-drop-href.');
}

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const databaseConfig = databaseConfigOf(config);
const client = createDatabaseClient(databaseConfig);

const toNumber = (value: number | string): number => Number(value);

const hrefColumnExists = async (table: string): Promise<boolean> => {
  if (databaseConfig.provider === 'oracle') {
    const objectName = `${databaseConfig.objectPrefix}${table}`;
    const row = await client.queryOne<{ count: number | string }>(
      "SELECT COUNT(*) AS count FROM user_tab_cols WHERE table_name = UPPER(?) AND column_name = 'HREF'",
      [objectName],
    );
    return toNumber(row?.count ?? 0) > 0;
  }

  const row = await client.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = 'href'",
    [table],
  );
  return toNumber(row?.count ?? 0) > 0;
};

const auditTable = async ([table, path, key]: HrefTable): Promise<AuditRow> =>
  (await client.queryOne<AuditRow>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN href IS NULL THEN 1 ELSE 0 END) AS "nullCount",
       SUM(CASE WHEN href IS NOT NULL AND href <> ? || '/' || ${key} THEN 1 ELSE 0 END) AS "divergenceCount"
     FROM ${table}`,
    [path],
  )) ?? { total: 0, nullCount: 0, divergenceCount: 0 };

const sampleDivergences = async ([table, path, key]: HrefTable): Promise<DivergenceSample[]> =>
  await client.queryMany<DivergenceSample>(
    `SELECT ${key} AS "key", href, ? || '/' || ${key} AS "expectedHref"
       FROM ${table}
      WHERE href IS NOT NULL AND href <> ? || '/' || ${key}
      LIMIT 20`,
    [path, path],
  );

try {
  // Auditoria nunca aplica migrations: HML/PRD devem ser atualizados pelo fluxo de deploy antes de
  // qualquer alteração física. Com DATABASE_AUTO_SCHEMA=false, drift impede a execução de forma segura.
  await client.initialize();

  let tablesWithColumn = 0;
  let totalDivergences = 0;
  let totalNulls = 0;

  for (const definition of HREF_TABLES) {
    const [table] = definition;
    if (!(await hrefColumnExists(table))) {
      process.stdout.write(`SKIP ${table} (coluna href ausente)\n`);
      continue;
    }

    tablesWithColumn += 1;
    const result = await auditTable(definition);
    const total = toNumber(result.total);
    const nullCount = toNumber(result.nullCount);
    const divergenceCount = toNumber(result.divergenceCount);
    totalNulls += nullCount;
    totalDivergences += divergenceCount;
    process.stdout.write(
      `AUDIT ${table}: total=${total}, nulos=${nullCount}, divergentes=${divergenceCount}\n`,
    );
    if (divergenceCount > 0) {
      for (const sample of await sampleDivergences(definition)) {
        process.stdout.write(
          `  DIVERGÊNCIA ${table} key=${sample.key}: href=${sample.href}; esperado=${sample.expectedHref}\n`,
        );
      }
    }
  }

  if (totalDivergences > 0 && !(apply && allowDivergentHrefs)) {
    throw new Error(
      `Auditoria encontrou ${totalDivergences} href(s) divergente(s). Investigue antes da remoção física ou use --allow-divergent-hrefs para descartar explicitamente os valores legados auditados.`,
    );
  }

  const divergenceSummary =
    totalDivergences === 0
      ? 'nenhuma divergência'
      : `${totalDivergences} href(s) divergente(s) descartado(s) por confirmação explícita`;
  process.stdout.write(
    `Auditoria aprovada: ${tablesWithColumn} tabela(s) com href; ${totalNulls} valor(es) nulos; ${divergenceSummary}.\n`,
  );

  if (!apply) {
    process.stdout.write('Nenhuma alteração aplicada. Use --apply --confirm-drop-href somente após revisar esta auditoria.\n');
  } else {
    for (const [table] of HREF_TABLES) {
      if (!(await hrefColumnExists(table))) continue;
      const sql =
        client.provider === 'oracle'
          ? `ALTER TABLE ${table} SET UNUSED COLUMN href`
          : `ALTER TABLE ${table} DROP COLUMN href`;
      await client.run(sql);
      process.stdout.write(`DROP ${table}\n`);
    }

    if (reclaimSpace && client.provider === 'oracle') {
      for (const [table] of HREF_TABLES) {
        await client.run(`ALTER TABLE ${table} DROP UNUSED COLUMNS CHECKPOINT 1000`);
        process.stdout.write(`RECLAIM ${table}\n`);
      }
    }

    process.stdout.write(`Remoção física de href concluída em ${client.provider}.\n`);
  }
} finally {
  await client.close();
}
