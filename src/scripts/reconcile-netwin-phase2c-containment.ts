#!/usr/bin/env node
/**
 * Repara exclusivamente no destino as contenções legadas da Fase 2.C Netwin.
 *
 * Auditoria (somente leitura do Oracle Nexus NX_DEV1_):
 *   npm run migrate:netwin:phase2c-containment
 *
 * Aplicação (requer confirmação explícita):
 *   npm run migrate:netwin:phase2c-containment -- --tenant-id vtal --apply --confirm-netwin-phase2c-containment-repair
 *
 * Este script não cria conexão com o DR Netwin. A proveniência necessária já
 * está persistida nas characteristics das Ports pela Fase 2.C corrigida.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';
import type { DatabaseClient, DatabaseSession } from '../shared/persistence/database-client.js';
import { netwinEquipmentId, netwinInternalEquipmentId } from './netwin-migration/identity.js';

loadEnv();

export const NETWIN_PHASE2C_TARGET_PREFIX = 'NX_DEV1_';
export const NETWIN_PHASE2C_TENANT_ID = 'vtal';
const PAGE_SIZE = 500;
const ORACLE_IN_BATCH_SIZE = 900;

type ResourceRelationshipRow = { resourceToId: string; resourceFromId: string };
type PortRow = { id: string; characteristics: string | null };
type ParentRow = { id: string; tenantId: string };

export type Phase2cContainmentRepairOptions = {
  tenantId?: string;
  apply: boolean;
  confirmed: boolean;
};

export type Provenance = { parentOspEquipmentId: number; parentIspEquipmentId: number };
export type CandidateStatus =
  | 'ignored'
  | 'malformed-provenance'
  | 'canonical-parent-invalid'
  | 'unexpected-parent'
  | 'repairable'
  | 'already-canonical';

export type ContainmentCandidate = {
  portId: string;
  status: CandidateStatus;
  canonicalParentId?: string;
  legacyParentId?: string;
  parentIds: string[];
  detail?: string;
};

export type AuditReport = {
  targetPrefix: string;
  tenantId: string;
  scannedPorts: number;
  ignoredPorts: number;
  malformedProvenance: number;
  canonicalParentInvalid: number;
  unexpectedParent: number;
  repairable: number;
  alreadyCanonical: number;
  legacyContainments: number;
  canonicalContainmentsMissing: number;
  legacyParentsWithoutRelationships: number;
  examples: ContainmentCandidate[];
  approved: boolean;
};

const positiveInteger = (value: unknown): number | undefined => {
  const normalized =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : undefined;
};

function characteristicsToValues(value: string | null): Map<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    const values = new Map<string, unknown>();
    const extras: Record<string, unknown>[] = [];
    for (const entry of parsed) {
      if (
        entry &&
        typeof entry === 'object' &&
        'name' in entry &&
        typeof entry.name === 'string' &&
        'value' in entry
      ) {
        // A Fase 2.C corrigida não grava mais parentOspEquipmentId/parentIspEquipmentId como
        // characteristic de topo (eles não são atributo do recurso — C5); ficam aninhados em
        // `_origin.extra`. Registros já importados antes da correção continuam no formato de
        // topo, por isso ambos são aceitos aqui.
        if (entry.name === '_origin.extra' && entry.value && typeof entry.value === 'object') {
          extras.push(entry.value as Record<string, unknown>);
          continue;
        }
        values.set(entry.name, entry.value);
      }
    }
    for (const extra of extras) {
      for (const [key, extraValue] of Object.entries(extra)) {
        if (!values.has(key)) values.set(key, extraValue);
      }
    }
    return values;
  } catch {
    return undefined;
  }
}

/** Extrai exclusivamente a ponte ISP↔OSP persistida pela Fase 2.C corrigida. */
export function parsePhase2cPortProvenance(
  characteristics: string | null,
): { kind: 'absent' } | { kind: 'invalid' } | { kind: 'valid'; provenance: Provenance } {
  const values = characteristicsToValues(characteristics);
  if (!values) return { kind: 'absent' };
  const hasOsp = values.has('parentOspEquipmentId');
  const hasIsp = values.has('parentIspEquipmentId');
  if (!hasOsp && !hasIsp) return { kind: 'absent' };
  const ospEquipmentId = positiveInteger(values.get('parentOspEquipmentId'));
  const ispEquipmentId = positiveInteger(values.get('parentIspEquipmentId'));
  if (!ospEquipmentId || !ispEquipmentId) return { kind: 'invalid' };
  return {
    kind: 'valid',
    provenance: { parentOspEquipmentId: ospEquipmentId, parentIspEquipmentId: ispEquipmentId },
  };
}

