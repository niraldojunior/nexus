#!/usr/bin/env node
/**
 * Reconcilia specifications concretas Netwin v1 para os grupos semânticos v2.
 *
 * Auditoria (padrão, sem escrita):
 *   npm run reconcile:netwin-resource-specifications -- --target-prefix NX_DEV1_ --tenant-id vtal
 *
 * Aplicação (confirmação explícita):
 *   npm run reconcile:netwin-resource-specifications -- --target-prefix NX_DEV1_ --tenant-id vtal --apply --confirm-reconcile-netwin-specifications
 */
import { config as loadEnv } from 'dotenv';
import oracledb, { type Connection } from 'oracledb';
import { fileURLToPath } from 'node:url';
import {
  configureOracleClient,
  oracleConnectDescriptor,
  makeTablePrefixer,
} from './netwin-migration-kit.js';
import {
  cardTypeSpecId,
  equipmentModelSpecId,
  rackTypeSpecId,
  resolveEquipmentTypeCode,
  subrackTypeSpecId,
} from './netwin-migration/concrete-specs.js';
import {
  buildEquipmentSpecIndex,
  buildExistingTypeIndex,
  buildRackSpecIndex,
  buildSplitterSpecIndex,
  RACK_CATALOGS,
  loadRackCatalogRows,
  loadManufacturerResolver,
  loadEquipmentCatalogRows,
  loadSplitterCatalogRows,
} from './netwin-migration/concrete-spec-sources.js';
import { CANONICAL_RESOURCE_TYPES } from './netwin-migration/phase1-resource-specs.js';
import type { ConcreteSpecGroup } from './netwin-migration/concrete-spec-groups.js';

// O worktree não versiona `.env`; em desenvolvimento ele pode ficar apenas no checkout principal.
// Permite executar o saneador isolado sem copiar nem expor segredos.
loadEnv({ path: process.env.NEXUS_ENV_FILE ?? '.env', quiet: true });
configureOracleClient();
oracledb.fetchAsString = [oracledb.CLOB];

const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 1_000;
const ORACLE_IN_LIMIT = 900;
const KNOWN_CONCRETE_CHARACTERISTICS = new Set([
  'model',
  'modelcode',
  'equipmenttype',
  'sapmaterialcode',
  'technology',
  'modelalias',
  'splitratio',
  'inputports',
  'outputports',
]);

export type ReconcileOptions = {
  targetPrefix: string;
  tenantId: string;
  batchSize: number;
  apply: boolean;
  confirmed: boolean;
};

export type TargetSpecification = {
  id: string;
  name: string;
  resourceTypeId: string;
  description: string | null;
  relatedParty: string | null;
  validForEnd: string | null;
  characteristics: string | null;
};

type ReferenceCount = { total: number; active: number; ended: number };
export type SpecificationAction = {
  legacyId: string;
  canonicalId: string;
  legacyName: string;
  physical: ReferenceCount;
  logical: ReferenceCount;
  characteristics: string;
  retire: boolean;
};

export type ReconciliationBlock = {
  canonicalId: string;
  legacyIds: string[];
  reason:
    | 'canonical-specification-missing'
    | 'canonical-specification-ended'
    | 'resource-type-conflict'
    | 'related-party-conflict'
    | 'characteristics-invalid'
    | 'origin-extra-conflict'
    | 'custom-characteristic-conflict';
  detail: string;
};

export type ReconciliationPlan = {
  actions: SpecificationAction[];
  blocks: ReconciliationBlock[];
  alreadyReconciled: number;
};

export type ReconciliationReport = ReconciliationPlan & {
  targetPrefix: string;
  tenantId: string;
  sourceGroups: number;
  legacySpecifications: number;
  physicalReferences: number;
  logicalReferences: number;
  approved: boolean;
};

type SqlConnection = Pick<Connection, 'execute' | 'commit' | 'rollback'>;
type ResourceTypeRow = { ID: string; CODE: string; NAME: string | null };
type SpecificationRow = {
  ID: string;
  NAME: string;
  RESOURCE_TYPE_ID: string;
  DESCRIPTION: string | null;
  RELATED_PARTY: string | null;
  VALID_FOR_END: string | null;
  CHARACTERISTICS: string | null;
};
type ReferenceRow = { SPEC_ID: string; TOTAL: number | string; ACTIVE: number | string };

