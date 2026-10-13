import oracledb, { type Connection } from 'oracledb';
import { assertReadOnlySourceSql } from './context.js';
import {
  dynamicAttributeTarget,
  dynamicLookupKey,
  DYNAMIC_LOOKUP_ATTRIBUTES,
} from './equipment-enrichment.js';
import { chunksOf, hydrateByIds, namedInBinds } from './source-batches.js';

/**
 * Hidratação read-only do enriquecimento de equipamentos (issue #332).
 *
 * Cada família é uma consulta independente, chunkada em até 900 binds, indexada em memória. Nada
 * entra no SELECT paginado da Fase 2.B (sem JOIN 1:N) e nenhuma consulta roda por equipamento.
 * Todo SQL passa por `assertReadOnlySourceSql`; a conexão ainda é protegida por proxy.
 */

export interface EquipmentOspExtra extends Record<string, unknown> {
  ID: number;
  LABEL: string | null;
  DESCRIPTION: string | null;
  OWNER_ID: number | null;
}

export interface EquipmentIspExtra extends Record<string, unknown> {
  OSP_ID: number;
  ISP_ID: number;
  ISP_COUNT: number;
  ID_BD_TIPO_EQUIP: number | null;
  NUM_SERIE: string | null;
  NUM_SAP: string | null;
  DESIGNACAO: string | null;
  DESIGNACAO_ALTERNATIVA: string | null;
  IDENTIFICACAO: string | null;
  OBSERVACOES: string | null;
  PROJECT_STATE: string | null;
  ID_BD_PROJECTO: number | null;
  DATA_ESTADO_CICLO_VIDA: Date | string | null;
  DATA_ESTADO_OPERACIONAL: Date | string | null;
  DATA_ESTADO_PROVISAO: Date | string | null;
}

export interface EquipmentSourceExtras {
  osp: Map<number, EquipmentOspExtra>;
  isp: Map<number, EquipmentIspExtra>;
  /** OSP_ID → (nome da characteristic → valor bruto), já filtrado pela allowlist. */
  dynamic: Map<number, Map<string, unknown>>;
  /** OSP_ID → célula (ID) e estação abastecedora (ID de LOCATION) informadas pelo dinâmico. */
  cellId: Map<number, number>;
  supplierStationId: Map<number, number>;
  /** Lookups resolvidos nesta página. */
  modelSap: Map<number, string | null>;
  projectName: Map<number, string>;
  cell: Map<number, { name: string | null; supplierLocationId: number | null }>;
  anomalies: {
    multipleIspPerOsp: number;
    duplicateDynamicValues: number;
    unmappedDynamic: Map<string, number>;
  };
  timings: Record<string, number>;
}

const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;

async function run<T>(
  source: Connection,
  sql: string,
  binds: Record<string, number>,
  size: number,
): Promise<T[]> {
  assertReadOnlySourceSql(sql);
  const result = await source.execute<T>(sql, binds, { ...OBJECT, fetchArraySize: size });
  return result.rows ?? [];
}

async function byChunks<T>(
  source: Connection,
  ids: readonly number[],
  query: (inClause: string) => string,
): Promise<T[]> {
  const rows: T[] = [];
  for (const chunk of chunksOf([...new Set(ids)])) {
    const { clause, binds } = namedInBinds(chunk, 'id');
    for (const row of await run<T>(source, query(clause), binds, chunk.length)) rows.push(row);
  }
  return rows;
}

const positiveNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function hydrateEquipmentExtras(
  source: Connection,
  ospIds: readonly number[],
  modelSapCache: Map<number, string | null>,
  projectCache: Map<number, string>,
  cellCache: Map<number, { name: string | null; supplierLocationId: number | null }>,
): Promise<EquipmentSourceExtras> {
  const timings: Record<string, number> = {};
  const time = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      timings[key] = Date.now() - startedAt;
    }
  };

  const ospRows = await time('osp', () =>
    hydrateByIds<EquipmentOspExtra>(source, ospIds, (inClause) => {
      const sql = `SELECT e.ID, e.LABEL, e.DESCRIPTION, e.OWNER_ID
                       FROM NETWIN.OSP_EQUIPMENT e
                      WHERE e.ID IN (${inClause})`;
      assertReadOnlySourceSql(sql);
      return sql;
    }),
  );

  const ispRows = await time('isp', () =>
    hydrateByIds<EquipmentIspExtra>(
      source,
      ospIds,
      (inClause) => {
        const sql = `SELECT nm.ID_BD_ENTITY_OSP AS OSP_ID,
                            MIN(ie.ID_BD_EQUIPAMENTO) AS ISP_ID,
                            COUNT(*) AS ISP_COUNT,
                            MIN(ie.ID_BD_TIPO_EQUIP) AS ID_BD_TIPO_EQUIP,
                            MIN(ie.NUM_SERIE) AS NUM_SERIE,
                            MIN(ie.NUM_SAP) AS NUM_SAP,
                            MIN(ie.DESIGNACAO) AS DESIGNACAO,
                            MIN(ie.DESIGNACAO_ALTERNATIVA) AS DESIGNACAO_ALTERNATIVA,
                            MIN(ie.IDENTIFICACAO) AS IDENTIFICACAO,
                            MIN(ie.OBSERVACOES) AS OBSERVACOES,
                            MIN(ie.PROJECT_STATE) AS PROJECT_STATE,
                            MIN(ie.ID_BD_PROJECTO) AS ID_BD_PROJECTO,
                            MIN(ie.DATA_ESTADO_CICLO_VIDA) AS DATA_ESTADO_CICLO_VIDA,
                            MIN(ie.DATA_ESTADO_OPERACIONAL) AS DATA_ESTADO_OPERACIONAL,
                            MIN(ie.DATA_ESTADO_PROVISAO) AS DATA_ESTADO_PROVISAO
                       FROM NETWIN.NS_RES_INS_NODE_MIRROR nm
                       JOIN NETWIN.ISP_INS_EQUIPAMENTO ie ON ie.ID_BD_EQUIPAMENTO = nm.ID_BD_ENTITY_ISP
                      WHERE nm.ENTITY_ISP = 'AC_GEN_INS_EQUIPAMENTO'
                        AND nm.ID_BD_ENTITY_OSP IN (${inClause})
                      GROUP BY nm.ID_BD_ENTITY_OSP`;
        assertReadOnlySourceSql(sql);
        return sql;
      },
      'OSP_ID',
    ),
  );
  const osp = new Map(ospRows.map((row) => [row.ID, row]));
  const isp = new Map(ispRows.map((row) => [row.OSP_ID, row]));

  // Valores dinâmicos: chave é o equipamento ISP; várias linhas por equipamento (uma por atributo).
  const ospByIsp = new Map<number, number>();
  for (const row of ispRows) ospByIsp.set(row.ISP_ID, row.OSP_ID);
  const anomalies: EquipmentSourceExtras['anomalies'] = {
    multipleIspPerOsp: ispRows.filter((row) => Number(row.ISP_COUNT) > 1).length,
    duplicateDynamicValues: 0,
    unmappedDynamic: new Map(),
  };
  const dynamic = new Map<number, Map<string, unknown>>();
  const cellId = new Map<number, number>();
  const supplierStationId = new Map<number, number>();

  await time('dynamic', async () => {
    const rows = await byChunks<{ ISP_ID: number; ATTR: string; VALOR: unknown }>(
      source,
      [...ospByIsp.keys()],
      (inClause) => `SELECT v.ID_BD_EQUIPAMENTO AS ISP_ID,
                            d.NOME_ATRIBUTO AS ATTR,
                            v.VALOR_ATRIBUTO AS VALOR
                       FROM NETWIN.ISP_INS_DIN_ATRIBUTO v
                       JOIN NETWIN.ISP_CAT_DIN_ATRIBUTO d ON d.ID_BD_DEF_ATRIBUTO = v.ID_BD_DEF_ATRIBUTO
                      WHERE v.ID_BD_EQUIPAMENTO IN (${inClause})`,
    );
    for (const row of rows) {
      const ospId = ospByIsp.get(row.ISP_ID);
      if (ospId === undefined || row.VALOR === null || row.VALOR === undefined) continue;
      const key = dynamicLookupKey(row.ATTR);
      if (key === DYNAMIC_LOOKUP_ATTRIBUTES.cell) {
        const id = positiveNumber(row.VALOR);
        if (id) cellId.set(ospId, id);
        continue;
      }
      if (key === DYNAMIC_LOOKUP_ATTRIBUTES.supplierStation) {
        const id = positiveNumber(row.VALOR);
        if (id) supplierStationId.set(ospId, id);
        continue;
      }
      const target = dynamicAttributeTarget(row.ATTR);
      if (!target) {
        anomalies.unmappedDynamic.set(
          String(row.ATTR),
          (anomalies.unmappedDynamic.get(String(row.ATTR)) ?? 0) + 1,
        );
        continue;
      }
      const values = dynamic.get(ospId) ?? new Map<string, unknown>();
      // Desempate determinístico: o primeiro valor lido vence; duplicata é só contabilizada.
      if (values.has(target)) anomalies.duplicateDynamicValues++;
      else values.set(target, row.VALOR);
      dynamic.set(ospId, values);
    }
  });

  // Lookups ainda ausentes dos caches da execução.
  await time('lookups', async () => {
    const missingModels = [
      ...new Set(
        ispRows
          .map((row) => row.ID_BD_TIPO_EQUIP)
          .filter((id): id is number => id !== null && !modelSapCache.has(id)),
      ),
    ];
    for (const row of await byChunks<{ ID: number; SAP: string | null }>(
      source,
      missingModels,
      (inClause) => `SELECT ID_BD_TIPO_EQUIP AS ID, COD_MATERIAL_SAP AS SAP
                       FROM NETWIN.ISP_CAT_MODELO_EQUIP
                      WHERE ID_BD_TIPO_EQUIP IN (${inClause})`,
    )) {
      modelSapCache.set(row.ID, row.SAP);
    }
    for (const id of missingModels) if (!modelSapCache.has(id)) modelSapCache.set(id, null);

    const missingProjects = [
      ...new Set(
        ispRows
          .map((row) => row.ID_BD_PROJECTO)
          .filter((id): id is number => id !== null && !projectCache.has(id)),
      ),
    ];
    for (const row of await byChunks<{ ID: number; NAME: string | null }>(
      source,
      missingProjects,
      (inClause) => `SELECT ID, NAME FROM NETWIN.PROJECT WHERE ID IN (${inClause})`,
    )) {
      if (row.NAME) projectCache.set(row.ID, row.NAME);
    }

    const missingCells = [...new Set(cellId.values())].filter((id) => !cellCache.has(id));
    for (const row of await byChunks<{
      ID: number;
      NAME: string | null;
      SUPPLIER_LOCATION_ID: number | null;
    }>(
      source,
      missingCells,
      (inClause) => `SELECT ID, NAME, SUPPLIER_LOCATION_ID
                       FROM NETWIN.OSP_CELL
                      WHERE ID IN (${inClause})`,
    )) {
      cellCache.set(row.ID, { name: row.NAME, supplierLocationId: row.SUPPLIER_LOCATION_ID });
    }
    for (const id of missingCells) {
      if (!cellCache.has(id)) cellCache.set(id, { name: null, supplierLocationId: null });
    }
  });

  return {
    osp,
    isp,
    dynamic,
    cellId,
    supplierStationId,
    modelSap: modelSapCache,
    projectName: projectCache,
    cell: cellCache,
    anomalies,
    timings,
  };
}

/** Projetos do tenant por nome normalizado; nome com mais de um candidato fica ambíguo (null). */
export async function resolveGeoProjectIds(
  target: Connection,
  table: string,
  tenantId: string,
  names: readonly string[],
  normalize: (value: string) => string,
): Promise<Map<string, string | null>> {
  const wanted = new Set(names.map(normalize).filter(Boolean));
  const found = new Map<string, string | null>();
  if (wanted.size === 0) return found;
  const result = await target.execute<{ ID: string; NAME: string }>(
    `SELECT id, name FROM ${table} WHERE tenant_id = :1 AND archived_at IS NULL`,
    [tenantId],
    OBJECT,
  );
  for (const row of result.rows ?? []) {
    const key = normalize(row.NAME);
    if (!wanted.has(key)) continue;
    found.set(key, found.has(key) ? null : row.ID);
  }
  return found;
}