/** Classifica uma Port sem consultar origem ou inferir identidade por texto. */
export function classifyPhase2cContainment(input: {
  portId: string;
  characteristics: string | null;
  parentIds: Iterable<string>;
  canonicalParentIsTenantOwned?: boolean;
}): ContainmentCandidate {
  const provenance = parsePhase2cPortProvenance(input.characteristics);
  const parentIds = [...new Set(input.parentIds)].sort();
  if (provenance.kind === 'absent') return { portId: input.portId, status: 'ignored', parentIds };
  if (provenance.kind === 'invalid') {
    return { portId: input.portId, status: 'malformed-provenance', parentIds };
  }

  const canonicalParentId = netwinEquipmentId(provenance.provenance.parentOspEquipmentId);
  const legacyParentId = netwinInternalEquipmentId(provenance.provenance.parentIspEquipmentId);
  if (!input.canonicalParentIsTenantOwned) {
    return {
      portId: input.portId,
      status: 'canonical-parent-invalid',
      canonicalParentId,
      legacyParentId,
      parentIds,
    };
  }

  const unexpected = parentIds.filter(
    (parentId) => parentId !== canonicalParentId && parentId !== legacyParentId,
  );
  if (unexpected.length > 0) {
    return {
      portId: input.portId,
      status: 'unexpected-parent',
      canonicalParentId,
      legacyParentId,
      parentIds,
      detail: `Pais de contenção não reconhecidos: ${unexpected.join(', ')}.`,
    };
  }
  if (parentIds.length === 1 && parentIds[0] === canonicalParentId) {
    return {
      portId: input.portId,
      status: 'already-canonical',
      canonicalParentId,
      legacyParentId,
      parentIds,
    };
  }
  return {
    portId: input.portId,
    status: 'repairable',
    canonicalParentId,
    legacyParentId,
    parentIds,
  };
}

export function parsePhase2cContainmentRepairOptions(
  argv: string[],
): Phase2cContainmentRepairOptions {
  const tenantFlag = argv.indexOf('--tenant-id');
  const tenantId = tenantFlag >= 0 ? argv[tenantFlag + 1] : undefined;
  return {
    ...(tenantId ? { tenantId } : {}),
    apply: argv.includes('--apply'),
    confirmed: argv.includes('--confirm-netwin-phase2c-containment-repair'),
  };
}

export function assertPhase2cContainmentRepairInvocation(
  options: Phase2cContainmentRepairOptions,
  objectPrefix: string,
): void {
  if (objectPrefix.toUpperCase() !== NETWIN_PHASE2C_TARGET_PREFIX) {
    throw new Error(
      `Este reparo só pode operar no prefixo ${NETWIN_PHASE2C_TARGET_PREFIX}; recebido ${objectPrefix}.`,
    );
  }
  if (options.tenantId !== NETWIN_PHASE2C_TENANT_ID) {
    throw new Error(`Este reparo exige --tenant-id ${NETWIN_PHASE2C_TENANT_ID}.`);
  }
  if (options.confirmed && !options.apply) {
    throw new Error('--confirm-netwin-phase2c-containment-repair exige --apply.');
  }
  if (options.apply && !options.confirmed) {
    throw new Error('A escrita exige --apply --confirm-netwin-phase2c-containment-repair juntos.');
  }
}

function addExample(examples: ContainmentCandidate[], candidate: ContainmentCandidate): void {
  if (examples.length < 20 && candidate.status !== 'ignored') examples.push(candidate);
}

async function relationshipsForPorts(
  db: DatabaseSession,
  portIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (let offset = 0; offset < portIds.length; offset += ORACLE_IN_BATCH_SIZE) {
    const batch = portIds.slice(offset, offset + ORACLE_IN_BATCH_SIZE);
    const rows = await db.queryMany<ResourceRelationshipRow>(
      `SELECT resource_to_id AS "resourceToId", resource_from_id AS "resourceFromId"
         FROM tmf_resource_relationship
        WHERE relationship_type = 'containsAsChild'
          AND resource_to_id IN (${batch.map(() => '?').join(', ')})`,
      batch,
    );
    for (const row of rows) {
      const parents = result.get(row.resourceToId) ?? [];
      parents.push(row.resourceFromId);
      result.set(row.resourceToId, parents);
    }
  }
  return result;
}

