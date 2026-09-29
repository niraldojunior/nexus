import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { MigrationContext } from './context.js';
import { bulkMergeRows } from '../netwin-migration-kit.js';
import { deterministicUuid, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import {
  aggregateCells,
  COVERAGE_CELL_METERS,
  COVERAGE_CITY_CELL_METERS,
  COVERAGE_MIN_COMPONENT_CELLS,
  COVERAGE_RADIUS_METERS,
  COVERAGE_SMOOTH_ITERATIONS,
  COVERAGE_UF_CELL_METERS,
  neighborhoodStats,
  stampCells,
  tracePolygonsFromCells,
  type CdoPoint,
  type CoverageComponent,
  type NeighborhoodStat,
} from '../../modules/geo/coverage-grid.js';

type CdoRow = {
  ID: string;
  NAME: string;
  STATUS: string;
  GEOMETRY: string;
  LOCALITY: string | null;
  CITY: string | null;
  UF: string | null;
  STREET_NR: string | null;
};
type Level = 'neighborhood' | 'city' | 'uf';
export type CoverageStats = { cdos: number; polygons: number; cells: number };

type GeneratedCoverage = {
  locations: Array<Record<string, unknown>>;
  sites: Array<Record<string, unknown>>;
  areas: Array<Record<string, unknown>>;
  cells: Array<Record<string, unknown>>;
};

const SPEC_CODE = 'GPON_COVERAGE';
const SPEC_ID = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `SITE_SPEC:${SPEC_CODE}`);

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function neighborhoodOf(row: CdoRow): string {
  const locality = clean(row.LOCALITY);
  return !locality || /^\d+$/u.test(locality) || locality === clean(row.STREET_NR)
    ? 'Sem bairro'
    : locality;
}

function levelLabel(level: Level): string {
  if (level === 'neighborhood') return 'Bairro';
  if (level === 'city') return 'Município';
  return 'UF';
}

function coverageChars(stat: NeighborhoodStat, level: Level): string {
  return JSON.stringify([
    { group: '_coverage', name: 'kind', value: 'GponCoverage', valueType: 'string' },
    { group: '_coverage', name: 'level', value: level, valueType: 'string' },
    { group: '_coverage', name: 'areaKey', value: stat.key, valueType: 'string' },
    { group: '_coverage', name: 'neighborhoodKey', value: stat.key, valueType: 'string' },
    { group: '_coverage', name: 'neighborhood', value: stat.neighborhood, valueType: 'string' },
    { group: '_coverage', name: 'city', value: stat.city, valueType: 'string' },
    { group: '_coverage', name: 'uf', value: stat.uf, valueType: 'string' },
    { group: '_coverage', name: 'cdoTotal', value: stat.cdoTotal, valueType: 'integer' },
    { group: '_coverage', name: 'cdoAvailable', value: stat.cdoAvailable, valueType: 'integer' },
    {
      group: '_coverage',
      name: 'cdoUnavailable',
      value: Math.max(0, stat.cdoTotal - stat.cdoAvailable),
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'availabilityRatio',
      value: stat.availabilityRatio,
      valueType: 'decimal',
    },
    {
      group: '_coverage',
      name: 'coveredAreaKm2',
      value: stat.coveredAreaKm2,
      valueType: 'decimal',
    },
    {
      group: '_coverage',
      name: 'radiusMeters',
      value: COVERAGE_RADIUS_METERS,
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'cellMeters',
      value:
        level === 'neighborhood'
          ? COVERAGE_CELL_METERS
          : level === 'city'
            ? COVERAGE_CITY_CELL_METERS
            : COVERAGE_UF_CELL_METERS,
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'smoothIterations',
      value: COVERAGE_SMOOTH_ITERATIONS,
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'minComponentCells',
      value: level === 'neighborhood' ? COVERAGE_MIN_COMPONENT_CELLS : 1,
      valueType: 'integer',
    },
    { group: '_origin', name: 'system', value: 'Nexus Netwin Phase 3', valueType: 'string' },
    { group: '_origin', name: 'entity', value: 'derivedGponCoverage', valueType: 'string' },
  ]);
}

function bounds(geometry: CoverageComponent['geometry']) {
  const ring = geometry.coordinates[0] ?? [];
  return (ring as Array<[number, number]>).reduce(
    (out, [lng, lat]) => ({
      minLng: Math.min(out.minLng, lng),
      minLat: Math.min(out.minLat, lat),
      maxLng: Math.max(out.maxLng, lng),
      maxLat: Math.max(out.maxLat, lat),
    }),
    { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity },
  );
}

