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
        'A associação direta de ISP_INS_BASTIDOR a GeographicSite/Sala não foi comprovada.',
        'A classificação de equipamento ISP como OLT, DIO ou DGO ainda requer código de catálogo explicitamente validado.',
        'A contenção de equipamento em rack/subrack não foi comprovada por chave relacional direta.',
        'Não há contrato de origem confirmado para instâncias físicas de Splitter, razão de divisão, portas e contêiner.',
      ],
    };
  } finally {
    await source.close();
  }
}

export async function runPhase2StationInternalPlantDiscovery(
  ctx: MigrationContext,
): Promise<PhaseStats> {
  console.log('\n=== Fase 2.D: Descoberta de planta interna de estações (somente leitura) ===');
  const report = await discoverStationInternalPlant(ctx);
  console.log(JSON.stringify({ phase: '2d', report }, null, 2));
  console.log(
    'Fase 2.D não materializou recursos: a carga permanece bloqueada até todos os contratos listados serem comprovados.',
  );
  return {
    loaded: 0,
    updated: 0,
    skipped: 0,
    rejected: report.equipmentWithoutOspBridge,
    errors: 0,
  };
}