async function canonicalParentsFor(
  db: DatabaseSession,
  candidates: Array<{ id: string; characteristics: string | null }>,
  tenantId: string,
): Promise<Set<string>> {
  const parentIds = [
    ...new Set(
      candidates.flatMap((candidate) => {
        const provenance = parsePhase2cPortProvenance(candidate.characteristics);
        return provenance.kind === 'valid'
          ? [netwinEquipmentId(provenance.provenance.parentOspEquipmentId)]
          : [];
      }),
    ),
  ];
  const valid = new Set<string>();
  for (let offset = 0; offset < parentIds.length; offset += ORACLE_IN_BATCH_SIZE) {
    const batch = parentIds.slice(offset, offset + ORACLE_IN_BATCH_SIZE);
    const rows = await db.queryMany<ParentRow>(
      `SELECT id, tenant_id AS "tenantId"
         FROM tmf_physical_resource
        WHERE id IN (${batch.map(() => '?').join(', ')})`,
      batch,
    );
    for (const row of rows) if (row.tenantId === tenantId) valid.add(row.id);
  }
  return valid;
}

async function audit(
  db: DatabaseSession,
  targetPrefix: string,
  tenantId: string,
): Promise<AuditReport> {
  const report: AuditReport = {
    targetPrefix,
    tenantId,
    scannedPorts: 0,
    ignoredPorts: 0,
    malformedProvenance: 0,
    canonicalParentInvalid: 0,
    unexpectedParent: 0,
    repairable: 0,
    alreadyCanonical: 0,
    legacyContainments: 0,
    canonicalContainmentsMissing: 0,
    legacyParentsWithoutRelationships: 0,
    examples: [],
    approved: false,
  };

  let cursor: string | null = null;
  for (;;) {
    const ports: PortRow[] = await db.queryMany<PortRow>(
      `SELECT id, characteristics
         FROM tmf_physical_resource
        WHERE tenant_id = ?
          AND (? IS NULL OR id > ?)
          AND INSTR(characteristics, ?) > 0
        ORDER BY id
        FETCH NEXT ? ROWS ONLY`,
      [tenantId, cursor, cursor, 'parentOspEquipmentId', PAGE_SIZE],
    );
    if (ports.length === 0) break;
    cursor = ports.at(-1)?.id ?? cursor;
    report.scannedPorts += ports.length;

    const relationships = await relationshipsForPorts(
      db,
      ports.map((port) => port.id),
    );
    const validCanonicalParents = await canonicalParentsFor(db, ports, tenantId);
    for (const port of ports) {
      const parsed = parsePhase2cPortProvenance(port.characteristics);
      const expectedCanonical =
        parsed.kind === 'valid'
          ? netwinEquipmentId(parsed.provenance.parentOspEquipmentId)
          : undefined;
      const candidate = classifyPhase2cContainment({
        portId: port.id,
        characteristics: port.characteristics,
        parentIds: relationships.get(port.id) ?? [],
        ...(expectedCanonical
          ? { canonicalParentIsTenantOwned: validCanonicalParents.has(expectedCanonical) }
          : {}),
      });
      addExample(report.examples, candidate);
      switch (candidate.status) {
        case 'ignored':
          report.ignoredPorts++;
          break;
        case 'malformed-provenance':
          report.malformedProvenance++;
          break;
        case 'canonical-parent-invalid':
          report.canonicalParentInvalid++;
          break;
        case 'unexpected-parent':
          report.unexpectedParent++;
          break;
        case 'repairable':
          report.repairable++;
          if (candidate.parentIds.includes(candidate.legacyParentId ?? ''))
            report.legacyContainments++;
          if (!candidate.parentIds.includes(candidate.canonicalParentId ?? ''))
            report.canonicalContainmentsMissing++;
          break;
        case 'already-canonical':
          report.alreadyCanonical++;
          break;
      }
    }
  }
  report.approved =
    report.malformedProvenance === 0 &&
    report.canonicalParentInvalid === 0 &&
    report.unexpectedParent === 0;
  return report;
}

