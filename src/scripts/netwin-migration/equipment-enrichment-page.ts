import oracledb, { type Connection } from 'oracledb';
import type { MigrationCharacteristic } from '../netwin-migration-kit.js';
import { normalizeTypeKey } from './concrete-specs.js';
import type { MigrationContext } from './context.js';
import {
  buildCharacteristic,
  buildEquipmentEnrichment,
  mergeOwnedCharacteristics,
  mergeOwnedRelatedParties,
  resolveSerials,
  servingSiteCharacteristic,
  type PartyReference,
} from './equipment-enrichment.js';
import {
  hydrateEquipmentExtras,
  resolveGeoProjectIds,
  type EquipmentSourceExtras,
} from './equipment-enrichment-source.js';
import { netwinLocationId, netwinOwnerPartyId } from './identity.js';
import { chunksOf } from './source-batches.js';

/** Caches de lookup vivos durante toda a execução da fase (não crescem com o total da UF). */
export interface EnrichmentCaches {
  modelSap: Map<number, string | null>;
  projectName: Map<number, string>;
  cell: Map<number, { name: string | null; supplierLocationId: number | null }>;
  unmappedDynamic: Map<string, number>;
}

export const createEnrichmentCaches = (): EnrichmentCaches => ({
  modelSap: new Map(),
  projectName: new Map(),
  cell: new Map(),
  unmappedDynamic: new Map(),
});

export interface EnrichmentInput {
  ospId: number;
  resourceId: string;
  name: string;
  /** Characteristics já produzidas pela fase (`_origin`, `substatus`). */
  baseCharacteristics: readonly MigrationCharacteristic[];
}

export interface EnrichedEquipment {
  label: string | null;
  serial_number: string | null;
  project_id: string | null;
  serving_site_id: string | null;
  related_party: string;
  characteristics: string;
}

export interface EnrichmentPageStats {
  serialConflicts: number;
  projectsResolved: number;
  projectsUnresolved: number;
  ownersResolved: number;
  timings: Record<string, number>;
  anomalies: EquipmentSourceExtras['anomalies'];
}

async function readExisting(
  target: Connection,
  table: string,
  tenantId: string,
  resourceIds: readonly string[],
): Promise<Map<string, { characteristics: string | null; relatedParty: string | null }>> {
  const existing = new Map<
    string,
    { characteristics: string | null; relatedParty: string | null }
  >();
  for (const chunk of chunksOf(resourceIds)) {
    const binds = chunk.map((_, index) => `:${index + 2}`).join(', ');
    const result = await target.execute<{
      ID: string;
      CHARACTERISTICS: string | null;
      RELATED_PARTY: string | null;
    }>(
      `SELECT id, characteristics, related_party FROM ${table}
        WHERE tenant_id = :1 AND id IN (${binds})`,
      [tenantId, ...chunk],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: {
          CHARACTERISTICS: { type: oracledb.STRING },
          RELATED_PARTY: { type: oracledb.STRING },
        },
      },
    );
    for (const row of result.rows ?? []) {
      existing.set(row.ID, {
        characteristics: row.CHARACTERISTICS,
        relatedParty: row.RELATED_PARTY,
      });
    }
  }
  return existing;
}

async function readSerialHolders(
  target: Connection,
  table: string,
  serials: readonly string[],
): Promise<Map<string, string>> {
  const holders = new Map<string, string>();
  for (const chunk of chunksOf(serials)) {
    const binds = chunk.map((_, index) => `:${index + 1}`).join(', ');
    const result = await target.execute<{ ID: string; SERIAL_NUMBER: string }>(
      `SELECT id, serial_number FROM ${table} WHERE serial_number IN (${binds})`,
      [...chunk],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of result.rows ?? []) holders.set(row.SERIAL_NUMBER, row.ID);
  }
  return holders;
}

/**
 * Enriquecimento de uma página de equipamentos, compartilhado pela Fase 2.B (inline) e pela 2.F
 * (backfill). Sem `target` (dry-run) não há estado existente nem colisão de série a consultar.
 */
