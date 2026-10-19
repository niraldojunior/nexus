import oracledb from 'oracledb';
import {
  normalizeAdministrativeCity,
  normalizeStateCode,
  type AdministrativeCityTuple,
} from '../../modules/geo/administrative-city.js';
import type { MigrationContext } from './context.js';
import {
  deterministicUuid,
  netwinCableId,
  netwinEquipmentId,
  netwinLocationId,
  netwinRouteId,
  NEXUS_NETWIN_NAMESPACE,
} from './identity.js';
import { parseWktLineString, parseWktPoint } from '../../shared/utils/wkt.js';
import {
  bulkMergeRows,
  resolveAdministrativeCityIds,
  merge,
  netwinOriginCharacteristics,
  resolveLifecycleStatus,
  resolveOspLifecycleState,
  resolveNetwinPlantState,
} from '../netwin-migration-kit.js';
import {
  enqueueNativeRelationships,
  loadNativeCheckpoint,
  saveNativeCheckpoint,
  type NativeRelationship,
} from './checkpoint.js';
import { MigrationProgress } from './progress.js';
import { CANONICAL_RESOURCE_TYPES } from './phase1-resource-specs.js';
import {
  equipmentTypeSpecId,
  pickSpecification,
  resolveEquipmentTypeCode,
  SpecCoverage,
} from './concrete-specs.js';
import {
  buildEquipmentSpecIndex,
  buildExistingTypeIndex,
  canonicalEquipmentSpecId,
  loadEquipmentCatalogRows,
  loadManufacturerResolver,
} from './concrete-spec-sources.js';
import {
  chunksOf,
  hydrateByIds,
  hydrateWktByIds,
  selectResourceIdsByStructuredInfranode,
} from './source-batches.js';
import { createScopedResourcePager } from './scoped-resource-ids.js';
import {
  createEnrichmentCaches,
  enrichEquipmentPage,
  type EnrichmentInput,
} from './equipment-enrichment-page.js';
import type { PhaseStats } from './types.js';

/** Subtipos OSP comprovados; qualquer outro é contabilizado como não mapeado. */
const EQUIPMENT_SPEC_BY_SUBTYPE = new Map<number, string>([
  [517, 'Netwin CDOI'],
  [512, 'Netwin CEO'],
  [504, 'Netwin CEO'],
  [508, 'Netwin Optical Node'],
]);

interface IspEquipmentDetail extends Record<string, unknown> {
  OSP_ID: number;
  ID_BD_TIPO_NE: number | null;
  ID_BD_TIPO_EQUIP: number | null;
  NUM_SERIE: string | null;
  DESIGNACAO_ALTERNATIVA: string | null;
  IDENTIFICACAO: string | null;
}

export type ResourcePhaseRunStats = PhaseStats & { paused: boolean };