function levelConfig(level: Level) {
  if (level === 'neighborhood') {
    return {
      cellMeters: COVERAGE_CELL_METERS,
      minCells: COVERAGE_MIN_COMPONENT_CELLS,
      keyOf: (key: string) => key,
      prefix: 'GPON:',
    };
  }
  if (level === 'city') {
    return {
      cellMeters: COVERAGE_CITY_CELL_METERS,
      minCells: 1,
      keyOf: (key: string) => key.split('|').slice(0, 2).join('|'),
      prefix: 'GPON-CITY:',
    };
  }
  return {
    cellMeters: COVERAGE_UF_CELL_METERS,
    minCells: 1,
    keyOf: (key: string) => key.split('|')[0]!,
    prefix: 'GPON-UF:',
  };
}

export function phase3CdoSourceSql(t: (table: string) => string): string {
  return `SELECT r.id AS "ID", r.name AS "NAME", r.status AS "STATUS", l.geometry AS "GEOMETRY",
                 a.locality AS "LOCALITY", a.city AS "CITY", a.state_or_province AS "UF", a.street_nr AS "STREET_NR"
            FROM ${t('tmf_physical_resource')} r
            JOIN ${t('tmf_resource_specification')} rs
              ON rs.id = r.resource_specification_id AND rs.tenant_id = r.tenant_id
            JOIN ${t('tmf_resource_type')} rt ON rt.id = rs.resource_type_id
            LEFT JOIN ${t('tmf_geographic_site')} place_site
              ON place_site.id = r.place_id AND place_site.tenant_id = r.tenant_id
            LEFT JOIN ${t('tmf_geographic_address')} place_address
              ON place_address.id = r.place_id AND place_address.tenant_id = r.tenant_id
            JOIN ${t('tmf_geographic_location')} l
              ON l.id = COALESCE(place_site.geographic_location_id,place_address.geographic_location_id,r.place_id)
             AND l.tenant_id = r.tenant_id
            LEFT JOIN ${t('tmf_geographic_address')} a
              ON a.id = (
                SELECT address.id
                  FROM ${t('tmf_geographic_address')} address
                 WHERE address.geographic_location_id = l.id
                   AND address.tenant_id = r.tenant_id
                 ORDER BY address.id
                 FETCH FIRST 1 ROWS ONLY
              )
           WHERE r.tenant_id=:tenantId
             AND r.status<>'terminated'
             AND l.geometry_type='Point'
             AND rt.code IN ('category:CDOI','category:CDOE','CTO')
             AND UPPER(r.name) LIKE 'CDO%'`;
}

export function phase3CdoPageSql(t: (table: string) => string): string {
  return `SELECT *
            FROM (${phase3CdoSourceSql(t)}) cdo
           WHERE (:lastId IS NULL OR "ID" > :lastId)
           ORDER BY "ID"
           FETCH FIRST :batchSize ROWS ONLY`;
}

async function resolveSpecId(conn: Connection, ctx: MigrationContext): Promise<string> {
  const existing = await conn.execute<{ ID: string; CATEGORY: string; SITE_ROLE: string | null }>(
    `SELECT id AS "ID", category AS "CATEGORY", site_role AS "SITE_ROLE"
       FROM ${ctx.t('tmf_geographic_site_specification')}
      WHERE code=:1`,
    [SPEC_CODE],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if ((existing.rows?.length ?? 0) > 1) {
    throw new Error(`SiteSpecification ${SPEC_CODE} duplicada.`);
  }
  const row = existing.rows?.[0];
  if (row) {
    if (row.CATEGORY !== 'Region' || row.SITE_ROLE !== 'grouping') {
      throw new Error(`SiteSpecification ${SPEC_CODE} incompatível: esperada Region/grouping.`);
    }
    return row.ID;
  }
  if (ctx.options.apply) {
    await conn.execute(
      `INSERT INTO ${ctx.t('tmf_geographic_site_specification')}
        (id,name,code,category,site_role,lifecycle_status,characteristics,is_bootstrap)
       VALUES (:1,:2,:3,'Region','grouping','Active','[]',0)`,
      [SPEC_ID, 'Cobertura GPON', SPEC_CODE],
    );
  }
  return SPEC_ID;
}

function parseCdo(row: CdoRow): CdoPoint | null {
  try {
    const coordinates = (JSON.parse(row.GEOMETRY) as { coordinates?: unknown }).coordinates;
    if (
      !Array.isArray(coordinates) ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1])
    ) {
      return null;
    }
    const uf = clean(row.UF).toUpperCase() || 'ZZ';
    const city = clean(row.CITY) || 'Sem município';
    const neighborhood = neighborhoodOf(row);
    return {
      lng: Number(coordinates[0]),
      lat: Number(coordinates[1]),
      available: row.STATUS === 'active',
      uf,
      city,
      neighborhood,
      neighborhoodKey: `${uf}|${city}|${neighborhood}`,
    };
  } catch {
    return null;
  }
}

