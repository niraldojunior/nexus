import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { MigrationContext } from './context.js';
import { MigrationProgress, shouldCommitMigrationBatch } from './progress.js';
import { MAP_DENSITY_ZOOMS, densityFactor } from '../../modules/geo/map-density.js';
import { MAP_TILE_ZOOM, tileForPoint, tileSegmentsForLine } from '../../modules/geo/map-tile.js';
import type { GeoJSONLineString } from '../../modules/geo/domain.js';
import { excludeInternalResourceTypesSql } from '../../modules/geo/map-visibility.js';
import { bulkMergeBindDefs, partitionByBindWidth, quote } from '../netwin-migration-kit.js';

export type Phase3MapStats = {
  candidates: number;
  features: number;
  skippedGeometry: number;
  densityCells: number;
};

type Candidate = {
  ID: string;
  NAME: string;
  FEATURE_KIND: 'resource' | 'site';
  ENTITY_TYPE: 'PhysicalResource' | 'GeographicSite';
  TYPE_CODE: string | null;
  SITE_CATEGORY: string | null;
  SOURCE_MODEL_TYPE: string;
  SOURCE_MODEL_ID: string;
  STATUS: string | null;
  SUBLABEL: string | null;
  GEOMETRY_TYPE: 'Point' | 'LineString' | null;
  GEOMETRY: string | null;
};

type VisibleSpecification = { ID: string; TYPE_CODE: string };
type FeatureRow = Record<string, string | number | null>;
type IndexColumn = { INDEX_NAME: string; COLUMN_NAME: string; COLUMN_POSITION: number };
type TableStatistic = {
  TABLE_NAME: string;
  NUM_ROWS: number | null;
  LAST_ANALYZED: Date | string | null;
  STALE_STATS: 'YES' | 'NO' | null;
};

const FEATURE_COLUMNS = [
  'tenant_id',
  'tile_z',
  'tile_x',
  'tile_y',
  'entity_id',
  'shape',
  'feature_kind',
  'entity_type',
  'type_code',
  'site_category',
  'source_model_type',
  'source_model_id',
  'status',
  'label',
  'sublabel',
  'lng',
  'lat',
  'geometry',
  'rank',
] as const;

// Tamanho fixo (literal, não bind) da página de varredura de `phase3MapResourcePageSql` — ver o
// comentário da função para o motivo de ser literal. Independente de `--batch-size`, que continua
// controlando só o tamanho do lote de INSERT em `insertFeatures`.
const PHASE3_MAP_PAGE_SIZE = 5000;

const PHYSICAL_RESOURCE_INDEX_COLUMNS = ['TENANT_ID', 'RESOURCE_SPECIFICATION_ID', 'ID'];
const DIAGNOSTIC_TABLES = [
  'tmf_physical_resource',
  'tmf_resource_specification',
  'tmf_resource_type',
  'tmf_geographic_site',
  'tmf_geographic_address',
  'tmf_geographic_location',
] as const;

// `ctx.t()` devolve o identificador já quoted (`"NX_DEV2_TMF_PHYSICAL_RESOURCE"`) — a forma correta
// em SQL de aplicação. Já as views do dicionário (USER_IND_COLUMNS, USER_TAB_STATISTICS) guardam o
// nome do objeto como VALOR de coluna, sempre sem aspas. Comparar `table_name` com o identificador
// quoted nunca casa: o diagnóstico dava falso negativo ("falta índice") mesmo com a migration v25
// aplicada com sucesso.
export function oracleDictionaryObjectName(identifier: string): string {
  return identifier.replaceAll('"', '').toUpperCase();
}

export function phase3VisibleMapSpecificationsSql(t: (table: string) => string): string {
  return `SELECT rs.id AS "ID", rt.code AS "TYPE_CODE"
            FROM ${t('tmf_resource_specification')} rs
            JOIN ${t('tmf_resource_type')} rt ON rt.id = rs.resource_type_id
           WHERE rs.tenant_id = :tenantId
             AND ${excludeInternalResourceTypesSql('rt')}
             AND COALESCE(rt.map_presence, 1) = 1
           ORDER BY rs.id`;
}

