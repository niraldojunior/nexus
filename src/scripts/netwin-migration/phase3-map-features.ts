import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { MigrationContext } from './context.js';
import { MigrationProgress, shouldCommitMigrationBatch } from './progress.js';
import { MAP_DENSITY_ZOOMS } from '../../modules/geo/map-density.js';
import {
  MAP_TILE_ZOOM,
  tileForPoint,
  MAP_BASE_LOD_KEY,
  tileSegmentsForLineLods,
  type LineLodProfile,
} from '../../modules/geo/map-tile.js';
import {
  emptyPhase3Timings,
  formatPhase3Timings,
  runBoundedPipeline,
  timed,
  type Phase3Timings,
} from './phase3-pipeline.js';
import { loadPublishedLineTiling } from './line-tiling.js';
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

type IncrementalCandidate = Candidate & {
  UPDATED_KEY: string;
};

type ExistingFeatureTile = {
  TILE_Z: number;
  TILE_X: number;
  TILE_Y: number;
};

// O cursor guarda `updated_at` em UTC como texto com microssegundos: `Date` do JS trunca em
// milissegundos e, com frações abaixo disso, a página seguinte repetia as mesmas linhas.
type IncrementalCursor = {
  updatedKey: string;
  id: string;
};

const INCREMENTAL_CURSOR_FORMAT = 'YYYY-MM-DD HH24:MI:SS.FF6';