function componentSortKey(component: CoverageComponent): string {
  const areaBounds = bounds(component.geometry);
  const firstCell = [...component.cells].sort(
    (a, b) => a.gridX - b.gridX || a.gridY - b.gridY,
  )[0];
  return [
    component.neighborhoodKey,
    firstCell?.gridX ?? 0,
    firstCell?.gridY ?? 0,
    areaBounds.minLng,
    areaBounds.minLat,
    areaBounds.maxLng,
    areaBounds.maxLat,
    JSON.stringify(component.geometry),
  ].join('|');
}

function deduplicateCells(cells: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const cell of cells) {
    const key = `${cell.grid_size_m}:${cell.grid_x}:${cell.grid_y}`;
    const current = result.get(key);
    if (
      !current ||
      Number(cell.unit_total) > Number(current.unit_total) ||
      (Number(cell.unit_total) === Number(current.unit_total) &&
        String(cell.coverage_area_id) < String(current.coverage_area_id))
    ) {
      result.set(key, cell);
    }
  }
  return [...result.values()];
}

function generateCoverage(
  cdos: CdoPoint[],
  ctx: MigrationContext,
  specId: string = SPEC_ID,
): GeneratedCoverage {
  const fineCells = stampCells(cdos, COVERAGE_CELL_METERS, COVERAGE_RADIUS_METERS);
  const locations: Array<Record<string, unknown>> = [];
  const sites: Array<Record<string, unknown>> = [];
  const areas: Array<Record<string, unknown>> = [];
  const cells: Array<Record<string, unknown>> = [];

  for (const level of ['neighborhood', 'city', 'uf'] as const) {
    const config = levelConfig(level);
    const levelCdos =
      level === 'neighborhood'
        ? cdos
        : cdos.map((cdo) => ({ ...cdo, neighborhoodKey: config.keyOf(cdo.neighborhoodKey) }));
    const statCells =
      level === 'neighborhood'
        ? fineCells
        : fineCells.map((cell) => ({ ...cell, neighborhoodKey: config.keyOf(cell.neighborhoodKey) }));
    const statByKey = new Map(
      neighborhoodStats(levelCdos, statCells, COVERAGE_CELL_METERS).map((stat) => [stat.key, stat]),
    );
    const geometryCells =
      level === 'neighborhood'
        ? fineCells
        : aggregateCells(fineCells, COVERAGE_CELL_METERS, config.cellMeters, config.keyOf);
    const components = tracePolygonsFromCells(geometryCells, config.cellMeters, {
      smoothIterations: COVERAGE_SMOOTH_ITERATIONS,
      minComponentCells: config.minCells,
    }).sort((a, b) => componentSortKey(a).localeCompare(componentSortKey(b)));
    const ordinals = new Map<string, number>();

    for (const component of components) {
      const stat = statByKey.get(component.neighborhoodKey);
      if (!stat) continue;
      const ordinal = ordinals.get(component.neighborhoodKey) ?? 0;
      ordinals.set(component.neighborhoodKey, ordinal + 1);
      const identity = `${ctx.options.tenantId}:${level}:${component.neighborhoodKey}:${ordinal}`;
      const locationId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `GPON_LOCATION:${identity}`);
      const siteId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `GPON_SITE:${identity}`);
      const areaBounds = bounds(component.geometry);
      const chars = coverageChars(stat, level);
      const sourceId = SPEC_CODE;
      locations.push({
        id: locationId,
        tenant_id: ctx.options.tenantId,
        geometry_type: 'Polygon',
        geometry: JSON.stringify(component.geometry),
        spatial_ref: 'EPSG:4326',
        reference_point: `${config.prefix}${component.neighborhoodKey}`.slice(0, 255),
        characteristics: chars,
      });
      sites.push({
        id: siteId,
        tenant_id: ctx.options.tenantId,
        name: `Cobertura GPON — ${levelLabel(level)} ${component.neighborhoodKey}`.slice(0, 255),
        site_specification_id: specId,
        status: 'Active',
        geographic_location_id: locationId,
        related_party: JSON.stringify([
          { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
        ]),
        characteristics: chars,
      });
      areas.push({
        tenant_id: ctx.options.tenantId,
        location_id: locationId,
        source_type: 'GEOGRAPHIC_SITE_SPECIFICATION',
        source_id: sourceId,
        lod_level: level,
        cell_size_m: config.cellMeters,
        min_lng: areaBounds.minLng,
        min_lat: areaBounds.minLat,
        max_lng: areaBounds.maxLng,
        max_lat: areaBounds.maxLat,
        area_key: component.neighborhoodKey,
        neighborhood: level === 'neighborhood' ? stat.neighborhood : null,
        city: level === 'uf' ? null : stat.city,
        uf: stat.uf,
        unit_total: stat.cdoTotal,
        unit_available: stat.cdoAvailable,
        unit_label: 'CDOs',
        covered_area_km2: stat.coveredAreaKm2,
      });
      if (level === 'neighborhood') {
        for (const cell of component.cells) {
          cells.push({
            tenant_id: ctx.options.tenantId,
            grid_size_m: COVERAGE_CELL_METERS,
            grid_x: cell.gridX,
            grid_y: cell.gridY,
            coverage_area_id: locationId,
            unit_total: cell.cdoTotal,
            unit_available: cell.cdoAvailable,
          });
        }
      }
    }
  }
  return { locations, sites, areas, cells: deduplicateCells(cells) };
}