// A página é restringida no CTE antes dos joins de Place/Location. Assim, cada consulta parte de
// uma ResourceSpecification visível e do índice (tenant_id, resource_specification_id, id), sem
// examinar instâncias de Port/Splitter ou de qualquer outro tipo não exibível no mapa.
//
// O `place_id` do recurso pode apontar para Site, Address ou direto para Location, e a Location
// efetiva é o primeiro que resolver. Escrever esse COALESCE dentro da condição de join do
// Location (como era antes) produz um predicado não-sargável: o otimizador não consegue propagar
// a seletividade para o índice único de Address e resolve o join por HASH JOIN OUTER, varrendo
// `tmf_geographic_address` INTEIRA (2,1M linhas medidas) a cada página de 5.000 candidatos. Medido
// por isolamento de cada join nesta base: CTE sozinho 132ms, + site 111ms, + address 104ms,
// + location direto 160ms, mas os três via COALESCE no join 5.288ms (~40x).
//
// Resolver o COALESCE num CTE intermediário (`resolved`) e só então juntar Location por igualdade
// simples devolve o predicado à forma sargável. Os `USE_NL` fixam o nested loop + INDEX UNIQUE SCAN
// que é sempre o acesso certo aqui: a página tem no máximo `batchSize` linhas e cada lookup é por
// chave primária, então hash join (que materializa a tabela inteira do lado direito) nunca compensa
// — sem os hints o otimizador volta a escolher hash assim que as estatísticas mudam.
//
// O `FETCH FIRST` usa literal, não bind: com `:batchSize` o otimizador não enxerga o limite na hora
// de montar o plano (estimava 27.445 linhas em vez de 5.000) e superdimensiona os passos seguintes.
// Por isso o tamanho de página desta query é fixo em PHASE3_MAP_PAGE_SIZE em vez de seguir
// `--batch-size`, que continua governando o tamanho do lote de GRAVAÇÃO.
//
// Resultado medido na maior specification (AerialSpan, 691.721 candidatos), com resultado idêntico
// ao da forma anterior em todas as profundidades testadas: 5.409ms -> 2.154ms (prof. 5k),
// 4.632ms -> 980ms (prof. 200k), 4.463ms -> 1.994ms (prof. 500k).
export function phase3MapResourcePageSql(t: (table: string) => string): string {
  return `WITH resource_page AS (
            SELECT r.id, r.name, r.status, r.place_id, r.tenant_id
              FROM ${t('tmf_physical_resource')} r
             WHERE r.tenant_id = :tenantId
               AND r.resource_specification_id = :specificationId
               AND (:lastId IS NULL OR r.id > :lastId)
               AND r.status <> 'terminated'
             ORDER BY r.id
             FETCH FIRST ${PHASE3_MAP_PAGE_SIZE} ROWS ONLY
          ), resolved AS (
            SELECT /*+ USE_NL(place_site) USE_NL(place_address) */
                   r.id, r.name, r.status, r.tenant_id,
                   COALESCE(place_site.geographic_location_id, place_address.geographic_location_id, r.place_id) AS location_id
              FROM resource_page r
              LEFT JOIN ${t('tmf_geographic_site')} place_site
                ON place_site.id = r.place_id AND place_site.tenant_id = r.tenant_id
              LEFT JOIN ${t('tmf_geographic_address')} place_address
                ON place_address.id = r.place_id AND place_address.tenant_id = r.tenant_id
          )
          SELECT /*+ USE_NL(l) */
                 r.id AS "ID", r.name AS "NAME", 'resource' AS "FEATURE_KIND",
                 'PhysicalResource' AS "ENTITY_TYPE", :typeCode AS "TYPE_CODE", NULL AS "SITE_CATEGORY",
                 'RESOURCE_TYPE' AS "SOURCE_MODEL_TYPE", :typeCode AS "SOURCE_MODEL_ID", r.status AS "STATUS",
                 NULL AS "SUBLABEL", l.geometry_type AS "GEOMETRY_TYPE", l.geometry AS "GEOMETRY"
            FROM resolved r
            LEFT JOIN ${t('tmf_geographic_location')} l
              ON l.id = r.location_id AND l.tenant_id = r.tenant_id
           ORDER BY r.id`;
}

export function phase3MapSitePageSql(t: (table: string) => string): string {
  return `SELECT s.id AS "ID", s.name AS "NAME", 'site' AS "FEATURE_KIND",
                 'GeographicSite' AS "ENTITY_TYPE", NULL AS "TYPE_CODE", spec.category AS "SITE_CATEGORY",
                 'GEOGRAPHIC_SITE_SPECIFICATION' AS "SOURCE_MODEL_TYPE", spec.code AS "SOURCE_MODEL_ID",
                 s.status AS "STATUS", spec.code AS "SUBLABEL", l.geometry_type AS "GEOMETRY_TYPE", l.geometry AS "GEOMETRY"
            FROM ${t('tmf_geographic_site')} s
            JOIN ${t('tmf_geographic_site_specification')} spec ON spec.id = s.site_specification_id
            JOIN ${t('tmf_geographic_location')} l
              ON l.id = s.geographic_location_id AND l.tenant_id = s.tenant_id
           WHERE s.tenant_id = :tenantId
             AND (:lastId IS NULL OR s.id > :lastId)
             AND spec.category = 'Site'
             AND s.status NOT IN ('Retired', 'terminated')
             AND l.geometry_type = 'Point'
             AND NOT EXISTS (
               SELECT 1 FROM ${t('geo_project_site')} ps
               JOIN ${t('geo_project')} p ON p.id = ps.project_id
              WHERE ps.site_id = s.id AND p.status <> 'terminated'
             )
           ORDER BY s.id
           FETCH FIRST :batchSize ROWS ONLY`;
}

// Contagem de candidatos, usada só para dar `total` (e portanto ETA) ao progresso da gravação.
// Espelha os filtros de `phase3MapResourcePageSql` restritos à própria tabela de recurso: os LEFT
// JOINs de Place/Location daquela query não filtram linha nenhuma (são LEFT), então omiti-los aqui
// não muda a contagem e evita varrer Geo à toa.
export function phase3MapResourceCountSql(t: (table: string) => string): string {
  return `SELECT COUNT(*) AS "TOTAL"
            FROM ${t('tmf_physical_resource')} r
           WHERE r.tenant_id = :tenantId
             AND r.resource_specification_id = :specificationId
             AND r.status <> 'terminated'`;
}

// Espelha `phase3MapSitePageSql`. Aqui os JOINs são INNER e o NOT EXISTS filtra de fato, então
// todos precisam ser replicados para a contagem bater com o que a paginação vai percorrer.
export function phase3MapSiteCountSql(t: (table: string) => string): string {
  return `SELECT COUNT(*) AS "TOTAL"
            FROM ${t('tmf_geographic_site')} s
            JOIN ${t('tmf_geographic_site_specification')} spec ON spec.id = s.site_specification_id
            JOIN ${t('tmf_geographic_location')} l
              ON l.id = s.geographic_location_id AND l.tenant_id = s.tenant_id
           WHERE s.tenant_id = :tenantId
             AND spec.category = 'Site'
             AND s.status NOT IN ('Retired', 'terminated')
             AND l.geometry_type = 'Point'
             AND NOT EXISTS (
               SELECT 1 FROM ${t('geo_project_site')} ps
               JOIN ${t('geo_project')} p ON p.id = ps.project_id
              WHERE ps.site_id = s.id AND p.status <> 'terminated'
             )`;
}

