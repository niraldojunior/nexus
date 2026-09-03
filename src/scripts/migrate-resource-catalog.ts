// Migração controlada da Fase A do Resource Catalog (issue #188, plano §7 + addendum Task #12).
//
// Auditoria (não grava):
//   npm run migrate:resource-catalog
//
// Escrita (Fase A — aditiva/backfill, nunca Fase B destrutiva):
//   npm run migrate:resource-catalog -- --apply --confirm-resource-catalog-backfill
//
// A escrita relaxa a unicidade global de `code` em tmf_resource_category/tmf_resource_type para
// `UNIQUE(tenant_id, code)` (lookup de nome de constraint em runtime, nunca hardcoded — mesmo
// padrão de `drop-href-columns.ts`), materializa ResourceType por tenant `vtal`, migra as tabelas
// do módulo Resource de `default` para `vtal`, converte Category/Layer/Type em
// ResourceCatalogNode e faz o backfill em lote de `resource_type_id`. Nunca remove coluna/tabela
// legada — isso é Fase B, script/flag separados, ainda bloqueados.
import { config as loadEnv } from 'dotenv';
import { databaseConfigOf, loadConfig } from '../shared/config/env.js';
import type { DatabaseSession } from '../shared/persistence/database-client.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';
import { RESOURCE_CATALOG_BOOTSTRAP } from '../modules/resource/catalog.js';
import { createCanonicalId } from '../shared/utils/canonical-id.js';

loadEnv();

type CountRow = { count: number | string };
type IdRow = { id: string };
type TenantRow = { tableName: string; tenantId: string; count: number | string };
type CategoryRow = { id: string; code: string; parentCode: string | null };
type AuditFinding = { code: string; table: string; count: number; sampleIds: string[] };
type AuditReport = {
  provider: 'postgres' | 'oracle';
  mode: 'audit-only';
  allowedTenants: readonly string[];
  findings: AuditFinding[];
  countsByTenant: TenantRow[];
  approved: boolean;
};

const ALLOWED_TENANTS = ['default', 'vtal', 'tecto'] as const;
const RESOURCE_TENANT_TABLES = [
  'tmf_resource_catalog',
  'tmf_resource_category',
  'tmf_resource_layer',
  'tmf_resource_type',
  'tmf_resource_specification',
  'tmf_resource_function_specification',
  'tmf_resource_status_catalog',
  'tmf_physical_resource',
  'tmf_logical_resource',
] as const;
const SAMPLE_LIMIT = 20;

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const apply = hasFlag('--apply');
const confirmedBackfill = hasFlag('--confirm-resource-catalog-backfill');
const confirmedCutover = hasFlag('--confirm-resource-catalog-cutover');
const isCutover = hasFlag('--cutover');

if (apply && !confirmedBackfill && !confirmedCutover) {
  throw new Error(
    'A escrita exige --confirm-resource-catalog-backfill (Fase A) ou --cutover --confirm-resource-catalog-cutover (Fase B).',
  );
}
if ((confirmedBackfill || confirmedCutover) && !apply) {
  throw new Error('--confirm-* exige --apply junto.');
}
if (isCutover && !confirmedCutover) {
  throw new Error('Fase B (--cutover) exige --apply --confirm-resource-catalog-cutover.');
}

// Único sentido migrado nesta Fase A: linhas legadas (sem tenant, hoje armazenadas como
// tenant_id='default') passam a existir também sob tenant_id='vtal' — decisão firmada no plano
// ("Decisões já firmadas"; `tecto` fica vazio). Não migra nenhum outro módulo.
const SOURCE_TENANT = 'default';
const DESTINATION_TENANT = 'vtal';
const CHUNK_SIZE = 20_000;

// Tabelas do módulo Resource que só precisam de reclassificação de tenant_id — tmf_resource_type
// fica de fora: é materializado (cópia com novo id), não relabeled, ver `materializeResourceTypes`.
const TENANT_MIGRATE_TABLES = [
  'tmf_resource_catalog',
  'tmf_resource_category',
  'tmf_resource_layer',
  'tmf_resource_specification',
  'tmf_resource_function_specification',
  'tmf_resource_status_catalog',
  'tmf_physical_resource',
  'tmf_logical_resource',
] as const;

// Nomes de constraint tenant-scoped que este script cria — seguem a mesma convenção
// `<tabela>_<colunas>_key` já usada em `tmf_resource_type_tenant_id_id_key` (batch v2). O nome da
// constraint global antiga (`code TEXT NOT NULL UNIQUE` inline) nunca é hardcoded: é resolvido em
// runtime via metadata (`findUniqueConstraintOnColumn`), porque Postgres e Oracle geram nomes
// diferentes (e o Postgres em si pode variar conforme o histórico de migrations do ambiente).
const RELAX_GLOBAL_CODE_UNIQUENESS_TARGETS = [
  { table: 'tmf_resource_category', constraintName: 'tmf_resource_category_tenant_id_code_key' },
  { table: 'tmf_resource_type', constraintName: 'tmf_resource_type_tenant_id_code_key' },
] as const;

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const databaseConfig = databaseConfigOf(config);
const client = createDatabaseClient(databaseConfig);

const count = async (db: DatabaseSession, sql: string, params: unknown[] = []): Promise<number> =>
  Number((await db.queryOne<CountRow>(sql, params))?.count ?? 0);

const sampleIds = async (
  db: DatabaseSession,
  sql: string,
  params: unknown[] = [],
): Promise<string[]> =>
  (await db.queryMany<IdRow>(`${sql} FETCH FIRST ${SAMPLE_LIMIT} ROWS ONLY`, params)).map(
    (row) => row.id,
  );

const addFinding = async (
  db: DatabaseSession,
  findings: AuditFinding[],
  code: string,
  table: string,
  countSql: string,
  sampleSql: string,
  params: unknown[] = [],
): Promise<void> => {
  const total = await count(db, countSql, params);
  if (total === 0) return;
  findings.push({
    code,
    table,
    count: total,
    sampleIds: await sampleIds(db, sampleSql, params),
  });
};