export async function runPhase3Coverage(ctx: MigrationContext): Promise<CoverageStats> {
  const conn = await ctx.getTargetReadConnection();
  try {
    console.log('\n=== Fase 3.B: Cobertura ===');
    const specId = await resolveSpecId(conn, ctx);

    const pageSql = phase3CdoPageSql(ctx.t);
    const cdos: CdoPoint[] = [];
    let lastId: string | null = null;
    while (true) {
      const queryResult: oracledb.Result<CdoRow> = await conn.execute<CdoRow>(
        pageSql,
        { tenantId: ctx.options.tenantId, lastId: lastId ?? null, batchSize: ctx.options.batchSize },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: ctx.options.batchSize },
      );
      const cdoPage: CdoRow[] = queryResult.rows ?? [];
      if (cdoPage.length === 0) break;
      for (const row of cdoPage) {
        const cdo = parseCdo(row);
        if (cdo) cdos.push(cdo);
      }
      lastId = cdoPage[cdoPage.length - 1]!.ID;
    }

    if (cdos.length === 0) {
      console.log('[Cobertura] nenhuma CDO elegível; projeção vigente preservada.');
      return { cdos: 0, polygons: 0, cells: 0 };
    }
    const generated = generateCoverage(cdos, ctx, specId);
    console.log(
      `[Cobertura] CDOs=${cdos.length}; polígonos=${generated.locations.length}; células=${generated.cells.length}.`,
    );
    if (!ctx.options.apply) {
      return { cdos: cdos.length, polygons: generated.locations.length, cells: generated.cells.length };
    }

    try {
      await conn.execute(
        `UPDATE ${ctx.t('tmf_geographic_site')}
            SET status='Retired'
          WHERE tenant_id=:tenantId
            AND site_specification_id=:specId
            AND status<>'Retired'`,
        { tenantId: ctx.options.tenantId, specId },
      );
      await conn.execute(`DELETE FROM ${ctx.t('geo_coverage_cell')} WHERE tenant_id=:tenantId`, {
        tenantId: ctx.options.tenantId,
      });
      await conn.execute(
        `DELETE FROM ${ctx.t('geo_coverage_area')} WHERE tenant_id=:tenantId AND source_type=:sourceType AND source_id=:sourceId`,
        { tenantId: ctx.options.tenantId, sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION', sourceId: SPEC_CODE },
      );
      await bulkMergeRows(
        conn,
        ctx.t,
        'tmf_geographic_location',
        ['id'],
        ['id', 'tenant_id', 'geometry_type', 'geometry', 'spatial_ref', 'reference_point', 'characteristics'],
        generated.locations,
        ctx.options.batchSize,
      );
      await bulkMergeRows(
        conn,
        ctx.t,
        'tmf_geographic_site',
        ['id'],
        [
          'id',
          'tenant_id',
          'name',
          'site_specification_id',
          'status',
          'geographic_location_id',
          'related_party',
          'characteristics',
        ],
        generated.sites,
        ctx.options.batchSize,
      );
      await bulkMergeRows(
        conn,
        ctx.t,
        'geo_coverage_area',
        ['tenant_id', 'location_id'],
        [
          'tenant_id',
          'location_id',
          'source_type',
          'source_id',
          'lod_level',
          'cell_size_m',
          'min_lng',
          'min_lat',
          'max_lng',
          'max_lat',
          'area_key',
          'neighborhood',
          'city',
          'uf',
          'unit_total',
          'unit_available',
          'unit_label',
          'covered_area_km2',
        ],
        generated.areas,
        ctx.options.batchSize,
      );
      await bulkMergeRows(
        conn,
        ctx.t,
        'geo_coverage_cell',
        ['tenant_id', 'grid_size_m', 'grid_x', 'grid_y'],
        [
          'tenant_id',
          'grid_size_m',
          'grid_x',
          'grid_y',
          'coverage_area_id',
          'unit_total',
          'unit_available',
        ],
        generated.cells,
        ctx.options.batchSize,
      );
      await conn.execute('COMMIT');
    } catch (error) {
      await conn.execute('ROLLBACK');
      throw error;
    }
    return { cdos: cdos.length, polygons: generated.locations.length, cells: generated.cells.length };
  } finally {
    await conn.close();
  }
}
