import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { MigrationContext } from './context.js';
import { MigrationProgress } from './progress.js';
import { MAP_DENSITY_ZOOMS, densityFactor } from '../../modules/geo/map-density.js';
import { MAP_TILE_ZOOM, tileForPoint, tileSegmentsForLine } from '../../modules/geo/map-tile.js';
import type { GeoJSONLineString } from '../../modules/geo/domain.js';
import { excludeInternalResourceTypesSql } from '../../modules/geo/map-visibility.js';

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
export function phase3MapResourcePageSql(t: (table: string) => string): string {
  return `WITH resource_page AS (
            SELECT r.id, r.name, r.status, r.place_id, r.tenant_id
              FROM ${t('tmf_physical_resource')} r
             WHERE r.tenant_id = :tenantId
               AND r.resource_specification_id = :specificationId
               AND (:lastId IS NULL OR r.id > :lastId)
               AND r.status <> 'terminated'
             ORDER BY r.id
             FETCH FIRST :batchSize ROWS ONLY
          )
          SELECT r.id AS "ID", r.name AS "NAME", 'resource' AS "FEATURE_KIND",
                 'PhysicalResource' AS "ENTITY_TYPE", :typeCode AS "TYPE_CODE", NULL AS "SITE_CATEGORY",
                 'RESOURCE_TYPE' AS "SOURCE_MODEL_TYPE", :typeCode AS "SOURCE_MODEL_ID", r.status AS "STATUS",
                 NULL AS "SUBLABEL", l.geometry_type AS "GEOMETRY_TYPE", l.geometry AS "GEOMETRY"
            FROM resource_page r
            LEFT JOIN ${t('tmf_geographic_site')} place_site
              ON place_site.id = r.place_id AND place_site.tenant_id = r.tenant_id
            LEFT JOIN ${t('tmf_geographic_address')} place_address
              ON place_address.id = r.place_id AND place_address.tenant_id = r.tenant_id
            LEFT JOIN ${t('tmf_geographic_location')} l
              ON l.id = COALESCE(place_site.geographic_location_id, place_address.geographic_location_id, r.place_id)
             AND l.tenant_id = r.tenant_id
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

async function insertFeatures(
  conn: Connection,
  ctx: MigrationContext,
  rows: FeatureRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const sql = `INSERT INTO ${ctx.t('geo_map_feature')} (${FEATURE_COLUMNS.map((column) => `"${column.toUpperCase()}"`).join(',')}) VALUES (${FEATURE_COLUMNS.map((_, index) => `:${index + 1}`).join(',')})`;
  await conn.executeMany(
    sql,
    rows.map((row) => FEATURE_COLUMNS.map((column) => row[column] ?? null)),
    { autoCommit: false },
  );
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
        batchSize: ctx.options.batchSize,
      },
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

async function scanCandidates(
  conn: Connection,
  ctx: MigrationContext,
  stage: 'validação' | 'gravação',
  specifications: VisibleSpecification[],
  onFeatures?: (rows: FeatureRow[]) => Promise<void>,
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
    await reportStatistics(conn, ctx);
    const specifications = await visibleSpecifications(conn, ctx);
    console.log(
      `[Mapa] ${specifications.length} ResourceSpecification(s) visíveis; Port, Splitter e tipos map_presence=0 não são consultados.`,
    );
    const scan = await scanCandidates(conn, ctx, 'validação', specifications);
    if (scan.candidates === 0) {
      console.log('[Mapa] nenhum candidato elegível; projeções vigentes preservadas.');
      return { candidates: 0, features: 0, skippedGeometry: 0, densityCells: 0 };
    }
    if (scan.features === 0) {
      throw new Error('Rebuild de mapa abortado: candidatos elegíveis sem features válidas.');
    }

    let densityCells = scan.densityTiles.size;
    if (ctx.options.apply) {
      try {
        await conn.execute(`DELETE FROM ${ctx.t('geo_map_feature')} WHERE tenant_id=:tenantId`, {
          tenantId: ctx.options.tenantId,
        });
        const writeScan = await scanCandidates(
          conn,
          ctx,
          'gravação',
          specifications,
          async (rows) => {
            await insertFeatures(conn, ctx, rows);
          },
        );
        if (writeScan.candidates !== scan.candidates || writeScan.features !== scan.features) {
          throw new Error('Rebuild de mapa abortado: a fonte mudou durante a reconstrução.');
        }
        await conn.execute(`DELETE FROM ${ctx.t('geo_map_density')} WHERE tenant_id=:tenantId`, {
          tenantId: ctx.options.tenantId,
        });
        densityCells = await rebuildDensity(conn, ctx);
        await conn.execute('COMMIT');
      } catch (error) {
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
