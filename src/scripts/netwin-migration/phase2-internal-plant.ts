import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import {
  loadInternalCards,
  loadInternalEquipment,
  loadInternalEquipmentByNeighborhood,
  loadInternalPortConnections,
  loadInternalPorts,
} from './internal-plant-source.js';
import {
  deterministicUuid,
  netwinEquipmentId,
  netwinInternalCardId,
  netwinInternalPhysicalPortId,
  netwinLocationId,
  NEXUS_NETWIN_NAMESPACE,
} from './identity.js';
import {
  bulkMergeRows,
  netwinOriginCharacteristics,
  resolveLifecycleStatus,
} from '../netwin-migration-kit.js';
import { MigrationProgress } from './progress.js';
import type { PhaseStats } from './types.js';

const CDO_TYPE_TO_SPEC = new Map<number, { typeCode: string; specName: string }>([
  [270, { typeCode: 'category:CDOI', specName: 'Netwin CDOI' }],
  [271, { typeCode: 'category:CDOE', specName: 'Netwin CDOE' }],
  [272, { typeCode: 'category:CDOI', specName: 'Netwin CDOI' }],
]);

export function parseSplitterRatio(
  tipoNome: string | null | undefined,
  tipoSigla: string | null | undefined,
  cardNome: string | null | undefined,
): number {
  const combined = `${tipoNome ?? ''} ${tipoSigla ?? ''} ${cardNome ?? ''}`.toUpperCase();
  const match = combined.match(/1\s*[:xX/]\s*(\d+)/);
  if (match && match[1]) {
    const ratio = parseInt(match[1], 10);
    if ([2, 4, 8, 16, 32, 64].includes(ratio)) {
      return ratio;
    }
  }
  return 8; // fallback padrão para FTTH CDO splitter
}

type CdoSourceRow = {
  ID_BD_EQUIPAMENTO: number;
  ID_BD_EQUIPAMENTO_OSP: number;
  ID_BD_LOCAL: number;
  ID_BD_TIPO_NE: number | null;
};

type CanonicalCdoParent = {
  ispEquipmentId: number;
  ospEquipmentId: number;
  resourceId: string;
};

/**
 * A CDO OSP é a identidade canônica que a Fase 2.B coloca no mapa. O espelho
 * ISP só comprova que as portas físicas pertencem a ela; ele não cria outra CDO.
 */
export function resolveCanonicalCdoParents(rows: CdoSourceRow[]): {
  parents: Map<number, CanonicalCdoParent>;
  rejectedEquipmentIds: Set<number>;
} {
  const candidates = new Map<number, CanonicalCdoParent>();
  const rejectedEquipmentIds = new Set<number>();

  for (const row of rows) {
    const mapping = CDO_TYPE_TO_SPEC.get(row.ID_BD_TIPO_NE ?? -1);
    if (!mapping) continue;
    if (!Number.isInteger(row.ID_BD_EQUIPAMENTO_OSP)) {
      rejectedEquipmentIds.add(row.ID_BD_EQUIPAMENTO);
      continue;
    }
    const candidate: CanonicalCdoParent = {
      ispEquipmentId: row.ID_BD_EQUIPAMENTO,
      ospEquipmentId: row.ID_BD_EQUIPAMENTO_OSP,
      resourceId: netwinEquipmentId(row.ID_BD_EQUIPAMENTO_OSP),
    };
    const prior = candidates.get(candidate.ispEquipmentId);
    if (prior && prior.ospEquipmentId !== candidate.ospEquipmentId) {
      candidates.delete(candidate.ispEquipmentId);
      rejectedEquipmentIds.add(candidate.ispEquipmentId);
      continue;
    }
    if (!rejectedEquipmentIds.has(candidate.ispEquipmentId))
      candidates.set(candidate.ispEquipmentId, candidate);
  }

  return { parents: candidates, rejectedEquipmentIds };
}

function defaultName(value: string | null, fallback: string): string {
  return (value?.trim() || fallback).slice(0, 255);
}