const auditResourceTypesForTenant = async (
  db: DatabaseSession,
  findings: AuditFinding[],
  tenantId: string,
): Promise<void> => {
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_TYPE_CODE_EMPTY',
    'tmf_resource_type',
    `SELECT COUNT(*) AS count FROM tmf_resource_type
      WHERE tenant_id = ? AND (code IS NULL OR TRIM(code) = '')`,
    `SELECT id FROM tmf_resource_type
      WHERE tenant_id = ? AND (code IS NULL OR TRIM(code) = '') ORDER BY id`,
    [tenantId],
  );
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_TYPE_CODE_DUPLICATE_DESTINATION',
    'tmf_resource_type',
    `SELECT COUNT(*) AS count FROM (
       SELECT LOWER(code) AS normalized_code
         FROM tmf_resource_type
        WHERE tenant_id = ?
        GROUP BY LOWER(code)
       HAVING COUNT(*) > 1
     ) duplicates`,
    `SELECT MIN(id) AS id FROM tmf_resource_type
      WHERE tenant_id = ?
      GROUP BY LOWER(code)
     HAVING COUNT(*) > 1 ORDER BY id`,
    [tenantId],
  );
};

const auditDefaultDestinationCollisions = async (
  db: DatabaseSession,
  findings: AuditFinding[],
): Promise<void> => {
  const incompatible = await db.queryMany<IdRow>(
    `SELECT source.id
       FROM tmf_resource_type source
       JOIN tmf_resource_type destination
         ON destination.tenant_id = 'vtal'
        AND LOWER(destination.code) = LOWER(source.code)
      WHERE source.tenant_id = 'default'
        AND (destination.code <> source.code
          OR destination.name <> source.name
          OR destination.status <> source.status
          OR COALESCE(destination.description, '') <> COALESCE(source.description, '')
          OR COALESCE(destination.map_presence, -1) <> COALESCE(source.map_presence, -1))
      ORDER BY source.id`,
  );
  if (incompatible.length > 0) {
    findings.push({
      code: 'RESOURCE_CATALOG_TYPE_DESTINATION_INCOMPATIBLE',
      table: 'tmf_resource_type',
      count: incompatible.length,
      sampleIds: incompatible.slice(0, SAMPLE_LIMIT).map((row) => row.id),
    });
  }
};

const auditResourceRowsForTenant = async (
  db: DatabaseSession,
  findings: AuditFinding[],
  tenantId: string,
): Promise<void> => {
  // O join aceita a categoria tanto no mesmo tenant do tipo quanto em DESTINATION_TENANT quando o
  // tipo é SOURCE_TENANT ('default'): a etapa 3 (`migrateTenantChunked`) já pode ter relabelado
  // `tmf_resource_category` para `vtal` sem que os `tmf_resource_type` originais de `default`
  // tenham sido tocados (são mantidos como fonte de materialização, nunca migrados — C6). É estado
  // transitório válido de uma reexecução (--apply resumido), não divergência de dado.
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_TYPE_CATEGORY_MISSING',
    'tmf_resource_type',
    `SELECT COUNT(*) AS count FROM tmf_resource_type rt
       LEFT JOIN tmf_resource_category rc ON rc.code = rt.category_code
        AND (rc.tenant_id = rt.tenant_id OR (rt.tenant_id = ? AND rc.tenant_id = ?))
      WHERE rt.tenant_id = ? AND rc.id IS NULL`,
    `SELECT rt.id FROM tmf_resource_type rt
       LEFT JOIN tmf_resource_category rc ON rc.code = rt.category_code
        AND (rc.tenant_id = rt.tenant_id OR (rt.tenant_id = ? AND rc.tenant_id = ?))
      WHERE rt.tenant_id = ? AND rc.id IS NULL ORDER BY rt.id`,
    [SOURCE_TENANT, DESTINATION_TENANT, tenantId],
  );
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_SPEC_TYPE_UNRESOLVED',
    'tmf_resource_specification',
    `SELECT COUNT(*) AS count FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_type rt ON rt.tenant_id = rs.tenant_id AND rt.code = rs.resource_type
      WHERE rs.tenant_id = ? AND rt.id IS NULL`,
    `SELECT rs.id FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_type rt ON rt.tenant_id = rs.tenant_id AND rt.code = rs.resource_type
      WHERE rs.tenant_id = ? AND rt.id IS NULL ORDER BY rs.id`,
    [tenantId],
  );
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_SPEC_CATEGORY_MISSING',
    'tmf_resource_specification',
    `SELECT COUNT(*) AS count FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_category rc ON rc.tenant_id = rs.tenant_id AND rc.code = rs.category
      WHERE rs.tenant_id = ? AND rc.id IS NULL`,
    `SELECT rs.id FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_category rc ON rc.tenant_id = rs.tenant_id AND rc.code = rs.category
      WHERE rs.tenant_id = ? AND rc.id IS NULL ORDER BY rs.id`,
    [tenantId],
  );
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_SPEC_LAYER_CROSS_TENANT_OR_MISSING',
    'tmf_resource_specification',
    `SELECT COUNT(*) AS count FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_layer rl ON rl.id = rs.resource_layer_id AND rl.tenant_id = rs.tenant_id
      WHERE rs.tenant_id = ? AND rs.resource_layer_id IS NOT NULL AND rl.id IS NULL`,
    `SELECT rs.id FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_layer rl ON rl.id = rs.resource_layer_id AND rl.tenant_id = rs.tenant_id
      WHERE rs.tenant_id = ? AND rs.resource_layer_id IS NOT NULL AND rl.id IS NULL ORDER BY rs.id`,
    [tenantId],
  );
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_SPEC_TYPE_ID_DIVERGENT',
    'tmf_resource_specification',
    `SELECT COUNT(*) AS count FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_type rt ON rt.id = rs.resource_type_id AND rt.tenant_id = rs.tenant_id
      WHERE rs.tenant_id = ? AND rs.resource_type_id IS NOT NULL
        AND (rt.id IS NULL OR rt.code <> rs.resource_type)`,
    `SELECT rs.id FROM tmf_resource_specification rs
       LEFT JOIN tmf_resource_type rt ON rt.id = rs.resource_type_id AND rt.tenant_id = rs.tenant_id
      WHERE rs.tenant_id = ? AND rs.resource_type_id IS NOT NULL
        AND (rt.id IS NULL OR rt.code <> rs.resource_type) ORDER BY rs.id`,
    [tenantId],
  );
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_STATUS_TYPE_UNRESOLVED',
    'tmf_resource_status_catalog',
    `SELECT COUNT(*) AS count FROM tmf_resource_status_catalog sc
       LEFT JOIN tmf_resource_type rt ON rt.tenant_id = sc.tenant_id AND rt.code = sc.resource_type
      WHERE sc.tenant_id = ? AND sc.resource_type IS NOT NULL AND rt.id IS NULL`,
    `SELECT sc.code AS id FROM tmf_resource_status_catalog sc
       LEFT JOIN tmf_resource_type rt ON rt.tenant_id = sc.tenant_id AND rt.code = sc.resource_type
      WHERE sc.tenant_id = ? AND sc.resource_type IS NOT NULL AND rt.id IS NULL ORDER BY sc.code`,
    [tenantId],
  );
};