// Mantido para testes e ferramentas que exibem a fonte do rebuild. A execução real pagina
// ResourceSpecifications visíveis e Sites separadamente, nunca uma UNION ALL global.
export function phase3MapCandidatesSql(t: (table: string) => string): string {
  return `${phase3VisibleMapSpecificationsSql(t)}\n-- resource pages: ${phase3MapResourcePageSql(t)}\n-- site pages: ${phase3MapSitePageSql(t)}`;
}

export function phase3MapCandidatePageSql(t: (table: string) => string): string {
  return phase3MapResourcePageSql(t);
}

export function hasPhase3ResourceScanIndex(rows: readonly IndexColumn[]): string | null {
  const byIndex = new Map<string, IndexColumn[]>();
  for (const row of rows) {
    const columns = byIndex.get(row.INDEX_NAME) ?? [];
    columns.push(row);
    byIndex.set(row.INDEX_NAME, columns);
  }
  for (const [indexName, columns] of byIndex) {
    const prefix = columns
      .sort((left, right) => left.COLUMN_POSITION - right.COLUMN_POSITION)
      .slice(0, PHYSICAL_RESOURCE_INDEX_COLUMNS.length)
      .map((column) => column.COLUMN_NAME.toUpperCase());
    if (prefix.join(',') === PHYSICAL_RESOURCE_INDEX_COLUMNS.join(',')) return indexName;
  }
  return null;
}

export function stalePhase3Statistics(rows: readonly TableStatistic[]): string[] {
  return rows
    .filter((row) => row.STALE_STATS === 'YES' || row.LAST_ANALYZED === null)
    .map((row) => row.TABLE_NAME);
}

