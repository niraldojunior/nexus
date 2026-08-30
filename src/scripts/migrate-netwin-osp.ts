/**
 * Carga de cabos, lances (rotas) e equipamentos ópticos do Netwin (`NETWIN.OSP_*`) no
 * inventário do Nexus. Irmão de `migrate-netwin-infranode.ts` — reusa o mesmo protocolo de
 * reconciliação por hash e as mesmas tabelas de controle (`netwin-migration-kit.ts`), mas parte
 * de um **equipamento semente** e caminha pela topologia (cabo → equipamento a montante) em vez
 * de varrer a origem por página.
 *
 * Racional da investigação (ver plano da conversa que originou este script):
 *
 *   · As tabelas `NETWINOI.OSP_CABLEX`/`OSP_EQUIPMENTX`/`OSP_ROUTEX` são snapshots defasados —
 *     este script lê sempre `NETWIN.OSP_*` (via sinônimo), nunca as `*X`.
 *   · `GEOM_WGS` é sempre NULL nesta base; `GEOM` já está em SRID 4326 — não reprojetar.
 *     `SDO_CS.TRANSFORM` derruba a sessão nesta versão do DR — não usar.
 *   · O grafo de cabos é um DAG, não uma corrente: um equipamento pode ter mais de um cabo a
 *     montante (`EQUIPMENT_ID_Z = atual`). A caminhada usa o de menor `ID` e avisa no log
 *     quando descarta os demais — desempate determinístico, não uma verdade de campo.
 *
 * Modelagem (AGENTS.md C1/C5/C6/C9):
 *
 *   Equipamento óptico (CDOI/CDOE/CEO/CEOS/OPT)   PhysicalResource · Point
 *   Cabo (OSP_CABLE)                              PhysicalResource · LineString · Cable.OutsidePlant
 *   Lance (OSP_ROUTE)                              PhysicalResource · LineString · Infrastructure.CivilWorks
 *
 *   equipamentoA --connectedTo--> cabo --connectedTo--> equipamentoZ   (direção A→Z preservada)
 *   cabo         --supportedBy-->  lance                                (1 por OSP_CABLE_X_ROUTE)
 *
 * Uso:
 *   node dist/src/scripts/migrate-netwin-osp.js --infranode-id 475412            # dry-run
 *   node dist/src/scripts/migrate-netwin-osp.js --infranode-id 475412 --apply
 *   node dist/src/scripts/migrate-netwin-osp.js --equipment-id 52237472 --apply
 *   node dist/src/scripts/migrate-netwin-osp.js --restore <job-id> --apply       # desfaz o clearArea
 */