const auditResourceSpecTenants = async (
  db: DatabaseSession,
  findings: AuditFinding[],
): Promise<void> => {
  // `TENANT_MIGRATE_TABLES` migra `tmf_resource_specification` antes de
  // `tmf_physical_resource`/`tmf_logical_resource` (passo 3) — um `resource` ainda em
  // SOURCE_TENANT apontando para uma `specification` já em DESTINATION_TENANT é a ordem esperada
  // de uma reexecução (--apply resumido), não divergência real. Qualquer outra combinação
  // continua reprovando.
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_PHYSICAL_SPEC_TENANT_DIVERGENCE',
    'tmf_physical_resource',
    `SELECT COUNT(*) AS count FROM tmf_physical_resource r
       JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
      WHERE r.tenant_id <> rs.tenant_id
        AND NOT (r.tenant_id = ? AND rs.tenant_id = ?)`,
    `SELECT r.id FROM tmf_physical_resource r
       JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
      WHERE r.tenant_id <> rs.tenant_id
        AND NOT (r.tenant_id = ? AND rs.tenant_id = ?) ORDER BY r.id`,
    [SOURCE_TENANT, DESTINATION_TENANT],
  );
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_LOGICAL_SPEC_TENANT_DIVERGENCE',
    'tmf_logical_resource',
    `SELECT COUNT(*) AS count FROM tmf_logical_resource r
       JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
      WHERE r.tenant_id <> rs.tenant_id
        AND NOT (r.tenant_id = ? AND rs.tenant_id = ?)`,
    `SELECT r.id FROM tmf_logical_resource r
       JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
      WHERE r.tenant_id <> rs.tenant_id
        AND NOT (r.tenant_id = ? AND rs.tenant_id = ?) ORDER BY r.id`,
    [SOURCE_TENANT, DESTINATION_TENANT],
  );
};

const auditCategoryHierarchy = async (
  db: DatabaseSession,
  findings: AuditFinding[],
  tenantId: string,
): Promise<void> => {
  const rows = await db.queryMany<CategoryRow>(
    `SELECT id, code, parent_category_code AS "parentCode"
       FROM tmf_resource_category WHERE tenant_id = ?`,
    [tenantId],
  );
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const missingParent = rows.filter((row) => row.parentCode && !byCode.has(row.parentCode));
  if (missingParent.length > 0) {
    findings.push({
      code: 'RESOURCE_CATALOG_CATEGORY_PARENT_MISSING',
      table: 'tmf_resource_category',
      count: missingParent.length,
      sampleIds: missingParent.slice(0, SAMPLE_LIMIT).map((row) => row.id),
    });
  }

  const cyclic = new Set<string>();
  for (const row of rows) {
    const visited = new Set<string>();
    let cursor: string | null = row.code;
    while (cursor) {
      if (visited.has(cursor)) {
        for (const code of visited) cyclic.add(code);
        break;
      }
      visited.add(cursor);
      cursor = byCode.get(cursor)?.parentCode ?? null;
    }
  }
  if (cyclic.size > 0) {
    findings.push({
      code: 'RESOURCE_CATALOG_CATEGORY_CYCLE',
      table: 'tmf_resource_category',
      count: cyclic.size,
      sampleIds: [...cyclic].slice(0, SAMPLE_LIMIT),
    });
  }
};

const audit = async (db: DatabaseSession): Promise<AuditReport> => {
  const findings: AuditFinding[] = [];
  const countsByTenant: TenantRow[] = [];

  for (const table of RESOURCE_TENANT_TABLES) {
    const rows = await db.queryMany<TenantRow>(
      `SELECT ? AS "tableName", tenant_id AS "tenantId", COUNT(*) AS count
         FROM ${table}
        GROUP BY tenant_id
        ORDER BY tenant_id`,
      [table],
    );
    countsByTenant.push(...rows);
    await addFinding(
      db,
      findings,
      'RESOURCE_CATALOG_TENANT_UNSUPPORTED',
      table,
      `SELECT COUNT(*) AS count FROM ${table}
        WHERE tenant_id NOT IN ('default', 'vtal', 'tecto') OR tenant_id IS NULL`,
      `SELECT id FROM ${table}
        WHERE tenant_id NOT IN ('default', 'vtal', 'tecto') OR tenant_id IS NULL ORDER BY id`,
    );
  }

  for (const tenantId of ALLOWED_TENANTS) {
    await auditResourceTypesForTenant(db, findings, tenantId);
    await auditResourceRowsForTenant(db, findings, tenantId);
    await auditCategoryHierarchy(db, findings, tenantId);
  }
  await auditDefaultDestinationCollisions(db, findings);
  await auditResourceSpecTenants(db, findings);

  return {
    provider: databaseConfig.provider,
    mode: 'audit-only',
    allowedTenants: ALLOWED_TENANTS,
    findings,
    countsByTenant,
    approved: findings.length === 0,
  };
};

// --- Writer da Fase A (--apply --confirm-resource-catalog-backfill) ----------------------------
// Tudo abaixo só executa com as duas flags. Cada etapa é resumível por reconsulta de estado
// (idempotente): reexecutar após uma falha parcial não duplica nada, só completa o que faltou.

type UniqueConstraintNameRow = { name: string };
type ConstraintColumnCountRow = { count: number | string };

/**
 * Acha, por metadata (nunca hardcoded), o nome da constraint UNIQUE de coluna única exatamente
 * `column` em `table` — mesmo padrão de `drop-href-columns.ts`. Descarta constraints compostas
 * (ex. `UNIQUE(tenant_id, id)`, que não é a que queremos relaxar).
 */