export async function enrichEquipmentPage(
  ctx: MigrationContext,
  source: Connection,
  target: Connection | null,
  inputs: readonly EnrichmentInput[],
  caches: EnrichmentCaches,
): Promise<{
  rows: Map<string, EnrichedEquipment>;
  stats: EnrichmentPageStats;
}> {
  const extras = await hydrateEquipmentExtras(
    source,
    inputs.map((input) => input.ospId),
    caches.modelSap,
    caches.projectName,
    caches.cell,
  );
  for (const [name, count] of extras.anomalies.unmappedDynamic) {
    caches.unmappedDynamic.set(name, (caches.unmappedDynamic.get(name) ?? 0) + count);
  }

  const timings = { ...extras.timings };
  let startedAt = Date.now();

  const projectNames = [
    ...new Set(
      inputs.flatMap((input) => {
        const projectId = extras.isp.get(input.ospId)?.ID_BD_PROJECTO;
        const name = projectId ? caches.projectName.get(projectId) : undefined;
        return name ? [name] : [];
      }),
    ),
  ];
  const geoProjects = target
    ? await resolveGeoProjectIds(
        target,
        ctx.t('geo_project'),
        ctx.options.tenantId,
        projectNames,
        normalizeTypeKey,
      )
    : new Map<string, string | null>();

  const existing = target
    ? await readExisting(
        target,
        ctx.t('tmf_physical_resource'),
        ctx.options.tenantId,
        inputs.map((i) => i.resourceId),
      )
    : new Map<string, { characteristics: string | null; relatedParty: string | null }>();
  timings.targetRead = Date.now() - startedAt;

  startedAt = Date.now();
  const rawSerials = inputs.map((input) => ({
    resourceId: input.resourceId,
    sourceId: input.ospId,
    rawSerial: extras.isp.get(input.ospId)?.NUM_SERIE,
  }));
  const candidateSerials = [
    ...new Set(
      rawSerials.flatMap((c) => {
        const text = typeof c.rawSerial === 'string' ? c.rawSerial.trim() : '';
        return text ? [text.slice(0, 255)] : [];
      }),
    ),
  ];
  const holders = target
    ? await readSerialHolders(target, ctx.t('tmf_physical_resource'), candidateSerials)
    : new Map<string, string>();
  const serials = resolveSerials(rawSerials, holders);

  const rows = new Map<string, EnrichedEquipment>();
  const stats: EnrichmentPageStats = {
    serialConflicts: 0,
    projectsResolved: 0,
    projectsUnresolved: 0,
    ownersResolved: 0,
    timings,
    anomalies: extras.anomalies,
  };

  for (const input of inputs) {
    const osp = extras.osp.get(input.ospId);
    const isp = extras.isp.get(input.ospId);
    const projectName = isp?.ID_BD_PROJECTO
      ? caches.projectName.get(isp.ID_BD_PROJECTO)
      : undefined;
    const geoProjectId = projectName
      ? (geoProjects.get(normalizeTypeKey(projectName)) ?? null)
      : null;
    if (projectName) {
      if (geoProjectId) stats.projectsResolved++;
      else stats.projectsUnresolved++;
    }

    const cellId = extras.cellId.get(input.ospId);
    const cell = cellId ? caches.cell.get(cellId) : undefined;
    const stationId = extras.supplierStationId.get(input.ospId) ?? cell?.supplierLocationId ?? null;
    const servingSiteId = stationId ? netwinLocationId(stationId) : null;

    const enrichment = buildEquipmentEnrichment({
      name: input.name,
      label: osp?.LABEL,
      description: osp?.DESCRIPTION,
      designation: isp?.DESIGNACAO,
      alternateDesignation: isp?.DESIGNACAO_ALTERNATIVA,
      identification: isp?.IDENTIFICACAO,
      observations: isp?.OBSERVACOES,
      sapMaterialCode: isp?.NUM_SAP,
      modelSapMaterialCode: isp?.ID_BD_TIPO_EQUIP
        ? caches.modelSap.get(isp.ID_BD_TIPO_EQUIP)
        : null,
      lifecycleStateDate: isp?.DATA_ESTADO_CICLO_VIDA,
      operationalStateDate: isp?.DATA_ESTADO_OPERACIONAL,
      provisionStateDate: isp?.DATA_ESTADO_PROVISAO,
      projectState: isp?.PROJECT_STATE,
      // Projeto estruturado resolvido vira project_id; só o não resolvido cai na characteristic.
      projectName: geoProjectId ? null : projectName,
      dynamic: extras.dynamic.get(input.ospId) ?? new Map(),
      cellName: cell?.name,
      servingSiteId,
    });

    const serial = serials.get(input.resourceId);
    if (serial?.conflict) stats.serialConflicts++;
    const current = existing.get(input.resourceId);
    const produced: MigrationCharacteristic[] = [
      ...input.baseCharacteristics,
      ...enrichment.characteristics,
      ...(servingSiteId ? [servingSiteCharacteristic(servingSiteId)] : []),
    ];
    const reported = buildCharacteristic('reportedSerialNumber', serial?.reportedSerialNumber);
    if (reported) produced.push(reported);

    const ownerId = osp?.OWNER_ID ? netwinOwnerPartyId(osp.OWNER_ID) : null;
    if (ownerId) stats.ownersResolved++;
    const owner: PartyReference = {
      id: ownerId ?? ctx.options.ownerPartyId,
      '@referredType': 'Organization',
      role: 'infrastructure_owner',
    };

    rows.set(input.resourceId, {
      label: enrichment.label,
      serial_number: serial?.serialNumber ?? null,
      project_id: geoProjectId,
      serving_site_id: servingSiteId,
      related_party: JSON.stringify(mergeOwnedRelatedParties(current?.relatedParty, owner)),
      characteristics: JSON.stringify(
        mergeOwnedCharacteristics(current?.characteristics, produced),
      ),
    });
  }
  timings.transform = Date.now() - startedAt;
  return { rows, stats };
}