async function applyRepair(client: DatabaseClient, report: AuditReport): Promise<void> {
  if (!report.approved) {
    throw new Error('Preflight reprovado; nenhuma contenção foi alterada.');
  }

  let canonicalInserted = 0;
  let legacyRemoved = 0;
  await client.transaction(async (session) => {
    let cursor: string | null = null;
    for (;;) {
      const ports: PortRow[] = await session.queryMany<PortRow>(
        `SELECT id, characteristics
           FROM tmf_physical_resource
          WHERE tenant_id = ?
            AND (? IS NULL OR id > ?)
            AND INSTR(characteristics, ?) > 0
          ORDER BY id
          FETCH NEXT ? ROWS ONLY`,
        [report.tenantId, cursor, cursor, 'parentOspEquipmentId', PAGE_SIZE],
      );
      if (ports.length === 0) break;
      cursor = ports.at(-1)?.id ?? cursor;
      const relationships = await relationshipsForPorts(
        session,
        ports.map((port) => port.id),
      );
      const validCanonicalParents = await canonicalParentsFor(session, ports, report.tenantId);
      for (const port of ports) {
        const parsed = parsePhase2cPortProvenance(port.characteristics);
        const expectedCanonical =
          parsed.kind === 'valid'
            ? netwinEquipmentId(parsed.provenance.parentOspEquipmentId)
            : undefined;
        const candidate = classifyPhase2cContainment({
          portId: port.id,
          characteristics: port.characteristics,
          parentIds: relationships.get(port.id) ?? [],
          ...(expectedCanonical
            ? { canonicalParentIsTenantOwned: validCanonicalParents.has(expectedCanonical) }
            : {}),
        });
        if (candidate.status !== 'repairable') continue;
        if (!candidate.canonicalParentId || !candidate.legacyParentId) {
          throw new Error(`Candidata ${candidate.portId} sem identidades de pai completas.`);
        }
        if (!candidate.parentIds.includes(candidate.canonicalParentId)) {
          const inserted = await session.execute(
            `INSERT INTO tmf_resource_relationship
             (resource_from_id, resource_to_id, relationship_type)
             SELECT ?, ?, 'containsAsChild'
               WHERE NOT EXISTS (
                 SELECT 1 FROM tmf_resource_relationship
                  WHERE resource_from_id = ? AND resource_to_id = ? AND relationship_type = 'containsAsChild'
               )`,
            [
              candidate.canonicalParentId,
              candidate.portId,
              candidate.canonicalParentId,
              candidate.portId,
            ],
          );
          canonicalInserted += inserted.changes;
        }
        if (candidate.parentIds.includes(candidate.legacyParentId)) {
          const removed = await session.execute(
            `DELETE FROM tmf_resource_relationship
              WHERE resource_from_id = ?
                AND resource_to_id = ?
                AND relationship_type = 'containsAsChild'`,
            [candidate.legacyParentId, candidate.portId],
          );
          legacyRemoved += removed.changes;
        }
      }
    }
  });
  process.stdout.write(
    `Reparo aplicado: ${canonicalInserted} contenções canônicas inseridas; ${legacyRemoved} contenções legadas removidas. Nenhum recurso físico foi excluído ou alterado.\n`,
  );
}

async function main(): Promise<void> {
  const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
  const options = parsePhase2cContainmentRepairOptions(process.argv.slice(2));
  assertPhase2cContainmentRepairInvocation(options, config.database.objectPrefix);
  const client = createDatabaseClient(config.database);
  try {
    await client.initialize();
    const report = await audit(client, config.database.objectPrefix, NETWIN_PHASE2C_TENANT_ID);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.approved) {
      throw new Error(
        'Preflight reprovado; investigue o relatório antes de executar qualquer reparo.',
      );
    }
    if (!options.apply) return;
    await applyRepair(client, report);
    const after = await audit(client, config.database.objectPrefix, NETWIN_PHASE2C_TENANT_ID);
    process.stdout.write(`${JSON.stringify(after, null, 2)}\n`);
    if (!after.approved || after.repairable !== 0 || after.legacyContainments !== 0) {
      throw new Error(
        'Validação pós-reparo reprovada; investigue o relatório antes de nova execução.',
      );
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}

export { audit, applyRepair };