const findUniqueConstraintOnColumn = async (
  db: DatabaseSession,
  table: string,
  column: string,
): Promise<string | null> => {
  const candidates =
    databaseConfig.provider === 'oracle'
      ? await db.queryMany<UniqueConstraintNameRow>(
          `SELECT DISTINCT uc.constraint_name AS "name"
             FROM user_constraints uc
            WHERE uc.table_name = UPPER(?) AND uc.constraint_type = 'U'
              AND EXISTS (
                SELECT 1 FROM user_cons_columns c1
                 WHERE c1.constraint_name = uc.constraint_name AND UPPER(c1.column_name) = UPPER(?)
              )`,
          [`${databaseConfig.objectPrefix}${table}`, column],
        )
      : await db.queryMany<UniqueConstraintNameRow>(
          `SELECT DISTINCT tc.constraint_name AS "name"
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
            WHERE tc.table_schema = current_schema() AND tc.table_name = ? AND tc.constraint_type = 'UNIQUE'
              AND EXISTS (
                SELECT 1 FROM information_schema.key_column_usage k1
                 WHERE k1.constraint_name = tc.constraint_name AND k1.table_schema = tc.table_schema
                   AND k1.column_name = ?
              )`,
          [table, column],
        );

  for (const candidate of candidates) {
    const columnCount =
      databaseConfig.provider === 'oracle'
        ? await db.queryOne<ConstraintColumnCountRow>(
            `SELECT COUNT(*) AS count FROM user_cons_columns WHERE constraint_name = ?`,
            [candidate.name],
          )
        : await db.queryOne<ConstraintColumnCountRow>(
            `SELECT COUNT(*) AS count FROM information_schema.key_column_usage
              WHERE table_schema = current_schema() AND constraint_name = ?`,
            [candidate.name],
          );
    if (Number(columnCount?.count ?? 0) === 1) return candidate.name;
  }
  return null;
};

type ForeignKeyDependentRow = { tableName: string; name: string };

/**
 * Ex.: `tmf_resource_type.category_code` referencia `tmf_resource_category(code)` via FK —
 * Oracle recusa (`ORA-02273`) dropar a `UNIQUE`/`PK` alvo enquanto essa FK existir. Achamos e
 * removemos essas FKs dependentes antes de relaxar a constraint; não as recriamos: a coluna que
 * elas protegiam (`category_code`) só sai de vez na Fase B, e o Gate A já garante que os valores
 * existentes são íntegros — a checagem em runtime deixa de existir no meio-tempo, sem risco novo
 * de dado (nenhum código legado é escrito depois desta migração).
 */
const findDependentForeignKeys = async (
  db: DatabaseSession,
  parentConstraintName: string,
): Promise<ForeignKeyDependentRow[]> => {
  if (databaseConfig.provider === 'oracle') {
    return db.queryMany<ForeignKeyDependentRow>(
      `SELECT table_name AS "tableName", constraint_name AS "name"
         FROM user_constraints
        WHERE constraint_type = 'R' AND r_constraint_name = UPPER(?)`,
      [parentConstraintName],
    );
  }
  return db.queryMany<ForeignKeyDependentRow>(
    `SELECT tc.table_name AS "tableName", tc.constraint_name AS "name"
       FROM information_schema.table_constraints tc
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND rc.unique_constraint_name = ?`,
    [parentConstraintName],
  );
};

/** Metadata de Oracle devolve o nome de objeto já prefixado (`ORACLE_OBJECT_PREFIX`) — as DDLs
 * deste script vão todas por `client.execute`, que reaplica o prefixo sozinho (`transformOracleQuery`),
 * então precisamos do nome "cru" de volta antes de montar o próximo `ALTER TABLE`. */
const stripObjectPrefix = (rawTableName: string): string => {
  if (databaseConfig.provider !== 'oracle') return rawTableName;
  const prefix = databaseConfig.objectPrefix.toUpperCase();
  const upper = rawTableName.toUpperCase();
  return (upper.startsWith(prefix) ? upper.slice(prefix.length) : upper).toLowerCase();
};

const constraintExistsByName = async (
  db: DatabaseSession,
  table: string,
  constraintName: string,
): Promise<boolean> => {
  const row =
    databaseConfig.provider === 'oracle'
      ? await db.queryOne<ConstraintColumnCountRow>(
          `SELECT COUNT(*) AS count FROM user_constraints WHERE table_name = UPPER(?) AND constraint_name = UPPER(?)`,
          [`${databaseConfig.objectPrefix}${table}`, constraintName],
        )
      : await db.queryOne<ConstraintColumnCountRow>(
          `SELECT COUNT(*) AS count FROM information_schema.table_constraints
            WHERE table_schema = current_schema() AND table_name = ? AND constraint_name = ?`,
          [table, constraintName],
        );
  return Number(row?.count ?? 0) > 0;
};

/**
 * Relaxa `UNIQUE(code)` global para `UNIQUE(tenant_id, code)` em `table`. Puramente aditivo do
 * ponto de vista de dado (nenhuma linha é tocada) — só a constraint muda. Idempotente: se a
 * constraint tenant-scoped já existe (execução anterior), não faz nada.
 */
const relaxGlobalCodeUniqueness = async (
  db: DatabaseSession,
  table: string,
  newConstraintName: string,
): Promise<'relaxed' | 'already-relaxed'> => {
  if (await constraintExistsByName(db, table, newConstraintName)) {
    return 'already-relaxed';
  }
  const globalConstraintName = await findUniqueConstraintOnColumn(db, table, 'code');
  if (!globalConstraintName) {
    throw new Error(
      `Não encontrei a constraint UNIQUE(code) legada em ${table} nem a constraint tenant-scoped ${newConstraintName} já aplicada. Investigue o schema antes de prosseguir — nenhum estado automático é seguro aqui.`,
    );
  }
  for (const dependent of await findDependentForeignKeys(db, globalConstraintName)) {
    const childTable = stripObjectPrefix(dependent.tableName);
    await db.execute(`ALTER TABLE ${childTable} DROP CONSTRAINT ${dependent.name}`);
    process.stdout.write(
      `    DROP FK dependente ${dependent.name} em ${childTable} (referenciava ${table}.code)\n`,
    );
  }
  await db.execute(`ALTER TABLE ${table} DROP CONSTRAINT ${globalConstraintName}`);
  await db.execute(`ALTER TABLE ${table} ADD CONSTRAINT ${newConstraintName} UNIQUE(tenant_id, code)`);
  return 'relaxed';
};

