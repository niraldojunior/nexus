import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import {
  loadInternalEquipment,
  loadInternalEquipmentByNeighborhood,
  loadInternalPorts,
  loadInternalRacks,
  loadInternalSubracks,
} from './internal-plant-source.js';
import type { PhaseStats } from './types.js';
import {
  deterministicUuid,
  netwinInternalRackId,
  netwinInternalSubrackId,
  netwinLocationId,
  NEXUS_NETWIN_NAMESPACE,
} from './identity.js';
import {
  bulkMergeRows,
  netwinOriginCharacteristics,
  resolveNetwinPlantState,
} from '../netwin-migration-kit.js';
import { resolveMunicipalityScopePrefilter } from './scope-resolution.js';
import { chunksOf, selectFullTableIds, selectScopedInfranodeIds } from './source-batches.js';
import {
  loadInternalRacksByPlaceIds,
  loadInternalSubracksByRackIds,
} from './internal-plant-source.js';

export type StationPlantDiscoveryReport = {
  scopedLocations: number;
  bridgedEquipment: number;
  equipmentWithoutOspBridge: number;
  adapterPorts: number;
  portsWithSubrack: number;
  portsWithCard: number;
  subracks: number;
  subracksWithRack: number;
  racks: number;
  equipmentTypes: string[];
  subrackTypes: string[];
  rackTypes: string[];
  unresolvedContracts: string[];
};

function uniquePositiveIds(values: Array<number | null>): number[] {
  return [
    ...new Set(
      values.filter(
        (value): value is number => value !== null && Number.isInteger(value) && value > 0,
      ),
    ),
  ];
}

function typeNames(rows: Array<{ TIPO_NOME: string | null; TIPO_SIGLA: string | null }>): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row.TIPO_SIGLA ?? row.TIPO_NOME)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
}

async function scopedLocationIds(ctx: MigrationContext): Promise<number[]> {
  const source = await ctx.getSourceConnection();
  try {
    if (ctx.options.scope.full) {
      const result = await source.execute<{ ID: number }>(
        'SELECT ID FROM NETWIN.LOCATION ORDER BY ID',
        [],
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        },
      );
      return (result.rows ?? []).map((row) => row.ID);
    }

    const rawScope = ctx.options.scope.municipio ?? ctx.options.scope.uf;
    if (!rawScope) return [];
    const name = rawScope.toUpperCase();
    const normalized = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const result = await source.execute<{ ID: number }>(
      `SELECT DISTINCT id AS "ID"
         FROM (
           SELECT l.ID
             FROM NETWIN.LOCATION l
            WHERE UPPER(l.NAME) = :name OR UPPER(l.NAME) = :normalized
           UNION
           SELECT association.ID_CHILD AS ID
             FROM NETWIN.LOCATION_ASSOC association
            START WITH association.ID_PARENT IN (
              SELECT l.ID
                FROM NETWIN.LOCATION l
               WHERE UPPER(l.NAME) = :name OR UPPER(l.NAME) = :normalized
            )
          CONNECT BY NOCYCLE PRIOR association.ID_CHILD = association.ID_PARENT
         )
        ORDER BY id`,
      { name, normalized },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (result.rows ?? []).map((row) => row.ID);
  } finally {
    await source.close();
  }
}

/**
 * Fase 2.D ainda é uma descoberta, não uma carga. Ela só relata vínculos que
 * as tabelas ISP expõem diretamente e nunca grava no destino nem na origem.
 */