export async function runPhase2Resources(ctx: MigrationContext): Promise<ResourcePhaseRunStats> {
  const stats: ResourcePhaseRunStats = {
    loaded: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    errors: 0,
    paused: false,
  };
  console.log('\n=== Fase 2.B: Recursos e Topologia (Equipamentos, Cabos, Lances e Grafo) ===');

  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();

  try {
    // 1. Carrega o mapa de estados de ciclo de vida de NETWIN.NI_CAT_STATE
    console.log('Carregando catálogo de ciclo de vida (NI_CAT_STATE)...');
    const statesResult = await source.execute<{ ID_STATE: number; DESIGNATION: string | null }>(
      `SELECT ID_STATE, DESIGNATION FROM NETWIN.NI_CAT_STATE`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const lifecycleMap = new Map<number, string>();
    for (const s of statesResult.rows ?? []) {
      lifecycleMap.set(s.ID_STATE, s.DESIGNATION ?? '');
    }

    // 1b. Carrega especificações válidas do Nexus e garante fallback de integridade
    const validSpecs = new Set<string>();
    const defaultCableSpecId = deterministicUuid(
      NEXUS_NETWIN_NAMESPACE,
      'RESOURCE_SPEC:DistributionCable',
    );
    const defaultRouteSpecId = deterministicUuid(
      NEXUS_NETWIN_NAMESPACE,
      'RESOURCE_SPEC:Netwin Aerial Span',
    );
    const equipmentCoverage = new SpecCoverage();
    const defaultEqSpecId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'RESOURCE_SPEC:Netwin CDOE');

    if (target) {
      const specResult = await target.execute<{ ID: string }>(
        `SELECT id FROM ${ctx.t('resource_specification')}`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const r of specResult.rows ?? []) {
        validSpecs.add(r.ID);
      }

      if (!validSpecs.has(defaultCableSpecId)) {
        const typeRes = await target.execute<{ ID: string }>(
          `SELECT id FROM ${ctx.t('resource_type')} WHERE code = 'DistributionCable' FETCH FIRST 1 ROWS ONLY`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        const distTypeId = typeRes.rows?.[0]?.ID ?? 'rt-distribution-cable';
        await merge(target, ctx.t, 'resource_specification', ['id'], {
          id: defaultCableSpecId,
          tenant_id: ctx.options.tenantId,
          name: 'Cabo de Distribuição Padrão',
          resource_type_id: distTypeId,
          description: 'Especificação padrão de cabo óptico Netwin',
          characteristics: JSON.stringify(
            netwinOriginCharacteristics('RESOURCE_SPECIFICATION', defaultCableSpecId),
          ),
        });
        await target.execute('COMMIT');
        validSpecs.add(defaultCableSpecId);
      }
    }

    // O mesmo índice semântico da Fase 1 resolve aliases de catálogo da instância para a
    // ResourceSpecification V2 canônica. Recomputá-lo da origem é determinístico e evita
    // depender de characteristics do destino para encontrar aliases.
    const [equipmentCatalogRows, resolveManufacturer] = await Promise.all([
      loadEquipmentCatalogRows(source),
      loadManufacturerResolver(source),
    ]);
    const resourceTypes = await source.execute<{
      ID_BD_TIPO_EQUIPAMENTO: number;
      NOME: string | null;
      SIGLA: string | null;
    }>(
      `SELECT ID_BD_TIPO_EQUIPAMENTO, NOME, SIGLA
         FROM NETWIN.ISP_CAT_TIPO_EQUIPAMENTO`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const targetTypeCodes = new Set<string>();
    if (target) {
      const targetTypes = await target.execute<{ CODE: string }>(
        `SELECT code FROM ${ctx.t('resource_type')} WHERE tenant_id IN (:1, 'default')`,
        [ctx.options.tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const row of targetTypes.rows ?? []) targetTypeCodes.add(row.CODE);
    }
    const existingTypeIndex = buildExistingTypeIndex(
      CANONICAL_RESOURCE_TYPES,
      targetTypeCodes,
    );
    const typeCodeByTipoNe = new Map<number, string>();
    for (const row of resourceTypes.rows ?? []) {
      typeCodeByTipoNe.set(
        row.ID_BD_TIPO_EQUIPAMENTO,
        resolveEquipmentTypeCode(
          row.ID_BD_TIPO_EQUIPAMENTO,
          row.NOME?.trim() || null,
          row.SIGLA?.trim() || null,
          existingTypeIndex,
        ).code,
      );
    }
    const equipmentSpecIndex = buildEquipmentSpecIndex(
      equipmentCatalogRows,
      (row) => typeCodeByTipoNe.get(row.ID_BD_TIPO_NE) ?? `netwin-equipment-${row.ID_BD_TIPO_NE}`,
      resolveManufacturer,
    );

    const batchSize = ctx.options.batchSize;
    const maxRecords = ctx.options.maxRecords ?? Infinity;
    const equipmentProgress = new MigrationProgress({
      label: 'Fase 2.B — Equipamentos',
      unit: 'equipamentos',
      reportEvery: batchSize,
    });
    const routeProgress = new MigrationProgress({
      label: 'Fase 2.B — Lances',
      unit: 'lances',
      reportEvery: batchSize,
    });
    const cableProgress = new MigrationProgress({
      label: 'Fase 2.B — Cabos',
      unit: 'cabos',
      reportEvery: batchSize,
    });

    const exchangeIds: number[] = [];
    if (!ctx.options.scope.bairro && ctx.options.scope.municipio) {
      const muniUpper = ctx.options.scope.municipio.toUpperCase();
      const muniClean = muniUpper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const exchRes = await source.execute<{ ID: number }>(
        `SELECT l.ID
         FROM NETWIN.LOCATION l
         WHERE l.ID IN (
           SELECT ID FROM NETWIN.LOCATION WHERE UPPER(NAME) = :muniClean OR UPPER(NAME) = :muniUpper
           UNION
           SELECT ID_CHILD FROM NETWIN.LOCATION_ASSOC WHERE ID_PARENT IN (
             SELECT ID FROM NETWIN.LOCATION WHERE UPPER(NAME) = :muniClean OR UPPER(NAME) = :muniUpper
           )
         )`,
        { muniClean, muniUpper },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const r of exchRes.rows ?? []) {
        exchangeIds.push(r.ID);
      }
      console.log(
        `[Escopo] ${exchangeIds.length} localidades/estações encontradas para ${ctx.options.scope.municipio}: ${exchangeIds.join(', ')}`,
      );
    } else if (!ctx.options.scope.bairro && ctx.options.scope.uf) {
      const ufUpper = ctx.options.scope.uf.toUpperCase();
      const exchRes = await source.execute<{ ID: number }>(
        `SELECT la2.ID_CHILD as ID
         FROM NETWIN.LOCATION reg
         JOIN NETWIN.LOCATION_ASSOC la1 ON la1.ID_PARENT = reg.ID
         JOIN NETWIN.LOCATION_ASSOC la2 ON la2.ID_PARENT = la1.ID_CHILD
         WHERE reg.NAME = :ufUpper`,
        { ufUpper },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const r of exchRes.rows ?? []) {
        exchangeIds.push(r.ID);
      }
      console.log(`[Escopo] ${exchangeIds.length} localidades encontradas para a UF ${ufUpper}`);
    }

    const hasStructuredExchangeScope = Boolean(
      !ctx.options.scope.bairro && (ctx.options.scope.municipio || ctx.options.scope.uf),
    );
    if (hasStructuredExchangeScope && exchangeIds.length === 0) {
      // Sem \u00e2ncora estruturada, n\u00e3o retomamos o fallback por texto de ADDRESS. Ele era caro,
      // n\u00e3o index\u00e1vel e podia ampliar silenciosamente o recorte. O est\u00e1gio fica vazio at\u00e9 que
      // a hierarquia LOCATION/EXCHANGE seja corrigida ou o escopo seja refinado.
      console.warn(
        `[Escopo] Nenhuma \u00e2ncora EXCHANGE estruturada foi encontrada para ${ctx.options.scope.municipio ?? ctx.options.scope.uf}; equipamentos, lances e cabos n\u00e3o ser\u00e3o ampliados por endere\u00e7o textual.`,
      );
    }

    const emptyStructuredScope = hasStructuredExchangeScope && exchangeIds.length === 0;
    const skipRoutesAndCablesForNeighborhood = Boolean(ctx.options.scope.bairro);
    if (skipRoutesAndCablesForNeighborhood) {
      console.log(
        '[Escopo] Lances e cabos n\u00e3o possuem v\u00ednculo direto comprovado ao DL_INFRANODE; n\u00e3o ser\u00e3o carregados por bairro.',
      );
    }

    const selectFullResourceIds = async (table: string, lastId: number, limit: number) => {
      const result = await source.execute<{ ID: number }>(
        `SELECT ID
         FROM (
           SELECT ID
           FROM ${table}
           WHERE ID > :lastId
           ORDER BY ID
         )
         WHERE ROWNUM <= :batchSize`,
        { lastId, batchSize: limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: limit, prefetchRows: limit },
      );
      return (result.rows ?? []).map((row) => row.ID);
    };

    const ufOnlyScope = Boolean(
      !ctx.options.scope.bairro && !ctx.options.scope.municipio && ctx.options.scope.uf,
    );
    const exchangePager = (table: string) =>
      createScopedResourcePager(source, table, 'EXCHANGE_ID', exchangeIds, {
        eligible: ufOnlyScope,
      });
    const equipmentPager = exchangePager('NETWIN.OSP_EQUIPMENT');
    const routePager = exchangePager('NETWIN.OSP_ROUTE');
    const cablePager = exchangePager('NETWIN.OSP_CABLE');

    const selectEquipmentIds = async (lastId: number, limit: number) => {
      if (ctx.options.scope.bairro) {
        return selectResourceIdsByStructuredInfranode(
          source,
          'NETWIN.OSP_EQUIPMENT',
          'INFRANODE_ID',
          ctx.options.scope,
          lastId,
          limit,
        );
      }
      if (exchangeIds.length > 0) return equipmentPager.next(lastId, limit);
      return emptyStructuredScope
        ? []
        : selectFullResourceIds('NETWIN.OSP_EQUIPMENT', lastId, limit);
    };

    const selectExchangeScopedResourceIds = async (
      table: string,
      lastId: number,
      limit: number,
    ) => {
      if (skipRoutesAndCablesForNeighborhood || emptyStructuredScope) return [];
      if (exchangeIds.length > 0) {
        return (table === 'NETWIN.OSP_ROUTE' ? routePager : cablePager).next(lastId, limit);
      }
      return selectFullResourceIds(table, lastId, limit);
    };

    // =========================================================================
    // 2. MIGRAÇÃO DE EQUIPAMENTOS (NETWIN.OSP_EQUIPMENT)
    // =========================================================================
    console.log('\n--- Migrando Equipamentos Ópticos (OSP_EQUIPMENT) ---');
    const equipmentCheckpoint = await loadNativeCheckpoint(target, ctx, '2B-equipment');
    let lastEqId = equipmentCheckpoint.lastSourceId;
    let eqCount = equipmentCheckpoint.processedCount;
    let equipmentProcessedThisRun = 0;
    let equipmentGeometryFailures = 0;
    if (ctx.options.resume) {
      console.log(`[Resume] Fase 2.B/equipamentos: cursor ${lastEqId}; processados=${eqCount}.`);
    }
    equipmentProgress.start();
    const enrichmentCaches = createEnrichmentCaches();
    let serialConflictCount = 0;
    let projectsResolvedCount = 0;
    let projectsUnresolvedCount = 0;

    for (;;) {
      if (equipmentProcessedThisRun >= maxRecords) break;
      const currentLimit = Math.min(batchSize, maxRecords - equipmentProcessedThisRun);

      const selectionStartedAt = Date.now();
      const equipmentIds = await selectEquipmentIds(lastEqId, currentLimit);
      const scopeSelectionMs = Date.now() - selectionStartedAt;
      if (equipmentIds.length === 0) break;

      const hydrationStartedAt = Date.now();
      const rows = await hydrateByIds<{
        ID: number;
        NAME: string | null;
        CAT_SUBTYPE_ID: number | null;
        INFRANODE_ID: number | null;
        EXCHANGE_ID: number | null;
        CAT_LIFE_CYCLE_STATE_ID: number | null;
        EXTERNAL_CODE: string | null;
        BAIRRO: string | null;
        MUNICIPIO: string | null;
        UF: string | null;
        ISP_CICLO_VIDA: string | number | null;
        ISP_OPERACIONAL: string | null;
      }>(
        source,
        equipmentIds,
        // O estado real do CDO mora no equipamento ISP espelhado (CAT_LIFE_CYCLE_STATE_ID do OSP
        // é nulo). Agrega por equipamento OSP para o espelho não gerar fan-out.
        (inClause) => `SELECT e.ID, e.NAME, e.CAT_SUBTYPE_ID, e.INFRANODE_ID, e.EXCHANGE_ID,
                              e.CAT_LIFE_CYCLE_STATE_ID, e.EXTERNAL_CODE,
                              i.BAIRRO AS BAIRRO, i.BADDR_MUNICIPIO AS MUNICIPIO,
                              i.BADDR_UF_ABRV AS UF,
                              st.CICLO_VIDA AS ISP_CICLO_VIDA, st.OPERACIONAL AS ISP_OPERACIONAL
                         FROM NETWIN.OSP_EQUIPMENT e
                         LEFT JOIN NETWINOI.DL_INFRANODE i ON i.PI_ID = e.INFRANODE_ID
                         LEFT JOIN (
                           SELECT nm.ID_BD_ENTITY_OSP AS OSP_ID,
                                  MIN(ie.ESTADO_CICLO_VIDA) AS CICLO_VIDA,
                                  MIN(ie.ESTADO_OPERACIONAL) AS OPERACIONAL
                             FROM NETWIN.NS_RES_INS_NODE_MIRROR nm
                             JOIN NETWIN.ISP_INS_EQUIPAMENTO ie ON ie.ID_BD_EQUIPAMENTO = nm.ID_BD_ENTITY_ISP
                            WHERE nm.ENTITY_ISP = 'AC_GEN_INS_EQUIPAMENTO'
                              AND nm.ID_BD_ENTITY_OSP IN (${inClause})
                            GROUP BY nm.ID_BD_ENTITY_OSP
                         ) st ON st.OSP_ID = e.ID
                        WHERE e.ID IN (${inClause})`,
      );
      // Dados descritivos do espelho ISP (tipo/modelo, série...) em lote, fora da seleção paginada.
      const ispDetails = await hydrateByIds<IspEquipmentDetail>(
        source,
        equipmentIds,
        (inClause) => `SELECT nm.ID_BD_ENTITY_OSP AS OSP_ID,
                              MIN(ie.ID_BD_TIPO_NE) AS ID_BD_TIPO_NE,
                              MIN(ie.ID_BD_TIPO_EQUIP) AS ID_BD_TIPO_EQUIP,
                              MIN(ie.NUM_SERIE) AS NUM_SERIE,
                              MIN(ie.DESIGNACAO_ALTERNATIVA) AS DESIGNACAO_ALTERNATIVA,
                              MIN(ie.IDENTIFICACAO) AS IDENTIFICACAO
                         FROM NETWIN.NS_RES_INS_NODE_MIRROR nm
                         JOIN NETWIN.ISP_INS_EQUIPAMENTO ie ON ie.ID_BD_EQUIPAMENTO = nm.ID_BD_ENTITY_ISP
                        WHERE nm.ENTITY_ISP = 'AC_GEN_INS_EQUIPAMENTO'
                          AND nm.ID_BD_ENTITY_OSP IN (${inClause})
                        GROUP BY nm.ID_BD_ENTITY_OSP`,
        'OSP_ID',
      );
      const ispDetailByOspId = new Map(ispDetails.map((row) => [row.OSP_ID, row]));
      const { wktById, failedIds } = await hydrateWktByIds(
        source,
        'NETWIN.OSP_EQUIPMENT',
        rows.map((row) => row.ID),
      );
      if (failedIds.length > 0) {
        equipmentGeometryFailures += failedIds.length;
        console.warn(
          `[Geometria] ${failedIds.length} equipamento(s) com geometria corrompida na origem neste lote; migrados sem geometria. Exemplos: ${failedIds.slice(0, 5).join(', ')}.`,
        );
      }
      const hydrationMs = Date.now() - hydrationStartedAt;
      if (rows.length === 0) break;

      const locations: Array<Record<string, unknown>> = [];
      const resources: Array<Record<string, unknown>> = [];
      const addresses: Array<Record<string, unknown>> = [];
      const addressCityTuples = new Map<string, AdministrativeCityTuple>();
      const seenEqIds = new Set<number>();
      const enrichmentInputs: EnrichmentInput[] = [];

      for (const eq of rows) {
        lastEqId = Math.max(lastEqId, eq.ID);
        if (seenEqIds.has(eq.ID)) continue;
        seenEqIds.add(eq.ID);
        const resId = netwinEquipmentId(eq.ID);
        const name = (eq.NAME ?? `Equipamento ${eq.ID}`).slice(0, 255);

        // Geometria
        const eqWkt = wktById.get(eq.ID);
        if (eqWkt) {
          try {
            const point = parseWktPoint(eqWkt);
            locations.push({
              id: resId,
              tenant_id: ctx.options.tenantId,
              geometry_type: 'Point',
              geometry: JSON.stringify(point),
              spatial_ref: 'EPSG:4326',
              reference_point: name,
              characteristics: '[]',
            });
            // Bairro/município/UF do DL_INFRANODE: a cobertura GPON (fase 3.B) agrupa e rotula
            // as CDOs pelo endereço ligado à localização do equipamento.
            const locality = (eq.BAIRRO ?? '').trim();
            const city = (eq.MUNICIPIO ?? '').trim();
            const uf = normalizeStateCode(eq.UF);
            if (locality || city || uf) {
              const addressId = deterministicUuid(
                NEXUS_NETWIN_NAMESPACE,
                `EQUIPMENT:ADDR:${eq.ID}`,
              );
              const cityTuple = normalizeAdministrativeCity({
                country: 'BR',
                stateOrProvince: uf,
                city,
              });
              if (cityTuple) addressCityTuples.set(addressId, cityTuple);
              addresses.push({
                id: addressId,
                tenant_id: ctx.options.tenantId,
                street_name: name,
                locality: locality ? locality.slice(0, 100) : null,
                city: (cityTuple?.cityName ?? city).slice(0, 100) || null,
                state_or_province: uf,
                country: 'BR',
                geographic_location_id: resId,
                characteristics: '[]',
              });
            }
          } catch {
            // Geometria inválida/nula
          }
        }

        const designation =
          eq.CAT_LIFE_CYCLE_STATE_ID !== null
            ? lifecycleMap.get(eq.CAT_LIFE_CYCLE_STATE_ID)
            : undefined;
        const lifecycle = resolveLifecycleStatus(designation);
        const ospState = resolveOspLifecycleState(designation);
        const hasIspState = eq.ISP_CICLO_VIDA !== null || eq.ISP_OPERACIONAL !== null;
        const ispState = hasIspState
          ? resolveNetwinPlantState({
              cicloVida: eq.ISP_CICLO_VIDA,
              operacional: eq.ISP_OPERACIONAL,
            })
          : null;
        const { substatus } = lifecycle;
        const status = ispState?.status ?? ospState.status;

        // Subtipo desconhecido não vira CDOE por omissão: é contabilizado e cai na genérica
        // de CDOE apenas porque o recurso precisa de uma specification; o relatório o expõe.
        const specName = EQUIPMENT_SPEC_BY_SUBTYPE.get(eq.CAT_SUBTYPE_ID ?? -1);
        if (!specName) equipmentCoverage.record('unmapped', eq.CAT_SUBTYPE_ID);
        const genericId = deterministicUuid(
          NEXUS_NETWIN_NAMESPACE,
          `RESOURCE_SPEC:${specName ?? 'Netwin CDOE'}`,
        );
        const genericResolved = target && !validSpecs.has(genericId) ? defaultEqSpecId : genericId;
        const ispDetail = ispDetailByOspId.get(eq.ID);
        // A Fase 1 materializa specs de modelo para todo tipo de equipamento em uso; a spec
        // concreta vale mesmo quando o subtipo OSP não está no mapa (modem, bateria, antena...).
        const concreteId =
          ispDetail?.ID_BD_TIPO_NE && ispDetail.ID_BD_TIPO_EQUIP
            ? canonicalEquipmentSpecId(
                equipmentSpecIndex,
                ispDetail.ID_BD_TIPO_NE,
                ispDetail.ID_BD_TIPO_EQUIP,
              )
            : null;
        // Tipo interno sem modelo (Célula 2G, antena...): a spec "de tipo" vem antes do fallback
        // genérico, para o recurso não ser classificado como CDOE por omissão.
        const typeSpecId = ispDetail?.ID_BD_TIPO_NE
          ? equipmentTypeSpecId(ispDetail.ID_BD_TIPO_NE)
          : null;
        const hasConcrete = concreteId !== null && validSpecs.has(concreteId);
        const finalSpecId =
          !hasConcrete && typeSpecId && validSpecs.has(typeSpecId)
            ? (equipmentCoverage.record('concrete'), typeSpecId)
            : specName || hasConcrete
              ? pickSpecification(concreteId, validSpecs, genericResolved, equipmentCoverage)
              : genericResolved;

        resources.push({
          id: resId,
          tenant_id: ctx.options.tenantId,
          name,
          resource_specification_id: finalSpecId,
          status,
          status_code: ispState?.statusCode ?? ospState.statusCode,
          place_id: resId,
          place_type: 'GeographicLocation',
          // Estação abastecedora (não o INFRANODE, que é o local físico): preenchida pelo
          // enriquecimento a partir da célula / atributo dinâmico.
          serving_site_id: null,
          administrative_state: ispState?.administrative_state ?? ospState.administrative_state,
          operational_state: ispState?.operational_state ?? ospState.operational_state,
          usage_state: ispState?.usage_state ?? 'idle',
          related_party: '[]',
          characteristics: '[]',
          label: null,
          serial_number: null,
          project_id: null,
        });
        enrichmentInputs.push({
          ospId: eq.ID,
          resourceId: resId,
          name,
          baseCharacteristics: [
            ...netwinOriginCharacteristics('OSP_EQUIPMENT', eq.ID),
            ...(substatus ? [{ name: 'substatus', value: substatus, valueType: 'string' }] : []),
          ],
        });
      }

      // Canon: o `place` do recurso é o GeographicSite (o poste/CO onde ele está pendurado),
      // derivado de INFRANODE_ID; sem site migrado, mantém a Location própria do equipamento.
      const siteIdByEquipment = new Map<string, string>();
      for (const eq of rows) {
        if (eq.INFRANODE_ID) {
          siteIdByEquipment.set(netwinEquipmentId(eq.ID), netwinLocationId(eq.INFRANODE_ID));
        }
      }
      const existingSites = new Set<string>();
      if (target) {
        for (const chunk of chunksOf([...new Set(siteIdByEquipment.values())])) {
          const binds: Record<string, string> = {};
          const clause = chunk
            .map((id, i) => {
              binds[`s${i}`] = id;
              return `:s${i}`;
            })
            .join(',');
          const found = await target.execute<{ ID: string }>(
            `SELECT id FROM ${ctx.t('geographic_site')} WHERE id IN (${clause})`,
            binds,
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          for (const row of found.rows ?? []) existingSites.add(row.ID);
        }
      }
      for (const resource of resources) {
        const siteId = siteIdByEquipment.get(String(resource.id));
        if (siteId && (!target || existingSites.has(siteId))) {
          resource.place_id = siteId;
          resource.place_type = 'GeographicSite';
        }
      }

      const enrichmentStartedAt = Date.now();
      const enrichment = await enrichEquipmentPage(
        ctx,
        source,
        target,
        enrichmentInputs,
        enrichmentCaches,
      );
      for (const resource of resources) {
        const enriched = enrichment.rows.get(String(resource.id));
        if (enriched) Object.assign(resource, enriched);
      }
      serialConflictCount += enrichment.stats.serialConflicts;
      projectsResolvedCount += enrichment.stats.projectsResolved;
      projectsUnresolvedCount += enrichment.stats.projectsUnresolved;
      const enrichmentMs = Date.now() - enrichmentStartedAt;

      const nextEqCount = eqCount + equipmentIds.length;
      let locationMergeMs = 0;
      let resourceMergeMs = 0;
      let commitMs = 0;
      if (target) {
        try {
          let startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'geographic_location',
            ['id'],
            [
              'id',
              'tenant_id',
              'geometry_type',
              'geometry',
              'spatial_ref',
              'reference_point',
              'characteristics',
            ],
            locations,
            batchSize,
          );
          // Município vive no Site (issue #339); a master é só garantida para a grafia canônica.
          await resolveAdministrativeCityIds(target, ctx.t, [...addressCityTuples.values()]);
          await bulkMergeRows(
            target,
            ctx.t,
            'geographic_address',
            ['id'],
            [
              'id',
              'tenant_id',
              'street_name',
              'locality',
              'city',
              'state_or_province',
              'country',
              'geographic_location_id',
              'characteristics',
            ],
            addresses,
            batchSize,
          );
          locationMergeMs = Date.now() - startedAt;
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'resource_physical',
            ['id'],
            [
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
              'status_changed_at',
              'administrative_state_changed_at',
              'operational_state_changed_at',
              'usage_state_changed_at',
              'related_party',
              'characteristics',
              'label',
              'serial_number',
              'project_id',
            ],
            resources,
            batchSize,
          );
          resourceMergeMs = Date.now() - startedAt;
          await saveNativeCheckpoint(target, ctx, '2B-equipment', {
            lastSourceId: lastEqId,
            processedCount: nextEqCount,
          });
          startedAt = Date.now();
          await target.execute('COMMIT');
          commitMs = Date.now() - startedAt;
        } catch (error) {
          await target.execute('ROLLBACK');
          throw error;
        }
      }

      eqCount = nextEqCount;
      equipmentProcessedThisRun += equipmentIds.length;
      stats.loaded += resources.length;
      equipmentProgress.advance(equipmentIds.length);
      console.log(
        `[Progresso] Fase 2.B — Equipamentos: cursor ${lastEqId}; selecionados=${equipmentIds.length}; hidratados=${rows.length}; seleção=${scopeSelectionMs}ms (${equipmentPager.strategy()}); hidratação=${hydrationMs}ms; enriquecimento=${enrichmentMs}ms (${Object.entries(
          enrichment.stats.timings,
        )
          .map(([k, v]) => `${k}=${v}`)
          .join(
            ' ',
          )}); localização=${locationMergeMs}ms; recursos=${resourceMergeMs}ms; commit=${commitMs}ms.`,
      );
    }
    equipmentProgress.finish();
    equipmentPager.release();
    console.log(equipmentCoverage.format('equipamentos'));
    console.log(
      `[Enriquecimento] séries em conflito=${serialConflictCount}; projetos resolvidos=${projectsResolvedCount}, mantidos como characteristic=${projectsUnresolvedCount}.`,
    );
    if (enrichmentCaches.unmappedDynamic.size > 0) {
      const top = [...enrichmentCaches.unmappedDynamic.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `${name}=${count}`)
        .join(', ');
      console.log(`[Enriquecimento] atributos dinâmicos fora da allowlist (top 10): ${top}.`);
    }
    if (equipmentGeometryFailures > 0) {
      console.warn(
        `[Geometria] ${equipmentGeometryFailures} equipamento(s) migrados sem geometria por dado corrompido na origem (OSP_EQUIPMENT.GEOM).`,
      );
    }

    // =========================================================================
    // 3. MIGRAÇÃO DE ROTAS / LANCES (NETWIN.OSP_ROUTE)
    // =========================================================================
    console.log('\n--- Migrando Rotas e Lances (OSP_ROUTE) ---');
    const routeCheckpoint = await loadNativeCheckpoint(target, ctx, '2B-route');
    let lastRouteId = routeCheckpoint.lastSourceId;
    let routeCount = routeCheckpoint.processedCount;
    let routesProcessedThisRun = 0;
    let routeGeometryFailures = 0;
    if (ctx.options.resume) {
      console.log(`[Resume] Fase 2.B/lances: cursor ${lastRouteId}; processados=${routeCount}.`);
    }
    routeProgress.start();

    for (;;) {
      if (routesProcessedThisRun >= maxRecords) break;
      const currentLimit = Math.min(batchSize, maxRecords - routesProcessedThisRun);

      const selectionStartedAt = Date.now();
      const routeIds = await selectExchangeScopedResourceIds(
        'NETWIN.OSP_ROUTE',
        lastRouteId,
        currentLimit,
      );
      const scopeSelectionMs = Date.now() - selectionStartedAt;
      if (routeIds.length === 0) break;

      const hydrationStartedAt = Date.now();
      // A geometria fica fora deste SELECT de propósito: `SDO_UTIL.TO_WKTGEOMETRY` sobre o lote
      // inteiro aborta tudo se uma única rota tiver geometria corrompida (ver `hydrateWktByIds`).
      const rows = await hydrateByIds<{
        ID: number;
        NAME: string | null;
        CAT_SUBTYPE_ID: number | null;
        EXCHANGE_ID: number | null;
        CAT_LIFE_CYCLE_STATE_ID: number | null;
      }>(
        source,
        routeIds,
        (inClause) => `SELECT r.ID, r.NAME, r.CAT_SUBTYPE_ID, r.EXCHANGE_ID,
                              r.CAT_LIFE_CYCLE_STATE_ID
                         FROM NETWIN.OSP_ROUTE r
                        WHERE r.ID IN (${inClause})`,
      );
      const { wktById, failedIds } = await hydrateWktByIds(
        source,
        'NETWIN.OSP_ROUTE',
        rows.map((row) => row.ID),
      );
      if (failedIds.length > 0) {
        routeGeometryFailures += failedIds.length;
        console.warn(
          `[Geometria] ${failedIds.length} rota(s) com geometria corrompida na origem neste lote; migradas sem geometria. Exemplos: ${failedIds.slice(0, 5).join(', ')}.`,
        );
      }
      const hydrationMs = Date.now() - hydrationStartedAt;
      if (rows.length === 0) break;

      const locations: Array<Record<string, unknown>> = [];
      const resources: Array<Record<string, unknown>> = [];
      const seenRouteIds = new Set<number>();

      for (const r of rows) {
        lastRouteId = Math.max(lastRouteId, r.ID);
        if (seenRouteIds.has(r.ID)) continue;
        seenRouteIds.add(r.ID);
        const resId = netwinRouteId(r.ID);
        const name = (r.NAME ?? `Lance ${r.ID}`).slice(0, 255);

        const wkt = wktById.get(r.ID);
        if (wkt) {
          try {
            const line = parseWktLineString(wkt);
            locations.push({
              id: resId,
              tenant_id: ctx.options.tenantId,
              geometry_type: 'LineString',
              geometry: JSON.stringify(line),
              spatial_ref: 'EPSG:4326',
              reference_point: name,
              characteristics: '[]',
            });
          } catch {
            // Linha com WKT inválido é ignorada
          }
        }

        const designation =
          r.CAT_LIFE_CYCLE_STATE_ID !== null
            ? lifecycleMap.get(r.CAT_LIFE_CYCLE_STATE_ID)
            : undefined;
        const ospState = resolveOspLifecycleState(designation);
        const status = ospState.status;

        const specId = deterministicUuid(
          NEXUS_NETWIN_NAMESPACE,
          `RESOURCE_SPEC:Netwin Aerial Span`,
        );
        const finalSpecId = target && !validSpecs.has(specId) ? defaultRouteSpecId : specId;

        resources.push({
          id: resId,
          tenant_id: ctx.options.tenantId,
          name,
          resource_specification_id: finalSpecId,
          status,
          place_id: resId,
          place_type: 'GeographicLocation',
          serving_site_id: r.EXCHANGE_ID ? netwinLocationId(r.EXCHANGE_ID) : null,
          status_code: ospState.statusCode,
          administrative_state: ospState.administrative_state,
          operational_state: ospState.operational_state,
          usage_state: ospState.usage_state,
          related_party: JSON.stringify([
            { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
          ]),
          characteristics: JSON.stringify(netwinOriginCharacteristics('OSP_ROUTE', r.ID)),
        });
      }

      const nextRouteCount = routeCount + routeIds.length;
      let locationMergeMs = 0;
      let resourceMergeMs = 0;
      let commitMs = 0;
      if (target) {
        try {
          let startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'geographic_location',
            ['id'],
            [
              'id',
              'tenant_id',
              'geometry_type',
              'geometry',
              'spatial_ref',
              'reference_point',
              'characteristics',
            ],
            locations,
            batchSize,
          );
          locationMergeMs = Date.now() - startedAt;
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'resource_physical',
            ['id'],
            [
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
            ],
            resources,
            batchSize,
          );
          resourceMergeMs = Date.now() - startedAt;
          await saveNativeCheckpoint(target, ctx, '2B-route', {
            lastSourceId: lastRouteId,
            processedCount: nextRouteCount,
          });
          startedAt = Date.now();
          await target.execute('COMMIT');
          commitMs = Date.now() - startedAt;
        } catch (error) {
          await target.execute('ROLLBACK');
          throw error;
        }
      }

      routeCount = nextRouteCount;
      routesProcessedThisRun += routeIds.length;
      stats.loaded += resources.length;
      routeProgress.advance(routeIds.length);
      console.log(
        `[Progresso] Fase 2.B — Lances: cursor ${lastRouteId}; selecionados=${routeIds.length}; hidratados=${rows.length}; seleção=${scopeSelectionMs}ms (${routePager.strategy()}); hidratação=${hydrationMs}ms; localização=${locationMergeMs}ms; recursos=${resourceMergeMs}ms; commit=${commitMs}ms.`,
      );
    }
    routeProgress.finish();
    routePager.release();
    if (routeGeometryFailures > 0) {
      console.warn(
        `[Geometria] ${routeGeometryFailures} rota(s) migradas sem geometria por dado corrompido na origem (OSP_ROUTE.GEOM).`,
      );
    }

    // =========================================================================
    // 4. MIGRAÇÃO DE CABOS E TOPOLOGIA (NETWIN.OSP_CABLE + RELACIONAMENTOS)
    // =========================================================================
    console.log('\n--- Migrando Cabos e Topologia (OSP_CABLE + connectedTo + supportedBy) ---');
    const cableCheckpoint = await loadNativeCheckpoint(target, ctx, '2B-cable');
    let lastCableId = cableCheckpoint.lastSourceId;
    let cableCount = cableCheckpoint.processedCount;
    let cablesProcessedThisRun = 0;
    let cableGeometryFailures = 0;
    if (ctx.options.resume) {
      console.log(`[Resume] Fase 2.B/cabos: cursor ${lastCableId}; processados=${cableCount}.`);
    }
    cableProgress.start();

    for (;;) {
      if (cablesProcessedThisRun >= maxRecords) break;
      const currentLimit = Math.min(batchSize, maxRecords - cablesProcessedThisRun);

      const selectionStartedAt = Date.now();
      const cableIds = await selectExchangeScopedResourceIds(
        'NETWIN.OSP_CABLE',
        lastCableId,
        currentLimit,
      );
      const scopeSelectionMs = Date.now() - selectionStartedAt;
      if (cableIds.length === 0) break;

      const hydrationStartedAt = Date.now();
      const rows = await hydrateByIds<{
        ID: number;
        NAME: string | null;
        EQUIPMENT_ID_A: number | null;
        EQUIPMENT_ID_Z: number | null;
        CAT_MODEL_ID: number | null;
        EXCHANGE_ID: number | null;
        CAT_LIFE_CYCLE_STATE_ID: number | null;
      }>(
        source,
        cableIds,
        (inClause) => `SELECT c.ID, c.NAME, c.EQUIPMENT_ID_A, c.EQUIPMENT_ID_Z, c.CAT_MODEL_ID,
                              c.EXCHANGE_ID, c.CAT_LIFE_CYCLE_STATE_ID
                         FROM NETWIN.OSP_CABLE c
                        WHERE c.ID IN (${inClause})`,
      );
      const { wktById, failedIds } = await hydrateWktByIds(
        source,
        'NETWIN.OSP_CABLE',
        rows.map((row) => row.ID),
      );
      if (failedIds.length > 0) {
        cableGeometryFailures += failedIds.length;
        console.warn(
          `[Geometria] ${failedIds.length} cabo(s) com geometria corrompida na origem neste lote; migrados sem geometria. Exemplos: ${failedIds.slice(0, 5).join(', ')}.`,
        );
      }
      const hydrationMs = Date.now() - hydrationStartedAt;
      if (rows.length === 0) break;

      const locations: Array<Record<string, unknown>> = [];
      const resources: Array<Record<string, unknown>> = [];
      const relationships: NativeRelationship[] = [];
      const seenCableIds = new Set<number>();

      for (const c of rows) {
        lastCableId = Math.max(lastCableId, c.ID);
        if (seenCableIds.has(c.ID)) continue;
        seenCableIds.add(c.ID);

        const cableId = netwinCableId(c.ID);
        const name = (c.NAME ?? `Cabo ${c.ID}`).slice(0, 255);

        const cableWkt = wktById.get(c.ID);
        if (cableWkt) {
          try {
            const line = parseWktLineString(cableWkt);
            locations.push({
              id: cableId,
              tenant_id: ctx.options.tenantId,
              geometry_type: 'LineString',
              geometry: JSON.stringify(line),
              spatial_ref: 'EPSG:4326',
              reference_point: name,
              characteristics: '[]',
            });
          } catch {
            // Linha com WKT inválido é ignorada
          }
        }

        const designation =
          c.CAT_LIFE_CYCLE_STATE_ID !== null
            ? lifecycleMap.get(c.CAT_LIFE_CYCLE_STATE_ID)
            : undefined;
        const ospState = resolveOspLifecycleState(designation);
        const status = ospState.status;

        const specId = c.CAT_MODEL_ID
          ? deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:CABLE_MODEL:${c.CAT_MODEL_ID}`)
          : defaultCableSpecId;
        const finalSpecId = target && !validSpecs.has(specId) ? defaultCableSpecId : specId;

        resources.push({
          id: cableId,
          tenant_id: ctx.options.tenantId,
          name,
          resource_specification_id: finalSpecId,
          status,
          place_id: cableId,
          place_type: 'GeographicLocation',
          serving_site_id: c.EXCHANGE_ID ? netwinLocationId(c.EXCHANGE_ID) : null,
          status_code: ospState.statusCode,
          administrative_state: ospState.administrative_state,
          operational_state: ospState.operational_state,
          usage_state: ospState.usage_state,
          related_party: JSON.stringify([
            { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
          ]),
          characteristics: JSON.stringify(netwinOriginCharacteristics('OSP_CABLE', c.ID)),
        });

        // Relacionamentos connectedTo instantâneos em memória:
        if (c.EQUIPMENT_ID_A) {
          relationships.push({
            resource_from_id: netwinEquipmentId(c.EQUIPMENT_ID_A),
            resource_to_id: cableId,
            relationship_type: 'connectedTo',
          });
        }
        if (c.EQUIPMENT_ID_Z) {
          relationships.push({
            resource_from_id: cableId,
            resource_to_id: netwinEquipmentId(c.EQUIPMENT_ID_Z),
            relationship_type: 'connectedTo',
          });
        }
      }

      // Relacionamentos supportedBy de lances para o lote de cabos:
      const routeLinks: Array<{ CABLE_ID: number; ROUTE_ID: number }> = [];
      for (let i = 0; i < cableIds.length; i += 900) {
        const chunk = cableIds.slice(i, i + 900);
        const binds = chunk.map((_, idx) => `:${idx + 1}`).join(',');
        const linkResult = await source.execute<{ CABLE_ID: number; ROUTE_ID: number }>(
          `SELECT CABLE_ID, ROUTE_ID FROM NETWIN.OSP_CABLE_X_ROUTE WHERE CABLE_ID IN (${binds})`,
          chunk,
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        for (const row of linkResult.rows ?? []) routeLinks.push(row);
      }

      for (const link of routeLinks) {
        relationships.push({
          resource_from_id: netwinCableId(link.CABLE_ID),
          resource_to_id: netwinRouteId(link.ROUTE_ID),
          relationship_type: 'supportedBy',
        });
      }

      const uniqueRelationships = [
        ...new Map(
          relationships.map((relationship) => [
            `${relationship.resource_from_id}:${relationship.resource_to_id}:${relationship.relationship_type}`,
            relationship,
          ]),
        ).values(),
      ];
      const relationshipsFound = relationships.length;
      const nextCableCount = cableCount + cableIds.length;
      let locationMergeMs = 0;
      let resourceMergeMs = 0;
      let relationshipQueueInsertMs = 0;
      let relationshipsEnqueued = 0;
      let commitMs = 0;
      if (target) {
        try {
          let startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'geographic_location',
            ['id'],
            [
              'id',
              'tenant_id',
              'geometry_type',
              'geometry',
              'spatial_ref',
              'reference_point',
              'characteristics',
            ],
            locations,
            batchSize,
          );
          locationMergeMs = Date.now() - startedAt;
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'resource_physical',
            ['id'],
            [
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
            ],
            resources,
            batchSize,
          );
          resourceMergeMs = Date.now() - startedAt;
          startedAt = Date.now();
          relationshipsEnqueued = await enqueueNativeRelationships(
            target,
            ctx,
            uniqueRelationships,
            batchSize,
          );
          relationshipQueueInsertMs = Date.now() - startedAt;
          await saveNativeCheckpoint(target, ctx, '2B-cable', {
            lastSourceId: lastCableId,
            processedCount: nextCableCount,
          });
          startedAt = Date.now();
          await target.execute('COMMIT');
          commitMs = Date.now() - startedAt;
        } catch (error) {
          await target.execute('ROLLBACK');
          throw error;
        }
      }

      cableCount = nextCableCount;
      cablesProcessedThisRun += cableIds.length;
      stats.loaded += resources.length;
      cableProgress.advance(cableIds.length);
      console.log(
        `[Progresso] Fase 2.B — Cabos: cursor ${lastCableId}; selecionados=${cableIds.length}; hidratados=${rows.length}; vínculosEncontrados=${relationshipsFound}; relaçõesDeduplicadas=${uniqueRelationships.length}; relaçõesEnfileiradas=${relationshipsEnqueued}; seleção=${scopeSelectionMs}ms (${cablePager.strategy()}); hidratação=${hydrationMs}ms; localização=${locationMergeMs}ms; recursos=${resourceMergeMs}ms; relationshipQueueInsertMs=${relationshipQueueInsertMs}ms; commit=${commitMs}ms.`,
      );
    }
    cableProgress.finish();
    cablePager.release();
    if (cableGeometryFailures > 0) {
      console.warn(
        `[Geometria] ${cableGeometryFailures} cabo(s) migrados sem geometria por dado corrompido na origem (OSP_CABLE.GEOM).`,
      );
    }

    stats.paused = Boolean(
      ctx.options.maxRecords &&
      (equipmentProcessedThisRun >= ctx.options.maxRecords ||
        routesProcessedThisRun >= ctx.options.maxRecords ||
        cablesProcessedThisRun >= ctx.options.maxRecords),
    );
    console.log(
      stats.paused
        ? `Fase 2.B pausada após o limite de ${ctx.options.maxRecords} registros por subcarga.`
        : `Fase 2.B concluída: ${stats.loaded} recursos e amarrações topológicas carregados.`,
    );
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