/**
 * Tabelas migradas cuja chave é natural (`tenant_id, code`), sem coluna `id` própria —
 * `tmf_resource_status_catalog` é a única no módulo Resource (§2.5 do plano). O chunking por `id`
 * não se aplica; como o Gate A já mostrou uma dezena de linhas nessa tabela (bem abaixo de
 * `CHUNK_SIZE`), um único `UPDATE` direto por `tenant_id` substitui o laço de chunking.
 */
const NO_ID_COLUMN_TABLES = new Set<string>(['tmf_resource_status_catalog']);

/**
 * `UPDATE ... WHERE id IN (SELECT ... FETCH FIRST n ROWS ONLY)` em loop até zerar. Cada chunk é
 * uma instrução isolada — no Oracle autocommita sozinha; no Postgres é uma transação implícita de
 * uma instrução. Uma falha no meio perde só o chunk em voo, nunca os já aplicados (idempotente:
 * a próxima chamada só vê o que ainda está em `fromTenant`). Tabelas sem coluna `id`
 * (`NO_ID_COLUMN_TABLES`) pulam o chunking e usam um `UPDATE` direto por `tenant_id`.
 */
const migrateTenantChunked = async (
  table: string,
  fromTenant: string,
  toTenant: string,
): Promise<number> => {
  if (NO_ID_COLUMN_TABLES.has(table)) {
    const result = await client.execute(`UPDATE ${table} SET tenant_id = ? WHERE tenant_id = ?`, [
      toTenant,
      fromTenant,
    ]);
    if (result.changes > 0) {
      process.stdout.write(`    MIGRATE ${table}: +${result.changes} linha(s) (total ${result.changes})\n`);
    }
    return result.changes;
  }
  let migrated = 0;
  for (;;) {
    const result = await client.execute(
      `UPDATE ${table} SET tenant_id = ?
        WHERE id IN (
          SELECT id FROM ${table} WHERE tenant_id = ? FETCH FIRST ${CHUNK_SIZE} ROWS ONLY
        )`,
      [toTenant, fromTenant],
    );
    if (result.changes === 0) break;
    migrated += result.changes;
    process.stdout.write(`    MIGRATE ${table}: +${result.changes} linha(s) (total ${migrated})\n`);
  }
  return migrated;
};

type TypeRow = {
  id: string;
  code: string;
  name: string;
  category_code: string;
  description: string | null;
  status: string;
  map_presence: number | string | null;
};
type MaterializedType = { destinationId: string; code: string };

/**
 * Passo 2 do plano §7 Fase A: para cada `ResourceType` em `default`, reusa o tipo já existente em
 * `vtal` com o mesmo código (já auditado compatível por `auditDefaultDestinationCollisions`) ou
 * cria uma cópia com `id` novo. Nunca apaga/edita o original em `default` (C6). Devolve o mapa
 * `sourceId -> destino` usado pelos passos seguintes.
 */