export async function discoverStationInternalPlant(
  ctx: MigrationContext,
): Promise<StationPlantDiscoveryReport> {
  const locationIds = ctx.options.scope.bairro ? [] : await scopedLocationIds(ctx);
  if (!ctx.options.scope.bairro && locationIds.length === 0) {
    throw new Error(
      'A Fase 2.D não encontrou LOCATIONs no escopo informado; a descoberta não será ampliada silenciosamente.',
    );
  }

  const source = await ctx.getSourceConnection();
  try {
    const maxRecords = ctx.options.maxRecords ?? Number.MAX_SAFE_INTEGER;
    const equipment = ctx.options.scope.bairro
      ? await loadInternalEquipmentByNeighborhood(source, ctx.options.scope, maxRecords)
      : await loadInternalEquipment(source, locationIds, maxRecords);
    const bridgedEquipment = equipment.filter((item) =>
      Number.isInteger(item.ID_BD_EQUIPAMENTO_OSP),
    );
    const ports = await loadInternalPorts(
      source,
      bridgedEquipment.map((item) => item.ID_BD_EQUIPAMENTO),
    );
    const subrackIds = uniquePositiveIds(ports.map((port) => port.ID_BD_SUBBASTIDOR));
    const subracks = await loadInternalSubracks(source, subrackIds);
    const rackIds = uniquePositiveIds(subracks.map((subrack) => subrack.ID_BD_BASTIDOR));
    const racks = await loadInternalRacks(source, rackIds);

    return {
      scopedLocations: ctx.options.scope.bairro
        ? new Set(equipment.map((item) => item.ID_BD_LOCAL)).size
        : locationIds.length,
      bridgedEquipment: bridgedEquipment.length,
      equipmentWithoutOspBridge: equipment.length - bridgedEquipment.length,
      adapterPorts: ports.length,
      portsWithSubrack: ports.filter((port) => Number.isInteger(port.ID_BD_SUBBASTIDOR)).length,
      portsWithCard: ports.filter((port) => Number.isInteger(port.ID_BD_CARTA)).length,
      subracks: subracks.length,
      subracksWithRack: subracks.filter((subrack) => Number.isInteger(subrack.ID_BD_BASTIDOR))
        .length,
      racks: racks.length,
      equipmentTypes: typeNames(equipment),
      subrackTypes: typeNames(subracks),
      rackTypes: typeNames(racks),
      unresolvedContracts: [
        'A classificação de equipamento ISP como OLT, DIO ou DGO ainda requer código de catálogo explicitamente validado.',
        'A contenção de equipamento em rack/subrack não foi comprovada por chave relacional direta.',
        'Não há contrato de origem confirmado para instâncias físicas de Splitter, razão de divisão, portas e contêiner.',
      ],
    };
  } finally {
    await source.close();
  }
}

const RACK_SPEC_NAME = 'Netwin Rack';
const SUBRACK_SPEC_NAME = 'Netwin Shelf';

export type StationRackLoadStats = PhaseStats & { racks: number; subracks: number };

function textCharacteristics(fields: Array<[string, unknown]>) {
  return fields
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([name, value]) => ({ name, value: String(value), valueType: 'string' }));
}

/**
 * Carga de bastidores e subbastidores de estações. O local vem de ISP_INS_BASTIDOR.ID_BD_PI
 * (= DL_INFRANODE.PI_ID = LOCATION.ID), então `place_id` é o GeographicSite do andar, sala,
 * torre ou armário (C2). Equipamentos de estação já entram pela Fase 2.B (espelho OSP).
 */