// Separa o que é atributo operacional de instância (coberto pela matriz de
// `ResourceType.resourceTypeCharacteristic` da Fase 1.D — ver SPLITTER_INSTANCE_CHARACTERISTICS e
// PORT_INSTANCE_CHARACTERISTICS em phase1-resource-specs.ts) do que é proveniência reservada C5.
// Identificadores de pai/card não são atributo do recurso: servem só para reconciliação de
// contenção (ver reconcile-netwin-phase2c-containment.ts) e vão em `_origin.extra`.
function instanceCharacteristics(fields: Array<[string, unknown]>) {
  return fields
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([name, value]) => ({ name, value: String(value), valueType: 'string' }));
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
           SELECT la.ID_CHILD AS ID
             FROM NETWIN.LOCATION_ASSOC la
            START WITH la.ID_PARENT IN (
              SELECT l.ID
                FROM NETWIN.LOCATION l
               WHERE UPPER(l.NAME) = :name OR UPPER(l.NAME) = :normalized
            )
          CONNECT BY NOCYCLE PRIOR la.ID_CHILD = la.ID_PARENT
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

export function isCompatiblePortSpecification(
  specification: { tenantId: string; resourceTypeCode: string } | undefined,
  tenantId: string,
): boolean {
  return specification?.tenantId === tenantId && specification.resourceTypeCode === 'Port';
}

async function requirePortSpecification(
  ctx: MigrationContext,
  target: oracledb.Connection,
): Promise<string> {
  const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'RESOURCE_SPEC:Netwin Port');
  const result = await target.execute<{
    ID: string;
    SPECIFICATION_TENANT_ID: string;
    RESOURCE_TYPE_CODE: string;
  }>(
    `SELECT specification.id,
            specification.tenant_id AS specification_tenant_id,
            resource_type.code AS resource_type_code
       FROM ${ctx.t('tmf_resource_specification')} specification
       JOIN ${ctx.t('tmf_resource_type')} resource_type ON resource_type.id = specification.resource_type_id
      WHERE specification.id = :1`,
    [specId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const specification = result.rows?.[0];
  if (
    !isCompatiblePortSpecification(
      specification
        ? {
            tenantId: specification.SPECIFICATION_TENANT_ID,
            resourceTypeCode: specification.RESOURCE_TYPE_CODE,
          }
        : undefined,
      ctx.options.tenantId,
    )
  ) {
    throw new Error(
      'ResourceSpecification canônica Netwin Port ausente ou incompatível com o tenant/tipo Port. Verifique a Fase 1.D no destino.',
    );
  }
  return specId;
}

async function requireSplitterSpecifications(
  ctx: MigrationContext,
  target: oracledb.Connection,
): Promise<Map<number, string>> {
  const specs = new Map<number, string>();
  for (const ratio of [2, 4, 8, 16, 32, 64]) {
    const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:Splitter:1x${ratio}`);
    specs.set(ratio, specId);
  }

  const result = await target.execute<{ ID: string }>(
    `SELECT specification.id
       FROM ${ctx.t('tmf_resource_specification')} specification
       JOIN ${ctx.t('tmf_resource_type')} resource_type ON resource_type.id = specification.resource_type_id
      WHERE specification.tenant_id = :1
        AND resource_type.code = 'Splitter'`,
    [ctx.options.tenantId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const existing = new Set((result.rows ?? []).map((row) => row.ID));
  for (const [ratio, id] of specs) {
    if (!existing.has(id)) {
      throw new Error(
        `ResourceSpecification ausente para Splitter 1:${ratio}. Execute a Fase 1 antes da Fase 2.C.`,
      );
    }
  }
  return specs;
}

async function requireSpecIds(
  ctx: MigrationContext,
  target: oracledb.Connection | null,
): Promise<Map<number, string>> {
  const specs = new Map<number, string>();
  for (const [sourceType, mapping] of CDO_TYPE_TO_SPEC) {
    specs.set(
      sourceType,
      deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:${mapping.specName}`),
    );
  }
  if (!target) return specs;

  const result = await target.execute<{ ID: string }>(
    `SELECT id FROM ${ctx.t('tmf_resource_specification')}`,
    [],
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    },
  );
  const existing = new Set((result.rows ?? []).map((row) => row.ID));
  for (const [sourceType, id] of specs) {
    if (!existing.has(id)) {
      throw new Error(
        `ResourceSpecification ausente para CDO Netwin tipo ${sourceType}. Execute a Fase 1 antes.`,
      );
    }
  }
  return specs;
}