const materializeResourceTypes = async (
  db: DatabaseSession,
): Promise<Map<string, MaterializedType>> => {
  const sourceTypes = await db.queryMany<TypeRow>(
    `SELECT id, code, name, category_code, description, status, map_presence
       FROM tmf_resource_type WHERE tenant_id = ? ORDER BY code`,
    [SOURCE_TENANT],
  );
  const map = new Map<string, MaterializedType>();
  const now = new Date().toISOString();
  for (const source of sourceTypes) {
    const existing = await db.queryOne<{ id: string }>(
      `SELECT id FROM tmf_resource_type WHERE tenant_id = ? AND code = ?`,
      [DESTINATION_TENANT, source.code],
    );
    if (existing) {
      map.set(source.id, { destinationId: existing.id, code: source.code });
      continue;
    }
    const newId = createCanonicalId();
    await db.execute(
      `INSERT INTO tmf_resource_type
       (id, tenant_id, code, name, category_code, description, status, map_presence, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        DESTINATION_TENANT,
        source.code,
        source.name,
        source.category_code,
        source.description,
        source.status,
        source.map_presence,
        now,
        now,
      ],
    );
    map.set(source.id, { destinationId: newId, code: source.code });
    process.stdout.write(`    TYPE ${source.code}: cópia nova ${newId} em ${DESTINATION_TENANT}\n`);
  }
  return map;
};

/**
 * Passo 5 do plano §7 Fase A: o boot já garante isso (`seedResourceCatalogContainers`,
 * insert-if-missing) — aqui é só confirmação/criação de segurança caso o script rode antes do
 * primeiro boot pós-migration.
 */
const ensureDefaultCatalog = async (db: DatabaseSession): Promise<string> => {
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM tmf_resource_catalog WHERE tenant_id = ? AND code = ?`,
    [DESTINATION_TENANT, RESOURCE_CATALOG_BOOTSTRAP.code],
  );
  if (existing) return existing.id;
  const id = createCanonicalId();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO tmf_resource_catalog
     (id, tenant_id, code, name, description, status, is_default, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', 1, 0, ?, ?)`,
    [
      id,
      DESTINATION_TENANT,
      RESOURCE_CATALOG_BOOTSTRAP.code,
      RESOURCE_CATALOG_BOOTSTRAP.name,
      RESOURCE_CATALOG_BOOTSTRAP.description,
      now,
      now,
    ],
  );
  return id;
};

type NodeFields = {
  name: string;
  kind: 'GROUP' | 'RESOURCE_TYPE';
  parentNodeId: string | null;
  resourceTypeId: string | null;
  status: string;
  metadata: Record<string, unknown>;
};

/** Idempotente por `(tenant_id, catalog_id, code)` — já existe, devolve o id existente sem tocar. */
const ensureNode = async (
  db: DatabaseSession,
  catalogId: string,
  code: string,
  fields: NodeFields,
): Promise<string> => {
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM tmf_resource_catalog_node WHERE tenant_id = ? AND catalog_id = ? AND code = ?`,
    [DESTINATION_TENANT, catalogId, code],
  );
  if (existing) return existing.id;
  const id = createCanonicalId();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO tmf_resource_catalog_node
     (id, tenant_id, catalog_id, parent_node_id, code, name, kind, resource_type_id, status, sort_order, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id,
      DESTINATION_TENANT,
      catalogId,
      fields.parentNodeId,
      code,
      fields.name,
      fields.kind,
      fields.resourceTypeId,
      fields.status,
      JSON.stringify(fields.metadata),
      now,
      now,
    ],
  );
  process.stdout.write(`    NODE ${code}: criado (${fields.kind})\n`);
  return id;
};

type CategoryFullRow = {
  id: string;
  code: string;
  name: string;
  parent_category_code: string | null;
  description: string | null;
  status: string;
};

/**
 * Cria um `GROUP` por Category (`code = category:<code>`), respeitando `parent_category_code` —
 * grupos raiz ficam sem pai. Resolve profundidade arbitrária em passadas sucessivas (sem assumir
 * ordem de `parent` antes de `filho` na consulta); Gate A já garante zero ciclo/pai ausente.
 */
const buildCategoryNodes = async (
  db: DatabaseSession,
  catalogId: string,
): Promise<Map<string, string>> => {
  const categories = await db.queryMany<CategoryFullRow>(
    `SELECT id, code, name, parent_category_code, description, status
       FROM tmf_resource_category WHERE tenant_id = ? ORDER BY code`,
    [DESTINATION_TENANT],
  );
  const byCode = new Map(categories.map((row) => [row.code, row]));
  const nodeIdByCategoryCode = new Map<string, string>();
  const pending = new Set(categories.map((row) => row.code));

  let progressed = true;
  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const code of [...pending]) {
      const cat = byCode.get(code);
      if (!cat) {
        pending.delete(code);
        continue;
      }
      const parentCode = cat.parent_category_code;
      if (parentCode && !nodeIdByCategoryCode.has(parentCode)) continue;
      const parentNodeId = parentCode ? (nodeIdByCategoryCode.get(parentCode) ?? null) : null;
      const nodeId = await ensureNode(db, catalogId, `category:${code}`, {
        name: cat.name,
        kind: 'GROUP',
        parentNodeId,
        resourceTypeId: null,
        status: cat.status,
        metadata: { _migratedFrom: { categoryCode: code } },
      });
      nodeIdByCategoryCode.set(code, nodeId);
      pending.delete(code);
      progressed = true;
    }
  }
  if (pending.size > 0) {
    throw new Error(
      `Hierarquia de categoria não resolvida (ciclo ou pai ausente pós-migração, deveria ter sido barrado pelo Gate A): ${[...pending].join(', ')}`,
    );
  }
  return nodeIdByCategoryCode;
};

type LayerRow = { id: string; code: string; name: string; status: string };
type ComboRow = { category_code: string; layer_code: string | null; type_code: string };

/**
 * `GROUP category:<c>:layer:<l>` para toda combinação Category+Layer efetivamente usada por
 * alguma Specification; layer nunca referenciada em nenhuma specification vira `GROUP` raiz
 * próprio `layer:<code>` (preserva a entidade sem inventar pai).
 */
const buildComboAndLayerNodes = async (
  db: DatabaseSession,
  catalogId: string,
  categoryNodeIdByCode: Map<string, string>,
): Promise<{ combos: ComboRow[]; comboGroupNodeId: Map<string, string> }> => {
  const combos = await db.queryMany<ComboRow>(
    `SELECT DISTINCT s.category AS category_code, l.code AS layer_code, s.resource_type AS type_code
       FROM tmf_resource_specification s
       LEFT JOIN tmf_resource_layer l ON l.id = s.resource_layer_id AND l.tenant_id = s.tenant_id
      WHERE s.tenant_id = ?`,
    [DESTINATION_TENANT],
  );

  const comboGroupNodeId = new Map<string, string>();
  const usedLayerCodes = new Set<string>();

  for (const combo of combos) {
    if (!combo.layer_code) continue;
    usedLayerCodes.add(combo.layer_code);
    const key = `${combo.category_code}::${combo.layer_code}`;
    if (comboGroupNodeId.has(key)) continue;
    const parentNodeId = categoryNodeIdByCode.get(combo.category_code) ?? null;
    if (!parentNodeId) {
      throw new Error(
        `Specification referencia categoria ${combo.category_code} sem GROUP correspondente — deveria ter sido barrado pelo Gate A.`,
      );
    }
    const nodeId = await ensureNode(
      db,
      catalogId,
      `category:${combo.category_code}:layer:${combo.layer_code}`,
      {
        name: combo.layer_code,
        kind: 'GROUP',
        parentNodeId,
        resourceTypeId: null,
        status: 'active',
        metadata: {
          _migratedFrom: { categoryCode: combo.category_code, layerCode: combo.layer_code },
        },
      },
    );
    comboGroupNodeId.set(key, nodeId);
  }

  const layers = await db.queryMany<LayerRow>(
    `SELECT id, code, name, status FROM tmf_resource_layer WHERE tenant_id = ? ORDER BY code`,
    [DESTINATION_TENANT],
  );
  for (const layer of layers) {
    if (usedLayerCodes.has(layer.code)) continue;
    await ensureNode(db, catalogId, `layer:${layer.code}`, {
      name: layer.name,
      kind: 'GROUP',
      parentNodeId: null,
      resourceTypeId: null,
      status: layer.status,
      metadata: { _migratedFrom: { layerCode: layer.code } },
    });
  }

  return { combos, comboGroupNodeId };
};

/**
 * `RESOURCE_TYPE` sob o grupo mais específico aplicável — uma ocorrência por combinação
 * Category(/Layer) observada, mais o caminho-base pela `category_code` própria do tipo (mesmo sem
 * nenhuma Specification usando essa combinação). Nunca perde ocorrência: mesmo tipo em múltiplas
 * combinações gera múltiplos nodes.
 */
const buildResourceTypeNodes = async (
  db: DatabaseSession,
  catalogId: string,
  categoryNodeIdByCode: Map<string, string>,
  comboGroupNodeId: Map<string, string>,
  combos: ComboRow[],
): Promise<void> => {
  const destinationTypes = await db.queryMany<TypeRow>(
    `SELECT id, code, name, category_code, description, status, map_presence
       FROM tmf_resource_type WHERE tenant_id = ? ORDER BY code`,
    [DESTINATION_TENANT],
  );
  const typeByCode = new Map(destinationTypes.map((row) => [row.code, row]));
  const placed = new Set<string>();

  const placeType = async (
    categoryCode: string,
    layerCode: string | null,
    typeCode: string,
  ): Promise<void> => {
    const type = typeByCode.get(typeCode);
    if (!type) return; // Specification aponta pra um code sem tipo em vtal — Gate A já barra isso.
    const key = `${categoryCode}::${layerCode ?? ''}::${typeCode}`;
    if (placed.has(key)) return;
    placed.add(key);
    const parentNodeId = layerCode
      ? (comboGroupNodeId.get(`${categoryCode}::${layerCode}`) ?? null)
      : (categoryNodeIdByCode.get(categoryCode) ?? null);
    if (!parentNodeId) {
      throw new Error(
        `Node pai ausente para tipo ${typeCode} (categoria=${categoryCode}, layer=${layerCode ?? '-'}).`,
      );
    }
    const nodeCode = layerCode
      ? `category:${categoryCode}:layer:${layerCode}:type:${typeCode}`
      : `category:${categoryCode}:type:${typeCode}`;
    await ensureNode(db, catalogId, nodeCode, {
      name: type.name,
      kind: 'RESOURCE_TYPE',
      parentNodeId,
      resourceTypeId: type.id,
      status: type.status,
      metadata: { _migratedFrom: { categoryCode, layerCode: layerCode ?? undefined } },
    });
  };

  for (const combo of combos) {
    await placeType(combo.category_code, combo.layer_code, combo.type_code);
  }
  for (const type of destinationTypes) {
    await placeType(type.category_code, null, type.code);
  }
};

/**
 * Passo 7 do plano §7 Fase A: em lote por tipo (uma `UPDATE` por código, não por linha) —
 * `NULL` continua "vale para qualquer tipo" em `tmf_resource_status_catalog`.
 */
const backfillResourceTypeIds = async (
  db: DatabaseSession,
  typeMap: Map<string, MaterializedType>,
): Promise<void> => {
  const seen = new Set<string>();
  for (const materialized of typeMap.values()) {
    if (seen.has(materialized.code)) continue;
    seen.add(materialized.code);
    const specResult = await db.execute(
      `UPDATE tmf_resource_specification SET resource_type_id = ?
        WHERE tenant_id = ? AND resource_type = ? AND (resource_type_id IS NULL OR resource_type_id <> ?)`,
      [materialized.destinationId, DESTINATION_TENANT, materialized.code, materialized.destinationId],
    );
    const statusResult = await db.execute(
      `UPDATE tmf_resource_status_catalog SET resource_type_id = ?
        WHERE tenant_id = ? AND resource_type = ? AND (resource_type_id IS NULL OR resource_type_id <> ?)`,
      [materialized.destinationId, DESTINATION_TENANT, materialized.code, materialized.destinationId],
    );
    process.stdout.write(
      `    BACKFILL ${materialized.code}: specification=${specResult.changes}, statusCatalog=${statusResult.changes}\n`,
    );
  }
};

/** Gate B (plano §7): reaproveita o Gate A + checagem específica do backfill. */
const auditGateB = async (db: DatabaseSession): Promise<AuditReport> => {
  const report = await audit(db);
  await addFinding(
    db,
    report.findings,
    'RESOURCE_CATALOG_BACKFILL_SPEC_TYPE_ID_MISSING',
    'tmf_resource_specification',
    `SELECT COUNT(*) AS count FROM tmf_resource_specification WHERE tenant_id = ? AND resource_type_id IS NULL`,
    `SELECT id FROM tmf_resource_specification WHERE tenant_id = ? AND resource_type_id IS NULL ORDER BY id`,
    [DESTINATION_TENANT],
  );
  return {
    ...report,
    approved: report.findings.length === 0,
  };
};

/** Gate D (plano Fase B): preflight isolado para cutover sem consultas a tabelas legadas já ausentes de TABLE_NAMES. */
const auditGateD = async (db: DatabaseSession): Promise<AuditReport> => {
  const findings: AuditFinding[] = [];
  await addFinding(
    db,
    findings,
    'RESOURCE_CATALOG_CUTOVER_SPEC_TYPE_ID_MISSING',
    'tmf_resource_specification',
    `SELECT COUNT(*) AS count FROM tmf_resource_specification WHERE tenant_id = ? AND resource_type_id IS NULL`,
    `SELECT id FROM tmf_resource_specification WHERE tenant_id = ? AND resource_type_id IS NULL ORDER BY id`,
    [DESTINATION_TENANT],
  );
  return {
    provider: databaseConfig.provider,
    mode: 'audit-only',
    allowedTenants: ALLOWED_TENANTS,
    findings,
    countsByTenant: [],
    approved: findings.length === 0,
  };
};

const columnExists = async (
  db: DatabaseSession,
  table: string,
  columnName: string,
): Promise<boolean> => {
  const row =
    databaseConfig.provider === 'oracle'
      ? await db.queryOne<{ count: number | string }>(
          `SELECT COUNT(*) AS count FROM user_tab_cols WHERE table_name = UPPER(?) AND column_name = UPPER(?)`,
          [`${databaseConfig.objectPrefix}${table}`, columnName],
        )
      : await db.queryOne<{ count: number | string }>(
          `SELECT COUNT(*) AS count FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`,
          [table, columnName],
        );
  return Number(row?.count ?? 0) > 0;
};

const tableExists = async (db: DatabaseSession, table: string): Promise<boolean> => {
  const row =
    databaseConfig.provider === 'oracle'
      ? await db.queryOne<{ count: number | string }>(
          `SELECT COUNT(*) AS count FROM user_tables WHERE table_name = UPPER(?)`,
          [`${databaseConfig.objectPrefix}${table}`],
        )
      : await db.queryOne<{ count: number | string }>(
          `SELECT COUNT(*) AS count FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name = ?`,
          [table],
        );
  return Number(row?.count ?? 0) > 0;
};

const dropColumnIfExists = async (
  db: DatabaseSession,
  table: string,
  columnName: string,
): Promise<boolean> => {
  if (!(await columnExists(db, table, columnName))) {
    process.stdout.write(`    DROP COLUMN ${table}.${columnName}: coluna já inexistente\n`);
    return false;
  }
  // Remove FKs/constraints dependentes da coluna antes do drop
  if (databaseConfig.provider === 'oracle') {
    await db.execute(`ALTER TABLE ${table} DROP COLUMN ${columnName} CASCADE CONSTRAINTS`);
  } else {
    await db.execute(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${columnName} CASCADE`);
  }
  process.stdout.write(`    DROP COLUMN ${table}.${columnName}: removida\n`);
  return true;
};