export async function runPhase2StationRacks(ctx: MigrationContext): Promise<StationRackLoadStats> {
  console.log('\n=== Fase 2.D: Bastidores e subbastidores de estações ===');
  const stats: StationRackLoadStats = {
    loaded: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    errors: 0,
    racks: 0,
    subracks: 0,
  };
  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();
  try {
    const scope = ctx.options.scope;
    const structured = Boolean(scope.bairro || scope.municipio || scope.uf);
    const prefilter = structured
      ? await resolveMunicipalityScopePrefilter(source, scope)
      : undefined;
    const specIds = {
      rack: deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:${RACK_SPEC_NAME}`),
      subrack: deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:${SUBRACK_SPEC_NAME}`),
    };
    if (target) {
      const found = await target.execute<{ ID: string }>(
        `SELECT id FROM ${ctx.t('tmf_resource_specification')} WHERE id IN (:1, :2)`,
        [specIds.rack, specIds.subrack],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if ((found.rows ?? []).length < 2) {
        throw new Error('Specs Netwin Rack/Shelf ausentes. Execute a Fase 1 antes.');
      }
    }
    const resourceColumns = [
      'id',
      'tenant_id',
      'name',
      'resource_specification_id',
      'status',
      'status_code',
      'place_id',
      'place_type',
      'administrative_state',
      'operational_state',
      'usage_state',
      'related_party',
      'characteristics',
    ];
    const relationshipColumns = ['resource_from_id', 'resource_to_id', 'relationship_type'];
    const owner = JSON.stringify([
      { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
    ]);
    const maxRecords = ctx.options.maxRecords ?? Infinity;
    let lastId = 0;
    for (;;) {
      const limit = Math.min(900, ctx.options.batchSize);
      const placeIds = structured
        ? await selectScopedInfranodeIds(source, scope, lastId, limit, prefilter)
        : await selectFullTableIds(source, 'NETWIN.LOCATION', lastId, limit);
      if (placeIds.length === 0) break;
      lastId = placeIds[placeIds.length - 1]!;

      const racks = await loadInternalRacksByPlaceIds(source, placeIds);
      if (racks.length === 0) continue;
      const subracks = await loadInternalSubracksByRackIds(
        source,
        racks.map((rack) => rack.ID_BD_BASTIDOR),
      );

      const existingSites = new Set<string>();
      if (target) {
        for (const chunk of chunksOf([
          ...new Set(racks.map((r) => netwinLocationId(r.ID_BD_PI))),
        ])) {
          const clause = chunk.map((_, i) => `:${i + 1}`).join(',');
          const found = await target.execute<{ ID: string }>(
            `SELECT id FROM ${ctx.t('tmf_geographic_site')} WHERE id IN (${clause})`,
            chunk,
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          for (const row of found.rows ?? []) existingSites.add(row.ID);
        }
      }

      const resources: Array<Record<string, unknown>> = [];
      const relationships: Array<Record<string, unknown>> = [];
      const rackById = new Map<number, { id: string; siteId: string }>();
      for (const rack of racks) {
        const siteId = netwinLocationId(rack.ID_BD_PI);
        if (target && !existingSites.has(siteId)) {
          stats.rejected++;
          continue;
        }
        const id = netwinInternalRackId(rack.ID_BD_BASTIDOR);
        rackById.set(rack.ID_BD_BASTIDOR, { id, siteId });
        const state = resolveNetwinPlantState({
          cicloVida: rack.ESTADO_CICLO_VIDA,
          operacional: rack.ESTADO_OPERACIONAL,
        });
        resources.push({
          id,
          tenant_id: ctx.options.tenantId,
          name: (rack.NOME?.trim() || rack.CODIGO?.trim() || `Rack ${rack.ID_BD_BASTIDOR}`).slice(
            0,
            255,
          ),
          resource_specification_id: specIds.rack,
          status: state.status,
          status_code: state.statusCode ?? null,
          place_id: siteId,
          place_type: 'GeographicSite',
          administrative_state: state.administrative_state,
          operational_state: state.operational_state,
          usage_state: state.usage_state,
          related_party: owner,
          characteristics: JSON.stringify([
            ...textCharacteristics([
              ['rackCode', rack.CODIGO],
              ['rackRow', rack.FIADA],
              ['rackPosition', rack.POSICAO],
              ['sourceRackType', rack.TIPO_SIGLA ?? rack.TIPO_NOME],
            ]),
            ...netwinOriginCharacteristics('ISP_INS_BASTIDOR', rack.ID_BD_BASTIDOR),
          ]),
        });
      }
      let pageSubracks = 0;
      for (const sub of subracks) {
        const parent = rackById.get(sub.ID_BD_BASTIDOR);
        if (!parent) continue;
        const id = netwinInternalSubrackId(sub.ID_BD_SUBBASTIDOR);
        const state = resolveNetwinPlantState({
          cicloVida: sub.ESTADO_CICLO_VIDA,
          operacional: sub.ESTADO_OPERACIONAL,
        });
        resources.push({
          id,
          tenant_id: ctx.options.tenantId,
          name: (
            sub.NOME?.trim() ||
            sub.CODIGO?.trim() ||
            `Subrack ${sub.ID_BD_SUBBASTIDOR}`
          ).slice(0, 255),
          resource_specification_id: specIds.subrack,
          status: state.status,
          status_code: state.statusCode ?? null,
          place_id: parent.siteId,
          place_type: 'GeographicSite',
          administrative_state: state.administrative_state,
          operational_state: state.operational_state,
          usage_state: state.usage_state,
          related_party: owner,
          characteristics: JSON.stringify([
            ...textCharacteristics([
              ['subrackCode', sub.CODIGO ?? sub.CODIGOSB],
              ['subrackPosition', sub.POSICAO],
              ['sourceSubrackType', sub.TIPO_SIGLA ?? sub.TIPO_NOME],
            ]),
            ...netwinOriginCharacteristics('ISP_INS_SUBBASTIDOR', sub.ID_BD_SUBBASTIDOR),
          ]),
        });
        relationships.push({
          resource_from_id: parent.id,
          resource_to_id: id,
          relationship_type: 'containsAsChild',
        });
        pageSubracks++;
      }
      stats.racks += rackById.size;
      stats.subracks += pageSubracks;
      if (target && resources.length > 0) {
        try {
          await bulkMergeRows(
            target,
            ctx.t,
            'tmf_physical_resource',
            ['id'],
            resourceColumns,
            resources,
            ctx.options.batchSize,
          );
          if (relationships.length > 0) {
            await bulkMergeRows(
              target,
              ctx.t,
              'tmf_resource_relationship',
              relationshipColumns,
              relationshipColumns,
              relationships,
              ctx.options.batchSize,
            );
          }
          await target.execute('COMMIT');
        } catch (error) {
          await target.execute('ROLLBACK');
          throw error;
        }
        stats.loaded += resources.length;
      }
      if (stats.racks + stats.subracks >= maxRecords) break;
    }
    console.log(
      `[Fase 2.D] ${target ? 'Gravados' : 'DRY-RUN'}: racks=${stats.racks}; subracks=${stats.subracks}; rejeitados(sem site)=${stats.rejected}.`,
    );
    return stats;
  } finally {
    await source.close();
    await target?.close();
  }
}

export type StationPlantDiscoveryRunResult = {
  report: StationPlantDiscoveryReport;
  stats: PhaseStats;
  blocked: boolean;
};

export function isStationPlantDiscoveryBlocked(report: StationPlantDiscoveryReport): boolean {
  return report.unresolvedContracts.length > 0;
}

export async function runPhase2StationInternalPlantDiscovery(
  ctx: MigrationContext,
): Promise<StationPlantDiscoveryRunResult> {
  console.log('\n=== Fase 2.D: Descoberta de planta interna de estações (somente leitura) ===');
  const report = await discoverStationInternalPlant(ctx);
  const blocked = isStationPlantDiscoveryBlocked(report);
  console.log(JSON.stringify({ phase: '2d', report }, null, 2));
  if (blocked) {
    console.log(
      'Fase 2.D não materializou recursos: a carga permanece bloqueada até todos os contratos listados serem comprovados.',
    );
  }
  return {
    report,
    blocked,
    stats: {
      loaded: 0,
      updated: 0,
      skipped: 0,
      rejected: report.equipmentWithoutOspBridge,
      errors: 0,
    },
  };
}
