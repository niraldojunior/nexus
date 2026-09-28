import oracledb from 'oracledb';
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
import { bulkMergeRows, resolveLifecycleStatus, merge } from '../netwin-migration-kit.js';
import {
  enqueueNativeRelationships,
  loadNativeCheckpoint,
  saveNativeCheckpoint,
  type NativeRelationship,
} from './checkpoint.js';
import { MigrationProgress } from './progress.js';
import {
  hydrateByIds,
  selectResourceIdsByInfranodes,
  selectResourceIdsByStructuredInfranode,
} from './source-batches.js';
import type { PhaseStats } from './types.js';

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
    const defaultEqSpecId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'RESOURCE_SPEC:Netwin CDOE');

    if (target) {
      const specResult = await target.execute<{ ID: string }>(
        `SELECT id FROM ${ctx.t('tmf_resource_specification')}`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const r of specResult.rows ?? []) {
        validSpecs.add(r.ID);
      }

      if (!validSpecs.has(defaultCableSpecId)) {
        const typeRes = await target.execute<{ ID: string }>(
          `SELECT id FROM ${ctx.t('tmf_resource_type')} WHERE code = 'DistributionCable' FETCH FIRST 1 ROWS ONLY`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        const distTypeId = typeRes.rows?.[0]?.ID ?? 'rt-distribution-cable';
        await merge(target, ctx.t, 'tmf_resource_specification', ['id'], {
          id: defaultCableSpecId,
          tenant_id: ctx.options.tenantId,
          name: 'Cabo de Distribuição Padrão',
          resource_type_id: distTypeId,
          description: 'Especificação padrão de cabo óptico Netwin',
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
          ]),
        });
        await target.execute('COMMIT');
        validSpecs.add(defaultCableSpecId);
      }
    }

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
      if (exchangeIds.length > 0) {
        return selectResourceIdsByInfranodes(
          source,
          'NETWIN.OSP_EQUIPMENT',
          'EXCHANGE_ID',
          exchangeIds,
          lastId,
          limit,
        );
      }
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
        return selectResourceIdsByInfranodes(
          source,
          table,
          'EXCHANGE_ID',
          exchangeIds,
          lastId,
          limit,
        );
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
    if (ctx.options.resume) {
      console.log(`[Resume] Fase 2.B/equipamentos: cursor ${lastEqId}; processados=${eqCount}.`);
    }
    equipmentProgress.start();

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
        WKT: string | null;
      }>(
        source,
        equipmentIds,
        (inClause) => `SELECT e.ID, e.NAME, e.CAT_SUBTYPE_ID, e.INFRANODE_ID, e.EXCHANGE_ID,
                              e.CAT_LIFE_CYCLE_STATE_ID, e.EXTERNAL_CODE,
                              SDO_UTIL.TO_WKTGEOMETRY(e.GEOM) AS WKT
                         FROM NETWIN.OSP_EQUIPMENT e
                        WHERE e.ID IN (${inClause})`,
      );
      const hydrationMs = Date.now() - hydrationStartedAt;
      if (rows.length === 0) break;

      const locations: Array<Record<string, unknown>> = [];
      const resources: Array<Record<string, unknown>> = [];
      const seenEqIds = new Set<number>();

      for (const eq of rows) {
        lastEqId = Math.max(lastEqId, eq.ID);
        if (seenEqIds.has(eq.ID)) continue;
        seenEqIds.add(eq.ID);
        const resId = netwinEquipmentId(eq.ID);
        const name = (eq.NAME ?? `Equipamento ${eq.ID}`).slice(0, 255);

        // Geometria
        if (eq.WKT) {
          try {
            const point = parseWktPoint(eq.WKT);
            locations.push({
              id: resId,
              tenant_id: ctx.options.tenantId,
              geometry_type: 'Point',
              geometry: JSON.stringify(point),
              spatial_ref: 'EPSG:4326',
              reference_point: name,
              characteristics: '[]',
            });
          } catch {
            // Geometria inválida/nula
          }
        }

        const designation =
          eq.CAT_LIFE_CYCLE_STATE_ID !== null
            ? lifecycleMap.get(eq.CAT_LIFE_CYCLE_STATE_ID)
            : undefined;
        const { status, substatus } = resolveLifecycleStatus(designation);

        let specName = 'Netwin CDOE';
        if (eq.CAT_SUBTYPE_ID === 517) {
          specName = 'Netwin CDOI';
        } else if (eq.CAT_SUBTYPE_ID === 512 || eq.CAT_SUBTYPE_ID === 504) {
          specName = 'Netwin CEO';
        } else if (eq.CAT_SUBTYPE_ID === 508) {
          specName = 'Netwin Optical Node';
        }

        const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:${specName}`);
        const finalSpecId = target && !validSpecs.has(specId) ? defaultEqSpecId : specId;

        resources.push({
          id: resId,
          tenant_id: ctx.options.tenantId,
          name,
          resource_specification_id: finalSpecId,
          status,
          place_id: resId,
          place_type: 'GeographicLocation',
          serving_site_id: eq.EXCHANGE_ID ? netwinLocationId(eq.EXCHANGE_ID) : null,
          administrative_state: status === 'terminated' ? 'locked' : 'unlocked',
          operational_state: status === 'active' ? 'enabled' : 'disabled',
          usage_state: 'idle',
          related_party: JSON.stringify([
            { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
          ]),
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'OSP_EQUIPMENT', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(eq.ID), valueType: 'string' },
            ...(substatus ? [{ name: 'substatus', value: substatus, valueType: 'string' }] : []),
          ]),
        });
      }

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
            'tmf_geographic_location',
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
            'tmf_physical_resource',
            ['id'],
            [
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
        `[Progresso] Fase 2.B — Equipamentos: cursor ${lastEqId}; selecionados=${equipmentIds.length}; hidratados=${rows.length}; seleção=${scopeSelectionMs}ms; hidratação=${hydrationMs}ms; localização=${locationMergeMs}ms; recursos=${resourceMergeMs}ms; commit=${commitMs}ms.`,
      );
    }
    equipmentProgress.finish();

    // =========================================================================
    // 3. MIGRAÇÃO DE ROTAS / LANCES (NETWIN.OSP_ROUTE)
    // =========================================================================
    console.log('\n--- Migrando Rotas e Lances (OSP_ROUTE) ---');
    const routeCheckpoint = await loadNativeCheckpoint(target, ctx, '2B-route');
    let lastRouteId = routeCheckpoint.lastSourceId;
    let routeCount = routeCheckpoint.processedCount;
    let routesProcessedThisRun = 0;
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
      const rows = await hydrateByIds<{
        ID: number;
        NAME: string | null;
        CAT_SUBTYPE_ID: number | null;
        EXCHANGE_ID: number | null;
        CAT_LIFE_CYCLE_STATE_ID: number | null;
        WKT: string | null;
      }>(
        source,
        routeIds,
        (inClause) => `SELECT r.ID, r.NAME, r.CAT_SUBTYPE_ID, r.EXCHANGE_ID,
                              r.CAT_LIFE_CYCLE_STATE_ID, SDO_UTIL.TO_WKTGEOMETRY(r.GEOM) AS WKT
                         FROM NETWIN.OSP_ROUTE r
                        WHERE r.ID IN (${inClause})`,
      );
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

        if (r.WKT) {
          try {
            const line = parseWktLineString(r.WKT);
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
        const { status } = resolveLifecycleStatus(designation);

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
          administrative_state: status === 'terminated' ? 'locked' : 'unlocked',
          operational_state: status === 'active' ? 'enabled' : 'disabled',
          usage_state: 'idle',
          related_party: JSON.stringify([
            { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
          ]),
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'OSP_ROUTE', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(r.ID), valueType: 'string' },
          ]),
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
            'tmf_geographic_location',
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
            'tmf_physical_resource',
            ['id'],
            [
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
        `[Progresso] Fase 2.B — Lances: cursor ${lastRouteId}; selecionados=${routeIds.length}; hidratados=${rows.length}; seleção=${scopeSelectionMs}ms; hidratação=${hydrationMs}ms; localização=${locationMergeMs}ms; recursos=${resourceMergeMs}ms; commit=${commitMs}ms.`,
      );
    }
    routeProgress.finish();

    // =========================================================================
    // 4. MIGRAÇÃO DE CABOS E TOPOLOGIA (NETWIN.OSP_CABLE + RELACIONAMENTOS)
    // =========================================================================
    console.log('\n--- Migrando Cabos e Topologia (OSP_CABLE + connectedTo + supportedBy) ---');
    const cableCheckpoint = await loadNativeCheckpoint(target, ctx, '2B-cable');
    let lastCableId = cableCheckpoint.lastSourceId;
    let cableCount = cableCheckpoint.processedCount;
    let cablesProcessedThisRun = 0;
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
        WKT: string | null;
      }>(
        source,
        cableIds,
        (inClause) => `SELECT c.ID, c.NAME, c.EQUIPMENT_ID_A, c.EQUIPMENT_ID_Z, c.CAT_MODEL_ID,
                              c.EXCHANGE_ID, c.CAT_LIFE_CYCLE_STATE_ID,
                              SDO_UTIL.TO_WKTGEOMETRY(c.GEOM) AS WKT
                         FROM NETWIN.OSP_CABLE c
                        WHERE c.ID IN (${inClause})`,
      );
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

        if (c.WKT) {
          try {
            const line = parseWktLineString(c.WKT);
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
        const { status } = resolveLifecycleStatus(designation);

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
          administrative_state: status === 'terminated' ? 'locked' : 'unlocked',
          operational_state: status === 'active' ? 'enabled' : 'disabled',
          usage_state: 'idle',
          related_party: JSON.stringify([
            { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
          ]),
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'OSP_CABLE', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(c.ID), valueType: 'string' },
          ]),
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
        if (linkResult.rows) routeLinks.push(...linkResult.rows);
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
            'tmf_geographic_location',
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
            'tmf_physical_resource',
            ['id'],
            [
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
        `[Progresso] Fase 2.B — Cabos: cursor ${lastCableId}; selecionados=${cableIds.length}; hidratados=${rows.length}; vínculosEncontrados=${relationshipsFound}; relaçõesDeduplicadas=${uniqueRelationships.length}; relaçõesEnfileiradas=${relationshipsEnqueued}; seleção=${scopeSelectionMs}ms; hidratação=${hydrationMs}ms; localização=${locationMergeMs}ms; recursos=${resourceMergeMs}ms; relationshipQueueInsertMs=${relationshipQueueInsertMs}ms; commit=${commitMs}ms.`,
      );
    }
    cableProgress.finish();

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
