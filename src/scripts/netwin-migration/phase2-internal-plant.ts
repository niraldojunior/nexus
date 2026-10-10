import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import {
  hasAnyPhysicalConnections,
  loadInternalCards,
  loadInternalCdoEquipmentIds,
  loadInternalEquipmentByNeighborhood,
  loadInternalPortConnections,
  loadInternalPorts,
  resolveCardCanonicalEquipmentIds,
  type CdoEquipmentIdRow,
} from './internal-plant-source.js';
import {
  deterministicUuid,
  netwinEquipmentId,
  netwinInternalCardId,
  netwinInternalPhysicalPortId,
  NEXUS_NETWIN_NAMESPACE,
} from './identity.js';
import {
  bulkMergeRows,
  netwinOriginCharacteristics,
  resolveNetwinPlantState,
} from '../netwin-migration-kit.js';
import {
  enqueueNativeRelationships,
  loadNativeCheckpoint,
  saveNativeCheckpoint,
} from './checkpoint.js';
import { MigrationProgress } from './progress.js';
import type { PhaseStats } from './types.js';

/**
 * Tem de ser exatamente 900: é o tamanho de bloco interno de `loadInternalPorts`
 * (`internal-plant-source.ts`). Usar `batchSize` (2000) faria cada página virar consultas
 * desiguais e engrossaria o cursor de resume — ver Passo 1 do plano de paginação da Fase 2.C.
 */
const CDO_PAGE_SIZE = 900;

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

