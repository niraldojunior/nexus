import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { bulkInsertRows } from './context.js';
import {
  deterministicUuid,
  netwinCableId,
  netwinEquipmentId,
  netwinLocationId,
  netwinRouteId,
  NEXUS_NETWIN_NAMESPACE,
} from './identity.js';
import { parseWktLineString, parseWktPoint } from '../../shared/utils/wkt.js';
import { resolveLifecycleStatus, merge } from '../netwin-migration-kit.js';
import type { PhaseStats } from './types.js';

export async function runPhase2Resources(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
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
    const defaultCableSpecId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'RESOURCE_SPEC:DistributionCable');
    const defaultRouteSpecId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'RESOURCE_SPEC:Netwin Aerial Span');
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

    // Filtros de escopo (Município / UF)
    let eqScopeJoin = '';
    let eqScopeWhere = '';
    let routeScopeJoin = '';
    let routeScopeWhere = '';
    let cableScopeJoin = '';
    let cableScopeWhere = '';
    const scopeBinds: Record<string, string | number> = {};

    const exchangeIds: number[] = [];
    if (ctx.options.scope.municipio) {
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
      console.log(`[Escopo] ${exchangeIds.length} localidades/estações encontradas para ${ctx.options.scope.municipio}: ${exchangeIds.join(', ')}`);
    } else if (ctx.options.scope.uf) {
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

    if (exchangeIds.length > 0) {
      const exchBinds = exchangeIds.map((id, idx) => {
        scopeBinds[`ex${idx}`] = id;
        return `:ex${idx}`;
      }).join(',');

      eqScopeJoin = '';
      eqScopeWhere = `AND e.EXCHANGE_ID IN (${exchBinds})`;

      routeScopeJoin = '';
      routeScopeWhere = `AND r.EXCHANGE_ID IN (${exchBinds})`;

      cableScopeJoin = '';
      cableScopeWhere = `AND c.EXCHANGE_ID IN (${exchBinds})`;
    } else if (ctx.options.scope.municipio) {
      const muniUpper = ctx.options.scope.municipio.toUpperCase();
      const muniClean = muniUpper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      scopeBinds.muniPattern1 = `%${muniUpper}%`;
      scopeBinds.muniPattern2 = `%${muniClean}%`;

      eqScopeJoin = `
        JOIN NETWIN.LOCATION_ADDRESS_ASSOC laa ON laa.ID_LOCATION = COALESCE(e.INFRANODE_ID, e.EXCHANGE_ID)
        JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
      `;
      eqScopeWhere = `AND (UPPER(a.NAME) LIKE :muniPattern1 OR UPPER(a.NAME) LIKE :muniPattern2)`;

      routeScopeJoin = `
        JOIN NETWIN.LOCATION_ADDRESS_ASSOC laa ON laa.ID_LOCATION = COALESCE(r.EXCHANGE_ID, r.INFRANODE_ID_A)
        JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
      `;
      routeScopeWhere = `AND (UPPER(a.NAME) LIKE :muniPattern1 OR UPPER(a.NAME) LIKE :muniPattern2)`;

      cableScopeJoin = `
        JOIN NETWIN.LOCATION_ADDRESS_ASSOC laa ON laa.ID_LOCATION = c.EXCHANGE_ID
        JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
      `;
      cableScopeWhere = `AND (UPPER(a.NAME) LIKE :muniPattern1 OR UPPER(a.NAME) LIKE :muniPattern2)`;
    } else if (ctx.options.scope.uf) {
      scopeBinds.ufPattern = `%- ${ctx.options.scope.uf.toUpperCase()}%`;

      eqScopeJoin = `
        JOIN NETWIN.LOCATION_ADDRESS_ASSOC laa ON laa.ID_LOCATION = COALESCE(e.INFRANODE_ID, e.EXCHANGE_ID)
        JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
      `;
      eqScopeWhere = `AND UPPER(a.NAME) LIKE :ufPattern`;

      routeScopeJoin = `
        JOIN NETWIN.LOCATION_ADDRESS_ASSOC laa ON laa.ID_LOCATION = COALESCE(r.EXCHANGE_ID, r.INFRANODE_ID_A)
        JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
      `;
      routeScopeWhere = `AND UPPER(a.NAME) LIKE :ufPattern`;

      cableScopeJoin = `
        JOIN NETWIN.LOCATION_ADDRESS_ASSOC laa ON laa.ID_LOCATION = c.EXCHANGE_ID
        JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
      `;
      cableScopeWhere = `AND UPPER(a.NAME) LIKE :ufPattern`;
    }

    // =========================================================================
    // 2. MIGRAÇÃO DE EQUIPAMENTOS (NETWIN.OSP_EQUIPMENT)
    // =========================================================================
    console.log('\n--- Migrando Equipamentos Ópticos (OSP_EQUIPMENT) ---');
    let lastEqId = 0;
    let eqCount = 0;

    for (;;) {
      if (eqCount >= maxRecords) break;
      const currentLimit = Math.min(batchSize, maxRecords - eqCount);

      const eqResult = await source.execute<{
        ID: number;
        NAME: string | null;
        CAT_SUBTYPE_ID: number | null;
        INFRANODE_ID: number | null;
        EXCHANGE_ID: number | null;
        CAT_LIFE_CYCLE_STATE_ID: number | null;
        EXTERNAL_CODE: string | null;
        WKT: string | null;
      }>(
        `SELECT e.ID, e.NAME, e.CAT_SUBTYPE_ID, e.INFRANODE_ID, e.EXCHANGE_ID,
                e.CAT_LIFE_CYCLE_STATE_ID, e.EXTERNAL_CODE,
                SDO_UTIL.TO_WKTGEOMETRY(e.GEOM) AS WKT
         FROM (
           SELECT e.* FROM NETWIN.OSP_EQUIPMENT e
           ${eqScopeJoin}
           WHERE e.ID > :lastId
             ${eqScopeWhere}
           ORDER BY e.ID
         ) e
         WHERE ROWNUM <= :batchSize`,
        { ...scopeBinds, lastId: lastEqId, batchSize: currentLimit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: currentLimit },
      );

      const rows = eqResult.rows ?? [];
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

        const designation = eq.CAT_LIFE_CYCLE_STATE_ID !== null ? lifecycleMap.get(eq.CAT_LIFE_CYCLE_STATE_ID) : undefined;
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
          related_party: JSON.stringify([{ id: ctx.options.ownerPartyId, '@referredType': 'Organization' }]),
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'OSP_EQUIPMENT', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(eq.ID), valueType: 'string' },
            ...(substatus ? [{ name: 'substatus', value: substatus, valueType: 'string' }] : []),
          ]),
        });
      }

      if (target) {
        if (locations.length > 0) {
          await bulkInsertRows(
            target,
            ctx.t,
            'tmf_geographic_location',
            ['id', 'tenant_id', 'geometry_type', 'geometry', 'spatial_ref', 'reference_point', 'characteristics'],
            locations,
          );
        }
        await bulkInsertRows(
          target,
          ctx.t,
          'tmf_physical_resource',
          ['id', 'tenant_id', 'name', 'resource_specification_id', 'status', 'place_id', 'place_type', 'serving_site_id', 'administrative_state', 'operational_state', 'usage_state', 'related_party', 'characteristics'],
          resources,
        );
        await target.execute('COMMIT');
      }

      eqCount += rows.length;
      stats.loaded += resources.length;
      console.log(`Lote Equipamentos: +${rows.length} (Total: ${eqCount})`);
    }

    // =========================================================================
    // 3. MIGRAÇÃO DE ROTAS / LANCES (NETWIN.OSP_ROUTE)
    // =========================================================================
    console.log('\n--- Migrando Rotas e Lances (OSP_ROUTE) ---');
    let lastRouteId = 0;
    let routeCount = 0;

    for (;;) {
      if (routeCount >= maxRecords) break;
      const currentLimit = Math.min(batchSize, maxRecords - routeCount);

      const routeResult = await source.execute<{
        ID: number;
        NAME: string | null;
        CAT_SUBTYPE_ID: number | null;
        EXCHANGE_ID: number | null;
        CAT_LIFE_CYCLE_STATE_ID: number | null;
        WKT: string | null;
      }>(
        `SELECT r.ID, r.NAME, r.CAT_SUBTYPE_ID, r.EXCHANGE_ID, r.CAT_LIFE_CYCLE_STATE_ID,
                SDO_UTIL.TO_WKTGEOMETRY(r.GEOM) AS WKT
         FROM (
           SELECT r.* FROM NETWIN.OSP_ROUTE r
           ${routeScopeJoin}
           WHERE r.ID > :lastId
             ${routeScopeWhere}
           ORDER BY r.ID
         ) r
         WHERE ROWNUM <= :batchSize`,
        { ...scopeBinds, lastId: lastRouteId, batchSize: currentLimit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: currentLimit },
      );

      const rows = routeResult.rows ?? [];
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

        const designation = r.CAT_LIFE_CYCLE_STATE_ID !== null ? lifecycleMap.get(r.CAT_LIFE_CYCLE_STATE_ID) : undefined;
        const { status } = resolveLifecycleStatus(designation);

        const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:Netwin Aerial Span`);
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
          related_party: JSON.stringify([{ id: ctx.options.ownerPartyId, '@referredType': 'Organization' }]),
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'OSP_ROUTE', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(r.ID), valueType: 'string' },
          ]),
        });
      }

      if (target) {
        if (locations.length > 0) {
          await bulkInsertRows(
            target,
            ctx.t,
            'tmf_geographic_location',
            ['id', 'tenant_id', 'geometry_type', 'geometry', 'spatial_ref', 'reference_point', 'characteristics'],
            locations,
          );
        }
        await bulkInsertRows(
          target,
          ctx.t,
          'tmf_physical_resource',
          ['id', 'tenant_id', 'name', 'resource_specification_id', 'status', 'place_id', 'place_type', 'serving_site_id', 'administrative_state', 'operational_state', 'usage_state', 'related_party', 'characteristics'],
          resources,
        );
        await target.execute('COMMIT');
      }

      routeCount += rows.length;
      stats.loaded += resources.length;
      console.log(`Lote Lances: +${rows.length} (Total: ${routeCount})`);
    }

    // =========================================================================
    // 4. MIGRAÇÃO DE CABOS E TOPOLOGIA (NETWIN.OSP_CABLE + RELACIONAMENTOS)
    // =========================================================================
    console.log('\n--- Migrando Cabos e Topologia (OSP_CABLE + connectedTo + supportedBy) ---');
    let lastCableId = 0;
    let cableCount = 0;

    for (;;) {
      if (cableCount >= maxRecords) break;
      const currentLimit = Math.min(batchSize, maxRecords - cableCount);

      const cableResult = await source.execute<{
        ID: number;
        NAME: string | null;
        EQUIPMENT_ID_A: number | null;
        EQUIPMENT_ID_Z: number | null;
        CAT_MODEL_ID: number | null;
        EXCHANGE_ID: number | null;
        CAT_LIFE_CYCLE_STATE_ID: number | null;
        WKT: string | null;
      }>(
        `SELECT c.ID, c.NAME, c.EQUIPMENT_ID_A, c.EQUIPMENT_ID_Z, c.CAT_MODEL_ID, c.EXCHANGE_ID,
                c.CAT_LIFE_CYCLE_STATE_ID, SDO_UTIL.TO_WKTGEOMETRY(c.GEOM) AS WKT
         FROM (
           SELECT c.* FROM NETWIN.OSP_CABLE c
           ${cableScopeJoin}
           WHERE c.ID > :lastId
             ${cableScopeWhere}
           ORDER BY c.ID
         ) c
         WHERE ROWNUM <= :batchSize`,
        { ...scopeBinds, lastId: lastCableId, batchSize: currentLimit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: currentLimit },
      );

      const rows = cableResult.rows ?? [];
      if (rows.length === 0) break;

      const locations: Array<Record<string, unknown>> = [];
      const resources: Array<Record<string, unknown>> = [];
      const relationships: Array<Record<string, unknown>> = [];
      const cableIds: number[] = [];
      const seenCableIds = new Set<number>();

      for (const c of rows) {
        lastCableId = Math.max(lastCableId, c.ID);
        if (seenCableIds.has(c.ID)) continue;
        seenCableIds.add(c.ID);
        cableIds.push(c.ID);

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

        const designation = c.CAT_LIFE_CYCLE_STATE_ID !== null ? lifecycleMap.get(c.CAT_LIFE_CYCLE_STATE_ID) : undefined;
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
          related_party: JSON.stringify([{ id: ctx.options.ownerPartyId, '@referredType': 'Organization' }]),
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

      if (target) {
        if (locations.length > 0) {
          await bulkInsertRows(
            target,
            ctx.t,
            'tmf_geographic_location',
            ['id', 'tenant_id', 'geometry_type', 'geometry', 'spatial_ref', 'reference_point', 'characteristics'],
            locations,
          );
        }
        await bulkInsertRows(
          target,
          ctx.t,
          'tmf_physical_resource',
          ['id', 'tenant_id', 'name', 'resource_specification_id', 'status', 'place_id', 'place_type', 'serving_site_id', 'administrative_state', 'operational_state', 'usage_state', 'related_party', 'characteristics'],
          resources,
        );
        if (relationships.length > 0) {
          await bulkInsertRows(
            target,
            ctx.t,
            'tmf_resource_relationship',
            ['resource_from_id', 'resource_to_id', 'relationship_type'],
            relationships,
            1000,
            [1, 2291],
          );
        }
        await target.execute('COMMIT');
      }

      cableCount += rows.length;
      stats.loaded += resources.length;
      console.log(`Lote Cabos: +${rows.length} (Total: ${cableCount}, Relacionamentos: +${relationships.length})`);
    }

    console.log(`Fase 2.B concluída: ${stats.loaded} recursos e amarrações topológicas carregados.`);
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