export function incrementalCursorKey(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}000`;
}

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
  'lod_key',
  'rank',
] as const;

// Tamanho fixo (literal, não bind) da página de varredura de `phase3MapResourcePageSql` — ver o
// comentário da função para o motivo de ser literal. Independente de `--batch-size`, que continua
// controlando só o tamanho do lote de INSERT em `insertFeatures`.
const PHASE3_MAP_PAGE_SIZE = 5000;
// Blocos de leitura que o leitor pode adiantar ao escritor (contrapressão).
const PHASE3_PIPELINE_DEPTH = 4;
const PHASE3_GROUP_MAX_SPECIFICATIONS = 200;
const PHASE3_GROUP_MAX_CANDIDATES = 4 * PHASE3_MAP_PAGE_SIZE;

const PHYSICAL_RESOURCE_INDEX_COLUMNS = ['TENANT_ID', 'RESOURCE_SPECIFICATION_ID', 'ID'];
const INCREMENTAL_INDEXES = [
  {
    table: 'resource_physical',
    columns: ['TENANT_ID', 'UPDATED_AT', 'ID'],
  },
  {
    table: 'geographic_site',
    columns: ['TENANT_ID', 'UPDATED_AT', 'ID'],
  },
  {
    table: 'geographic_map_feature',
    columns: ['TENANT_ID', 'FEATURE_KIND', 'ENTITY_ID'],
  },
] as const;
const DIAGNOSTIC_TABLES = [
  'resource_physical',
  'resource_specification',
  'resource_type',
  'geographic_site',
  'geographic_address',
  'geographic_location',
] as const;

// `ctx.t()` devolve o identificador já quoted (`"NX_DEV2_RESOURCE_PHYSICAL"`) — a forma correta
// em SQL de aplicação. Já as views do dicionário (USER_IND_COLUMNS, USER_TAB_STATISTICS) guardam o
// nome do objeto como VALOR de coluna, sempre sem aspas. Comparar `table_name` com o identificador
// quoted nunca casa: o diagnóstico dava falso negativo ("falta índice") mesmo com a migration v25
// aplicada com sucesso.
export function oracleDictionaryObjectName(identifier: string): string {
  return identifier.replaceAll('"', '').toUpperCase();
}

export function phase3VisibleMapSpecificationsSql(t: (table: string) => string): string {
  return `SELECT rs.id AS "ID", rt.code AS "TYPE_CODE"
            FROM ${t('resource_specification')} rs
            JOIN ${t('resource_type')} rt ON rt.id = rs.resource_type_id
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
// `geographic_address` INTEIRA (2,1M linhas medidas) a cada página de 5.000 candidatos. Medido
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
              FROM ${t('resource_physical')} r
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
              LEFT JOIN ${t('geographic_site')} place_site
                ON place_site.id = r.place_id AND place_site.tenant_id = r.tenant_id
              LEFT JOIN ${t('geographic_address')} place_address
                ON place_address.id = r.place_id AND place_address.tenant_id = r.tenant_id
          )
          SELECT /*+ USE_NL(l) */
                 r.id AS "ID", r.name AS "NAME", 'resource' AS "FEATURE_KIND",
                 'PhysicalResource' AS "ENTITY_TYPE", :typeCode AS "TYPE_CODE", NULL AS "SITE_CATEGORY",
                 'RESOURCE_TYPE' AS "SOURCE_MODEL_TYPE", :typeCode AS "SOURCE_MODEL_ID", r.status AS "STATUS",
                 NULL AS "SUBLABEL", l.geometry_type AS "GEOMETRY_TYPE", l.geometry AS "GEOMETRY"
            FROM resolved r
            LEFT JOIN ${t('geographic_location')} l
              ON l.id = r.location_id AND l.tenant_id = r.tenant_id
           ORDER BY r.id`;
}

// Specifications pequenas (poucas dezenas de recursos) pagavam uma consulta inteira cada: com 4.890
// specifications e ~94 candidatos por uma, o custo fixo por consulta (~190ms) dominava — 80% do
// tempo era leitura, e o pipeline não tinha o que sobrepor (487 cand/s contra 470/s da linha de
// base). Esta variante lê várias specifications na mesma consulta: o índice (tenant, specification,
// id) atende cada valor do IN e o ORDER BY r.id mantém a paginação por chave única (`lastId` vale
// entre specifications porque `id` é único). O código do tipo vem do join com o catálogo, depois
// da página, por chave primária.
export function phase3MapResourceGroupPageSql(
  t: (table: string) => string,
  specificationCount: number,
): string {
  const binds = Array.from({ length: specificationCount }, (_, i) => `:spec${i}`).join(', ');
  return `WITH resource_page AS (
            SELECT r.id, r.name, r.status, r.place_id, r.tenant_id, r.resource_specification_id
              FROM ${t('resource_physical')} r
             WHERE r.tenant_id = :tenantId
               AND r.resource_specification_id IN (${binds})
               AND (:lastId IS NULL OR r.id > :lastId)
               AND r.status <> 'terminated'
             ORDER BY r.id
             FETCH FIRST ${PHASE3_MAP_PAGE_SIZE} ROWS ONLY
          ), resolved AS (
            SELECT /*+ USE_NL(place_site) USE_NL(place_address) */
                   r.id, r.name, r.status, r.tenant_id, r.resource_specification_id,
                   COALESCE(place_site.geographic_location_id, place_address.geographic_location_id, r.place_id) AS location_id
              FROM resource_page r
              LEFT JOIN ${t('geographic_site')} place_site
                ON place_site.id = r.place_id AND place_site.tenant_id = r.tenant_id
              LEFT JOIN ${t('geographic_address')} place_address
                ON place_address.id = r.place_id AND place_address.tenant_id = r.tenant_id
          )
          SELECT /*+ USE_NL(l) */
                 r.id AS "ID", r.name AS "NAME", 'resource' AS "FEATURE_KIND",
                 'PhysicalResource' AS "ENTITY_TYPE", rt.code AS "TYPE_CODE", NULL AS "SITE_CATEGORY",
                 'RESOURCE_TYPE' AS "SOURCE_MODEL_TYPE", rt.code AS "SOURCE_MODEL_ID", r.status AS "STATUS",
                 NULL AS "SUBLABEL", l.geometry_type AS "GEOMETRY_TYPE", l.geometry AS "GEOMETRY"
            FROM resolved r
            JOIN ${t('resource_specification')} rs ON rs.id = r.resource_specification_id
            JOIN ${t('resource_type')} rt ON rt.id = rs.resource_type_id
            LEFT JOIN ${t('geographic_location')} l
              ON l.id = r.location_id AND l.tenant_id = r.tenant_id
           ORDER BY r.id`;
}

// Uma só agregação sobre o índice devolve a contagem de todas as specifications; serve ao total do
// progresso e ao planejamento dos grupos (quais specifications são pequenas).
export function phase3MapResourceCountsBySpecificationSql(t: (table: string) => string): string {
  return `SELECT r.resource_specification_id AS "SPECIFICATION_ID", COUNT(*) AS "TOTAL"
            FROM ${t('resource_physical')} r
           WHERE r.tenant_id = :tenantId
             AND r.status <> 'terminated'
           GROUP BY r.resource_specification_id`;
}

// Specifications com ao menos uma página cheia ficam sozinhas (já amortizam o custo fixo e mantêm o
// plano de consulta medido); as menores são agrupadas até PHASE3_GROUP_MAX_CANDIDATES candidatos ou
// PHASE3_GROUP_MAX_SPECIFICATIONS binds. Specifications vazias também são percorridas, pois podem
// receber recursos entre a contagem e a leitura.
export type Phase3ScanUnit =
  | { kind: 'single'; specification: { ID: string; TYPE_CODE: string } }
  | { kind: 'group'; specificationIds: string[] };

export function planPhase3ScanUnits(
  specifications: { ID: string; TYPE_CODE: string }[],
  countBySpecification: ReadonlyMap<string, number>,
): Phase3ScanUnit[] {
  const units: Phase3ScanUnit[] = [];
  let group: { ID: string; TYPE_CODE: string }[] = [];
  let groupCandidates = 0;
  const flush = () => {
    if (group.length === 1) units.push({ kind: 'single', specification: group[0]! });
    else if (group.length > 1) {
      units.push({ kind: 'group', specificationIds: group.map((s) => s.ID) });
    }
    group = [];
    groupCandidates = 0;
  };
  for (const specification of specifications) {
    const count = countBySpecification.get(specification.ID) ?? 0;
    if (count >= PHASE3_MAP_PAGE_SIZE) {
      units.push({ kind: 'single', specification });
      continue;
    }
    if (
      group.length >= PHASE3_GROUP_MAX_SPECIFICATIONS ||
      groupCandidates + count > PHASE3_GROUP_MAX_CANDIDATES
    ) {
      flush();
    }
    group.push(specification);
    groupCandidates += count;
  }
  flush();
  return units;
}

export function phase3MapSitePageSql(t: (table: string) => string): string {
  return `SELECT s.id AS "ID", s.name AS "NAME", 'site' AS "FEATURE_KIND",
                 'GeographicSite' AS "ENTITY_TYPE", NULL AS "TYPE_CODE", spec.category AS "SITE_CATEGORY",
                 'GEOGRAPHIC_SITE_SPECIFICATION' AS "SOURCE_MODEL_TYPE", spec.code AS "SOURCE_MODEL_ID",
                 s.status AS "STATUS", spec.code AS "SUBLABEL", l.geometry_type AS "GEOMETRY_TYPE", l.geometry AS "GEOMETRY"
            FROM ${t('geographic_site')} s
            JOIN ${t('geographic_site_specification')} spec ON spec.id = s.site_specification_id
            JOIN ${t('geographic_location')} l
              ON l.id = s.geographic_location_id AND l.tenant_id = s.tenant_id
           WHERE s.tenant_id = :tenantId
             AND (:lastId IS NULL OR s.id > :lastId)
             AND spec.category = 'Site'
             AND s.status NOT IN ('Retired', 'terminated')
             AND l.geometry_type = 'Point'
             AND NOT EXISTS (
               SELECT 1 FROM ${t('project_site')} ps
               JOIN ${t('project')} p ON p.id = ps.project_id
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
            FROM ${t('resource_physical')} r
           WHERE r.tenant_id = :tenantId
             AND r.resource_specification_id = :specificationId
             AND r.status <> 'terminated'`;
}

// Espelha `phase3MapSitePageSql`. Aqui os JOINs são INNER e o NOT EXISTS filtra de fato, então
// todos precisam ser replicados para a contagem bater com o que a paginação vai percorrer.
export function phase3MapSiteCountSql(t: (table: string) => string): string {
  return `SELECT COUNT(*) AS "TOTAL"
            FROM ${t('geographic_site')} s
            JOIN ${t('geographic_site_specification')} spec ON spec.id = s.site_specification_id
            JOIN ${t('geographic_location')} l
              ON l.id = s.geographic_location_id AND l.tenant_id = s.tenant_id
           WHERE s.tenant_id = :tenantId
             AND spec.category = 'Site'
             AND s.status NOT IN ('Retired', 'terminated')
             AND l.geometry_type = 'Point'
             AND NOT EXISTS (
               SELECT 1 FROM ${t('project_site')} ps
               JOIN ${t('project')} p ON p.id = ps.project_id
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

export function phase3IncrementalResourcePageSql(t: (table: string) => string): string {
  return `WITH changed AS (
            SELECT r.id, r.name, r.status, r.place_id, r.tenant_id,
                   r.resource_specification_id, r.updated_at
              FROM ${t('resource_physical')} r
             WHERE r.tenant_id = :tenantId
               AND r.updated_at >= :updatedSince
               AND r.updated_at < :updatedBefore
               AND (
                 SYS_EXTRACT_UTC(r.updated_at) > TO_TIMESTAMP(:lastUpdatedKey, '${INCREMENTAL_CURSOR_FORMAT}') OR
                 (SYS_EXTRACT_UTC(r.updated_at) = TO_TIMESTAMP(:lastUpdatedKey, '${INCREMENTAL_CURSOR_FORMAT}') AND r.id > :lastId)
               )
               AND (
                 r.place_id IS NOT NULL OR EXISTS (
                   SELECT 1 FROM ${t('geographic_map_feature')} f
                    WHERE f.tenant_id = r.tenant_id AND f.feature_kind = 'resource'
                      AND f.entity_id = r.id
                 )
               )
             ORDER BY SYS_EXTRACT_UTC(r.updated_at), r.id
             FETCH FIRST ${PHASE3_MAP_PAGE_SIZE} ROWS ONLY
          ), resolved AS (
            SELECT /*+ USE_NL(place_site) USE_NL(place_address) */
                   r.id, r.name, r.status, r.tenant_id, r.updated_at,
                   COALESCE(place_site.geographic_location_id, place_address.geographic_location_id, r.place_id) AS location_id,
                   rt.code AS type_code,
                   CASE
                     WHEN r.status <> 'terminated'
                      AND ${excludeInternalResourceTypesSql('rt')}
                      AND COALESCE(rt.map_presence, 1) = 1
                     THEN 1 ELSE 0
                   END AS visible
              FROM changed r
              LEFT JOIN ${t('resource_specification')} rs
                ON rs.id = r.resource_specification_id AND rs.tenant_id = r.tenant_id
              LEFT JOIN ${t('resource_type')} rt ON rt.id = rs.resource_type_id
              LEFT JOIN ${t('geographic_site')} place_site
                ON place_site.id = r.place_id AND place_site.tenant_id = r.tenant_id
              LEFT JOIN ${t('geographic_address')} place_address
                ON place_address.id = r.place_id AND place_address.tenant_id = r.tenant_id
          )
          SELECT /*+ USE_NL(l) */
                 r.id AS "ID", r.name AS "NAME", 'resource' AS "FEATURE_KIND",
                 'PhysicalResource' AS "ENTITY_TYPE", r.type_code AS "TYPE_CODE", NULL AS "SITE_CATEGORY",
                 'RESOURCE_TYPE' AS "SOURCE_MODEL_TYPE", r.type_code AS "SOURCE_MODEL_ID", r.status AS "STATUS",
                 NULL AS "SUBLABEL",
                 CASE
                   WHEN r.visible = 1 AND l.geometry_type IN ('Point', 'LineString')
                   THEN l.geometry_type ELSE NULL
                 END AS "GEOMETRY_TYPE",
                 CASE
                   WHEN r.visible = 1 AND l.geometry_type IN ('Point', 'LineString')
                   THEN l.geometry ELSE NULL
                 END AS "GEOMETRY",
                 TO_CHAR(SYS_EXTRACT_UTC(r.updated_at), '${INCREMENTAL_CURSOR_FORMAT}') AS "UPDATED_KEY"
            FROM resolved r
            LEFT JOIN ${t('geographic_location')} l
              ON l.id = r.location_id AND l.tenant_id = r.tenant_id
           ORDER BY SYS_EXTRACT_UTC(r.updated_at), r.id`;
}

export function phase3IncrementalSitePageSql(t: (table: string) => string): string {
  return `WITH changed AS (
            SELECT s.id, s.name, s.status, s.site_specification_id,
                   s.geographic_location_id, s.tenant_id, s.updated_at
              FROM ${t('geographic_site')} s
             WHERE s.tenant_id = :tenantId
               AND s.updated_at >= :updatedSince
               AND s.updated_at < :updatedBefore
               AND (
                 SYS_EXTRACT_UTC(s.updated_at) > TO_TIMESTAMP(:lastUpdatedKey, '${INCREMENTAL_CURSOR_FORMAT}') OR
                 (SYS_EXTRACT_UTC(s.updated_at) = TO_TIMESTAMP(:lastUpdatedKey, '${INCREMENTAL_CURSOR_FORMAT}') AND s.id > :lastId)
               )
             ORDER BY SYS_EXTRACT_UTC(s.updated_at), s.id
             FETCH FIRST ${PHASE3_MAP_PAGE_SIZE} ROWS ONLY
          )
          SELECT s.id AS "ID", s.name AS "NAME", 'site' AS "FEATURE_KIND",
                 'GeographicSite' AS "ENTITY_TYPE", NULL AS "TYPE_CODE", spec.category AS "SITE_CATEGORY",
                 'GEOGRAPHIC_SITE_SPECIFICATION' AS "SOURCE_MODEL_TYPE", spec.code AS "SOURCE_MODEL_ID",
                 s.status AS "STATUS", spec.code AS "SUBLABEL",
                 CASE
                   WHEN spec.category = 'Site'
                    AND s.status NOT IN ('Retired', 'terminated')
                    AND l.geometry_type = 'Point'
                    AND NOT EXISTS (
                      SELECT 1 FROM ${t('project_site')} ps
                      JOIN ${t('project')} p ON p.id = ps.project_id
                     WHERE ps.site_id = s.id AND p.status <> 'terminated'
                    )
                   THEN l.geometry_type ELSE NULL
                 END AS "GEOMETRY_TYPE",
                 CASE
                   WHEN spec.category = 'Site'
                    AND s.status NOT IN ('Retired', 'terminated')
                    AND l.geometry_type = 'Point'
                    AND NOT EXISTS (
                      SELECT 1 FROM ${t('project_site')} ps
                      JOIN ${t('project')} p ON p.id = ps.project_id
                     WHERE ps.site_id = s.id AND p.status <> 'terminated'
                    )
                   THEN l.geometry ELSE NULL
                 END AS "GEOMETRY",
                 TO_CHAR(SYS_EXTRACT_UTC(s.updated_at), '${INCREMENTAL_CURSOR_FORMAT}') AS "UPDATED_KEY"
            FROM changed s
            LEFT JOIN ${t('geographic_site_specification')} spec ON spec.id = s.site_specification_id
            LEFT JOIN ${t('geographic_location')} l
              ON l.id = s.geographic_location_id AND l.tenant_id = s.tenant_id
           ORDER BY SYS_EXTRACT_UTC(s.updated_at), s.id`;
}

function indexWithPrefix(
  rows: readonly IndexColumn[],
  expectedColumns: readonly string[],
): string | null {
  const byIndex = new Map<string, IndexColumn[]>();
  for (const row of rows) {
    const columns = byIndex.get(row.INDEX_NAME) ?? [];
    columns.push(row);
    byIndex.set(row.INDEX_NAME, columns);
  }
  for (const [indexName, columns] of byIndex) {
    const prefix = columns
      .sort((left, right) => left.COLUMN_POSITION - right.COLUMN_POSITION)
      .slice(0, expectedColumns.length)
      .map((column) => column.COLUMN_NAME.toUpperCase());
    if (prefix.join(',') === expectedColumns.join(',')) return indexName;
  }
  return null;
}

export function hasPhase3ResourceScanIndex(rows: readonly IndexColumn[]): string | null {
  return indexWithPrefix(rows, PHYSICAL_RESOURCE_INDEX_COLUMNS);
}

export function hasPhase3IncrementalIndex(
  rows: readonly IndexColumn[],
  expectedColumns: readonly string[],
): string | null {
  return indexWithPrefix(rows, expectedColumns);
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
    lod_key: MAP_BASE_LOD_KEY,
    rank: 0,
  };
}

export function phase3MapFeaturesForCandidate(
  tenantId: string,
  candidate: Candidate,
  lineTiling?: ReadonlyMap<string, LineLodProfile[]>,
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
  return tileSegmentsForLineLods(
    line,
    lineTiling?.get(candidate.SOURCE_MODEL_ID ?? candidate.TYPE_CODE ?? ''),
  ).map(({ tile, coordinates, rank, lodKey }) => {
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
      lod_key: lodKey,
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
  const sql = `INSERT INTO ${ctx.t('geographic_map_feature')} (${FEATURE_COLUMNS.map((column) => `"${column.toUpperCase()}"`).join(',')}) VALUES (${FEATURE_COLUMNS.map((_, index) => `:${index + 1}`).join(',')})`;
  for (const partition of Object.values(partitionByBindWidth(columns, rows))) {
    if (partition.length === 0) continue;
    await conn.executeMany(
      sql,
      partition.map((row) => columns.map((column) => row[column] ?? null)),
      { autoCommit: false, bindDefs: bulkMergeBindDefs(columns, partition) },
    );
  }
}

function addDensityTile(
  densityTiles: Set<string>,
  tileZ: number,
  tileX: number,
  tileY: number,
): void {
  for (const zoom of MAP_DENSITY_ZOOMS) {
    if (tileZ < zoom) continue;
    const factor = 2 ** (tileZ - zoom);
    densityTiles.add(`${zoom}:${Math.floor(tileX / factor)}:${Math.floor(tileY / factor)}`);
  }
}

function addDensityTiles(densityTiles: Set<string>, rows: FeatureRow[]): void {
  for (const row of rows) {
    addDensityTile(densityTiles, Number(row.tile_z), Number(row.tile_x), Number(row.tile_y));
  }
}

export function densityTileCoordinates(key: string): { zoom: number; x: number; y: number } {
  const [zoom, x, y] = key.split(':').map(Number);
  if (![zoom, x, y].every(Number.isFinite)) throw new Error(`Célula de densidade inválida: ${key}`);
  return { zoom: zoom!, x: x!, y: y! };
}

type CandidateScan = Omit<Phase3MapStats, 'densityCells'> & {
  densityTiles: Set<string>;
  resources: number;
  sites: number;
  timings: Phase3Timings;
};

async function tableIndexColumns(conn: Connection, tableName: string): Promise<IndexColumn[]> {
  const result = await conn.execute<RawIndexColumn>(
    `SELECT c.index_name AS "INDEX_NAME", c.column_name AS "COLUMN_NAME",
            c.column_position AS "COLUMN_POSITION", e.column_expression AS "COLUMN_EXPRESSION"
       FROM user_ind_columns c
       LEFT JOIN user_ind_expressions e
         ON e.index_name = c.index_name AND e.column_position = c.column_position
      WHERE c.table_name = :tableName
      ORDER BY c.index_name, c.column_position`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows ?? []).map(resolveVirtualIndexColumn);
}

type RawIndexColumn = IndexColumn & { COLUMN_EXPRESSION?: string | null };

// TIMESTAMP WITH TIME ZONE é indexado por coluna virtual (SYS_NC…$ = SYS_EXTRACT_UTC("COL")).
export function resolveVirtualIndexColumn(row: RawIndexColumn): IndexColumn {
  const base = {
    INDEX_NAME: row.INDEX_NAME,
    COLUMN_NAME: row.COLUMN_NAME,
    COLUMN_POSITION: row.COLUMN_POSITION,
  };
  const wrapped = /^SYS_EXTRACT_UTC\(\s*"([^"]+)"\s*\)$/iu.exec(
    row.COLUMN_EXPRESSION?.trim() ?? '',
  );
  return wrapped?.[1] ? { ...base, COLUMN_NAME: wrapped[1] } : base;
}

async function ensureResourceScanIndex(conn: Connection, ctx: MigrationContext): Promise<void> {
  const tableName = oracleDictionaryObjectName(ctx.t('resource_physical'));
  const indexName = hasPhase3ResourceScanIndex(await tableIndexColumns(conn, tableName));
  if (!indexName) {
    throw new Error(
      `Rebuild de mapa abortado: falta índice ${PHYSICAL_RESOURCE_INDEX_COLUMNS.join(', ')} em ${tableName}. Rode npm run db:migrate para aplicar a migration phase3-map-scan-indexes.`,
    );
  }
  console.log(
    `[Mapa] Índice Oracle confirmado: ${indexName} (${PHYSICAL_RESOURCE_INDEX_COLUMNS.join(', ')}).`,
  );
}

async function ensureIncrementalIndexes(conn: Connection, ctx: MigrationContext): Promise<void> {
  for (const requirement of INCREMENTAL_INDEXES) {
    const tableName = oracleDictionaryObjectName(ctx.t(requirement.table));
    const indexName = hasPhase3IncrementalIndex(
      await tableIndexColumns(conn, tableName),
      requirement.columns,
    );
    if (!indexName) {
      throw new Error(
        `Fase 3.A incremental abortada: falta índice ${requirement.columns.join(', ')} em ${tableName}. Rode npm run db:migrate para aplicar a migration phase3-map-incremental-indexes.`,
      );
    }
    console.log(
      `[Mapa] Índice incremental confirmado: ${indexName} (${requirement.columns.join(', ')}).`,
    );
  }
}

const MAP_INDEX_TABLES = ['geographic_map_feature', 'geographic_map_density'] as const;

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
async function tableNormalIndexes(
  conn: Connection,
  tableName: string,
): Promise<PlainIndexStatus[]> {
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
async function disableMapIndexes(
  conn: Connection,
  ctx: MigrationContext,
  table: string,
): Promise<void> {
  const tableName = oracleDictionaryObjectName(ctx.t(table));
  for (const { constraintName, enabled, indexName } of await tableUniqueConstraints(
    conn,
    tableName,
  )) {
    if (!enabled) continue;
    const droppedIndexName = indexName ?? constraintName;
    console.log(
      `[Mapa] Desabilitando constraint ${constraintName} e removendo o índice único ${droppedIndexName} (${tableName}) para a carga em massa.`,
    );
    await conn.execute(
      `ALTER TABLE ${quote(tableName)} DISABLE CONSTRAINT ${quote(constraintName)}`,
    );
    try {
      await conn.execute(`DROP INDEX ${quote(droppedIndexName)}`);
    } catch (error) {
      // ORA-01418: o DISABLE CONSTRAINT acima já removeu o índice (caso implícito — ver
      // comentário da função). Qualquer outro erro é real e deve propagar.
      if (!(error instanceof Error) || !/ORA-01418/.test(error.message)) throw error;
    }
  }
  for (const { indexName } of await tableNormalIndexes(conn, tableName)) {
    console.log(
      `[Mapa] Marcando índice ${indexName} (${tableName}) como UNUSABLE para a carga em massa.`,
    );
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

async function rebuildMapIndexes(
  conn: Connection,
  ctx: MigrationContext,
  table: string,
): Promise<void> {
  const tableName = oracleDictionaryObjectName(ctx.t(table));
  for (const { constraintName, enabled, indexName, columns } of await tableUniqueConstraints(
    conn,
    tableName,
  )) {
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
    console.log(
      `[Mapa] Constraint ${constraintName} (${tableName}) reabilitada em ${Date.now() - startedAt}ms.`,
    );
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
    console.log(
      `[Mapa] Índice ${indexName} (${tableName}) reconstruído em ${Date.now() - startedAt}ms.`,
    );
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
      if (!enabled)
        broken.push({ table, description: `constraint ${constraintName} (${tableName})` });
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
  console.warn(
    `[Mapa] Reparando índice(s)/constraint(s) deixados por execução anterior: ${description}.`,
  );
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

async function scanResourceUnit(
  conn: Connection,
  ctx: MigrationContext,
  unit: Phase3ScanUnit,
  scan: CandidateScan,
  progress: MigrationProgress,
  onFeatures?: (rows: FeatureRow[]) => Promise<void>,
): Promise<void> {
  let lastId: string | null = null;
  const pageSql =
    unit.kind === 'single'
      ? phase3MapResourcePageSql(ctx.t)
      : phase3MapResourceGroupPageSql(ctx.t, unit.specificationIds.length);
  const unitBinds: Record<string, string> =
    unit.kind === 'single'
      ? { specificationId: unit.specification.ID, typeCode: unit.specification.TYPE_CODE }
      : Object.fromEntries(unit.specificationIds.map((id, i) => [`spec${i}`, id]));
  while (true) {
    const queryResult: oracledb.Result<Candidate> = await timed(scan.timings, 'fetchMs', () =>
      conn.execute<Candidate>(
        pageSql,
        {
          tenantId: ctx.options.tenantId,
          ...unitBinds,
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
      ),
    );
    const candidatePage = queryResult.rows ?? [];
    if (candidatePage.length === 0) return;
    scan.timings.pages += 1;
    const transformStartedAt = Date.now();
    const rows: FeatureRow[] = [];
    for (const candidate of candidatePage) {
      scan.candidates += 1;
      scan.resources += 1;
      const generated = phase3MapFeaturesForCandidate(ctx.options.tenantId, candidate, lineTiling);
      if (!generated) scan.skippedGeometry += 1;
      else rows.push(...generated);
    }
    scan.features += rows.length;
    addDensityTiles(scan.densityTiles, rows);
    scan.timings.transformMs += Date.now() - transformStartedAt;
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
    const queryResult: oracledb.Result<Candidate> = await timed(scan.timings, 'fetchMs', () =>
      conn.execute<Candidate>(
        pageSql,
        { tenantId: ctx.options.tenantId, lastId, batchSize: ctx.options.batchSize },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchArraySize: ctx.options.batchSize,
          prefetchRows: ctx.options.batchSize,
        },
      ),
    );
    const candidatePage = queryResult.rows ?? [];
    if (candidatePage.length === 0) return;
    scan.timings.pages += 1;
    const transformStartedAt = Date.now();
    const rows: FeatureRow[] = [];
    for (const candidate of candidatePage) {
      scan.candidates += 1;
      scan.sites += 1;
      const generated = phase3MapFeaturesForCandidate(ctx.options.tenantId, candidate, lineTiling);
      if (!generated) scan.skippedGeometry += 1;
      else rows.push(...generated);
    }
    scan.features += rows.length;
    addDensityTiles(scan.densityTiles, rows);
    scan.timings.transformMs += Date.now() - transformStartedAt;
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
): Promise<{ total: number; countBySpecification: Map<string, number> }> {
  let total = 0;
  const countBySpecification = new Map<string, number>();
  const counts = await conn.execute<{ SPECIFICATION_ID: string; TOTAL: number }>(
    phase3MapResourceCountsBySpecificationSql(ctx.t),
    { tenantId: ctx.options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: 5000 },
  );
  for (const row of counts.rows ?? []) {
    countBySpecification.set(row.SPECIFICATION_ID, Number(row.TOTAL));
  }
  // Só as specifications visíveis entram: Port, Splitter e map_presence=0 não são percorridos.
  for (const specification of specifications) {
    total += countBySpecification.get(specification.ID) ?? 0;
  }
  const siteResult = await conn.execute<{ TOTAL: number }>(
    phase3MapSiteCountSql(ctx.t),
    { tenantId: ctx.options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  total += Number(siteResult.rows?.[0]?.TOTAL ?? 0);
  return { total, countBySpecification };
}

// Carregado uma vez por execução em runPhase3MapFeatures (catálogo publicado do Studio GEO).
let lineTiling: ReadonlyMap<string, LineLodProfile[]> = new Map();

async function scanCandidates(
  conn: Connection,
  ctx: MigrationContext,
  stage: 'validação' | 'gravação',
  units: Phase3ScanUnit[],
  onFeatures?: (rows: FeatureRow[]) => Promise<void>,
  total?: number,
  timings: Phase3Timings = emptyPhase3Timings(),
): Promise<CandidateScan> {
  const scan: CandidateScan = {
    candidates: 0,
    features: 0,
    skippedGeometry: 0,
    densityTiles: new Set<string>(),
    resources: 0,
    sites: 0,
    timings,
  };
  const progress = new MigrationProgress({
    label: `Fase 3.A — ${stage}`,
    unit: 'candidatos',
    reportEvery: ctx.options.batchSize,
    ...(total === undefined ? {} : { total }),
  });
  progress.start();
  for (const unit of units) {
    await scanResourceUnit(conn, ctx, unit, scan, progress, onFeatures);
  }
  await scanSites(conn, ctx, scan, progress, onFeatures);
  progress.finish();
  return scan;
}

async function existingFeatureTiles(
  conn: Connection,
  ctx: MigrationContext,
  featureKind: Candidate['FEATURE_KIND'],
  entityIds: string[],
): Promise<ExistingFeatureTile[]> {
  const result: ExistingFeatureTile[] = [];
  for (let offset = 0; offset < entityIds.length; offset += 900) {
    const chunk = entityIds.slice(offset, offset + 900);
    const binds: Record<string, string> = {
      tenantId: ctx.options.tenantId,
      featureKind,
    };
    const clause = chunk
      .map((id, index) => {
        binds[`id${index}`] = id;
        return `:id${index}`;
      })
      .join(', ');
    const query = await conn.execute<ExistingFeatureTile>(
      `SELECT tile_z AS "TILE_Z", tile_x AS "TILE_X", tile_y AS "TILE_Y"
         FROM ${ctx.t('geographic_map_feature')}
        WHERE tenant_id = :tenantId AND feature_kind = :featureKind
          AND entity_id IN (${clause})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    result.push(...(query.rows ?? []));
  }
  return result;
}

async function deleteExistingFeatures(
  conn: Connection,
  ctx: MigrationContext,
  featureKind: Candidate['FEATURE_KIND'],
  entityIds: string[],
): Promise<number> {
  let removed = 0;
  for (let offset = 0; offset < entityIds.length; offset += 900) {
    const chunk = entityIds.slice(offset, offset + 900);
    const binds: Record<string, string> = {
      tenantId: ctx.options.tenantId,
      featureKind,
    };
    const clause = chunk
      .map((id, index) => {
        binds[`id${index}`] = id;
        return `:id${index}`;
      })
      .join(', ');
    const result = await conn.execute(
      `DELETE FROM ${ctx.t('geographic_map_feature')}
        WHERE tenant_id = :tenantId AND feature_kind = :featureKind
          AND entity_id IN (${clause})`,
      binds,
    );
    removed += result.rowsAffected ?? 0;
  }
  return removed;
}

/**
 * Predicado equivalente a `FLOOR(tile_x/2^(tile_z-zoom))=x AND FLOOR(tile_y/2^(tile_z-zoom))=y`,
 * porém como faixa por `tile_z`, o que permite range scan pela PK (tenant, tile_z, tile_x, tile_y)
 * em vez de varrer todas as features do tenant.
 */
export function densityCellTileRangesSql(zoom: number, x: number, y: number): string {
  const ranges: string[] = [];
  for (let z = zoom; z <= MAP_TILE_ZOOM; z += 1) {
    const span = 2 ** (z - zoom);
    ranges.push(
      `(tile_z=${z} AND tile_x BETWEEN ${x * span} AND ${(x + 1) * span - 1}` +
        ` AND tile_y BETWEEN ${y * span} AND ${(y + 1) * span - 1})`,
    );
  }
  return ranges.join(' OR ');
}

async function rebuildDensityCells(
  conn: Connection,
  ctx: MigrationContext,
  densityTiles: Set<string>,
): Promise<number> {
  let rebuilt = 0;
  for (const key of densityTiles) {
    const { zoom, x, y } = densityTileCoordinates(key);
    const binds = { tenantId: ctx.options.tenantId, zoom, x, y };
    await conn.execute(
      `DELETE FROM ${ctx.t('geographic_map_density')}
        WHERE tenant_id = :tenantId AND tile_z = :zoom AND tile_x = :x AND tile_y = :y`,
      binds,
    );
    const result = await conn.execute(
      `INSERT INTO ${ctx.t('geographic_map_density')}
        (tenant_id,tile_z,tile_x,tile_y,feature_count,resource_count,site_count,lng,lat)
       SELECT tenant_id,:zoom,:x,:y,COUNT(DISTINCT entity_id),
              COUNT(DISTINCT CASE WHEN feature_kind='resource' THEN entity_id END),
              COUNT(DISTINCT CASE WHEN feature_kind='site' THEN entity_id END),AVG(lng),AVG(lat)
         FROM ${ctx.t('geographic_map_feature')}
        WHERE tenant_id=:tenantId AND (${densityCellTileRangesSql(zoom, x, y)})
        GROUP BY tenant_id`,
      binds,
    );
    rebuilt += result.rowsAffected ?? 0;
  }
  return rebuilt;
}

interface IncrementalPage {
  featureKind: Candidate['FEATURE_KIND'];
  entityIds: string[];
  rows: FeatureRow[];
  oldFeatureCount: number;
}

async function scanIncrementalKind(
  conn: Connection,
  ctx: MigrationContext,
  featureKind: Candidate['FEATURE_KIND'],
  pageSql: string,
  updatedSince: Date,
  updatedBefore: Date,
  scan: CandidateScan,
  progress: MigrationProgress,
  emit: (page: IncrementalPage) => Promise<void>,
): Promise<void> {
  // A primeira página usa cursor imediatamente anterior ao corte, preservando a semântica
  // inclusiva de `updated_at >= :updatedSince` sem introduzir OR/NULL no predicado indexável.
  const cursor: IncrementalCursor = {
    updatedKey: incrementalCursorKey(new Date(updatedSince.getTime() - 1)),
    id: '',
  };
  while (true) {
    const result = await timed(scan.timings, 'fetchMs', () =>
      conn.execute<IncrementalCandidate>(
        pageSql,
        {
          tenantId: ctx.options.tenantId,
          updatedSince,
          updatedBefore,
          lastUpdatedKey: cursor.updatedKey,
          lastId: cursor.id,
        },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchArraySize: PHASE3_MAP_PAGE_SIZE,
          prefetchRows: PHASE3_MAP_PAGE_SIZE,
        },
      ),
    );
    scan.timings.pages += 1;
    const candidates = result.rows ?? [];
    if (candidates.length === 0) return;

    const entityIds = candidates.map((candidate) => candidate.ID);
    const oldTiles = await existingFeatureTiles(conn, ctx, featureKind, entityIds);
    for (const tile of oldTiles) {
      addDensityTile(scan.densityTiles, tile.TILE_Z, tile.TILE_X, tile.TILE_Y);
    }

    const rows: FeatureRow[] = [];
    for (const candidate of candidates) {
      scan.candidates += 1;
      if (featureKind === 'resource') scan.resources += 1;
      else scan.sites += 1;
      const generated = phase3MapFeaturesForCandidate(ctx.options.tenantId, candidate, lineTiling);
      if (!generated) scan.skippedGeometry += 1;
      else rows.push(...generated);
    }
    scan.features += rows.length;
    addDensityTiles(scan.densityTiles, rows);

    await emit({ featureKind, entityIds, rows, oldFeatureCount: oldTiles.length });

    progress.advance(candidates.length);
    const last = candidates[candidates.length - 1]!;
    cursor.updatedKey = last.UPDATED_KEY;
    cursor.id = last.ID;
  }
}

async function runIncrementalMapFeatures(
  conn: Connection,
  ctx: MigrationContext,
  updatedSince: Date,
): Promise<Phase3MapStats> {
  const updatedBefore = new Date();
  console.log(
    `[Mapa] Janela incremental: [${updatedSince.toISOString()}, ${updatedBefore.toISOString()}).`,
  );
  await ensureIncrementalIndexes(conn, ctx);
  const scan: CandidateScan = {
    candidates: 0,
    features: 0,
    skippedGeometry: 0,
    densityTiles: new Set<string>(),
    resources: 0,
    sites: 0,
    timings: emptyPhase3Timings(),
  };
  const progress = new MigrationProgress({
    label: `Fase 3.A — ${ctx.options.apply ? 'gravação incremental' : 'validação incremental'}`,
    unit: 'entidades',
    reportEvery: ctx.options.batchSize,
  });
  progress.start();
  let removedFeatures = 0;
  const kinds: Array<[Candidate['FEATURE_KIND'], string]> = [
    ['resource', phase3IncrementalResourcePageSql(ctx.t)],
    ['site', phase3IncrementalSitePageSql(ctx.t)],
  ];
  const readAll = async (emit: (page: IncrementalPage) => Promise<void>) => {
    for (const [kind, sql] of kinds) {
      await scanIncrementalKind(
        conn,
        ctx,
        kind,
        sql,
        updatedSince,
        updatedBefore,
        scan,
        progress,
        emit,
      );
    }
  };
  if (!ctx.options.apply) {
    await readAll(async (page) => {
      removedFeatures += page.oldFeatureCount;
    });
  } else {
    // Mesmo pipeline do rebuild completo: leitor (conn) e escritor (writeConn) em sessões
    // distintas, com fila limitada. O leitor só consulta tiles antigos de ids da própria página.
    const writeConn = await ctx.getTargetConnection();
    if (!writeConn) throw new Error('Conexão de escrita indisponível para --apply.');
    try {
      await runBoundedPipeline<IncrementalPage>(PHASE3_PIPELINE_DEPTH, readAll, async (page) => {
        await timed(scan.timings, 'insertMs', async () => {
          removedFeatures += await deleteExistingFeatures(
            writeConn,
            ctx,
            page.featureKind,
            page.entityIds,
          );
          await insertFeatures(writeConn, ctx, page.rows);
        });
        await timed(scan.timings, 'commitMs', () => writeConn.execute('COMMIT'));
      });
    } finally {
      await writeConn.close();
    }
  }
  progress.finish();
  console.log(formatPhase3Timings(scan.timings, scan.candidates));

  if (scan.candidates === 0) {
    console.log('[Mapa] nenhuma entidade alterada na janela; projeções vigentes preservadas.');
    return { candidates: 0, features: 0, skippedGeometry: 0, densityCells: 0 };
  }

  const densityCells = ctx.options.apply
    ? await rebuildDensityCells(conn, ctx, scan.densityTiles)
    : scan.densityTiles.size;
  if (ctx.options.apply) await conn.execute('COMMIT');
  console.log(
    `[Mapa] incremental: recursos=${scan.resources}; sites=${scan.sites}; features removidas=${removedFeatures}; features geradas=${scan.features}; geometrias/invisíveis sem feature=${scan.skippedGeometry}; células de densidade afetadas=${scan.densityTiles.size}; células materializadas=${densityCells}.`,
  );
  return {
    candidates: scan.candidates,
    features: scan.features,
    skippedGeometry: scan.skippedGeometry,
    densityCells,
  };
}

async function rebuildDensity(conn: Connection, ctx: MigrationContext): Promise<number> {
  let densityCells = 0;
  for (const zoom of MAP_DENSITY_ZOOMS) {
    // Linhas indexadas em z < MAP_TILE_ZOOM (zoom por camada) entram só nos níveis de densidade
    // iguais ou mais grossos que o seu z; o fator é relativo ao tile_z de cada linha.
    const result = await conn.execute(
      `INSERT INTO ${ctx.t('geographic_map_density')}
        (tenant_id,tile_z,tile_x,tile_y,feature_count,resource_count,site_count,lng,lat)
        SELECT tenant_id,${zoom},FLOOR(tile_x/POWER(2,tile_z-${zoom})),FLOOR(tile_y/POWER(2,tile_z-${zoom})),COUNT(DISTINCT entity_id),
               COUNT(DISTINCT CASE WHEN feature_kind='resource' THEN entity_id END),
               COUNT(DISTINCT CASE WHEN feature_kind='site' THEN entity_id END),AVG(lng),AVG(lat)
          FROM ${ctx.t('geographic_map_feature')}
         WHERE tenant_id=:tenantId AND tile_z>=${zoom}
         GROUP BY tenant_id,FLOOR(tile_x/POWER(2,tile_z-${zoom})),FLOOR(tile_y/POWER(2,tile_z-${zoom}))`,
      { tenantId: ctx.options.tenantId },
    );
    densityCells += result.rowsAffected ?? 0;
  }
  return densityCells;
}

async function replaceDensity(conn: Connection, ctx: MigrationContext): Promise<number> {
  await disableMapIndexes(conn, ctx, 'geographic_map_density');
  await conn.execute(`DELETE FROM ${ctx.t('geographic_map_density')} WHERE tenant_id=:tenantId`, {
    tenantId: ctx.options.tenantId,
  });
  const densityCells = await rebuildDensity(conn, ctx);
  await rebuildMapIndexes(conn, ctx, 'geographic_map_density');
  return densityCells;
}

/**
 * Recalcula só a densidade do tenant a partir das features vigentes (`--phase 3d`). Serve para
 * fechar uma Fase 3.A incremental interrompida: o conjunto de tiles afetados vive em memória e
 * se perde com o processo, então a densidade parcial não pode ser retomada.
 */
export async function runPhase3MapDensity(ctx: MigrationContext): Promise<number> {
  const conn = await ctx.getTargetReadConnection();
  try {
    console.log('\n=== Fase 3.D: Densidade do mapa (recálculo integral) ===');
    await recoverUnusableMapIndexes(conn, ctx);
    if (!ctx.options.apply) {
      const result = await conn.execute<{ FEATURES: number }>(
        `SELECT COUNT(*) AS "FEATURES" FROM ${ctx.t('geographic_map_feature')} WHERE tenant_id=:tenantId`,
        { tenantId: ctx.options.tenantId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const features = Number(result.rows?.[0]?.FEATURES ?? 0);
      console.log(`[Mapa] DRY-RUN: ${features} feature(s) seriam agregadas; densidade preservada.`);
      return 0;
    }
    await conn.execute(`ALTER SESSION SET SKIP_UNUSABLE_INDEXES = TRUE`);
    try {
      const densityCells = await replaceDensity(conn, ctx);
      await conn.execute('COMMIT');
      console.log(`[Mapa] células de densidade=${densityCells}.`);
      return densityCells;
    } catch (error) {
      console.error('[Mapa] Falha no recálculo da densidade; erro original:', error);
      try {
        await rebuildMapIndexes(conn, ctx, 'geographic_map_density');
      } catch (rebuildError) {
        console.error('[Mapa] Rebuild de emergência falhou:', rebuildError);
      }
      try {
        await conn.execute('ROLLBACK');
      } catch (rollbackError) {
        console.error('[Mapa] ROLLBACK falhou (conexão já encerrada):', rollbackError);
      }
      throw error;
    }
  } finally {
    await conn.close();
  }
}

export async function runPhase3MapFeatures(ctx: MigrationContext): Promise<Phase3MapStats> {
  const conn = await ctx.getTargetReadConnection();
  try {
    console.log('\n=== Fase 3.A: Índices de mapa e densidade ===');
    lineTiling = await loadPublishedLineTiling(conn, ctx.t, ctx.options.tenantId);
    console.log(`[Mapa] ${lineTiling.size} camada(s) de linha com perfis de LOD do Studio.`);
    await recoverUnusableMapIndexes(conn, ctx);
    if (ctx.options.updatedSince) {
      return await runIncrementalMapFeatures(conn, ctx, ctx.options.updatedSince);
    }
    await ensureResourceScanIndex(conn, ctx);
    await reportStatistics(conn, ctx);
    const specifications = await visibleSpecifications(conn, ctx);
    console.log(
      `[Mapa] ${specifications.length} ResourceSpecification(s) visíveis; Port, Splitter e tipos map_presence=0 não são consultados.`,
    );
    const { total: expectedCandidates, countBySpecification } = await countCandidates(
      conn,
      ctx,
      specifications,
    );
    const scanUnits = planPhase3ScanUnits(specifications, countBySpecification);
    console.log(
      `[Mapa] ${scanUnits.length} unidade(s) de leitura (specifications pequenas agrupadas).`,
    );
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
      scan = await scanCandidates(conn, ctx, 'validação', scanUnits, undefined, expectedCandidates);
      console.log(formatPhase3Timings(scan.timings, scan.candidates));
      densityCells = scan.densityTiles.size;
    } else {
      // Commit por página: uma queda de conexão no meio do rebuild deixa de descartar horas de
      // trabalho. O preço é uma janela em que o mapa mostra estado misto (parte novo, parte
      // antigo) — aceitável porque o mapa é o único consumidor destas projeções.
      await conn.execute(`ALTER SESSION SET SKIP_UNUSABLE_INDEXES = TRUE`);
      let pendingSinceCommit = 0;
      let writeConn: Connection | null = null;
      try {
        // disableMapIndexes e o DELETE entram no try: se qualquer um falhar (ex.: ORA-01502 por
        // um índice de constraint que não foi desabilitado corretamente), o catch ainda tenta o
        // rebuild de emergência antes de propagar — sem isso, um erro aqui deixava o índice
        // UNUSABLE sem nenhuma tentativa de reparo até a próxima execução.
        await disableMapIndexes(conn, ctx, 'geographic_map_feature');
        await conn.execute(
          `DELETE FROM ${ctx.t('geographic_map_feature')} WHERE tenant_id=:tenantId`,
          {
            tenantId: ctx.options.tenantId,
          },
        );
        await conn.execute('COMMIT');
        // Leitor (conn) e escritor (writeConn) em sessões distintas: o DELETE e o DDL acima já
        // foram confirmados, então o escritor não herda locks pendentes do leitor.
        writeConn = await ctx.getTargetConnection();
        if (!writeConn) throw new Error('Conexão de escrita indisponível para --apply.');
        const writer = writeConn;
        await writer.execute(`ALTER SESSION SET SKIP_UNUSABLE_INDEXES = TRUE`);
        const timings = emptyPhase3Timings();
        let scanned: CandidateScan | undefined;
        await runBoundedPipeline<FeatureRow[]>(
          PHASE3_PIPELINE_DEPTH,
          async (emit) => {
            scanned = await scanCandidates(
              conn,
              ctx,
              'gravação',
              scanUnits,
              async (rows) => {
                if (rows.length > 0) await emit(rows);
              },
              expectedCandidates,
              timings,
            );
          },
          async (rows) => {
            await timed(timings, 'insertMs', () => insertFeatures(writer, ctx, rows));
            pendingSinceCommit += rows.length;
            if (shouldCommitMigrationBatch(pendingSinceCommit, ctx.options.batchSize)) {
              await timed(timings, 'commitMs', () => writer.execute('COMMIT'));
              pendingSinceCommit = 0;
            }
          },
          async () => {
            if (pendingSinceCommit > 0) {
              await timed(timings, 'commitMs', () => writer.execute('COMMIT'));
              pendingSinceCommit = 0;
            }
          },
        );
        scan = scanned!;
        console.log(formatPhase3Timings(timings, scan.candidates));
        if (scan.features === 0) {
          throw new Error('Rebuild de mapa abortado: candidatos elegíveis sem features válidas.');
        }
        await rebuildMapIndexes(conn, ctx, 'geographic_map_feature');
        // A densidade agrega a tabela inteira, então só pode ser reconstruída depois que todas as
        // features existem — permanece um passo final único, junto do commit que o fecha.
        densityCells = await replaceDensity(conn, ctx);
        await conn.execute('COMMIT');
      } catch (error) {
        // Paliativo de disponibilidade: tenta deixar os índices VALID mesmo no caminho de erro,
        // sem mascarar o erro original. Se isto também falhar, o backstop real é
        // recoverUnusableMapIndexes na próxima execução.
        // O erro original é registrado antes: se a conexão do leitor caiu, o rebuild e o ROLLBACK
        // abaixo também falham e, sem este log, a causa real ficava escondida.
        console.error('[Mapa] Falha na reconstrução; erro original:', error);
        for (const table of MAP_INDEX_TABLES) {
          try {
            await rebuildMapIndexes(conn, ctx, table);
          } catch (rebuildError) {
            console.error('[Mapa] Rebuild de emergência falhou:', rebuildError);
          }
        }
        try {
          await conn.execute('ROLLBACK');
        } catch (rollbackError) {
          console.error('[Mapa] ROLLBACK falhou (conexão já encerrada):', rollbackError);
        }
        throw error;
      } finally {
        // close() descarta qualquer transação do escritor ainda não confirmada.
        await writeConn?.close();
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