/**
 * Fase 2.C — planta interna, com contrato ISP confirmado por dicionário Oracle.
 *
 * A origem Netwin é acessada apenas por `ctx.getSourceConnection()`: a conexão
 * executa `SET TRANSACTION READ ONLY` antes de qualquer leitura e bloqueia DML,
 * DDL, locks e APIs mutáveis. Esta fase usa exclusivamente SELECTs.
 *
 * Para CDO, o vínculo territorial comprovado é ISP_INS_EQUIPAMENTO →
 * NS_RES_INS_NODE_MIRROR → OSP_EQUIPMENT.INFRANODE_ID → LOCATION. Portas CDO
 * elegíveis são registros físicos reais, tipo `Adapter`, espelhados em
 * NS_RES_INS_TP_MIRROR_ALL. Rack, subrack, slot e card ainda não têm uma cadeia
 * inequívoca até LOCATION; portanto não são inventados nem associados a um site
 * por aproximação. Também não há categoria OLT confirmada.
 */
export async function runPhase2InternalPlant(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 2.C: Planta Interna (CDOs e portas físicas reais) ===');

  const locationIds = ctx.options.scope.bairro ? [] : await scopedLocationIds(ctx);
  if (!ctx.options.scope.bairro && locationIds.length === 0) {
    throw new Error(
      'A Fase 2.C não encontrou LOCATIONs no escopo informado; a carga não será ampliada silenciosamente.',
    );
  }

  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();
  try {
    const maxRecords = ctx.options.maxRecords ?? Number.MAX_SAFE_INTEGER;
    const sourceTiming = { equipmentMs: 0, portsMs: 0, cardsMs: 0, connectionsMs: 0 };
    let startedAt = Date.now();
    const equipment = ctx.options.scope.bairro
      ? await loadInternalEquipmentByNeighborhood(source, ctx.options.scope, maxRecords)
      : await loadInternalEquipment(source, locationIds, maxRecords);
    sourceTiming.equipmentMs = Date.now() - startedAt;
    const cdoEquipment = equipment.filter((item) => CDO_TYPE_TO_SPEC.has(item.ID_BD_TIPO_NE ?? -1));
    const { parents: canonicalParents, rejectedEquipmentIds } =
      resolveCanonicalCdoParents(cdoEquipment);
    startedAt = Date.now();
    const ports = await loadInternalPorts(source, [...canonicalParents.keys()]);
    sourceTiming.portsMs = Date.now() - startedAt;
    const cardIds = [
      ...new Set(
        ports
          .map((p) => p.ID_BD_CARTA)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    startedAt = Date.now();
    const cards = await loadInternalCards(source, cardIds);
    sourceTiming.cardsMs = Date.now() - startedAt;
    startedAt = Date.now();
    const connections = await loadInternalPortConnections(
      source,
      ports.map((item) => item.ID_BD_PORTO_FISICO),
    );
    sourceTiming.connectionsMs = Date.now() - startedAt;
    stats.rejected = equipment.length - cdoEquipment.length + rejectedEquipmentIds.size;

    console.log(
      `Fonte ISP: ${equipment.length} equipamentos vinculados ao escopo; ${cdoEquipment.length} CDOs com tipo explícito; ${canonicalParents.size} pontes OSP inequívocas; ${cards.length} splitters (cards); ${ports.length} portas físicas reais; ${connections.length} conexões físicas. Tempos de leitura: equipamentos=${sourceTiming.equipmentMs}ms; portas=${sourceTiming.portsMs}ms; cards=${sourceTiming.cardsMs}ms; conexões=${sourceTiming.connectionsMs}ms.`,
    );

    if (!target) {
      stats.loaded = cards.length + ports.length;
      console.log(
        `DRY-RUN 2.C: ${cards.length} splitters e ${ports.length} portas seriam relacionados às CDOs OSP canônicas; ${stats.rejected} itens não seriam importados por contrato incompleto.`,
      );
      return stats;
    }

    await requireSpecIds(ctx, target);
    const portSpecId = await requirePortSpecification(ctx, target);
    const splitterSpecsByRatio = await requireSplitterSpecifications(ctx, target);
    const validParentIds = new Set<string>();
    const parentIds = [
      ...new Set(Array.from(canonicalParents.values(), (parent) => parent.resourceId)),
    ];
    for (let offset = 0; offset < parentIds.length; offset += 900) {
      const parentBatch = parentIds.slice(offset, offset + 900);
      const placeholders = parentBatch.map((_, index) => `:${index + 1}`).join(', ');
      const result = await target.execute<{ ID: string; TENANT_ID: string }>(
        `SELECT id, tenant_id
           FROM ${ctx.t('tmf_physical_resource')}
          WHERE id IN (${placeholders})`,
        parentBatch,
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const row of result.rows ?? []) {
        if (row.TENANT_ID === ctx.options.tenantId) validParentIds.add(row.ID);
      }
    }

    for (const parent of canonicalParents.values()) {
      if (!validParentIds.has(parent.resourceId)) stats.rejected++;
    }

    const equipmentById = new Map(cdoEquipment.map((item) => [item.ID_BD_EQUIPAMENTO, item]));
    const cardById = new Map(cards.map((c) => [c.ID_BD_CARTA, c]));

    // Mapear cada card ao seu equipamento pai via as portas que pertencem a ele
    const cardToEquipmentId = new Map<number, number>();
    for (const port of ports) {
      if (port.ID_BD_CARTA && port.ID_BD_EQUIPAMENTO && !cardToEquipmentId.has(port.ID_BD_CARTA)) {
        cardToEquipmentId.set(port.ID_BD_CARTA, port.ID_BD_EQUIPAMENTO);
      }
    }

    const resourceColumns = [
      'id',
      'tenant_id',
      'name',
      'resource_specification_id',
      'status',
      'place_id',
      'place_type',
      'serving_site_id',
      'administrative_state',
      'operational_state',
      'usage_state',
      'related_party',
      'characteristics',
    ];
    const relationshipColumns = ['resource_from_id', 'resource_to_id', 'relationship_type'];
    const batches = <T>(items: T[]): T[][] => {
      const result: T[][] = [];
      for (let offset = 0; offset < items.length; offset += ctx.options.batchSize) {
        result.push(items.slice(offset, offset + ctx.options.batchSize));
      }
      return result;
    };
    const uniqueRows = (
      rows: Array<Record<string, unknown>>,
      key: (row: Record<string, unknown>) => string,
    ) => [...new Map(rows.map((row) => [key(row), row])).values()];
    const timing = {
      resourceMergeMs: 0,
      relationshipMergeMs: 0,
      commitMs: 0,
      executeManyCalls: 0,
    };
    const commit = async (stage: string, processed: number): Promise<void> => {
      const startedAt = Date.now();
      await target.execute('COMMIT');
      timing.commitMs += Date.now() - startedAt;
      console.log(`[Commit] Fase 2.C — ${stage}: ${processed} item(ns) confirmados.`);
    };
    const mergeStage = async (
      stage: string,
      rows: Array<Record<string, unknown>>,
      relationships: Array<Record<string, unknown>>,
      progress: MigrationProgress,
    ): Promise<void> => {
      for (const resourceBatch of batches(rows)) {
        const resourceStartedAt = Date.now();
        await bulkMergeRows(
          target,
          ctx.t,
          'tmf_physical_resource',
          ['id'],
          resourceColumns,
          resourceBatch,
          ctx.options.batchSize,
        );
        timing.resourceMergeMs += Date.now() - resourceStartedAt;
        timing.executeManyCalls++;
        await commit(stage, resourceBatch.length);
        progress.advance(resourceBatch.length);
      }
      for (const relationshipBatch of batches(relationships)) {
        const relationshipStartedAt = Date.now();
        await bulkMergeRows(
          target,
          ctx.t,
          'tmf_resource_relationship',
          relationshipColumns,
          relationshipColumns,
          relationshipBatch,
          ctx.options.batchSize,
        );
        timing.relationshipMergeMs += Date.now() - relationshipStartedAt;
        timing.executeManyCalls++;
        await commit(`${stage} — contenções`, relationshipBatch.length);
      }
      progress.finish();
    };

    const importedCardIds = new Set<number>();
    const splitterRows: Array<Record<string, unknown>> = [];
    const splitterRelationships: Array<Record<string, unknown>> = [];
    for (const card of cards) {
      const equipmentId = cardToEquipmentId.get(card.ID_BD_CARTA);
      const parent = equipmentId ? canonicalParents.get(equipmentId) : undefined;
      const cdo = equipmentId ? equipmentById.get(equipmentId) : undefined;
      if (!parent || !cdo || !validParentIds.has(parent.resourceId)) {
        stats.rejected++;
        continue;
      }
      const ratio = parseSplitterRatio(card.TIPO_NOME, card.TIPO_SIGLA, card.NOME);
      const splitterId = netwinInternalCardId(card.ID_BD_CARTA);
      splitterRows.push({
        id: splitterId,
        tenant_id: ctx.options.tenantId,
        name: defaultName(
          card.NOME,
          card.NOME_ALTERNATIVO ||
            `${card.TIPO_SIGLA ?? card.TIPO_NOME ?? 'Splitter'} ${card.ID_BD_CARTA}`,
        ),
        resource_specification_id: splitterSpecsByRatio.get(ratio) ?? splitterSpecsByRatio.get(8)!,
        status: resolveLifecycleStatus(undefined).status,
        place_id: netwinLocationId(cdo.ID_BD_LOCAL),
        place_type: 'GeographicSite',
        serving_site_id: netwinLocationId(cdo.ID_BD_LOCAL),
        administrative_state: 'unlocked',
        operational_state: card.ESTADO_OPERACIONAL === null ? 'unknown' : 'enabled',
        usage_state: 'idle',
        related_party: JSON.stringify([
          { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
        ]),
        characteristics: JSON.stringify([
          ...instanceCharacteristics([
            ['sourceCardType', card.TIPO_NOME],
            ['sourceCardSigla', card.TIPO_SIGLA],
            ['slotNumber', card.N_SLOT],
            ['positionUf', card.POSICAO_UF],
            ['splitRatio', `1:${ratio}`],
          ]),
          ...netwinOriginCharacteristics('ISP_INS_CARTA', card.ID_BD_CARTA, {
            parentOspEquipmentId: parent.ospEquipmentId,
            parentIspEquipmentId: parent.ispEquipmentId,
          }),
        ]),
      });
      splitterRelationships.push({
        resource_from_id: parent.resourceId,
        resource_to_id: splitterId,
        relationship_type: 'containsAsChild',
      });
      importedCardIds.add(card.ID_BD_CARTA);
    }
    const splitterProgress = new MigrationProgress({
      label: 'Fase 2.C — Splitters',
      unit: 'splitters',
      total: splitterRows.length,
      reportEvery: ctx.options.batchSize,
    });
    splitterProgress.start();
    await mergeStage(
      'Splitters',
      uniqueRows(splitterRows, (row) => String(row.id)),
      uniqueRows(
        splitterRelationships,
        (row) => `${row.resource_from_id}:${row.resource_to_id}:${row.relationship_type}`,
      ),
      splitterProgress,
    );
    stats.loaded += splitterRows.length;

    const importedPortIds = new Set<number>();
    const portRows: Array<Record<string, unknown>> = [];
    const portRelationships: Array<Record<string, unknown>> = [];
    for (const port of ports) {
      const parent = port.ID_BD_EQUIPAMENTO
        ? canonicalParents.get(port.ID_BD_EQUIPAMENTO)
        : undefined;
      const cdo = port.ID_BD_EQUIPAMENTO ? equipmentById.get(port.ID_BD_EQUIPAMENTO) : undefined;
      if (!parent || !cdo || !validParentIds.has(parent.resourceId)) {
        stats.rejected++;
        continue;
      }
      const hasCard = typeof port.ID_BD_CARTA === 'number' && importedCardIds.has(port.ID_BD_CARTA);
      const parentResourceId = hasCard
        ? netwinInternalCardId(port.ID_BD_CARTA!)
        : parent.resourceId;
      const portId = netwinInternalPhysicalPortId(port.ID_BD_PORTO_FISICO);
      const portCard = port.ID_BD_CARTA ? cardById.get(port.ID_BD_CARTA) : undefined;
      portRows.push({
        id: portId,
        tenant_id: ctx.options.tenantId,
        name: defaultName(port.NOME, port.CODIFICACAO_PORTO || `Porta ${port.ID_BD_PORTO_FISICO}`),
        resource_specification_id: portSpecId,
        status: resolveLifecycleStatus(undefined).status,
        place_id: netwinLocationId(cdo.ID_BD_LOCAL),
        place_type: 'GeographicSite',
        serving_site_id: netwinLocationId(cdo.ID_BD_LOCAL),
        administrative_state: 'unlocked',
        operational_state: port.ESTADO_OPERACIONAL === null ? 'unknown' : 'enabled',
        usage_state: 'idle',
        related_party: JSON.stringify([
          { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
        ]),
        characteristics: JSON.stringify([
          ...instanceCharacteristics([
            ['sourcePortType', port.TIPO_NOME],
            ['portId', port.ID_PORTO],
            ['coding', port.CODIFICACAO_PORTO],
            ['occupancy', port.OCUPACAO],
            ['circuit', port.CIRCUITO],
            ['bandwidth', port.DEBITO],
          ]),
          ...netwinOriginCharacteristics('ISP_INS_PORTO_FISICO', port.ID_BD_PORTO_FISICO, {
            parentOspEquipmentId: parent.ospEquipmentId,
            parentIspEquipmentId: parent.ispEquipmentId,
            ...(port.ID_BD_CARTA ? { parentCardId: port.ID_BD_CARTA } : {}),
            ...(portCard?.TIPO_NOME ? { parentCardType: portCard.TIPO_NOME } : {}),
          }),
        ]),
      });
      portRelationships.push({
        resource_from_id: parentResourceId,
        resource_to_id: portId,
        relationship_type: 'containsAsChild',
      });
      importedPortIds.add(port.ID_BD_PORTO_FISICO);
    }
    const portProgress = new MigrationProgress({
      label: 'Fase 2.C — Portas',
      unit: 'portas',
      total: portRows.length,
      reportEvery: ctx.options.batchSize,
    });
    portProgress.start();
    await mergeStage(
      'Portas',
      uniqueRows(portRows, (row) => String(row.id)),
      uniqueRows(
        portRelationships,
        (row) => `${row.resource_from_id}:${row.resource_to_id}:${row.relationship_type}`,
      ),
      portProgress,
    );
    stats.loaded += portRows.length;

    const connectionRelationships = uniqueRows(
      connections
        .filter(
          (connection) =>
            importedPortIds.has(connection.ID_BD_PORTO_FISICO_A) &&
            importedPortIds.has(connection.ID_BD_PORTO_FISICO_Z),
        )
        .map((connection) => ({
          resource_from_id: netwinInternalPhysicalPortId(connection.ID_BD_PORTO_FISICO_A),
          resource_to_id: netwinInternalPhysicalPortId(connection.ID_BD_PORTO_FISICO_Z),
          relationship_type: 'connectedTo',
        })),
      (row) => `${row.resource_from_id}:${row.resource_to_id}:${row.relationship_type}`,
    );
    const connectionProgress = new MigrationProgress({
      label: 'Fase 2.C — Conexões',
      unit: 'conexões',
      total: connectionRelationships.length,
      reportEvery: ctx.options.batchSize,
    });
    connectionProgress.start();
    for (const connectionBatch of batches(connectionRelationships)) {
      const relationshipStartedAt = Date.now();
      await bulkMergeRows(
        target,
        ctx.t,
        'tmf_resource_relationship',
        relationshipColumns,
        relationshipColumns,
        connectionBatch,
        ctx.options.batchSize,
      );
      timing.relationshipMergeMs += Date.now() - relationshipStartedAt;
      timing.executeManyCalls++;
      await commit('Conexões', connectionBatch.length);
      connectionProgress.advance(connectionBatch.length);
    }
    connectionProgress.finish();

    console.log(
      `Fase 2.C concluída: ${importedCardIds.size} splitters e ${importedPortIds.size} portas reconciliados; ${splitterRelationships.length + portRelationships.length} contenções e ${connectionRelationships.length} conexões reconciliadas; ${stats.rejected} itens rejeitados. DML em lote: ${timing.executeManyCalls} executeMany; recursos=${timing.resourceMergeMs}ms; relações=${timing.relationshipMergeMs}ms; commits=${timing.commitMs}ms. Nenhuma CDO ISP duplicada foi criada.`,
    );
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