const dropTableIfExists = async (db: DatabaseSession, table: string): Promise<boolean> => {
  if (!(await tableExists(db, table))) {
    process.stdout.write(`    DROP TABLE ${table}: tabela já inexistente\n`);
    return false;
  }
  if (databaseConfig.provider === 'oracle') {
    const physicalName = `${databaseConfig.objectPrefix}${table}`;
    await db.execute(`DROP TABLE ${physicalName} CASCADE CONSTRAINTS`);
  } else {
    await db.execute(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
  process.stdout.write(`    DROP TABLE ${table}: removida\n`);
  return true;
};

/**
 * Executa a limpeza física da Fase B (Issue #188 §7 Fase B):
 * 1. Remove colunas legadas em tmf_resource_specification (category, resource_type, resource_layer_id)
 * 2. Remove category_code em tmf_resource_type
 * 3. Remove resource_type em tmf_resource_status_catalog (se existente)
 * 4. Remove tabelas tmf_resource_layer e tmf_resource_category
 */
const executePhaseBCutover = async (db: DatabaseSession): Promise<void> => {
  process.stdout.write('1/4 — removendo colunas legadas de tmf_resource_specification...\n');
  await dropColumnIfExists(db, 'tmf_resource_specification', 'category');
  await dropColumnIfExists(db, 'tmf_resource_specification', 'resource_type');
  await dropColumnIfExists(db, 'tmf_resource_specification', 'resource_layer_id');

  process.stdout.write('2/4 — removendo coluna legada de tmf_resource_type...\n');
  await dropColumnIfExists(db, 'tmf_resource_type', 'category_code');

  process.stdout.write('3/4 — removendo coluna legada de tmf_resource_status_catalog...\n');
  await dropColumnIfExists(db, 'tmf_resource_status_catalog', 'resource_type');

  process.stdout.write('4/4 — dropando tabelas legadas...\n');
  await dropTableIfExists(db, 'tmf_resource_layer');
  await dropTableIfExists(db, 'tmf_resource_category');
};

try {
  await client.initialize();

  if (isCutover) {
    process.stdout.write(
      `Fase B --cutover iniciada: provider=${databaseConfig.provider}\n`,
    );

    const preflight = await auditGateD(client);
    if (!preflight.approved) {
      process.stdout.write(`${JSON.stringify(preflight, null, 2)}\n`);
      throw new Error(
        `Gate D (preflight de cutover) reprovado: ${preflight.findings.length} classe(s) de divergência. Nenhuma remoção física foi executada.`,
      );
    }
    process.stdout.write('Gate D (preflight) aprovado. Iniciando remoção física (DDL destrutivo).\n');

    await executePhaseBCutover(client);

    process.stdout.write(
      `Fase B --cutover concluída com sucesso em ${databaseConfig.provider}.\n`,
    );
  } else if (!apply) {
    const report = await audit(client);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.approved) {
      throw new Error(
        `Gate A reprovado: ${report.findings.length} classe(s) de divergência. Nenhuma alteração foi aplicada.`,
      );
    }
    process.stdout.write('Gate A aprovado em modo audit-only. Nenhuma alteração foi aplicada.\n');
  } else {
    process.stdout.write(
      `Fase A --apply iniciada: provider=${databaseConfig.provider}, ${SOURCE_TENANT} -> ${DESTINATION_TENANT}\n`,
    );

    const preflight = await audit(client);
    if (!preflight.approved) {
      process.stdout.write(`${JSON.stringify(preflight, null, 2)}\n`);
      throw new Error(
        `Gate A (preflight) reprovado: ${preflight.findings.length} classe(s) de divergência. Nenhuma alteração foi aplicada.`,
      );
    }
    process.stdout.write('Gate A (preflight) aprovado. Iniciando escrita.\n');

    process.stdout.write(
      '1/6 — relaxando UNIQUE(code) global para UNIQUE(tenant_id, code) em category/type...\n',
    );
    for (const target of RELAX_GLOBAL_CODE_UNIQUENESS_TARGETS) {
      const outcome = await relaxGlobalCodeUniqueness(client, target.table, target.constraintName);
      process.stdout.write(`  ${target.table}: ${outcome}\n`);
    }

    process.stdout.write('2/6 — materializando ResourceType por tenant vtal...\n');
    const typeMap = await materializeResourceTypes(client);
    process.stdout.write(`  ${typeMap.size} tipo(s) de origem mapeado(s).\n`);

    process.stdout.write('3/6 — migrando tabelas do módulo Resource default -> vtal...\n');
    for (const table of TENANT_MIGRATE_TABLES) {
      const migrated = await migrateTenantChunked(table, SOURCE_TENANT, DESTINATION_TENANT);
      process.stdout.write(`  ${table}: ${migrated} linha(s) migrada(s).\n`);
    }

    process.stdout.write('4/6 — garantindo catálogo default do tenant vtal...\n');
    const catalogId = await ensureDefaultCatalog(client);
    process.stdout.write(`  catálogo ${RESOURCE_CATALOG_BOOTSTRAP.code} = ${catalogId}\n`);

    process.stdout.write('5/6 — convertendo Category/Layer/Type em ResourceCatalogNode...\n');
    const categoryNodeIdByCode = await buildCategoryNodes(client, catalogId);
    const { combos, comboGroupNodeId } = await buildComboAndLayerNodes(
      client,
      catalogId,
      categoryNodeIdByCode,
    );
    await buildResourceTypeNodes(client, catalogId, categoryNodeIdByCode, comboGroupNodeId, combos);

    process.stdout.write('6/6 — backfill em lote de resource_type_id...\n');
    await backfillResourceTypeIds(client, typeMap);

    process.stdout.write('Gate B — revalidando coerência pós-backfill...\n');
    const gateB = await auditGateB(client);
    process.stdout.write(`${JSON.stringify(gateB, null, 2)}\n`);
    if (!gateB.approved) {
      throw new Error(
        `Gate B reprovado: ${gateB.findings.length} classe(s) de divergência. Estado parcial foi aplicado — revise o relatório acima antes de prosseguir; não há rollback automático.`,
      );
    }
    process.stdout.write(
      `Fase A --apply concluída com sucesso em ${databaseConfig.provider}. Gate B aprovado.\n`,
    );
  }
} finally {
  await client.close();
}