type CdoSourceRow = CdoEquipmentIdRow;

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
    const equipmentStartedAt = Date.now();

    // Varredura de equipamento em passada única: a projeção slim (4 campos numéricos) de
    // ~266k CDOs é ~25 MB, não o risco de memória. Só as portas paginam a seguir (Passo 1
    // do plano de paginação da Fase 2.C). O filtro de tipo CDO já vem do SQL — não filtra
    // mais em JS — então `loadInternalEquipment` (usada pela Fase 2.D) fica intacta.
    const cdoEquipment: CdoSourceRow[] = ctx.options.scope.bairro
      ? (await loadInternalEquipmentByNeighborhood(source, ctx.options.scope, maxRecords)).filter(
          (item) => CDO_TYPE_TO_SPEC.has(item.ID_BD_TIPO_NE ?? -1),
        )
      : await loadInternalCdoEquipmentIds(source, locationIds, maxRecords);
    const equipmentMs = Date.now() - equipmentStartedAt;

    const { parents: canonicalParents, rejectedEquipmentIds } =
      resolveCanonicalCdoParents(cdoEquipment);
    const equipmentById = new Map(cdoEquipment.map((item) => [item.ID_BD_EQUIPAMENTO, item]));
    // Ordem crescente global: cada bloco de 900 locais volta ordenado internamente, mas a
    // concatenação de vários blocos não é — sem isto o cursor de resume descartaria ids
    // nunca processados.
    const sortedCdoIds = [...canonicalParents.keys()].sort((a, b) => a - b);
    stats.rejected = rejectedEquipmentIds.size;

    console.log(
      `Fonte ISP: ${cdoEquipment.length} equipamentos CDO no escopo; ${canonicalParents.size} pontes OSP inequívocas; ${rejectedEquipmentIds.size} rejeitadas por ambiguidade OSP. Tempo de leitura: equipamentos=${equipmentMs}ms.`,
    );

    if (!target) {
      console.log(
        `DRY-RUN 2.C: ${canonicalParents.size} CDOs canônicas seriam processadas em páginas de ${CDO_PAGE_SIZE}; ${stats.rejected} equipamento(s) rejeitado(s) por ambiguidade OSP.`,
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

    // NETWIN.MRD_CONECTOR está vazia no DR inteiro (confirmado). Uma única consulta de
    // existência evita 9.944 consultas contra uma tabela sem linhas (Passo 4).
    const hasConnections = await hasAnyPhysicalConnections(source);
    if (!hasConnections) {
      console.log(
        '[Conexões] NETWIN.MRD_CONECTOR não tem linhas; estágio de conexões pulado (guarda de existência).',
      );
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
      portsMs: 0,
      cardsMs: 0,
      connectionsMs: 0,
    };

    // Checkpoint por CDO — não existe estágio '2C' até aqui (só '2A', '2B-equipment',
    // '2B-route', '2B-cable'); reusa `NativeCheckpoint` sem mudança de forma (Passo 2).
    const checkpoint = await loadNativeCheckpoint(target, ctx, '2C-plant');
    let lastCdoId = checkpoint.lastSourceId;
    let cdoProcessedCount = checkpoint.processedCount;
    if (ctx.options.resume) {
      console.log(`[Resume] Fase 2.C: cursor ${lastCdoId}; processados=${cdoProcessedCount}.`);
    }

    // Progresso único, fora do laço de página, medido em CDOs — instanciar por página
    // produziria 297 barras de 0->100% e destruiria a noção de progresso global.
    const plantProgress = new MigrationProgress({
      label: 'Fase 2.C — CDOs',
      unit: 'CDOs',
      total: canonicalParents.size,
      reportEvery: CDO_PAGE_SIZE,
    });
    plantProgress.start();
    plantProgress.advance(cdoProcessedCount);

    const importedCardIds = new Set<number>();
    const importedPortIds = new Set<number>();
    let queuedConnections = 0;

    const remainingCdoIds = sortedCdoIds.filter((id) => id > lastCdoId);
    for (let offset = 0; offset < remainingCdoIds.length; offset += CDO_PAGE_SIZE) {
      const pageIds = remainingCdoIds.slice(offset, offset + CDO_PAGE_SIZE);

      let pageStartedAt = Date.now();
      const ports = await loadInternalPorts(source, pageIds);
      timing.portsMs += Date.now() - pageStartedAt;

      const cardIds = [
        ...new Set(
          ports
            .map((p) => p.ID_BD_CARTA)
            .filter((id): id is number => typeof id === 'number' && id > 0),
        ),
      ];
      pageStartedAt = Date.now();
      const [cards, cardParents] = await Promise.all([
        loadInternalCards(source, cardIds),
        // Determinismo do card por MIN(ID_BD_EQUIPAMENTO) em SQL — Passo 3, necessário
        // porque 10 cards no RJ pertencem a portas de mais de um equipamento.
        resolveCardCanonicalEquipmentIds(source, cardIds),
      ]);
      timing.cardsMs += Date.now() - pageStartedAt;
      const cardById = new Map(cards.map((c) => [c.ID_BD_CARTA, c]));

      let connections: Array<{ ID_BD_PORTO_FISICO_A: number; ID_BD_PORTO_FISICO_Z: number }> = [];
      if (hasConnections) {
        pageStartedAt = Date.now();
        connections = await loadInternalPortConnections(
          source,
          ports.map((item) => item.ID_BD_PORTO_FISICO),
        );
        timing.connectionsMs += Date.now() - pageStartedAt;
      }

      const pageResources: Array<Record<string, unknown>> = [];
      const pageRelationships: Array<Record<string, unknown>> = [];
      let pageRejected = 0;

      // Splitters (cards): resolvidos antes das portas na mesma página, espelhando a ordem
      // original de duas passadas. Cards já emitidos em página anterior não são reemitidos.
      for (const [cardId, equipmentId] of cardParents) {
        if (importedCardIds.has(cardId)) continue;
        const card = cardById.get(cardId);
        const parent = canonicalParents.get(equipmentId);
        const cdo = equipmentById.get(equipmentId);
        if (!card || !parent || !cdo || !validParentIds.has(parent.resourceId)) {
          pageRejected++;
          continue;
        }
        const ratio = parseSplitterRatio(card.TIPO_NOME, card.TIPO_SIGLA, card.NOME);
        const splitterId = netwinInternalCardId(card.ID_BD_CARTA);
        const cardState = resolveNetwinPlantState({
          cicloVida: card.ESTADO_CICLO_VIDA,
          operacional: card.ESTADO_OPERACIONAL,
        });
        pageResources.push({
          id: splitterId,
          tenant_id: ctx.options.tenantId,
          name: defaultName(
            card.NOME,
            card.NOME_ALTERNATIVO ||
              `${card.TIPO_SIGLA ?? card.TIPO_NOME ?? 'Splitter'} ${card.ID_BD_CARTA}`,
          ),
          resource_specification_id:
            splitterSpecsByRatio.get(ratio) ?? splitterSpecsByRatio.get(8)!,
          status: cardState.status,
          status_code: cardState.statusCode ?? null,
          // Recurso interno: sem place/serving. O lugar dele é resolvido pelo recurso que o
          // contém (`containsAsChild`), nunca pelo Site da CDO.
          place_id: null,
          place_type: null,
          serving_site_id: null,
          administrative_state: cardState.administrative_state,
          operational_state: cardState.operational_state,
          usage_state: cardState.usage_state,
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
        pageRelationships.push({
          resource_from_id: parent.resourceId,
          resource_to_id: splitterId,
          relationship_type: 'containsAsChild',
        });
        importedCardIds.add(card.ID_BD_CARTA);
      }

      // Portas físicas desta página.
      for (const port of ports) {
        const equipmentId = port.ID_BD_EQUIPAMENTO;
        const parent = equipmentId ? canonicalParents.get(equipmentId) : undefined;
        const cdo = equipmentId ? equipmentById.get(equipmentId) : undefined;
        if (!parent || !cdo || !validParentIds.has(parent.resourceId)) {
          pageRejected++;
          continue;
        }
        const hasCard =
          typeof port.ID_BD_CARTA === 'number' && importedCardIds.has(port.ID_BD_CARTA);
        const parentResourceId = hasCard
          ? netwinInternalCardId(port.ID_BD_CARTA!)
          : parent.resourceId;
        const portId = netwinInternalPhysicalPortId(port.ID_BD_PORTO_FISICO);
        const portCard = port.ID_BD_CARTA ? cardById.get(port.ID_BD_CARTA) : undefined;
        const portState = resolveNetwinPlantState({
          cicloVida: port.ESTADO_CICLO_VIDA,
          operacional: port.ESTADO_OPERACIONAL,
          provisao: port.ESTADO_PROVISAO,
          hasService: port.ID_SERVICO !== null && port.ID_SERVICO !== undefined,
        });
        pageResources.push({
          id: portId,
          tenant_id: ctx.options.tenantId,
          name: defaultName(
            port.NOME,
            port.CODIFICACAO_PORTO || `Porta ${port.ID_BD_PORTO_FISICO}`,
          ),
          resource_specification_id: portSpecId,
          status: portState.status,
          status_code: portState.statusCode ?? null,
          // Recurso interno: sem place/serving. O lugar dele é resolvido pelo recurso que o
          // contém (`containsAsChild`), nunca pelo Site da CDO.
          place_id: null,
          place_type: null,
          serving_site_id: null,
          administrative_state: portState.administrative_state,
          operational_state: portState.operational_state,
          usage_state: portState.usage_state,
          related_party: JSON.stringify([
            { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
          ]),
          characteristics: JSON.stringify([
            ...instanceCharacteristics([
              ['sourcePortType', port.TIPO_NOME],
              ['portId', port.ID_PORTO],
              ['coding', port.CODIFICACAO_PORTO],
              ['occupancy', port.OCUPACAO],
              ['occupancyType', port.TIPO_OCUPACAO],
              ['provisionState', port.ESTADO_PROVISAO],
              ['serviceId', port.ID_SERVICO],
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
        pageRelationships.push({
          resource_from_id: parentResourceId,
          resource_to_id: portId,
          relationship_type: 'containsAsChild',
        });
        importedPortIds.add(port.ID_BD_PORTO_FISICO);
      }

      // `connectedTo` vai pela fila (`enqueueNativeRelationships` + `reconcileNativeRelationships`),
      // não por um Set em memória: é o que resolve corretamente uma conexão entre portas de
      // páginas diferentes, com o mesmo join duplo idempotente já usado na Fase 2.B.
      const pageConnections = uniqueRows(
        connections.map((connection) => ({
          resource_from_id: netwinInternalPhysicalPortId(connection.ID_BD_PORTO_FISICO_A),
          resource_to_id: netwinInternalPhysicalPortId(connection.ID_BD_PORTO_FISICO_Z),
          relationship_type: 'connectedTo',
        })),
        (row) => `${row.resource_from_id}:${row.resource_to_id}:${row.relationship_type}`,
      ) as Array<{ resource_from_id: string; resource_to_id: string; relationship_type: string }>;

      const uniqueResources = uniqueRows(pageResources, (row) => String(row.id));
      const uniqueRelationships = uniqueRows(
        pageRelationships,
        (row) => `${row.resource_from_id}:${row.resource_to_id}:${row.relationship_type}`,
      );

      const nextLastCdoId = pageIds[pageIds.length - 1]!;
      const nextProcessedCount = cdoProcessedCount + pageIds.length;
      try {
        let mergeStartedAt = Date.now();
        for (const resourceBatch of batches(uniqueResources)) {
          await bulkMergeRows(
            target,
            ctx.t,
            'tmf_physical_resource',
            ['id'],
            resourceColumns,
            resourceBatch,
            ctx.options.batchSize,
          );
          timing.executeManyCalls++;
        }
        timing.resourceMergeMs += Date.now() - mergeStartedAt;

        mergeStartedAt = Date.now();
        for (const relationshipBatch of batches(uniqueRelationships)) {
          await bulkMergeRows(
            target,
            ctx.t,
            'tmf_resource_relationship',
            relationshipColumns,
            relationshipColumns,
            relationshipBatch,
            ctx.options.batchSize,
          );
          timing.executeManyCalls++;
        }
        timing.relationshipMergeMs += Date.now() - mergeStartedAt;

        if (pageConnections.length > 0) {
          await enqueueNativeRelationships(target, ctx, pageConnections, ctx.options.batchSize);
          queuedConnections += pageConnections.length;
        }

        await saveNativeCheckpoint(target, ctx, '2C-plant', {
          lastSourceId: nextLastCdoId,
          processedCount: nextProcessedCount,
        });

        const commitStartedAt = Date.now();
        await target.execute('COMMIT');
        timing.commitMs += Date.now() - commitStartedAt;
      } catch (error) {
        await target.execute('ROLLBACK');
        throw error;
      }

      cdoProcessedCount = nextProcessedCount;
      lastCdoId = nextLastCdoId;
      stats.rejected += pageRejected;
      plantProgress.advance(pageIds.length);
      console.log(
        `[Progresso] Fase 2.C — CDOs: cursor ${lastCdoId}; página=${pageIds.length}; portas=${ports.length}; cards=${cards.length}; conexões=${connections.length}; rejeitados(página)=${pageRejected}.`,
      );
    }
    plantProgress.finish();
    stats.loaded = importedCardIds.size + importedPortIds.size;

    console.log(
      `Fase 2.C concluída: ${importedCardIds.size} splitters e ${importedPortIds.size} portas reconciliados; ${stats.rejected} itens rejeitados; ${queuedConnections} conexões enfileiradas para reconciliação de topologia. DML em lote: ${timing.executeManyCalls} executeMany; recursos=${timing.resourceMergeMs}ms; relações=${timing.relationshipMergeMs}ms; commits=${timing.commitMs}ms; leitura — portas=${timing.portsMs}ms, cards=${timing.cardsMs}ms, conexões=${timing.connectionsMs}ms. Nenhuma CDO ISP duplicada foi criada.`,
    );
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