import { createHash, randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import oracledb, { type Connection } from 'oracledb';
import { lngLatToTile, MAP_TILE_ZOOM, tileSegmentsForLine } from '../modules/geo/map-tile.js';
import { parseWktLineString, parseWktPoint } from '../shared/utils/wkt.js';
import type { GeoJSONGeometry } from '../modules/geo/domain.js';
import {
  configureOracleClient,
  cut,
  ensureCategory,
  ensureControlTables,
  ensureMapEntityIndex,
  ensureResourceType,
  identity,
  identityState,
  makeTablePrefixer,
  merge,
  numberOf,
  oracleConnectDescriptor,
  recordTouches,
  required,
  requiredAny,
  resolveLifecycleStatus,
  resourceSpecId,
  updateIdentityHash,
  type TablePrefixer,
} from './netwin-migration-kit.js';

loadEnv({ override: true });
oracledb.fetchAsString = [oracledb.CLOB];
configureOracleClient();

const MIGRATED_AT = new Date().toISOString();
const MIGRATED_BY = 'migrate-netwin-osp';
const SEED_TAG = 'netwin-osp';

type Args = {
  apply: boolean;
  restoreJobId?: string;
  equipmentId?: number;
  infranodeId?: number;
  cep?: string;
  numero?: string;
  municipioId?: number;
  complementoAbrv: string;
  complementoArg?: string;
  maxHops: number;
  tenantId: string;
  ownerPartyId: string;
};

const args = parseArgs(process.argv.slice(2));
const targetPrefix = process.env.TARGET_ORACLE_OBJECT_PREFIX ?? process.env.ORACLE_OBJECT_PREFIX;
const t: TablePrefixer = makeTablePrefixer(targetPrefix);
const netwinTnsAdmin = process.env.NETWIN_DR_TNS_ADMIN ?? process.env.TNS_ADMIN;

const sourcePool = await oracledb.createPool({
  connectString: oracleConnectDescriptor(required('NETWIN_DR_ORACLE_CONNECT_STRING')),
  user: required('NETWIN_DR_ORACLE_USER'),
  password: required('NETWIN_DR_ORACLE_PASSWORD'),
  ...(netwinTnsAdmin ? { configDir: netwinTnsAdmin } : {}),
  poolMin: 1,
  poolMax: 1,
});
const targetPool = args.apply
  ? await oracledb.createPool({
      connectString: requiredAny('TARGET_ORACLE_CONNECT_STRING', 'ORACLE_CONNECTION_STRING'),
      user: requiredAny('TARGET_ORACLE_USER', 'ORACLE_USER'),
      password: requiredAny('TARGET_ORACLE_PASSWORD', 'ORACLE_PASSWORD'),
      poolMin: 1,
      poolMax: 1,
    })
  : null;

async function run(): Promise<void> {
  const source = await sourcePool.getConnection();
  const target = targetPool ? await targetPool.getConnection() : null;
  try {
    await source.execute('SET TRANSACTION READ ONLY');

    if (args.restoreJobId) {
      if (!target) throw new Error('--restore exige --apply.');
      await ensureControlTables(target, t);
      await ensureClearedTable(target, t);
      const restored = await restoreArea(target, t, args.restoreJobId, args.tenantId);
      console.log(JSON.stringify({ restoreJobId: args.restoreJobId, mapFeaturesRestored: restored }));
    } else {
      const seedEquipmentId = await resolveSeed(source, args);
      console.log(JSON.stringify({ seedEquipmentId }));

      const { equipmentIds, cableIds, reachedCentral } = await traceUpstream(
        source,
        seedEquipmentId,
        args.maxHops,
      );
      console.log(
        JSON.stringify({
          hops: equipmentIds.length - 1,
          equipamentos: equipmentIds.length,
          cabos: cableIds.length,
          chegouNaCentral: reachedCentral,
        }),
      );
      if (!reachedCentral) {
        console.warn(
          'A caminhada terminou sem chegar numa Central (BUILDING.CENTRAL) — cadeia incompleta na origem.',
        );
      }

      const equipmentRows = await fetchEquipment(source, equipmentIds);
      const cableRows = await fetchCables(source, cableIds);
      const routeRows = await collectRoutes(source, cableIds);
      const modelIds = [...new Set(cableRows.map((c) => c.catModelId).filter((id): id is number => id !== null))];
      const models = await fetchCableModels(source, modelIds);
      const lifecycleIds = [
        ...new Set(
          [...equipmentRows, ...cableRows, ...routeRows]
            .map((n) => n.lifeCycleStateId)
            .filter((id): id is number => id !== null),
        ),
      ];
      const lifecycleStates = await fetchLifecycleStates(source, lifecycleIds);
      warnUnresolvedLifecycleIds(lifecycleIds, lifecycleStates);
      logLifecycleHistogram(
        [...equipmentRows, ...cableRows, ...routeRows].map((n) =>
          n.lifeCycleStateId !== null ? lifecycleStates.get(n.lifeCycleStateId) : undefined,
        ),
      );

      console.log(
        JSON.stringify({
          equipamentosResolvidos: equipmentRows.length,
          cabosResolvidos: cableRows.length,
          lances: routeRows.length,
        }),
      );

      if (!args.apply) {
        console.log('— DRY-RUN. Nada foi gravado no Nexus. Use --apply para executar. —');
        return;
      }
      if (!target) throw new Error('Conexão Oracle de destino indisponível.');

      await ensureControlTables(target, t);
      await ensureMapEntityIndex(target, t, targetPrefix);
      await ensureClearedTable(target, t);
      await ensureCatalogForOsp(target, t);

      const jobId = randomUUID();

      const central = equipmentRows.find((e) => e.piType?.endsWith('.BUILDING.CENTRAL'));
      const servingSiteId = central?.piAbrv
        ? await resolveServingSiteBySigla(target, t, central.piAbrv)
        : null;
      if (central && !servingSiteId) {
        console.warn(
          `Central "${central.piAbrv}" não encontrada como GeographicSite no Nexus — serving_site_id ficará vazio.`,
        );
      }

      const geometries: GeoJSONGeometry[] = [
        ...equipmentRows.map((e) => parseWktPoint(e.wkt)),
        ...cableRows.map((c) => parseWktLineString(c.wkt)),
        ...routeRows.map((r) => parseWktLineString(r.wkt)),
      ];
      const bbox = bboxFromGeometries(geometries, 50);

      const clearScopeSiteId = servingSiteId;
      if (!clearScopeSiteId) {
        console.warn(
          'Sem GeographicSite de escopo — a limpeza da área vai varrer toda a base de recursos do CSV Netwin (pode ser lenta).',
        );
      }
      // Limpeza + gravação são uma única transação: se a gravação falhar, a limpeza também
      // desfaz (nada de recurso do CSV terminado sem a topologia nova para substituí-lo).
      try {
        const cleared = await clearArea(target, t, jobId, args.tenantId, bbox, clearScopeSiteId);
        console.log(JSON.stringify({ jobId, recursosCsvLimpos: cleared }));

        await target.execute(
          `INSERT INTO ${t('netwin_mig_job')} (id,source_scn,mapping_version,last_pi_id,state,loaded_count,rejected_count,deferred_count,created_at,updated_at) VALUES (:1,'CURRENT','osp-cable-route-v1',0,'running',0,0,0,SYSTIMESTAMP,SYSTIMESTAMP)`,
          [jobId],
        );

        const touched: string[] = [];

        // Cadeia incompleta (G9): a caminhada não chegou numa Central, então o próprio
        // equipamento semente carrega o sinal — a aba Esquemático usa isto para avisar em
        // vez de desenhar um caminho que parece completo mas não é.
        const pathIncompleteIds = reachedCentral ? new Set<number>() : new Set([seedEquipmentId]);

        for (const node of equipmentRows) {
          const changed = await persistEquipment(
            target,
            t,
            args,
            node,
            servingSiteId,
            lifecycleStates,
            pathIncompleteIds.has(node.id),
          );
          if (changed) touched.push(String(node.id));
        }
        for (const node of cableRows) {
          const changed = await persistCable(target, t, args, node, models, lifecycleStates);
          if (changed) touched.push(String(node.id));
        }
        for (const node of routeRows) {
          const changed = await persistRoute(target, t, args, node, lifecycleStates);
          if (changed) touched.push(String(node.id));
        }

        for (const cable of cableRows) {
          const equipA = await identity(target, t, 'OSP_EQUIPMENT', String(cable.equipmentA), 'primary', 'PhysicalResource');
          const equipZ = await identity(target, t, 'OSP_EQUIPMENT', String(cable.equipmentZ), 'primary', 'PhysicalResource');
          const cableId = await identity(target, t, 'OSP_CABLE', String(cable.id), 'primary', 'PhysicalResource');
          await ensureRelationship(target, t, equipA, cableId, 'connectedTo');
          await ensureRelationship(target, t, cableId, equipZ, 'connectedTo');
        }
        for (const route of routeRows) {
          const routeId = await identity(target, t, 'OSP_ROUTE', String(route.id), 'primary', 'PhysicalResource');
          for (const cableSourceId of route.cableIds) {
            const cableId = await identity(target, t, 'OSP_CABLE', String(cableSourceId), 'primary', 'PhysicalResource');
            await ensureRelationship(target, t, cableId, routeId, 'supportedBy');
          }
        }

        await recordTouches(target, t, jobId, touched);
        const mapFeatures = await refreshMapFeatures(target, t, args.tenantId, jobId);

        await target.execute(
          `UPDATE ${t('netwin_mig_job')} SET state='loaded', loaded_count=:1, completed_at=SYSTIMESTAMP WHERE id=:2`,
          [equipmentRows.length + cableRows.length + routeRows.length, jobId],
        );
        await target.execute('COMMIT');
        console.log(JSON.stringify({ jobId, state: 'loaded', touched: touched.length, mapFeatures }));
      } catch (error) {
        await target.execute('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await source.close();
    await target?.close();
  }
}

// ------------------------------------------------------------------- seed -----

async function resolveSeed(source: Connection, input: Args): Promise<number> {
  if (input.equipmentId !== undefined) return input.equipmentId;

  let infranodeId = input.infranodeId;
  if (infranodeId === undefined) {
    if (!input.cep || !input.numero || input.municipioId === undefined) {
      throw new Error(
        'Informe --equipment-id, --infranode-id, ou --cep + --numero + --municipio-id.',
      );
    }
    const where = ['MUNICIPIO_ID = :municipioId', 'CEP = :cep', 'NUM_FACHADA = :numero'];
    const binds: Record<string, string | number> = {
      municipioId: input.municipioId,
      cep: input.cep,
      numero: input.numero,
    };
    if (input.complementoArg) {
      where.push('ABR_COMPLEMENTO1 = :complementoAbrv', 'ARGUMENTO1 = :complementoArg');
      binds.complementoAbrv = input.complementoAbrv;
      binds.complementoArg = input.complementoArg;
    }
    const rows = await source.execute<{ PI_ID: number }>(
      `SELECT PI_ID FROM NETWINOI.DL_INFRANODE WHERE ${where.join(' AND ')}`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const found = rows.rows ?? [];
    if (found.length === 0) throw new Error('Nenhum infranode encontrado para o endereço informado.');
    if (found.length > 1) {
      throw new Error(
        `${found.length} infranodes encontrados para o endereço — refine com --complemento-arg. IDs: ${found.map((r) => r.PI_ID).join(', ')}`,
      );
    }
    infranodeId = numberOf(found[0]?.PI_ID) ?? undefined;
    if (infranodeId === undefined) throw new Error('PI_ID inválido na origem.');
  }

  const eq = await source.execute<{ ID: number }>(
    `SELECT ID FROM NETWIN.OSP_EQUIPMENT WHERE INFRANODE_ID=:1 AND CAT_MEDIA_TYPE='CBFO'`,
    [infranodeId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const found = eq.rows ?? [];
  if (found.length === 0) {
    throw new Error(`Nenhum equipamento óptico (CBFO) encontrado no infranode ${infranodeId}.`);
  }
  if (found.length > 1) {
    throw new Error(
      `${found.length} equipamentos encontrados no infranode ${infranodeId} — use --equipment-id. IDs: ${found.map((r) => r.ID).join(', ')}`,
    );
  }
  const equipmentId = numberOf(found[0]?.ID);
  if (equipmentId === null) throw new Error('ID de equipamento inválido na origem.');
  return equipmentId;
}

// ---------------------------------------------------------------- trace -----

type EquipmentNode = {
  id: number;
  name: string;
  catSubtypeId: number;
  infranodeId: number | null;
  lifeCycleStateId: number | null;
  externalCode: string | null;
  wkt: string;
  piType: string | null;
  piAbrv: string | null;
  piDsc: string | null;
};

async function fetchOneEquipment(source: Connection, id: number): Promise<EquipmentNode | null> {
  const rows = await fetchEquipment(source, [id]);
  return rows[0] ?? null;
}

async function fetchEquipment(source: Connection, ids: number[]): Promise<EquipmentNode[]> {
  if (ids.length === 0) return [];
  const binds = ids.map((_, i) => `:${i + 1}`).join(',');
  const rows = await source.execute<Record<string, unknown>>(
    `SELECT e.ID, e.NAME, e.CAT_SUBTYPE_ID, e.INFRANODE_ID, e.CAT_LIFE_CYCLE_STATE_ID,
            e.EXTERNAL_CODE, SDO_UTIL.TO_WKTGEOMETRY(e.GEOM) AS WKT,
            i.PI_TYPE, i.PI_ABRV, i.PI_DSC
       FROM NETWIN.OSP_EQUIPMENT e
       LEFT JOIN NETWINOI.DL_INFRANODE i ON i.PI_ID = e.INFRANODE_ID
      WHERE e.ID IN (${binds})`,
    ids,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (rows.rows ?? []).map((r) => ({
    id: numberOf(r.ID) ?? 0,
    name: String(r.NAME ?? ''),
    catSubtypeId: numberOf(r.CAT_SUBTYPE_ID) ?? 0,
    infranodeId: numberOf(r.INFRANODE_ID),
    lifeCycleStateId: numberOf(r.CAT_LIFE_CYCLE_STATE_ID),
    externalCode: r.EXTERNAL_CODE ? String(r.EXTERNAL_CODE) : null,
    wkt: String(r.WKT ?? ''),
    piType: r.PI_TYPE ? String(r.PI_TYPE) : null,
    piAbrv: r.PI_ABRV ? String(r.PI_ABRV) : null,
    piDsc: r.PI_DSC ? String(r.PI_DSC) : null,
  }));
}

async function traceUpstream(
  source: Connection,
  seedId: number,
  maxHops: number,
): Promise<{ equipmentIds: number[]; cableIds: number[]; reachedCentral: boolean }> {
  const equipmentIds: number[] = [];
  const cableIds: number[] = [];
  const visited = new Set<number>();
  let current = seedId;
  let reachedCentral = false;
  let hops = 0;

  for (;;) {
    if (visited.has(current)) {
      console.warn(`Ciclo detectado em ${current} — interrompendo a caminhada.`);
      break;
    }
    visited.add(current);
    equipmentIds.push(current);

    const node = await fetchOneEquipment(source, current);
    if (!node) throw new Error(`Equipamento ${current} não encontrado em NETWIN.OSP_EQUIPMENT.`);
    if (node.piType?.endsWith('.BUILDING.CENTRAL')) {
      reachedCentral = true;
      break;
    }
    if (hops >= maxHops) {
      throw new Error(`Caminhada excedeu --max-hops (${maxHops}) sem chegar a uma Central.`);
    }

    // Traz o estado junto para o desempate (ver G7): um cabo descartado/projetado não deve
    // sequestrar o caminho só por ter ID menor quando existe candidato ativo no mesmo nó.
    const upstream = await source.execute<{
      ID: number;
      EQUIPMENT_ID_A: number;
      DESIGNATION: string | null;
    }>(
      `SELECT c.ID, c.EQUIPMENT_ID_A, s.DESIGNATION
         FROM NETWIN.OSP_CABLE c
         LEFT JOIN NETWIN.NI_CAT_STATE s ON s.ID_STATE = c.CAT_LIFE_CYCLE_STATE_ID
        WHERE c.EQUIPMENT_ID_Z = :1 ORDER BY c.ID`,
      [current],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const candidates = upstream.rows ?? [];
    if (candidates.length === 0) break; // beco sem saída — equipamento sem cabo a montante

    // Menor ID continua o critério final (desempate determinístico), mas um candidato
    // 'active' vem antes de todos — o cabo suspenso/terminado com ID menor não deve
    // sequestrar o caminho quando existe um cabo em serviço no mesmo nó.
    const ranked = [...candidates].sort((left, right) => {
      const leftActive = resolveLifecycleStatus(left.DESIGNATION ?? undefined).status === 'active';
      const rightActive = resolveLifecycleStatus(right.DESIGNATION ?? undefined).status === 'active';
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      return left.ID - right.ID;
    });
    const chosen = ranked[0];
    if (!chosen) break;
    if (candidates.length > 1) {
      console.warn(
        `Equipamento ${current} tem ${candidates.length} cabos a montante — usando ${chosen.ID}` +
          ` (critério: ativo, depois menor ID); descartados: ${ranked
            .slice(1)
            .map((c) => c.ID)
            .join(', ')}`,
      );
    }
    const nextCableId = numberOf(chosen.ID);
    const nextEquipmentId = numberOf(chosen.EQUIPMENT_ID_A);
    if (nextCableId === null || nextEquipmentId === null) {
      throw new Error('Cabo/equipamento com ID inválido na origem.');
    }
    cableIds.push(nextCableId);
    current = nextEquipmentId;
    hops += 1;
  }

  return { equipmentIds, cableIds, reachedCentral };
}

// ------------------------------------------------------------------ cabos -----

type CableNode = {
  id: number;
  name: string;
  equipmentA: number;
  equipmentZ: number;
  catModelId: number | null;
  userLength: number | null;
  geomLength: number | null;
  lifeCycleStateId: number | null;
  externalCode: string | null;
  wkt: string;
};

async function fetchCables(source: Connection, cableIds: number[]): Promise<CableNode[]> {
  if (cableIds.length === 0) return [];
  const binds = cableIds.map((_, i) => `:${i + 1}`).join(',');
  const rows = await source.execute<Record<string, unknown>>(
    `SELECT ID, NAME, EQUIPMENT_ID_A, EQUIPMENT_ID_Z, CAT_MODEL_ID, USER_LENGTH, GEOM_LENGTH,
            CAT_LIFE_CYCLE_STATE_ID, EXTERNAL_CODE, SDO_UTIL.TO_WKTGEOMETRY(GEOM) AS WKT
       FROM NETWIN.OSP_CABLE WHERE ID IN (${binds})`,
    cableIds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (rows.rows ?? []).map((r) => ({
    id: numberOf(r.ID) ?? 0,
    name: String(r.NAME ?? ''),
    equipmentA: numberOf(r.EQUIPMENT_ID_A) ?? 0,
    equipmentZ: numberOf(r.EQUIPMENT_ID_Z) ?? 0,
    catModelId: numberOf(r.CAT_MODEL_ID),
    userLength: numberOf(r.USER_LENGTH),
    geomLength: numberOf(r.GEOM_LENGTH),
    lifeCycleStateId: numberOf(r.CAT_LIFE_CYCLE_STATE_ID),
    externalCode: r.EXTERNAL_CODE ? String(r.EXTERNAL_CODE) : null,
    wkt: String(r.WKT ?? ''),
  }));
}

type CableModel = { nome: string | null; capacidade: number | null };

async function fetchCableModels(source: Connection, modelIds: number[]): Promise<Map<number, CableModel>> {
  const map = new Map<number, CableModel>();
  if (modelIds.length === 0) return map;
  const binds = modelIds.map((_, i) => `:${i + 1}`).join(',');
  const rows = await source.execute<Record<string, unknown>>(
    `SELECT ID, NOME, CAPACIDADE FROM NETWIN.REC_CAT_CABOS WHERE ID IN (${binds})`,
    modelIds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  for (const r of rows.rows ?? []) {
    const id = numberOf(r.ID);
    if (id === null) continue;
    map.set(id, { nome: r.NOME ? String(r.NOME) : null, capacidade: numberOf(r.CAPACIDADE) });
  }
  return map;
}

// ----------------------------------------------------------------- lances -----

type RouteNode = {
  id: number;
  cableIds: number[];
  catSubtypeId: number;
  name: string;
  userLength: number | null;
  geomLength: number | null;
  lifeCycleStateId: number | null;
  depth: number | null;
  height: number | null;
  width: number | null;
  wkt: string;
};

async function collectRoutes(source: Connection, cableIds: number[]): Promise<RouteNode[]> {
  if (cableIds.length === 0) return [];
  const binds = cableIds.map((_, i) => `:${i + 1}`).join(',');
  const rows = await source.execute<Record<string, unknown>>(
    `SELECT x.CABLE_ID, r.ID AS ROUTE_ID, r.CAT_SUBTYPE_ID, r.NAME, r.USER_LENGTH, r.GEOM_LENGTH,
            r.CAT_LIFE_CYCLE_STATE_ID, r.DEPTH, r.HEIGHT, r.WIDTH, SDO_UTIL.TO_WKTGEOMETRY(r.GEOM) AS WKT
       FROM NETWIN.OSP_CABLE_X_ROUTE x
       JOIN NETWIN.OSP_ROUTE r ON r.ID = x.ROUTE_ID
      WHERE x.CABLE_ID IN (${binds})`,
    cableIds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const byId = new Map<number, RouteNode>();
  for (const row of rows.rows ?? []) {
    const id = numberOf(row.ROUTE_ID);
    const cableId = numberOf(row.CABLE_ID);
    if (id === null || cableId === null) continue;
    const existing = byId.get(id);
    if (existing) {
      if (!existing.cableIds.includes(cableId)) existing.cableIds.push(cableId);
      continue;
    }
    byId.set(id, {
      id,
      cableIds: [cableId],
      catSubtypeId: numberOf(row.CAT_SUBTYPE_ID) ?? 0,
      name: String(row.NAME ?? ''),
      userLength: numberOf(row.USER_LENGTH),
      geomLength: numberOf(row.GEOM_LENGTH),
      lifeCycleStateId: numberOf(row.CAT_LIFE_CYCLE_STATE_ID),
      depth: numberOf(row.DEPTH),
      height: numberOf(row.HEIGHT),
      width: numberOf(row.WIDTH),
      wkt: String(row.WKT ?? ''),
    });
  }
  return [...byId.values()];
}

// ------------------------------------------------------------ ciclo de vida -----

async function fetchLifecycleStates(source: Connection, ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const binds = ids.map((_, i) => `:${i + 1}`).join(',');
  const rows = await source.execute<{ ID_STATE: number; DESIGNATION: string | null }>(
    `SELECT ID_STATE, DESIGNATION FROM NETWIN.NI_CAT_STATE WHERE ID_STATE IN (${binds})`,
    ids,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  for (const r of rows.rows ?? []) {
    const id = numberOf(r.ID_STATE);
    if (id === null) continue;
    map.set(id, String(r.DESIGNATION ?? ''));
  }
  return map;
}

// resolveLifecycleStatus vive em netwin-migration-kit.ts (compartilhado — ver comentário lá
// sobre o gap que suspendia a CDOE-7539 e a cadeia inteira até a estação).

// Avisa (uma vez por carga) quando um CAT_LIFE_CYCLE_STATE_ID referenciado por
// equipamento/cabo/lance não veio no lookup de NI_CAT_STATE — sem isto, um lookup que
// falhasse silenciosamente (escopo errado, ID fora da tabela) suspendia tudo sem deixar
// rastro (ver EQ-MOD gap G3 do plano de correção).
function warnUnresolvedLifecycleIds(requestedIds: number[], resolved: Map<number, string>): void {
  const missing = requestedIds.filter((id) => !resolved.has(id));
  if (missing.length > 0) {
    console.warn(
      `${missing.length} CAT_LIFE_CYCLE_STATE_ID não encontrados em NETWIN.NI_CAT_STATE — ` +
        `os itens que os referenciam cairão em designation vazia (ativo assumido): ${missing.join(', ')}`,
    );
  }
}

// Histograma designation → status resolvido, uma vez por carga: torna visível qualquer
// designation nova que caia no ramo default 'suspended' sem estar no vocabulário mapeado.
function logLifecycleHistogram(designations: Array<string | undefined>): void {
  const counts = new Map<string, { status: string; assumed: boolean; count: number }>();
  for (const designation of designations) {
    const key = designation ?? '(vazio)';
    const resolution = resolveLifecycleStatus(designation);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { status: resolution.status, assumed: resolution.assumed, count: 1 });
  }
  console.log(
    JSON.stringify({
      stage: 'lifecycle-histogram',
      designations: [...counts.entries()].map(([designation, v]) => ({ designation, ...v })),
    }),
  );
}

// ------------------------------------------------------------- classificação -----

const EQUIPMENT_TYPE_BY_SUBTYPE: Record<number, { resourceType: string; specName: string }> = {
  517: { resourceType: 'CTO', specName: 'Netwin CDOI' },
  518: { resourceType: 'CTO', specName: 'Netwin CDOE' },
  512: { resourceType: 'SpliceClosure', specName: 'Netwin CEOS' },
  504: { resourceType: 'SpliceClosure', specName: 'Netwin CEO' },
  508: { resourceType: 'OpticalNode', specName: 'Netwin Optical Node' },
};

function classifyEquipment(catSubtypeId: number): { resourceType: string; specName: string } {
  const hit = EQUIPMENT_TYPE_BY_SUBTYPE[catSubtypeId];
  if (!hit) {
    throw new Error(
      `Subtipo de equipamento não mapeado: CAT_SUBTYPE_ID=${catSubtypeId} — adicione em EQUIPMENT_TYPE_BY_SUBTYPE (migrate-netwin-osp.ts).`,
    );
  }
  return hit;
}

// Faixa de capacidade → resource_type do cabo. É uma HEURÍSTICA assumida (o Netwin não tem esse
// conceito), calibrada para bater com CABLE_STROKE_WEIGHT (web/src/utils/resourceIcon.ts) — ajuste
// aqui se o mapa mostrar backbone fino demais ou drop grosso demais.
const CABLE_CAPACITY_BACKBONE_MIN = 96;
const CABLE_CAPACITY_DISTRIBUTION_MIN = 12;

function classifyCable(capacidade: number | null): string {
  if (capacidade === null) return 'DistributionCable';
  if (capacidade >= CABLE_CAPACITY_BACKBONE_MIN) return 'BackboneCable';
  if (capacidade >= CABLE_CAPACITY_DISTRIBUTION_MIN) return 'DistributionCable';
  return 'DropCable';
}

const ROUTE_TYPE_BY_SUBTYPE: Record<number, string> = {
  202: 'AerialSpan',
  203: 'AerialSpan',
  204: 'AerialSpan',
  1545: 'AerialSpan',
  206: 'Duct',
  208: 'BuriedSpan',
  211: 'InnerSpan',
  212: 'InnerSpan',
  213: 'InnerSpan',
  218: 'InnerSpan',
  209: 'OtherSpan',
  215: 'OtherSpan',
  216: 'OtherSpan',
  1542: 'OtherSpan',
  1543: 'OtherSpan',
};

function classifyRoute(catSubtypeId: number): string {
  return ROUTE_TYPE_BY_SUBTYPE[catSubtypeId] ?? 'OtherSpan';
}

// ---------------------------------------------------------------- catálogo -----

async function ensureCatalogForOsp(target: Connection, t: TablePrefixer): Promise<void> {
  await ensureCategory(target, t, 'Infrastructure.Passive', 'Infraestrutura Passiva');
  await ensureCategory(target, t, 'Cable.OutsidePlant', 'Cabos OSP');
  await ensureCategory(target, t, 'Infrastructure.CivilWorks', 'Infraestrutura Civil');

  for (const [code, name] of [
    ['CTO', 'Caixa de Terminação Óptica'],
    ['SpliceClosure', 'Caixa de emenda'],
    ['OpticalNode', 'Nó óptico'],
  ] as const) {
    await ensureResourceType(target, t, code, name, 'Infrastructure.Passive');
  }
  for (const [code, name] of [
    ['BackboneCable', 'Cabo backbone'],
    ['DistributionCable', 'Cabo de distribuição'],
    ['DropCable', 'Cabo drop'],
  ] as const) {
    await ensureResourceType(target, t, code, name, 'Cable.OutsidePlant');
  }
  for (const [code, name] of [
    ['AerialSpan', 'Lance aéreo'],
    ['Duct', 'Duto'],
    ['BuriedSpan', 'Lance enterrado'],
    ['InnerSpan', 'Lance interno'],
    ['OtherSpan', 'Lance (outro)'],
  ] as const) {
    await ensureResourceType(target, t, code, name, 'Infrastructure.CivilWorks');
  }
}

// ----------------------------------------------------------------- geometria -----

function assertBrazilBounds([lng, lat]: [number, number]): void {
  if (lng < -75 || lng > -32 || lat < -34 || lat > 6) {
    throw new Error(`Coordenada fora do Brasil: [${lng}, ${lat}]`);
  }
}

async function upsertPointLocation(
  target: Connection,
  t: TablePrefixer,
  id: string,
  wkt: string,
  tenantId: string,
  referencePoint: string,
): Promise<void> {
  const point = parseWktPoint(wkt);
  assertBrazilBounds(point.coordinates);
  await merge(target, t, 'tmf_geographic_location', ['id'], {
    id,
    tenant_id: tenantId,
    geometry_type: 'Point',
    geometry: JSON.stringify(point),
    spatial_ref: 'EPSG:4326',
    reference_point: cut(referencePoint, 255),
    characteristics: '[]',
  });
}

async function upsertLineLocation(
  target: Connection,
  t: TablePrefixer,
  id: string,
  wkt: string,
  tenantId: string,
  referencePoint: string,
): Promise<void> {
  const line = parseWktLineString(wkt);
  for (const coordinate of line.coordinates) assertBrazilBounds(coordinate);
  await merge(target, t, 'tmf_geographic_location', ['id'], {
    id,
    tenant_id: tenantId,
    geometry_type: 'LineString',
    geometry: JSON.stringify(line),
    spatial_ref: 'EPSG:4326',
    reference_point: cut(referencePoint, 255),
    characteristics: '[]',
  });
}

// ------------------------------------------------------------------ origem -----

function originCharacteristics(
  sourceEntity: string,
  sourceId: string,
  extra: unknown,
  substatus?: string,
  options?: {
    // Estado de ciclo de vida bruto, para o "Suspenso" ficar auditável (G5): sem isto, um
    // substatus vazio (designation ausente/assumida) deixava o motivo do status inexplicável.
    catLifeCycleStateId?: number | null;
    lifeCycleDesignation?: string | null;
    statusAssumed?: boolean;
    // Cadeia que não chegou numa Central (G9) — só marcado no equipamento semente.
    pathIncomplete?: boolean;
  },
): string {
  return JSON.stringify([
    { name: 'seed', value: SEED_TAG, valueType: 'string' },
    ...(substatus ? [{ name: 'substatus', value: substatus, valueType: 'string' }] : []),
    { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
    { group: '_origin', name: 'id', value: sourceId, valueType: 'string' },
    { group: '_origin', name: 'entity', value: sourceEntity, valueType: 'string' },
    { group: '_origin', name: 'migratedAt', value: MIGRATED_AT, valueType: 'date' },
    { group: '_origin', name: 'migratedBy', value: MIGRATED_BY, valueType: 'string' },
    { group: '_origin', name: 'extra', value: extra, valueType: 'json' },
    ...(options?.catLifeCycleStateId != null
      ? [
          {
            group: '_origin',
            name: 'catLifeCycleStateId',
            value: options.catLifeCycleStateId,
            valueType: 'number',
          },
        ]
      : []),
    ...(options?.lifeCycleDesignation
      ? [
          {
            group: '_origin',
            name: 'lifeCycleDesignation',
            value: options.lifeCycleDesignation,
            valueType: 'string',
          },
        ]
      : []),
    ...(options?.statusAssumed
      ? [{ group: '_migration', name: 'statusAssumed', value: true, valueType: 'boolean' }]
      : []),
    ...(options?.pathIncomplete
      ? [{ group: '_migration', name: 'pathIncomplete', value: true, valueType: 'boolean' }]
      : []),
  ]);
}

// ------------------------------------------------------------------ persist -----

async function persistEquipment(
  target: Connection,
  t: TablePrefixer,
  input: Args,
  node: EquipmentNode,
  servingSiteId: string | null,
  lifecycleStates: Map<number, string>,
  pathIncomplete: boolean,
): Promise<boolean> {
  const sourceId = String(node.id);
  const sourceHash = createHash('sha256').update(JSON.stringify(node)).digest('hex');
  const previous = await identityState(target, t, 'OSP_EQUIPMENT', sourceId, 'primary');
  const nexusId = await identity(target, t, 'OSP_EQUIPMENT', sourceId, 'primary', 'PhysicalResource');
  if (previous?.sourceHash === sourceHash) return false;

  const classified = classifyEquipment(node.catSubtypeId);
  const specId = await resourceSpecId(target, t, classified.specName, classified.resourceType, 'Infrastructure.Passive');
  const designation = node.lifeCycleStateId !== null ? lifecycleStates.get(node.lifeCycleStateId) : undefined;
  const { status, substatus, assumed } = resolveLifecycleStatus(designation);

  await upsertPointLocation(target, t, nexusId, node.wkt, input.tenantId, node.name || `Equipamento ${node.id}`);
  await merge(target, t, 'tmf_physical_resource', ['id'], {
    id: nexusId,
    name: cut(node.name || `Equipamento ${node.id}`, 255),
    resource_specification_id: specId,
    resource_type: classified.resourceType,
    status,
    geographic_location_id: nexusId,
    place_id: nexusId,
    place_type: 'GeographicLocation',
    administrative_state: status === 'terminated' ? 'locked' : 'unlocked',
    operational_state: status === 'active' ? 'enabled' : 'disabled',
    usage_state: 'idle',
    serving_site_id: servingSiteId,
    related_party: JSON.stringify([{ id: input.ownerPartyId, '@referredType': 'Organization' }]),
    characteristics: originCharacteristics(
      'OSP_EQUIPMENT',
      sourceId,
      {
        nome: node.name,
        catSubtypeId: node.catSubtypeId,
        infranodeId: node.infranodeId,
        piType: node.piType,
        piAbrv: node.piAbrv,
        piDsc: node.piDsc,
        externalCode: node.externalCode,
      },
      substatus,
      {
        catLifeCycleStateId: node.lifeCycleStateId,
        lifeCycleDesignation: designation ?? null,
        statusAssumed: assumed,
        pathIncomplete,
      },
    ),
  });
  await updateIdentityHash(target, t, 'OSP_EQUIPMENT', sourceId, 'primary', sourceHash);
  return true;
}

async function persistCable(
  target: Connection,
  t: TablePrefixer,
  input: Args,
  node: CableNode,
  models: Map<number, CableModel>,
  lifecycleStates: Map<number, string>,
): Promise<boolean> {
  const sourceId = String(node.id);
  const sourceHash = createHash('sha256').update(JSON.stringify(node)).digest('hex');
  const previous = await identityState(target, t, 'OSP_CABLE', sourceId, 'primary');
  const nexusId = await identity(target, t, 'OSP_CABLE', sourceId, 'primary', 'PhysicalResource');
  if (previous?.sourceHash === sourceHash) return false;

  const model = node.catModelId !== null ? models.get(node.catModelId) : undefined;
  const resourceType = classifyCable(model?.capacidade ?? null);
  const specName = model?.nome ? `Netwin ${model.nome}` : `Netwin ${resourceType}`;
  const specId = await resourceSpecId(target, t, specName, resourceType, 'Cable.OutsidePlant');
  const designation = node.lifeCycleStateId !== null ? lifecycleStates.get(node.lifeCycleStateId) : undefined;
  const { status, substatus, assumed } = resolveLifecycleStatus(designation);

  await upsertLineLocation(target, t, nexusId, node.wkt, input.tenantId, node.name || `Cabo ${node.id}`);
  await merge(target, t, 'tmf_physical_resource', ['id'], {
    id: nexusId,
    name: cut(node.name || `Cabo ${node.id}`, 255),
    resource_specification_id: specId,
    resource_type: resourceType,
    status,
    geographic_location_id: nexusId,
    place_id: nexusId,
    place_type: 'GeographicLocation',
    administrative_state: status === 'terminated' ? 'locked' : 'unlocked',
    operational_state: status === 'active' ? 'enabled' : 'disabled',
    usage_state: 'active',
    serving_site_id: null,
    related_party: JSON.stringify([{ id: input.ownerPartyId, '@referredType': 'Organization' }]),
    characteristics: originCharacteristics(
      'OSP_CABLE',
      sourceId,
      {
        nome: node.name,
        modelo: model?.nome ?? null,
        capacidadeFibras: model?.capacidade ?? null,
        modeloDesconhecido: node.catModelId !== null && !model,
        comprimentoUsuario: node.userLength,
        comprimentoGeometrico: node.geomLength,
        equipmentIdA: node.equipmentA,
        equipmentIdZ: node.equipmentZ,
        externalCode: node.externalCode,
      },
      substatus,
      {
        catLifeCycleStateId: node.lifeCycleStateId,
        lifeCycleDesignation: designation ?? null,
        statusAssumed: assumed,
      },
    ),
  });
  await updateIdentityHash(target, t, 'OSP_CABLE', sourceId, 'primary', sourceHash);
  return true;
}

async function persistRoute(
  target: Connection,
  t: TablePrefixer,
  input: Args,
  node: RouteNode,
  lifecycleStates: Map<number, string>,
): Promise<boolean> {
  const sourceId = String(node.id);
  const sourceHash = createHash('sha256').update(JSON.stringify(node)).digest('hex');
  const previous = await identityState(target, t, 'OSP_ROUTE', sourceId, 'primary');
  const nexusId = await identity(target, t, 'OSP_ROUTE', sourceId, 'primary', 'PhysicalResource');
  if (previous?.sourceHash === sourceHash) return false;

  const resourceType = classifyRoute(node.catSubtypeId);
  const specId = await resourceSpecId(target, t, `Netwin ${resourceType}`, resourceType, 'Infrastructure.CivilWorks');
  const designation = node.lifeCycleStateId !== null ? lifecycleStates.get(node.lifeCycleStateId) : undefined;
  const { status, substatus, assumed } = resolveLifecycleStatus(designation);

  await upsertLineLocation(target, t, nexusId, node.wkt, input.tenantId, node.name || `Lance ${node.id}`);
  await merge(target, t, 'tmf_physical_resource', ['id'], {
    id: nexusId,
    name: cut(node.name || `Lance ${node.id}`, 255),
    resource_specification_id: specId,
    resource_type: resourceType,
    status,
    geographic_location_id: nexusId,
    place_id: nexusId,
    place_type: 'GeographicLocation',
    administrative_state: status === 'terminated' ? 'locked' : 'unlocked',
    operational_state: status === 'active' ? 'enabled' : 'disabled',
    usage_state: 'active',
    serving_site_id: null,
    related_party: JSON.stringify([{ id: input.ownerPartyId, '@referredType': 'Organization' }]),
    characteristics: originCharacteristics(
      'OSP_ROUTE',
      sourceId,
      {
        nomeOrigem: node.name,
        comprimentoUsuario: node.userLength,
        comprimentoGeometrico: node.geomLength,
        profundidade: node.depth,
        altura: node.height,
        largura: node.width,
      },
      substatus,
      {
        catLifeCycleStateId: node.lifeCycleStateId,
        lifeCycleDesignation: designation ?? null,
        statusAssumed: assumed,
      },
    ),
  });
  await updateIdentityHash(target, t, 'OSP_ROUTE', sourceId, 'primary', sourceHash);
  return true;
}

async function ensureRelationship(
  target: Connection,
  t: TablePrefixer,
  fromId: string,
  toId: string,
  type: string,
): Promise<void> {
  try {
    await target.execute(
      `INSERT INTO ${t('tmf_resource_relationship')} (resource_from_id, resource_to_id, relationship_type) VALUES (:1,:2,:3)`,
      [fromId, toId, type],
    );
  } catch (error) {
    if (!/ORA-00001/.test(String(error))) throw error;
  }
}

// ------------------------------------------------------------- índice de mapa -----

function validLngLat(lng: unknown, lat: unknown): lng is number {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -85 &&
    lat <= 85
  );
}

async function refreshMapFeatures(
  target: Connection,
  t: TablePrefixer,
  tenantId: string,
  jobId: string,
): Promise<number> {
  const touch = t('netwin_mig_touch');
  const identities = t('netwin_mig_identity');
  await target.execute(
    `DELETE FROM ${t('geo_map_feature')} feature
      WHERE feature.tenant_id=:1
        AND EXISTS (
          SELECT 1 FROM ${touch} touch JOIN ${identities} identity
            ON identity.source_entity IN ('OSP_EQUIPMENT','OSP_CABLE','OSP_ROUTE')
           AND identity.source_id=touch.source_id AND identity.target_role='primary'
           WHERE touch.job_id=:2 AND identity.nexus_id=feature.entity_id
        )`,
    [tenantId, jobId],
  );

  const candidates = await target.execute<{
    ID: string;
    RESOURCE_TYPE: string;
    STATUS: string;
    NAME: string;
    GEOMETRY_TYPE: string;
    GEOMETRY: string;
  }>(
    `SELECT r.id AS "ID", r.resource_type AS "RESOURCE_TYPE", r.status AS "STATUS", r.name AS "NAME",
            l.geometry_type AS "GEOMETRY_TYPE", l.geometry AS "GEOMETRY"
       FROM ${touch} touch
       JOIN ${identities} identity ON identity.source_entity IN ('OSP_EQUIPMENT','OSP_CABLE','OSP_ROUTE')
        AND identity.source_id=touch.source_id AND identity.target_role='primary'
       JOIN ${t('tmf_physical_resource')} r ON r.id=identity.nexus_id
       JOIN ${t('tmf_geographic_location')} l ON l.id=r.place_id
      WHERE touch.job_id=:jobId AND r.status <> 'terminated'`,
    { jobId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const rows: unknown[][] = [];
  for (const c of candidates.rows ?? []) {
    try {
      const geometry = JSON.parse(c.GEOMETRY) as GeoJSONGeometry;
      if (c.GEOMETRY_TYPE === 'Point' && geometry.type === 'Point') {
        const [lng, lat] = geometry.coordinates;
        if (!validLngLat(lng, lat)) continue;
        const tile = lngLatToTile(lng, lat, MAP_TILE_ZOOM);
        rows.push([
          tenantId,
          tile.z,
          tile.x,
          tile.y,
          c.ID,
          'point',
          'resource',
          'PhysicalResource',
          c.RESOURCE_TYPE,
          null,
          c.STATUS,
          c.NAME,
          null,
          lng,
          lat,
          null,
          0,
        ]);
      } else if (c.GEOMETRY_TYPE === 'LineString' && geometry.type === 'LineString') {
        const segments = tileSegmentsForLine(geometry, MAP_TILE_ZOOM);
        for (const segment of segments) {
          const anchor = segment.coordinates[Math.floor(segment.coordinates.length / 2)];
          if (!anchor) continue;
          rows.push([
            tenantId,
            segment.tile.z,
            segment.tile.x,
            segment.tile.y,
            c.ID,
            'line',
            'resource',
            'PhysicalResource',
            c.RESOURCE_TYPE,
            null,
            c.STATUS,
            c.NAME,
            null,
            anchor[0],
            anchor[1],
            JSON.stringify({ type: 'LineString', coordinates: segment.coordinates }),
            0,
          ]);
        }
      }
    } catch {
      // Geometria inválida não gera feature; o recurso continua preservado no inventário.
    }
  }

  await upsertMapFeatureRows(target, t, rows);
  return rows.length;
}

// MERGE em vez de INSERT: idempotente por construção — uma reexecução (ou uma reindexação que
// se sobrepõe a features já gravadas por outra rota) nunca esbarra na PK composta
// (tenant_id,tile_z,tile_x,tile_y,entity_id,shape), só atualiza a linha existente.
async function upsertMapFeatureRows(
  target: Connection,
  t: TablePrefixer,
  rows: unknown[][],
): Promise<void> {
  const mergeSql = `MERGE INTO ${t('geo_map_feature')} tgt
    USING (SELECT :1 tenant_id, :2 tile_z, :3 tile_x, :4 tile_y, :5 entity_id, :6 shape,
                  :7 feature_kind, :8 entity_type, :9 type_code, :10 site_category, :11 status,
                  :12 label, :13 sublabel, :14 lng, :15 lat, :16 geometry, :17 rank FROM DUAL) src
    ON (tgt.tenant_id=src.tenant_id AND tgt.tile_z=src.tile_z AND tgt.tile_x=src.tile_x
        AND tgt.tile_y=src.tile_y AND tgt.entity_id=src.entity_id AND tgt.shape=src.shape)
    WHEN MATCHED THEN UPDATE SET
      tgt.feature_kind=src.feature_kind, tgt.entity_type=src.entity_type, tgt.type_code=src.type_code,
      tgt.site_category=src.site_category, tgt.status=src.status, tgt.label=src.label,
      tgt.sublabel=src.sublabel, tgt.lng=src.lng, tgt.lat=src.lat, tgt.geometry=src.geometry,
      tgt.rank=src.rank, tgt.generated_at=SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT
      (tenant_id,tile_z,tile_x,tile_y,entity_id,shape,feature_kind,entity_type,
       type_code,site_category,status,label,sublabel,lng,lat,geometry,rank,generated_at)
      VALUES (src.tenant_id,src.tile_z,src.tile_x,src.tile_y,src.entity_id,src.shape,src.feature_kind,
              src.entity_type,src.type_code,src.site_category,src.status,src.label,src.sublabel,
              src.lng,src.lat,src.geometry,src.rank,SYSTIMESTAMP)`;
  const batchSize = 1000;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    await target.executeMany(mergeSql, rows.slice(offset, offset + batchSize));
  }
}

async function reindexPointFeatures(
  target: Connection,
  t: TablePrefixer,
  tenantId: string,
  ids: string[],
): Promise<number> {
  let total = 0;
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    const binds = chunk.map((_, i) => `:${i + 1}`).join(',');
    const rows = await target.execute<{
      ID: string;
      RESOURCE_TYPE: string;
      STATUS: string;
      NAME: string;
      GEOMETRY: string;
    }>(
      `SELECT r.id AS "ID", r.resource_type AS "RESOURCE_TYPE", r.status AS "STATUS", r.name AS "NAME", l.geometry AS "GEOMETRY"
         FROM ${t('tmf_physical_resource')} r JOIN ${t('tmf_geographic_location')} l ON l.id=r.place_id
        WHERE r.id IN (${binds}) AND r.status <> 'terminated' AND r.resource_type <> 'Splitter'
          AND l.geometry_type='Point'`,
      chunk,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const values: unknown[][] = [];
    for (const c of rows.rows ?? []) {
      try {
        const geometry = JSON.parse(c.GEOMETRY) as GeoJSONGeometry;
        if (geometry.type !== 'Point') continue;
        const [lng, lat] = geometry.coordinates;
        if (!validLngLat(lng, lat)) continue;
        const tile = lngLatToTile(lng, lat, MAP_TILE_ZOOM);
        values.push([
          tenantId,
          tile.z,
          tile.x,
          tile.y,
          c.ID,
          'point',
          'resource',
          'PhysicalResource',
          c.RESOURCE_TYPE,
          null,
          c.STATUS,
          c.NAME,
          null,
          lng,
          lat,
          null,
          0,
        ]);
      } catch {
        // Geometria inválida não gera feature.
      }
    }
    if (values.length) {
      await upsertMapFeatureRows(target, t, values);
      total += values.length;
    }
  }
  return total;
}

// -------------------------------------------------------- limpeza da área -----

type Bbox = { minLng: number; maxLng: number; minLat: number; maxLat: number };

function bboxFromGeometries(geometries: GeoJSONGeometry[], bufferMeters: number): Bbox {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const geometry of geometries) {
    const points: Array<[number, number]> =
      geometry.type === 'Point'
        ? [geometry.coordinates]
        : geometry.type === 'LineString'
          ? geometry.coordinates
          : [];
    for (const [lng, lat] of points) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const degLat = bufferMeters / 111320;
  const degLng = bufferMeters / (111320 * Math.max(0.1, Math.cos(midLatRad)));
  return {
    minLng: minLng - degLng,
    maxLng: maxLng + degLng,
    minLat: minLat - degLat,
    maxLat: maxLat + degLat,
  };
}

async function resolveServingSiteBySigla(
  target: Connection,
  t: TablePrefixer,
  sigla: string,
): Promise<string | null> {
  const rows = await target.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('tmf_geographic_site')} WHERE status <> 'terminated' AND UPPER(name) LIKE '%(' || UPPER(:1) || ')' FETCH FIRST 2 ROWS ONLY`,
    [sigla],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const found = rows.rows ?? [];
  return found.length === 1 ? (found[0]?.ID ?? null) : null;
}

async function ensureClearedTable(target: Connection, t: TablePrefixer): Promise<void> {
  try {
    await target.execute(
      `CREATE TABLE ${t('netwin_mig_cleared')} (job_id VARCHAR2(36 CHAR) NOT NULL, nexus_id VARCHAR2(36 CHAR) NOT NULL, previous_status VARCHAR2(32 CHAR) NOT NULL, previous_administrative_state VARCHAR2(32 CHAR), cleared_at TIMESTAMP(6) WITH TIME ZONE NOT NULL, PRIMARY KEY(job_id, nexus_id))`,
    );
  } catch (error) {
    if (!/ORA-00955/.test(String(error))) throw error;
  }
}

async function clearArea(
  target: Connection,
  t: TablePrefixer,
  jobId: string,
  tenantId: string,
  bbox: Bbox,
  servingSiteId: string | null,
): Promise<number> {
  const scope = servingSiteId ? `AND r.serving_site_id = :servingSiteId` : '';
  const binds: Record<string, string> = servingSiteId ? { servingSiteId } : {};
  const candidates = await target.execute<{
    ID: string;
    STATUS: string;
    ADMINISTRATIVE_STATE: string | null;
    GEOMETRY: string;
  }>(
    `SELECT r.id AS "ID", r.status AS "STATUS", r.administrative_state AS "ADMINISTRATIVE_STATE", l.geometry AS "GEOMETRY"
       FROM ${t('tmf_physical_resource')} r
       JOIN ${t('tmf_geographic_location')} l ON l.id = r.place_id
      WHERE r.characteristics LIKE '%recursos-netwin%' AND r.status <> 'terminated'
        AND l.geometry_type = 'Point' ${scope}`,
    binds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const toClear: Array<{ id: string; status: string; administrativeState: string | null }> = [];
  for (const c of candidates.rows ?? []) {
    try {
      const geometry = JSON.parse(c.GEOMETRY) as GeoJSONGeometry;
      if (geometry.type !== 'Point') continue;
      const [lng, lat] = geometry.coordinates;
      if (lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat) {
        toClear.push({ id: c.ID, status: c.STATUS, administrativeState: c.ADMINISTRATIVE_STATE });
      }
    } catch {
      // Geometria inválida — ignora para a limpeza, o registro permanece como estava.
    }
  }
  if (toClear.length === 0) return 0;

  for (const item of toClear) {
    await target.execute(
      `INSERT INTO ${t('netwin_mig_cleared')} (job_id, nexus_id, previous_status, previous_administrative_state, cleared_at) VALUES (:1,:2,:3,:4,SYSTIMESTAMP)`,
      [jobId, item.id, item.status, item.administrativeState],
    );
    await target.execute(
      `UPDATE ${t('tmf_physical_resource')} SET status='terminated', administrative_state='locked' WHERE id=:1`,
      [item.id],
    );
  }

  const ids = toClear.map((x) => x.id);
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    const binds2 = chunk.map((_, i) => `:${i + 1}`).join(',');
    await target.execute(
      `DELETE FROM ${t('geo_map_feature')} WHERE tenant_id=:${chunk.length + 1} AND entity_id IN (${binds2})`,
      [...chunk, tenantId],
    );
  }

  return toClear.length;
}

async function restoreArea(
  target: Connection,
  t: TablePrefixer,
  jobId: string,
  tenantId: string,
): Promise<number> {
  const rows = await target.execute<{
    NEXUS_ID: string;
    PREVIOUS_STATUS: string;
    PREVIOUS_ADMINISTRATIVE_STATE: string | null;
  }>(
    `SELECT nexus_id AS "NEXUS_ID", previous_status AS "PREVIOUS_STATUS", previous_administrative_state AS "PREVIOUS_ADMINISTRATIVE_STATE" FROM ${t('netwin_mig_cleared')} WHERE job_id=:1`,
    [jobId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const items = rows.rows ?? [];
  if (items.length === 0) {
    console.log('Nada para restaurar neste job.');
    return 0;
  }
  for (const item of items) {
    await target.execute(
      `UPDATE ${t('tmf_physical_resource')} SET status=:1, administrative_state=:2 WHERE id=:3`,
      [item.PREVIOUS_STATUS, item.PREVIOUS_ADMINISTRATIVE_STATE, item.NEXUS_ID],
    );
  }
  await target.execute(`DELETE FROM ${t('netwin_mig_cleared')} WHERE job_id=:1`, [jobId]);
  await target.execute('COMMIT');
  const restored = await reindexPointFeatures(
    target,
    t,
    tenantId,
    items.map((i) => i.NEXUS_ID),
  );
  return restored;
}

// -------------------------------------------------------------------- args -----

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const integer = (flag: string) => {
    const value = get(flag);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${flag} deve ser inteiro.`);
    return parsed;
  };
  const equipmentId = integer('--equipment-id');
  const infranodeId = integer('--infranode-id');
  const municipioId = integer('--municipio-id');
  const maxHops = integer('--max-hops') ?? 40;
  const restoreJobId = get('--restore');
  const cep = get('--cep');
  const numero = get('--numero');
  const complementoArg = get('--complemento-arg');
  return {
    apply: argv.includes('--apply'),
    ...(restoreJobId ? { restoreJobId } : {}),
    ...(equipmentId !== undefined ? { equipmentId } : {}),
    ...(infranodeId !== undefined ? { infranodeId } : {}),
    ...(cep ? { cep } : {}),
    ...(numero ? { numero } : {}),
    ...(municipioId !== undefined ? { municipioId } : {}),
    complementoAbrv: get('--complemento-abrv') ?? 'BL',
    ...(complementoArg ? { complementoArg } : {}),
    maxHops,
    tenantId: get('--tenant-id') ?? 'default',
    ownerPartyId: get('--owner-party-id') ?? 'vtal',
  };
}

try {
  await run();
} finally {
  await sourcePool.close(10);
  await targetPool?.close(10);
}