const count = (value: string | number | null | undefined): number => Number(value ?? 0);

function safePrefix(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error(`--target-prefix inválido: ${value}`);
  }
  return value.toUpperCase();
}

export function parseReconcileOptions(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ReconcileOptions {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const parsedBatchSize = Number(value('--batch-size') ?? DEFAULT_BATCH_SIZE);
  if (
    !Number.isSafeInteger(parsedBatchSize) ||
    parsedBatchSize < 1 ||
    parsedBatchSize > MAX_BATCH_SIZE
  ) {
    throw new Error(`--batch-size deve estar entre 1 e ${MAX_BATCH_SIZE}.`);
  }
  const targetPrefix = safePrefix(
    value('--target-prefix') ??
      env.TARGET_ORACLE_OBJECT_PREFIX ??
      env.ORACLE_OBJECT_PREFIX ??
      'NX_DEV1_',
  );
  return {
    targetPrefix,
    tenantId: value('--tenant-id') ?? 'vtal',
    batchSize: parsedBatchSize,
    apply: argv.includes('--apply'),
    confirmed: argv.includes('--confirm-reconcile-netwin-specifications'),
  };
}

export function assertReconcileInvocation(options: ReconcileOptions): void {
  if (!options.tenantId.trim()) throw new Error('--tenant-id é obrigatório.');
  if (options.confirmed && !options.apply) {
    throw new Error('--confirm-reconcile-netwin-specifications exige --apply.');
  }
  if (options.apply && !options.confirmed) {
    throw new Error(
      'A escrita exige a confirmação explícita --confirm-reconcile-netwin-specifications junto de --apply.',
    );
  }
  if (process.env.DATABASE_PROVIDER && process.env.DATABASE_PROVIDER.toLowerCase() !== 'oracle') {
    throw new Error('Esta reconciliação é Oracle-only (DATABASE_PROVIDER=oracle).');
  }
}

function parseCharacteristics(value: string | null): Array<Record<string, unknown>> | undefined {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    if (
      !parsed.every(
        (entry) =>
          entry && typeof entry === 'object' && 'name' in entry && typeof entry.name === 'string',
      )
    ) {
      return undefined;
    }
    return parsed as Array<Record<string, unknown>>;
  } catch {
    return undefined;
  }
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

/**
 * Só acrescenta provenance; jamais descarta characteristics existentes. Um `_origin.extra`
 * ilegível ou já associado a outro sucessor exige intervenção humana em vez de overwrite.
 */
export function addSupersededBy(
  characteristics: string | null,
  canonicalId: string,
): { characteristics: string } | { conflict: 'characteristics-invalid' | 'origin-extra-conflict' } {
  const entries = parseCharacteristics(characteristics);
  if (!entries) return { conflict: 'characteristics-invalid' };
  const extras = entries.filter((entry) => entry.name === '_origin.extra');
  if (extras.length > 1) return { conflict: 'origin-extra-conflict' };
  if (extras.length === 0) {
    return {
      characteristics: JSON.stringify([
        ...entries,
        { name: '_origin.extra', value: { supersededBy: canonicalId }, valueType: 'json' },
      ]),
    };
  }
  const extra = extras[0]!;
  if (!extra.value || typeof extra.value !== 'object' || Array.isArray(extra.value)) {
    return { conflict: 'origin-extra-conflict' };
  }
  const value = extra.value as Record<string, unknown>;
  if (value.supersededBy !== undefined && value.supersededBy !== canonicalId) {
    return { conflict: 'origin-extra-conflict' };
  }
  if (value.supersededBy === canonicalId) return { characteristics: JSON.stringify(entries) };
  return {
    characteristics: JSON.stringify(
      entries.map((entry) =>
        entry === extra ? { ...entry, value: { ...value, supersededBy: canonicalId } } : entry,
      ),
    ),
  };
}

function parseRelatedParty(value: string | null | undefined): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

export function relatedPartyConflict(
  legacy: string | null | undefined,
  canonical: string | null | undefined,
): boolean {
  const oldParties = parseRelatedParty(legacy);
  const newParties = parseRelatedParty(canonical);
  if (oldParties.length === 0 || newParties.length === 0) return false;
  const partyKey = (party: Record<string, unknown>) =>
    `${String(party.role ?? '').toLowerCase()}:${String(party.name ?? party.id ?? '')
      .trim()
      .toLowerCase()}`;
  const newKeys = new Set(newParties.map(partyKey));
  const oldMfr = oldParties.find((p) => String(p.role).toLowerCase() === 'manufacturer')?.name;
  const newMfr = newParties.find((p) => String(p.role).toLowerCase() === 'manufacturer')?.name;
  if (
    oldMfr &&
    newMfr &&
    String(oldMfr).trim().toLowerCase() !== String(newMfr).trim().toLowerCase()
  ) {
    return true;
  }
  for (const party of oldParties) {
    if (String(party.role).toLowerCase() === 'manufacturer') continue;
    if (!newKeys.has(partyKey(party))) return true;
  }
  return false;
}

function customCharacteristicConflicts(legacy: string | null, canonical: string | null): boolean {
  const oldEntries = parseCharacteristics(legacy);
  const newEntries = parseCharacteristics(canonical);
  if (!oldEntries || !newEntries) return false;
  const custom = (entries: Array<Record<string, unknown>>) =>
    new Map(
      entries
        .filter((entry) => {
          const name = String(entry.name).toLowerCase();
          return !name.startsWith('_origin.') && !KNOWN_CONCRETE_CHARACTERISTICS.has(name);
        })
        .map((entry) => [String(entry.name).toLowerCase(), stableJson(entry)]),
    );
  const oldCustom = custom(oldEntries);
  const newCustom = custom(newEntries);
  return [...oldCustom].some(
    ([name, value]) => newCustom.has(name) && newCustom.get(name) !== value,
  );
}

function emptyReferences(): ReferenceCount {
  return { total: 0, active: 0, ended: 0 };
}

function referencesFor(all: ReadonlyMap<string, ReferenceCount>, id: string): ReferenceCount {
  return all.get(id) ?? emptyReferences();
}

/** Builds the conservative action list independently from Oracle, for audit and unit tests. */
export function buildReconciliationPlan(
  groups: readonly ConcreteSpecGroup<unknown>[],
  specifications: readonly TargetSpecification[],
  physicalReferences = new Map<string, ReferenceCount>(),
  logicalReferences = new Map<string, ReferenceCount>(),
): ReconciliationPlan {
  const byId = new Map(specifications.map((spec) => [spec.id, spec]));
  const actions: SpecificationAction[] = [];
  const blocks: ReconciliationBlock[] = [];
  let alreadyReconciled = 0;

  for (const group of groups) {
    const legacyIds = group.sourceIds.map((sourceId) => legacySpecId(group.kind, sourceId));
    const legacy = legacyIds
      .map((id) => byId.get(id))
      .filter((spec): spec is TargetSpecification => Boolean(spec));
    if (legacy.length === 0) continue;
    const canonical = byId.get(group.canonicalId);
    if (!canonical) {
      blocks.push({
        canonicalId: group.canonicalId,
        legacyIds: legacy.map((spec) => spec.id),
        reason: 'canonical-specification-missing',
        detail:
          'A specification canônica v2 não existe no tenant; execute primeiro a Fase 1 com o agrupamento semântico.',
      });
      continue;
    }
    if (canonical.validForEnd) {
      blocks.push({
        canonicalId: canonical.id,
        legacyIds: legacy.map((spec) => spec.id),
        reason: 'canonical-specification-ended',
        detail: 'A specification canônica está encerrada e não pode receber referências.',
      });
      continue;
    }

    for (const old of legacy) {
      const physical = referencesFor(physicalReferences, old.id);
      const logical = referencesFor(logicalReferences, old.id);
      if (old.resourceTypeId !== canonical.resourceTypeId) {
        blocks.push({
          canonicalId: canonical.id,
          legacyIds: [old.id],
          reason: 'resource-type-conflict',
          detail: `${old.id} aponta para ResourceType distinto da specification canônica.`,
        });
        continue;
      }
      if (relatedPartyConflict(old.relatedParty, canonical.relatedParty)) {
        blocks.push({
          canonicalId: canonical.id,
          legacyIds: [old.id],
          reason: 'related-party-conflict',
          detail: `${old.id} possui relatedParty diferente da specification canônica.`,
        });
        continue;
      }
      if (customCharacteristicConflicts(old.characteristics, canonical.characteristics)) {
        blocks.push({
          canonicalId: canonical.id,
          legacyIds: [old.id],
          reason: 'custom-characteristic-conflict',
          detail: `${old.id} e a canônica definem characteristic customizada com valores distintos.`,
        });
        continue;
      }
      const merged = addSupersededBy(old.characteristics, canonical.id);
      if ('conflict' in merged) {
        blocks.push({
          canonicalId: canonical.id,
          legacyIds: [old.id],
          reason: merged.conflict,
          detail: `${old.id} possui characteristics que não podem receber supersededBy sem perda.`,
        });
        continue;
      }
      const retire = !old.validForEnd;
      const references = physical.total + logical.total;
      if (!retire && references === 0 && merged.characteristics === (old.characteristics ?? '[]')) {
        alreadyReconciled++;
        continue;
      }
      actions.push({
        legacyId: old.id,
        canonicalId: canonical.id,
        legacyName: old.name,
        physical,
        logical,
        characteristics: merged.characteristics,
        retire,
      });
    }
  }
  return { actions, blocks, alreadyReconciled };
}

function equipmentModelLegacyId(sourceId: string): string {
  const [tipoNe, tipoEquip] = sourceId.split(':').map(Number);
  if (
    tipoNe === undefined ||
    tipoEquip === undefined ||
    !Number.isSafeInteger(tipoNe) ||
    !Number.isSafeInteger(tipoEquip)
  ) {
    throw new Error(`ID de modelo de equipamento Netwin inválido: ${sourceId}`);
  }
  // Mantém a descoberta dos ids v1 em uma única função, sem reproduzir o UUID no SQL.
  return equipmentModelSpecId(tipoNe, tipoEquip);
}

/** Id v1 (uma spec por chave de catálogo) da origem de cada espécie de grupo. */
function legacySpecId(kind: ConcreteSpecGroup<unknown>['kind'], sourceId: string): string {
  switch (kind) {
    case 'equipment':
      return equipmentModelLegacyId(sourceId);
    case 'splitter':
      return cardTypeSpecId(Number(sourceId));
    case 'rack':
      return rackTypeSpecId(Number(sourceId));
    case 'shelf':
      return subrackTypeSpecId(Number(sourceId));
  }
}

async function querySourceGroups(
  source: Connection,
  resourceTypes: ReadonlyMap<string, string>,
): Promise<ConcreteSpecGroup<unknown>[]> {
  const [manufacturerResolver, equipmentRows, splitterRows] = await Promise.all([
    loadManufacturerResolver(source),
    loadEquipmentCatalogRows(source),
    loadSplitterCatalogRows(source),
  ]);
  const equipmentGroups = buildEquipmentSpecIndex(
    equipmentRows,
    (row) =>
      resolveEquipmentTypeCode(row.ID_BD_TIPO_NE, row.TIPO_NOME, row.TIPO_SIGLA, resourceTypes)
        .code,
    manufacturerResolver,
  ).groups;
  const splitterGroups = buildSplitterSpecIndex(splitterRows, manufacturerResolver).groups;
  const rackGroups: ConcreteSpecGroup<unknown>[] = [];
  for (const catalog of RACK_CATALOGS) {
    const rows = await loadRackCatalogRows(source, catalog);
    rackGroups.push(
      ...(buildRackSpecIndex(catalog, rows, manufacturerResolver)
        .groups as ConcreteSpecGroup<unknown>[]),
    );
  }
  return [...equipmentGroups, ...splitterGroups, ...rackGroups] as ConcreteSpecGroup<unknown>[];
}

async function targetResourceTypes(target: Connection, table: string, tenantId: string) {
  const result = await target.execute<ResourceTypeRow>(
    `SELECT id AS "ID", code AS "CODE", name AS "NAME" FROM ${table} WHERE tenant_id IN (:tenantId, 'default')`,
    { tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return buildExistingTypeIndex(
    CANONICAL_RESOURCE_TYPES,
    (result.rows ?? []).map((row) => row.CODE),
  );
}

async function targetSpecifications(target: Connection, table: string, tenantId: string) {
  const result = await target.execute<SpecificationRow>(
    `SELECT id AS "ID", name AS "NAME", resource_type_id AS "RESOURCE_TYPE_ID", description AS "DESCRIPTION",
            related_party AS "RELATED_PARTY", valid_for_end AS "VALID_FOR_END", characteristics AS "CHARACTERISTICS"
       FROM ${table} WHERE tenant_id = :tenantId`,
    { tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows ?? []).map((row): TargetSpecification => ({
    id: row.ID,
    name: row.NAME,
    resourceTypeId: row.RESOURCE_TYPE_ID,
    description: row.DESCRIPTION,
    relatedParty: row.RELATED_PARTY,
    validForEnd: row.VALID_FOR_END,
    characteristics: row.CHARACTERISTICS,
  }));
}

async function referenceCounts(
  target: Connection,
  table: string,
  tenantId: string,
  ids: string[],
): Promise<Map<string, ReferenceCount>> {
  const result = new Map<string, ReferenceCount>();
  for (let offset = 0; offset < ids.length; offset += ORACLE_IN_LIMIT) {
    const batch = ids.slice(offset, offset + ORACLE_IN_LIMIT);
    if (!batch.length) continue;
    const rows = await target.execute<ReferenceRow>(
      `SELECT resource_specification_id AS "SPEC_ID", COUNT(*) AS "TOTAL",
              SUM(CASE WHEN valid_for_end IS NULL AND status <> 'terminated' THEN 1 ELSE 0 END) AS "ACTIVE"
         FROM ${table}
        WHERE tenant_id = :tenantId AND resource_specification_id IN (${batch.map((_, index) => `:id${index}`).join(', ')})
        GROUP BY resource_specification_id`,
      { tenantId, ...Object.fromEntries(batch.map((id, index) => [`id${index}`, id])) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of rows.rows ?? []) {
      const total = count(row.TOTAL);
      const active = count(row.ACTIVE);
      result.set(row.SPEC_ID, { total, active, ended: total - active });
    }
  }
  return result;
}

export async function applyReconciliationPlan(
  target: SqlConnection,
  tables: { physical: string; logical: string; specification: string },
  tenantId: string,
  actions: readonly SpecificationAction[],
  batchSize: number,
): Promise<{ physicalUpdated: number; logicalUpdated: number; specificationsRetired: number }> {
  let physicalUpdated = 0;
  let logicalUpdated = 0;
  let specificationsRetired = 0;
  try {
    for (let offset = 0; offset < actions.length; offset += batchSize) {
      for (const action of actions.slice(offset, offset + batchSize)) {
        const params = { tenantId, legacyId: action.legacyId, canonicalId: action.canonicalId };
        if (action.physical.total > 0) {
          const physical = await target.execute(
            `UPDATE ${tables.physical} SET resource_specification_id = :canonicalId
              WHERE tenant_id = :tenantId AND resource_specification_id = :legacyId`,
            params,
          );
          physicalUpdated += physical.rowsAffected ?? 0;
        }
        if (action.logical.total > 0) {
          const logical = await target.execute(
            `UPDATE ${tables.logical} SET resource_specification_id = :canonicalId
              WHERE tenant_id = :tenantId AND resource_specification_id = :legacyId`,
            params,
          );
          logicalUpdated += logical.rowsAffected ?? 0;
        }
        if (action.retire || action.characteristics !== undefined) {
          const specification = await target.execute(
            `UPDATE ${tables.specification}
                SET valid_for_end = NVL(valid_for_end, CURRENT_TIMESTAMP),
                    characteristics = :characteristics,
                    updated_at = CURRENT_TIMESTAMP
              WHERE tenant_id = :tenantId AND id = :legacyId`,
            { tenantId, legacyId: action.legacyId, characteristics: action.characteristics },
          );
          specificationsRetired += specification.rowsAffected ?? 0;
        }
      }
      await target.commit();
      const processed = Math.min(offset + batchSize, actions.length);
      if (processed % 1000 === 0 || processed === actions.length) {
        process.stdout.write(
          `  [Aplicando] ${processed}/${actions.length} specifications... (físicos repontados: ${physicalUpdated}, specs encerradas: ${specificationsRetired})\n`,
        );
      }
    }
  } catch (error) {
    await target.rollback();
    throw error;
  }
  return { physicalUpdated, logicalUpdated, specificationsRetired };
}

export async function auditReconciliation(
  source: Connection,
  target: Connection,
  options: ReconcileOptions,
): Promise<ReconciliationReport> {
  const t = makeTablePrefixer(options.targetPrefix);
  const resourceTypes = await targetResourceTypes(target, t('resource_type'), options.tenantId);
  const groups = await querySourceGroups(source, resourceTypes);
  const specifications = await targetSpecifications(
    target,
    t('resource_specification'),
    options.tenantId,
  );
  const legacyIds = groups.flatMap((group) =>
    group.sourceIds.map((sourceId) => legacySpecId(group.kind, sourceId)),
  );
  const physical = await referenceCounts(
    target,
    t('resource_physical'),
    options.tenantId,
    legacyIds,
  );
  const logical = await referenceCounts(target, t('resource_logical'), options.tenantId, legacyIds);
  const plan = buildReconciliationPlan(groups, specifications, physical, logical);
  return {
    ...plan,
    targetPrefix: options.targetPrefix,
    tenantId: options.tenantId,
    sourceGroups: groups.length,
    legacySpecifications:
      plan.actions.length +
      plan.blocks.reduce((sum, block) => sum + block.legacyIds.length, 0) +
      plan.alreadyReconciled,
    physicalReferences: plan.actions.reduce((sum, action) => sum + action.physical.total, 0),
    logicalReferences: plan.actions.reduce((sum, action) => sum + action.logical.total, 0),
    approved: plan.blocks.length === 0,
  };
}

async function openConnections(): Promise<{ source: Connection; target: Connection }> {
  const sourceConnectString = process.env.NETWIN_DR_ORACLE_CONNECT_STRING;
  const sourceUser = process.env.NETWIN_DR_ORACLE_USER;
  const sourcePassword = process.env.NETWIN_DR_ORACLE_PASSWORD;
  const targetConnectString =
    process.env.TARGET_ORACLE_CONNECT_STRING ?? process.env.ORACLE_CONNECTION_STRING;
  const targetUser = process.env.TARGET_ORACLE_USER ?? process.env.ORACLE_USER;
  const targetPassword = process.env.TARGET_ORACLE_PASSWORD ?? process.env.ORACLE_PASSWORD;
  if (!sourceConnectString || !sourceUser || !sourcePassword) {
    throw new Error(
      'NETWIN_DR_ORACLE_CONNECT_STRING, NETWIN_DR_ORACLE_USER e NETWIN_DR_ORACLE_PASSWORD são obrigatórios.',
    );
  }
  if (!targetConnectString || !targetUser || !targetPassword) {
    throw new Error(
      'ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD são obrigatórios para o destino.',
    );
  }
  const source = await oracledb.getConnection({
    connectString: oracleConnectDescriptor(sourceConnectString),
    user: sourceUser,
    password: sourcePassword,
    ...((process.env.NETWIN_DR_TNS_ADMIN ?? process.env.TNS_ADMIN)
      ? { configDir: process.env.NETWIN_DR_TNS_ADMIN ?? process.env.TNS_ADMIN }
      : {}),
  });
  await source.execute('SET TRANSACTION READ ONLY');
  const target = await oracledb.getConnection({
    connectString: targetConnectString,
    user: targetUser,
    password: targetPassword,
  });
  return { source, target };
}

async function main(): Promise<void> {
  const options = parseReconcileOptions(process.argv.slice(2));
  assertReconcileInvocation(options);
  const { source, target } = await openConnections();
  try {
    const report = await auditReconciliation(source, target, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.approved) {
      if (options.apply) {
        throw new Error('Preflight bloqueado; corrija os grupos conflitantes antes de aplicar.');
      }
      return;
    }
    if (!options.apply) return;
    const t = makeTablePrefixer(options.targetPrefix);
    const result = await applyReconciliationPlan(
      target,
      {
        physical: t('resource_physical'),
        logical: t('resource_logical'),
        specification: t('resource_specification'),
      },
      options.tenantId,
      report.actions,
      options.batchSize,
    );
    process.stdout.write(
      `Aplicado: físicos=${result.physicalUpdated}; lógicos=${result.logicalUpdated}; specifications encerradas=${result.specificationsRetired}.\n`,
    );
  } finally {
    await source.close();
    await target.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