function pointFeature(
  tenantId: string,
  candidate: Candidate,
  coordinates: unknown,
): FeatureRow | null {
  if (
    !Array.isArray(coordinates) ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  const tile = tileForPoint([lng, lat], MAP_TILE_ZOOM);
  return {
    tenant_id: tenantId,
    tile_z: tile.z,
    tile_x: tile.x,
    tile_y: tile.y,
    entity_id: candidate.ID,
    shape: 'point',
    feature_kind: candidate.FEATURE_KIND,
    entity_type: candidate.ENTITY_TYPE,
    type_code: candidate.TYPE_CODE,
    site_category: candidate.SITE_CATEGORY,
    source_model_type: candidate.SOURCE_MODEL_TYPE,
    source_model_id: candidate.SOURCE_MODEL_ID,
    status: candidate.STATUS,
    label: candidate.NAME,
    sublabel: candidate.SUBLABEL,
    lng,
    lat,
    geometry: null,
    rank: 0,
  };
}

export function phase3MapFeaturesForCandidate(
  tenantId: string,
  candidate: Candidate,
): FeatureRow[] | null {
  if (!candidate.GEOMETRY || !candidate.GEOMETRY_TYPE) return null;
  let geometry: { coordinates?: unknown } | null = null;
  try {
    const parsed = JSON.parse(candidate.GEOMETRY);
    if (parsed && typeof parsed === 'object') geometry = parsed as { coordinates?: unknown };
  } catch {
    return null;
  }
  if (!geometry) return null;
  if (candidate.GEOMETRY_TYPE === 'Point') {
    const feature = pointFeature(tenantId, candidate, geometry.coordinates);
    return feature ? [feature] : null;
  }
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return null;
  const line: GeoJSONLineString = {
    type: 'LineString',
    coordinates: geometry.coordinates as GeoJSONLineString['coordinates'],
  };
  return tileSegmentsForLine(line, MAP_TILE_ZOOM).map(({ tile, coordinates, rank }) => {
    const anchor = coordinates[Math.floor(coordinates.length / 2)]!;
    return {
      tenant_id: tenantId,
      tile_z: tile.z,
      tile_x: tile.x,
      tile_y: tile.y,
      entity_id: candidate.ID,
      shape: 'line',
      feature_kind: 'resource',
      entity_type: candidate.ENTITY_TYPE,
      type_code: candidate.TYPE_CODE,
      site_category: null,
      source_model_type: candidate.SOURCE_MODEL_TYPE,
      source_model_id: candidate.SOURCE_MODEL_ID,
      status: candidate.STATUS,
      label: candidate.NAME,
      sublabel: null,
      lng: anchor[0],
      lat: anchor[1],
      geometry: JSON.stringify({ type: 'LineString', coordinates }),
      rank,
    };
  });
}

// Sem `bindDefs`, `executeMany` infere o tipo de cada bind e escolhe CLOB para `geometry` (que é
// coluna CLOB no destino) em TODAS as linhas do lote — inclusive nas features de ponto, onde
// `geometry` é null. Bind CLOB materializa um LOB temporário por valor no servidor: medido neste
// projeto, 2.000 linhas custaram 77.970ms em CLOB contra 196ms em VARCHAR2 (~400x — ver
// `bulkMergeBindDefs` em netwin-migration-kit.ts). Era a causa dos ~44 candidatos/s da gravação.
//
// A correção é a mesma já usada pela Fase 2: dimensionar o bind pelo conteúdo REAL do lote e
// isolar as poucas linhas de geometria larga (> 4000 bytes) num lote próprio, para que uma linha
// grande não arraste as demais ao caminho lento.
async function insertFeatures(
  conn: Connection,
  ctx: MigrationContext,
  rows: FeatureRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const columns = [...FEATURE_COLUMNS];
  const sql = `INSERT INTO ${ctx.t('geo_map_feature')} (${FEATURE_COLUMNS.map((column) => `"${column.toUpperCase()}"`).join(',')}) VALUES (${FEATURE_COLUMNS.map((_, index) => `:${index + 1}`).join(',')})`;
  for (const partition of Object.values(partitionByBindWidth(columns, rows))) {
    if (partition.length === 0) continue;
    await conn.executeMany(
      sql,
      partition.map((row) => columns.map((column) => row[column] ?? null)),
      { autoCommit: false, bindDefs: bulkMergeBindDefs(columns, partition) },
    );
  }
}

function addDensityTiles(densityTiles: Set<string>, rows: FeatureRow[]): void {
  for (const row of rows) {
    for (const zoom of MAP_DENSITY_ZOOMS) {
      const factor = densityFactor(zoom);
      densityTiles.add(
        `${zoom}:${Math.floor(Number(row.tile_x) / factor)}:${Math.floor(Number(row.tile_y) / factor)}`,
      );
    }
  }
}

type CandidateScan = Omit<Phase3MapStats, 'densityCells'> & {
  densityTiles: Set<string>;
  resources: number;
  sites: number;
};

async function ensureResourceScanIndex(conn: Connection, ctx: MigrationContext): Promise<void> {
  const tableName = oracleDictionaryObjectName(ctx.t('tmf_physical_resource'));
  const result = await conn.execute<IndexColumn>(
    `SELECT index_name AS "INDEX_NAME", column_name AS "COLUMN_NAME", column_position AS "COLUMN_POSITION"
       FROM user_ind_columns
      WHERE table_name = :tableName
      ORDER BY index_name, column_position`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const indexName = hasPhase3ResourceScanIndex(result.rows ?? []);
  if (!indexName) {
    throw new Error(
      `Rebuild de mapa abortado: falta índice ${PHYSICAL_RESOURCE_INDEX_COLUMNS.join(', ')} em ${tableName}. Rode npm run db:migrate para aplicar a migration phase3-map-scan-indexes.`,
    );
  }
  console.log(
    `[Mapa] Índice Oracle confirmado: ${indexName} (${PHYSICAL_RESOURCE_INDEX_COLUMNS.join(', ')}).`,
  );
}

const MAP_INDEX_TABLES = ['geo_map_feature', 'geo_map_density'] as const;

type PlainIndexStatus = { indexName: string; status: string };
type UniqueConstraintInfo = {
  constraintName: string;
  enabled: boolean;
  indexName: string | null;
  columns: string[];
};

// `user_indexes` também devolve o índice de LOB gerado implicitamente pelo Oracle para a
// coluna `geometry` (CLOB — ver CLOB_COLUMNS em oracle-schema.ts), ex.: "SYS_IL0000095939C00018$$".
// Esse índice é gerenciado junto com o segmento LOB e não aceita ALTER INDEX ... UNUSABLE/REBUILD
// (ORA-22864: cannot ALTER or DROP LOB indexes) — só os B-tree normais interessam aqui, por isso
// o filtro em index_type. Índices que sustentam PRIMARY KEY/UNIQUE são excluídos explicitamente:
// eles passam pelo caminho de `tableUniqueConstraints`, não por este.
async function tableNormalIndexes(conn: Connection, tableName: string): Promise<PlainIndexStatus[]> {
  const result = await conn.execute<{ INDEX_NAME: string; STATUS: string }>(
    `SELECT ui.index_name AS "INDEX_NAME", ui.status AS "STATUS"
       FROM user_indexes ui
      WHERE ui.table_name = :tableName AND ui.index_type = 'NORMAL'
        AND NOT EXISTS (
          SELECT 1 FROM user_constraints uc
           WHERE uc.table_name = ui.table_name AND uc.constraint_type IN ('P', 'U')
             AND uc.index_name = ui.index_name
        )`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows ?? []).map((r) => ({ indexName: r.INDEX_NAME, status: r.STATUS }));
}

// `user_cons_columns` guarda a definição de colunas do constraint independentemente do índice que
// o sustenta — sobrevive mesmo depois que o índice é dropado (confirmado ao vivo), o que é
// exatamente o que permite recriar o índice certo mais tarde, inclusive depois de um crash em
// outro processo. `index_name` em `user_constraints`, por outro lado, já some assim que o
// constraint é desabilitado (confirmado ao vivo) — por isso é lido aqui, antes de qualquer DISABLE,
// e não depois.
async function tableUniqueConstraints(
  conn: Connection,
  tableName: string,
): Promise<UniqueConstraintInfo[]> {
  const consResult = await conn.execute<{
    CONSTRAINT_NAME: string;
    STATUS: string;
    INDEX_NAME: string | null;
  }>(
    `SELECT constraint_name AS "CONSTRAINT_NAME", status AS "STATUS", index_name AS "INDEX_NAME"
       FROM user_constraints
      WHERE table_name = :tableName AND constraint_type IN ('P', 'U')`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const infos: UniqueConstraintInfo[] = [];
  for (const row of consResult.rows ?? []) {
    const colsResult = await conn.execute<{ COLUMN_NAME: string }>(
      `SELECT column_name AS "COLUMN_NAME" FROM user_cons_columns
        WHERE constraint_name = :constraintName ORDER BY position`,
      { constraintName: row.CONSTRAINT_NAME },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    infos.push({
      constraintName: row.CONSTRAINT_NAME,
      enabled: row.STATUS === 'ENABLED',
      indexName: row.INDEX_NAME,
      columns: (colsResult.rows ?? []).map((r) => r.COLUMN_NAME),
    });
  }
  return infos;
}

// Manutenção de índice B-tree durante o INSERT é o que faz a gravação desacelerar de ~1.450
// candidatos/s (tabela vazia) para um platô de ~65-120/s conforme ela cresce — confirmado:
// não é fan-out de linha/cabo (proporção linhas:candidatos medida em ~1,06:1). Desabilitar os
// índices antes da carga e reconstruí-los em bloco no final troca custo incremental por INSERT
// por um único rebuild sequencial por índice.
//
// Para o índice de PK/UNIQUE, `ALTER INDEX ... UNUSABLE` não é suficiente mesmo com o constraint
// desabilitado via `KEEP INDEX` — confirmado ao vivo: `SKIP_UNUSABLE_INDEXES` simplesmente não se
// aplica a índice único/PK, então a primeira instrução de DML na tabela continua falhando com
// ORA-01502. A única forma de eliminar o custo de manutenção deste índice durante a carga é
// removê-lo de fato (DROP INDEX) e recriá-lo do zero no final — por isso o tratamento é separado
// dos índices simples (que continuam no caminho UNUSABLE/REBUILD, que já funciona).
//
// `DISABLE CONSTRAINT` (sem `KEEP INDEX`) tem comportamento diferente dependendo da origem do
// índice que sustenta o constraint — confirmado ao vivo com os dois lados: quando o índice foi
// implicitamente criado pelo próprio Oracle (nunca passou por este ciclo disable/drop/recreate
// antes), o DISABLE já o remove sozinho; quando o índice foi anexado explicitamente via
// `USING INDEX` (como este script faz no `rebuildMapIndexes`, ou qualquer execução anterior já
// tiver feito), o DISABLE preserva o índice e o `DROP INDEX` explícito abaixo é que faz o
// trabalho. Isso quer dizer que o `DROP INDEX` pode legitimamente encontrar "nada a remover" na
// primeira vez que toca um índice ainda intocado (ORA-01418) — não é erro, é o auto-drop do
// Oracle chegando primeiro. Em qualquer execução futura (índice já recriado via USING INDEX),
// o DROP explícito passa a ser necessário de fato.
async function disableMapIndexes(conn: Connection, ctx: MigrationContext, table: string): Promise<void> {
  const tableName = oracleDictionaryObjectName(ctx.t(table));
  for (const { constraintName, enabled, indexName } of await tableUniqueConstraints(conn, tableName)) {
    if (!enabled) continue;
    const droppedIndexName = indexName ?? constraintName;
    console.log(
      `[Mapa] Desabilitando constraint ${constraintName} e removendo o índice único ${droppedIndexName} (${tableName}) para a carga em massa.`,
    );
    await conn.execute(`ALTER TABLE ${quote(tableName)} DISABLE CONSTRAINT ${quote(constraintName)}`);
    try {
      await conn.execute(`DROP INDEX ${quote(droppedIndexName)}`);
    } catch (error) {
      // ORA-01418: o DISABLE CONSTRAINT acima já removeu o índice (caso implícito — ver
      // comentário da função). Qualquer outro erro é real e deve propagar.
      if (!(error instanceof Error) || !/ORA-01418/.test(error.message)) throw error;
    }
  }
  for (const { indexName } of await tableNormalIndexes(conn, tableName)) {
    console.log(`[Mapa] Marcando índice ${indexName} (${tableName}) como UNUSABLE para a carga em massa.`);
    await conn.execute(`ALTER INDEX ${quote(indexName)} UNUSABLE`);
  }
}

// Um crash (ou duas execuções sobrepostas — a suspeita mais provável, dado que os grupos
// duplicados vistos ao vivo cobrem só ~13% das linhas, não a tabela inteira) pode deixar linhas
// duplicadas na chave do constraint depois que `disableMapIndexes` já dropou o índice único: sem
// ele, nada impede o INSERT de aceitar a mesma chave duas vezes, e o commit-por-página já tornou
// isso permanente antes de qualquer rebuild conseguir rejeitar. Sem esta limpeza, `CREATE UNIQUE
// INDEX` falha com ORA-01452 e trava tanto o caminho normal quanto o backstop
// (`recoverUnusableMapIndexes`) indefinidamente, exigindo cirurgia manual — como aconteceu ao
// vivo. Mantém a linha mais recente (`generated_at`) de cada grupo; perder a mais antiga é inócuo
// porque o conteúdo das duas é idêntico (mesma projeção da mesma entidade).
async function dedupeMapTableDuplicates(
  conn: Connection,
  ctx: MigrationContext,
  tableName: string,
  columns: string[],
): Promise<number> {
  const quotedTable = quote(tableName);
  const keyColumns = columns.map(quote).join(', ');
  const result = await conn.execute(
    `DELETE FROM ${quotedTable} t
      WHERE t.rowid NOT IN (
        SELECT keep_rowid FROM (
          SELECT rowid AS keep_rowid,
                 ROW_NUMBER() OVER (PARTITION BY ${keyColumns} ORDER BY generated_at DESC, rowid DESC) AS rn
            FROM ${quotedTable}
        )
        WHERE rn = 1
      )`,
  );
  const removed = result.rowsAffected ?? 0;
  if (removed > 0) {
    await conn.execute('COMMIT');
    console.warn(
      `[Mapa] Removida(s) ${removed} linha(s) duplicada(s) de ${tableName} (chave ${columns.join(', ')}) antes de recriar o índice único.`,
    );
  }
  return removed;
}

async function rebuildMapIndexes(conn: Connection, ctx: MigrationContext, table: string): Promise<void> {
  const tableName = oracleDictionaryObjectName(ctx.t(table));
  for (const { constraintName, enabled, indexName, columns } of await tableUniqueConstraints(conn, tableName)) {
    if (enabled) continue;
    await dedupeMapTableDuplicates(conn, ctx, tableName, columns);
    const newIndexName = indexName ?? constraintName;
    const startedAt = Date.now();
    try {
      await conn.execute(
        `CREATE UNIQUE INDEX ${quote(newIndexName)} ON ${quote(tableName)} (${columns.map(quote).join(', ')}) PARALLEL 4 NOLOGGING`,
      );
      await conn.execute(`ALTER INDEX ${quote(newIndexName)} NOPARALLEL`);
      // NOVALIDATE evita o full-scan de validação: o CREATE UNIQUE INDEX acima já teria falhado
      // com ORA-01452 se houvesse chave duplicada, então a unicidade já está garantida.
      await conn.execute(
        `ALTER TABLE ${quote(tableName)} ENABLE NOVALIDATE CONSTRAINT ${quote(constraintName)} USING INDEX ${quote(newIndexName)}`,
      );
    } catch (error) {
      // ORA-01452 (chave duplicada) ou qualquer outra falha aqui deixa a tabela sem este
      // constraint — nunca engolir, sempre relançar com contexto.
      throw new Error(
        `Rebuild de mapa abortado: falha ao recriar índice único/constraint ${constraintName} de ${tableName}. ` +
          `Se for ORA-01452, há duplicidade de chave nos dados recém-gravados. Detalhe: ${String(error)}`,
      );
    }
    console.log(`[Mapa] Constraint ${constraintName} (${tableName}) reabilitada em ${Date.now() - startedAt}ms.`);
  }
  for (const { indexName, status } of await tableNormalIndexes(conn, tableName)) {
    if (status === 'VALID') continue;
    const startedAt = Date.now();
    try {
      await conn.execute(`ALTER INDEX ${quote(indexName)} REBUILD PARALLEL 4 NOLOGGING`);
      await conn.execute(`ALTER INDEX ${quote(indexName)} NOPARALLEL`);
    } catch (error) {
      throw new Error(
        `Rebuild de mapa abortado: falha ao reconstruir índice ${indexName} de ${tableName}. Detalhe: ${String(error)}`,
      );
    }
    console.log(`[Mapa] Índice ${indexName} (${tableName}) reconstruído em ${Date.now() - startedAt}ms.`);
  }
}

// Backstop: um crash no meio da carga deixa índices UNUSABLE e/ou o constraint de PK/UNIQUE
// desabilitado sem seu índice. Sem isto, a próxima execução (ou o app do mapa) herdaria esse
// estado quebrado sem aviso. Em dry-run a conexão é read-only (ver getTargetReadConnection em
// context.ts) e bloqueia ALTER/DROP/CREATE — só pode diagnosticar e avisar; a reparação de fato
// só roda em --apply.
async function recoverUnusableMapIndexes(conn: Connection, ctx: MigrationContext): Promise<void> {
  const broken: { table: string; description: string }[] = [];
  for (const table of MAP_INDEX_TABLES) {
    const tableName = oracleDictionaryObjectName(ctx.t(table));
    for (const { indexName, status } of await tableNormalIndexes(conn, tableName)) {
      if (status !== 'VALID') broken.push({ table, description: `${indexName} (${tableName})` });
    }
    for (const { constraintName, enabled } of await tableUniqueConstraints(conn, tableName)) {
      if (!enabled) broken.push({ table, description: `constraint ${constraintName} (${tableName})` });
    }
  }
  if (broken.length === 0) return;

  const description = broken.map((b) => b.description).join(', ');
  if (!ctx.options.apply) {
    console.warn(
      `[Mapa] AVISO: índice(s)/constraint(s) não restaurados de uma execução anterior interrompida: ${description}. ` +
        `Leituras do mapa continuam funcionando (via full scan, ou sem validação de unicidade), mas rode --apply para reparar.`,
    );
    return;
  }
  console.warn(`[Mapa] Reparando índice(s)/constraint(s) deixados por execução anterior: ${description}.`);
  for (const table of new Set(broken.map((b) => b.table))) {
    await rebuildMapIndexes(conn, ctx, table);
  }
}

async function reportStatistics(conn: Connection, ctx: MigrationContext): Promise<void> {
  const tableNames = DIAGNOSTIC_TABLES.map((table) => oracleDictionaryObjectName(ctx.t(table)));
  const result = await conn.execute<TableStatistic>(
    `SELECT table_name AS "TABLE_NAME", num_rows AS "NUM_ROWS", last_analyzed AS "LAST_ANALYZED", stale_stats AS "STALE_STATS"
       FROM user_tab_statistics
      WHERE table_name IN (${tableNames.map((_, index) => `:table${index}`).join(', ')})`,
    Object.fromEntries(tableNames.map((tableName, index) => [`table${index}`, tableName])),
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const stale = stalePhase3Statistics(result.rows ?? []);
  if (stale.length > 0) {
    console.warn(
      `[Mapa] Estatísticas Oracle ausentes/desatualizadas: ${stale.join(', ')}. Antes do benchmark, rode node scripts/gather-db-stats.mjs --table ${DIAGNOSTIC_TABLES.join(',')}.`,
    );
  }
}

async function visibleSpecifications(
  conn: Connection,
  ctx: MigrationContext,
): Promise<VisibleSpecification[]> {
  const result = await conn.execute<VisibleSpecification>(
    phase3VisibleMapSpecificationsSql(ctx.t),
    { tenantId: ctx.options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: ctx.options.batchSize },
  );
  return result.rows ?? [];
}

async function scanResourceSpecification(
  conn: Connection,
  ctx: MigrationContext,
  specification: VisibleSpecification,
  scan: CandidateScan,
  progress: MigrationProgress,
  onFeatures?: (rows: FeatureRow[]) => Promise<void>,
): Promise<void> {
  let lastId: string | null = null;
  const pageSql = phase3MapResourcePageSql(ctx.t);
  while (true) {
    const queryResult: oracledb.Result<Candidate> = await conn.execute<Candidate>(
      pageSql,
      {
        tenantId: ctx.options.tenantId,
        specificationId: specification.ID,
        typeCode: specification.TYPE_CODE,
        lastId,
      },
      {
        // A SQL agora pagina em PHASE3_MAP_PAGE_SIZE (literal, não :batchSize — ver o comentário
        // de phase3MapResourcePageSql), então o fetch array precisa seguir o mesmo valor em vez
        // de --batch-size: ctx.options.batchSize continua governando só o lote de GRAVAÇÃO.
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: PHASE3_MAP_PAGE_SIZE,
        prefetchRows: PHASE3_MAP_PAGE_SIZE,
      },
    );
    const candidatePage = queryResult.rows ?? [];
    if (candidatePage.length === 0) return;
    const rows: FeatureRow[] = [];
    for (const candidate of candidatePage) {
      scan.candidates += 1;
      scan.resources += 1;
      const generated = phase3MapFeaturesForCandidate(ctx.options.tenantId, candidate);
      if (!generated) scan.skippedGeometry += 1;
      else rows.push(...generated);
    }
    scan.features += rows.length;
    addDensityTiles(scan.densityTiles, rows);
    if (onFeatures) await onFeatures(rows);
    progress.advance(candidatePage.length);
    lastId = candidatePage[candidatePage.length - 1]!.ID;
  }
}

async function scanSites(
  conn: Connection,
  ctx: MigrationContext,
  scan: CandidateScan,
  progress: MigrationProgress,
  onFeatures?: (rows: FeatureRow[]) => Promise<void>,
): Promise<void> {
  let lastId: string | null = null;
  const pageSql = phase3MapSitePageSql(ctx.t);
  while (true) {
    const queryResult: oracledb.Result<Candidate> = await conn.execute<Candidate>(
      pageSql,
      { tenantId: ctx.options.tenantId, lastId, batchSize: ctx.options.batchSize },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: ctx.options.batchSize,
        prefetchRows: ctx.options.batchSize,
      },
    );
    const candidatePage = queryResult.rows ?? [];
    if (candidatePage.length === 0) return;
    const rows: FeatureRow[] = [];
    for (const candidate of candidatePage) {
      scan.candidates += 1;
      scan.sites += 1;
      const generated = phase3MapFeaturesForCandidate(ctx.options.tenantId, candidate);
      if (!generated) scan.skippedGeometry += 1;
      else rows.push(...generated);
    }
    scan.features += rows.length;
    addDensityTiles(scan.densityTiles, rows);
    if (onFeatures) await onFeatures(rows);
    progress.advance(candidatePage.length);
    lastId = candidatePage[candidatePage.length - 1]!.ID;
  }
}

// Conta candidatos antes da gravação. Substitui a antiga passada de "validação", que percorria
// TODA a fonte só para produzir esses dois números (2h44m medidos no tenant nacional) e depois
// repetia a varredura inteira para gravar. Aqui o mesmo resultado sai de agregações indexadas.
async function countCandidates(
  conn: Connection,
  ctx: MigrationContext,
  specifications: VisibleSpecification[],
): Promise<number> {
  let total = 0;
  const resourceCountSql = phase3MapResourceCountSql(ctx.t);
  for (const specification of specifications) {
    const result = await conn.execute<{ TOTAL: number }>(
      resourceCountSql,
      { tenantId: ctx.options.tenantId, specificationId: specification.ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    total += Number(result.rows?.[0]?.TOTAL ?? 0);
  }
  const siteResult = await conn.execute<{ TOTAL: number }>(
    phase3MapSiteCountSql(ctx.t),
    { tenantId: ctx.options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  total += Number(siteResult.rows?.[0]?.TOTAL ?? 0);
  return total;
}

async function scanCandidates(
  conn: Connection,
  ctx: MigrationContext,
  stage: 'validação' | 'gravação',
  specifications: VisibleSpecification[],
  onFeatures?: (rows: FeatureRow[]) => Promise<void>,
  total?: number,
): Promise<CandidateScan> {
  const scan: CandidateScan = {
    candidates: 0,
    features: 0,
    skippedGeometry: 0,
    densityTiles: new Set<string>(),
    resources: 0,
    sites: 0,
  };
  const progress = new MigrationProgress({
    label: `Fase 3.A — ${stage}`,
    unit: 'candidatos',
    reportEvery: ctx.options.batchSize,
    ...(total === undefined ? {} : { total }),
  });
  progress.start();
  for (const specification of specifications) {
    await scanResourceSpecification(conn, ctx, specification, scan, progress, onFeatures);
  }
  await scanSites(conn, ctx, scan, progress, onFeatures);
  progress.finish();
  return scan;
}

async function rebuildDensity(conn: Connection, ctx: MigrationContext): Promise<number> {
  let densityCells = 0;
  for (const zoom of MAP_DENSITY_ZOOMS) {
    const factor = densityFactor(zoom);
    const result = await conn.execute(
      `INSERT INTO ${ctx.t('geo_map_density')}
        (tenant_id,tile_z,tile_x,tile_y,feature_count,resource_count,site_count,lng,lat)
        SELECT tenant_id,${zoom},FLOOR(tile_x/${factor}),FLOOR(tile_y/${factor}),COUNT(DISTINCT entity_id),
               COUNT(DISTINCT CASE WHEN feature_kind='resource' THEN entity_id END),
               COUNT(DISTINCT CASE WHEN feature_kind='site' THEN entity_id END),AVG(lng),AVG(lat)
          FROM ${ctx.t('geo_map_feature')}
         WHERE tenant_id=:tenantId AND tile_z=${MAP_TILE_ZOOM}
         GROUP BY tenant_id,FLOOR(tile_x/${factor}),FLOOR(tile_y/${factor})`,
      { tenantId: ctx.options.tenantId },
    );
    densityCells += result.rowsAffected ?? 0;
  }
  return densityCells;
}

export async function runPhase3MapFeatures(ctx: MigrationContext): Promise<Phase3MapStats> {
  const conn = await ctx.getTargetReadConnection();
  try {
    console.log('\n=== Fase 3.A: Índices de mapa e densidade ===');
    await ensureResourceScanIndex(conn, ctx);
    await recoverUnusableMapIndexes(conn, ctx);
    await reportStatistics(conn, ctx);
    const specifications = await visibleSpecifications(conn, ctx);
    console.log(
      `[Mapa] ${specifications.length} ResourceSpecification(s) visíveis; Port, Splitter e tipos map_presence=0 não são consultados.`,
    );
    const expectedCandidates = await countCandidates(conn, ctx, specifications);
    console.log(
      `[Mapa] ${expectedCandidates.toLocaleString('pt-BR')} candidato(s) a percorrer (contagem direta; a varredura de validação foi eliminada).`,
    );
    if (expectedCandidates === 0) {
      console.log('[Mapa] nenhum candidato elegível; projeções vigentes preservadas.');
      return { candidates: 0, features: 0, skippedGeometry: 0, densityCells: 0 };
    }

    // DRY-RUN percorre sem gravar; --apply grava na mesma passada. Antes eram duas varreturas
    // completas da fonte (validação + gravação) para o mesmo resultado.
    let scan: CandidateScan;
    let densityCells: number;
    if (!ctx.options.apply) {
      scan = await scanCandidates(conn, ctx, 'validação', specifications, undefined, expectedCandidates);
      densityCells = scan.densityTiles.size;
    } else {
      // Commit por página: uma queda de conexão no meio do rebuild deixa de descartar horas de
      // trabalho. O preço é uma janela em que o mapa mostra estado misto (parte novo, parte
      // antigo) — aceitável porque o mapa é o único consumidor destas projeções.
      await conn.execute(`ALTER SESSION SET SKIP_UNUSABLE_INDEXES = TRUE`);
      let pendingSinceCommit = 0;
      try {
        // disableMapIndexes e o DELETE entram no try: se qualquer um falhar (ex.: ORA-01502 por
        // um índice de constraint que não foi desabilitado corretamente), o catch ainda tenta o
        // rebuild de emergência antes de propagar — sem isso, um erro aqui deixava o índice
        // UNUSABLE sem nenhuma tentativa de reparo até a próxima execução.
        await disableMapIndexes(conn, ctx, 'geo_map_feature');
        await conn.execute(`DELETE FROM ${ctx.t('geo_map_feature')} WHERE tenant_id=:tenantId`, {
          tenantId: ctx.options.tenantId,
        });
        scan = await scanCandidates(
          conn,
          ctx,
          'gravação',
          specifications,
          async (rows) => {
            await insertFeatures(conn, ctx, rows);
            pendingSinceCommit += rows.length;
            if (shouldCommitMigrationBatch(pendingSinceCommit, ctx.options.batchSize)) {
              await conn.execute('COMMIT');
              pendingSinceCommit = 0;
            }
          },
          expectedCandidates,
        );
        if (scan.features === 0) {
          throw new Error('Rebuild de mapa abortado: candidatos elegíveis sem features válidas.');
        }
        await rebuildMapIndexes(conn, ctx, 'geo_map_feature');
        // A densidade agrega a tabela inteira, então só pode ser reconstruída depois que todas as
        // features existem — permanece um passo final único, junto do commit que o fecha.
        await disableMapIndexes(conn, ctx, 'geo_map_density');
        await conn.execute(`DELETE FROM ${ctx.t('geo_map_density')} WHERE tenant_id=:tenantId`, {
          tenantId: ctx.options.tenantId,
        });
        densityCells = await rebuildDensity(conn, ctx);
        await rebuildMapIndexes(conn, ctx, 'geo_map_density');
        await conn.execute('COMMIT');
      } catch (error) {
        // Paliativo de disponibilidade: tenta deixar os índices VALID mesmo no caminho de erro,
        // sem mascarar o erro original. Se isto também falhar, o backstop real é
        // recoverUnusableMapIndexes na próxima execução.
        for (const table of MAP_INDEX_TABLES) {
          try {
            await rebuildMapIndexes(conn, ctx, table);
          } catch (rebuildError) {
            console.error('[Mapa] Rebuild de emergência falhou:', rebuildError);
          }
        }
        await conn.execute('ROLLBACK');
        throw error;
      }
    }

    console.log(
      `[Mapa] recursos=${scan.resources}; sites=${scan.sites}; features=${scan.features}; geometrias inválidas=${scan.skippedGeometry}; células de densidade=${densityCells}.`,
    );
    return {
      candidates: scan.candidates,
      features: scan.features,
      skippedGeometry: scan.skippedGeometry,
      densityCells,
    };
  } finally {
    await conn.close();
  }
}
