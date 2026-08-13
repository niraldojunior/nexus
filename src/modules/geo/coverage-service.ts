// Read-model da cobertura GPON por bairro (REQ-MOD01-014) — a fonte do mapa em escala de
// cidade/estado, no lugar dos recursos individuais e dos clusters.
//
// Lê os dois artefatos que `scripts/build-gpon-coverage.mjs` gravou: a grade fina de 150 m
// (geo_gpon_coverage_cell) e os polígonos de bairro (tmf_geographic_location, `reference_point`
// "GPON:"). Existe separado de `GeoService`/`GeoTreeService` pelo mesmo motivo da árvore: é
// projeção de leitura que cruza módulos, fora do contrato TMF, então fala direto com o
// `DatabaseClient`.
//
// O recorte por viewport reusa o índice inteiro da grade: o bbox em lng/lat é convertido para
// coordenadas de célula (Web Mercator) e a consulta filtra por `grid_x/grid_y BETWEEN`, tanto
// para as células quanto para descobrir quais polígonos tocam a área (via os coverage_area_id
// distintos das células ali dentro). Nada de teste de interseção de polígono em SQL.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { GeoJSONPolygon } from './domain.js';
import { COVERAGE_CELL_METERS, COVERAGE_COARSE_FACTOR, lngLatToMercator } from './coverage-grid.js';

export type CoverageLevel = 'fine' | 'coarse' | 'area';

export type CoverageBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

// Estatística do bairro exposta ao mapa (balão de hover). `portsTotal`/`portsUsed` ficam
// null até o takeup existir; `areaIds` liga o bairro aos polígonos que o desenham.
export type CoverageNeighborhood = {
  id: number;
  areaIds: string[];
  neighborhoodKey: string;
  neighborhood: string;
  city: string;
  uf: string;
  cdoTotal: number;
  cdoAvailable: number;
  cdoUnavailable: number;
  availabilityRatio: number;
  coveredAreaKm2: number;
  portsTotal: number | null;
  portsUsed: number | null;
};

export type CoverageArea = {
  id: string;
  neighborhoodIndex: number;
  geometry: GeoJSONPolygon;
};

export type CoverageResponse = {
  level: CoverageLevel;
  grid: { sizeMeters: number; projection: 'EPSG:3857' };
  // fine e coarse: [gridX, gridY, cdoTotal, cdoAvailable, neighborhoodIndex]
  cells: number[][];
  areas: CoverageArea[];
  neighborhoods: CoverageNeighborhood[];
  truncated: boolean;
};

// Teto de linhas devolvidas por nível. A cobertura só existe onde há CDO (bairro denso), então
// a própria área visível limita o volume; estes tetos são a válvula contra bbox anômalo.
const MAX_FINE_CELLS = 20000;
const MAX_AREAS = 4000;

type CoverageCellRow = {
  grid_x: number;
  grid_y: number;
  cdo_total: number;
  cdo_available: number;
  coverage_area_id: string | null;
};

type CoverageAreaRow = {
  id: string;
  geometry: string | null;
  characteristics: string | null;
};

export class GeoCoverageService {
  public constructor(private readonly db: DatabaseClient) {}

  public async coverage(bounds: CoverageBounds, level: CoverageLevel): Promise<CoverageResponse> {
    // Resolução REAL da grade gravada, não uma constante fixa: assim o serviço acompanha
    // qualquer resolução que o loader tenha usado (150 m, 50 m…) sem precisar casar código e
    // dados. Sem isso, mudar COVERAGE_CELL_METERS sem recarregar deixava a cobertura vazia.
    const cellMeters = await this.resolveCellSize();
    const range = gridRange(bounds, cellMeters);

    if (level === 'area') return this.areaLevel(range, cellMeters);
    if (level === 'coarse') return this.coarseLevel(range, cellMeters);
    return this.fineLevel(range, cellMeters);
  }

  // Resolução dominante presente em geo_gpon_coverage_cell (a mais frequente, para ignorar
  // sobras de uma geração anterior em outra resolução). Cai no default se a tabela estiver vazia.
  private async resolveCellSize(): Promise<number> {
    const row = await this.db.get<{ grid_size_m: number }>(
      `SELECT grid_size_m FROM geo_gpon_coverage_cell GROUP BY grid_size_m ORDER BY COUNT(*) DESC`,
    );
    return row?.grid_size_m ?? COVERAGE_CELL_METERS;
  }

  // Escala de detalhe (100–500 m): células de 150 m cruas, cada uma com o índice do seu bairro.
  private async fineLevel(range: GridRange, cellMeters: number): Promise<CoverageResponse> {
    const rows = await this.fetchCells(range, cellMeters, MAX_FINE_CELLS + 1);
    const truncated = rows.length > MAX_FINE_CELLS;
    const cellRows = truncated ? rows.slice(0, MAX_FINE_CELLS) : rows;

    const areaIds = distinct(cellRows.map((row) => row.coverage_area_id));
    const { neighborhoods, indexByAreaId } = await this.loadNeighborhoods(areaIds);

    const cells = cellRows.map((row) => [
      row.grid_x,
      row.grid_y,
      row.cdo_total,
      row.cdo_available,
      row.coverage_area_id ? (indexByAreaId.get(row.coverage_area_id) ?? -1) : -1,
    ]);

    return {
      level: 'fine',
      grid: { sizeMeters: cellMeters, projection: 'EPSG:3857' },
      cells,
      areas: [],
      neighborhoods,
      truncated,
    };
  }

  // Escala intermediária (500 m–10 km): agrega 5×5 células finas num campo de densidade mais
  // grosso, carimbando cada célula grossa com o bairro dominante (o que mais CDOs contribuiu)
  // para o balão de hover continuar funcionando. A agregação é em JS por `floor(gx/5)`, para não
  // depender da semântica de divisão inteira de negativos, que difere entre Postgres e Oracle.
  private async coarseLevel(range: GridRange, cellMeters: number): Promise<CoverageResponse> {
    const rows = await this.fetchCells(range, cellMeters, MAX_FINE_CELLS + 1);
    const truncated = rows.length > MAX_FINE_CELLS;
    const cellRows = truncated ? rows.slice(0, MAX_FINE_CELLS) : rows;

    const areaIds = distinct(cellRows.map((row) => row.coverage_area_id));
    const { neighborhoods, indexByAreaId } = await this.loadNeighborhoods(areaIds);

    const buckets = new Map<
      string,
      { cx: number; cy: number; total: number; available: number; tally: Map<number, number> }
    >();
    for (const row of cellRows) {
      const cx = Math.floor(row.grid_x / COVERAGE_COARSE_FACTOR);
      const cy = Math.floor(row.grid_y / COVERAGE_COARSE_FACTOR);
      const key = `${cx},${cy}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { cx, cy, total: 0, available: 0, tally: new Map() };
        buckets.set(key, bucket);
      }
      bucket.total += row.cdo_total;
      bucket.available += row.cdo_available;
      const index = row.coverage_area_id ? indexByAreaId.get(row.coverage_area_id) : undefined;
      if (index !== undefined) bucket.tally.set(index, (bucket.tally.get(index) ?? 0) + row.cdo_total);
    }

    const cells = [...buckets.values()].map((bucket) => {
      let dominant = -1;
      let best = -1;
      for (const [index, count] of bucket.tally) {
        if (count > best) {
          best = count;
          dominant = index;
        }
      }
      return [bucket.cx, bucket.cy, bucket.total, bucket.available, dominant];
    });

    return {
      level: 'coarse',
      grid: { sizeMeters: cellMeters * COVERAGE_COARSE_FACTOR, projection: 'EPSG:3857' },
      cells,
      areas: [],
      neighborhoods,
      truncated,
    };
  }

  // Escala de cidade/estado (10 km+): só os polígonos de bairro que tocam a viewport, com a
  // estatística. Os polígonos são achados pelos coverage_area_id distintos das células ali
  // dentro — reusa o índice da grade, sem interseção de polígono em SQL.
  private async areaLevel(range: GridRange, cellMeters: number): Promise<CoverageResponse> {
    const idRows = await this.db.all<{ coverage_area_id: string | null }>(
      `SELECT DISTINCT coverage_area_id
         FROM geo_gpon_coverage_cell
        WHERE grid_size_m = ?
          AND grid_x BETWEEN ? AND ?
          AND grid_y BETWEEN ? AND ?`,
      [cellMeters, range.gxMin, range.gxMax, range.gyMin, range.gyMax],
    );
    const areaIds = distinct(idRows.map((row) => row.coverage_area_id));
    const truncated = areaIds.length > MAX_AREAS;
    const scopedIds = truncated ? areaIds.slice(0, MAX_AREAS) : areaIds;

    const { neighborhoods, indexByAreaId, geometryByAreaId } = await this.loadNeighborhoods(
      scopedIds,
      { withGeometry: true },
    );

    const areas: CoverageArea[] = [];
    for (const id of scopedIds) {
      const geometry = geometryByAreaId.get(id);
      const neighborhoodIndex = indexByAreaId.get(id);
      if (!geometry || neighborhoodIndex === undefined) continue;
      areas.push({ id, neighborhoodIndex, geometry });
    }

    return {
      level: 'area',
      grid: { sizeMeters: cellMeters, projection: 'EPSG:3857' },
      cells: [],
      areas,
      neighborhoods,
      truncated,
    };
  }

  private fetchCells(range: GridRange, cellMeters: number, limit: number): Promise<CoverageCellRow[]> {
    return this.db.all<CoverageCellRow>(
      `SELECT grid_x, grid_y, cdo_total, cdo_available, coverage_area_id
         FROM geo_gpon_coverage_cell
        WHERE grid_size_m = ?
          AND grid_x BETWEEN ? AND ?
          AND grid_y BETWEEN ? AND ?
        LIMIT ?`,
      [cellMeters, range.gxMin, range.gxMax, range.gyMin, range.gyMax, limit],
    );
  }

  // Carrega os polígonos de cobertura pelos ids, parseia o grupo `_coverage` das characteristics
  // e dedupe por bairro (vários componentes/áreas de um bairro compartilham a mesma estatística).
  private async loadNeighborhoods(
    areaIds: string[],
    options: { withGeometry?: boolean } = {},
  ): Promise<{
    neighborhoods: CoverageNeighborhood[];
    indexByAreaId: Map<string, number>;
    geometryByAreaId: Map<string, GeoJSONPolygon>;
  }> {
    const indexByAreaId = new Map<string, number>();
    const geometryByAreaId = new Map<string, GeoJSONPolygon>();
    const byKey = new Map<string, CoverageNeighborhood>();
    if (areaIds.length === 0) return { neighborhoods: [], indexByAreaId, geometryByAreaId };

    const rows = await this.fetchAreaRows(areaIds);
    for (const row of rows) {
      const coverage = parseCoverage(row.characteristics);
      if (!coverage) continue;

      if (options.withGeometry && row.geometry) {
        const geometry = parseGeometry(row.geometry);
        if (geometry) geometryByAreaId.set(row.id, geometry);
      }

      let neighborhood = byKey.get(coverage.neighborhoodKey);
      if (!neighborhood) {
        neighborhood = {
          id: byKey.size,
          areaIds: [],
          neighborhoodKey: coverage.neighborhoodKey,
          neighborhood: coverage.neighborhood,
          city: coverage.city,
          uf: coverage.uf,
          cdoTotal: coverage.cdoTotal,
          cdoAvailable: coverage.cdoAvailable,
          cdoUnavailable: coverage.cdoUnavailable,
          availabilityRatio: coverage.availabilityRatio,
          coveredAreaKm2: coverage.coveredAreaKm2,
          portsTotal: null,
          portsUsed: null,
        };
        byKey.set(coverage.neighborhoodKey, neighborhood);
      }
      neighborhood.areaIds.push(row.id);
      indexByAreaId.set(row.id, neighborhood.id);
    }

    return { neighborhoods: [...byKey.values()], indexByAreaId, geometryByAreaId };
  }

  private async fetchAreaRows(areaIds: string[]): Promise<CoverageAreaRow[]> {
    const rows: CoverageAreaRow[] = [];
    for (let i = 0; i < areaIds.length; i += 500) {
      const block = areaIds.slice(i, i + 500);
      const placeholders = block.map(() => '?').join(', ');
      const page = await this.db.all<CoverageAreaRow>(
        `SELECT id, geometry, characteristics
           FROM tmf_geographic_location
          WHERE id IN (${placeholders})`,
        block,
      );
      rows.push(...page);
    }
    return rows;
  }
}

type GridRange = { gxMin: number; gxMax: number; gyMin: number; gyMax: number };

// bbox em lng/lat → faixa de células na grade global de Web Mercator. Em Mercator y cresce com a
// latitude, então minLat→minY e maxLat→maxY se mantêm ordenados.
function gridRange(bounds: CoverageBounds, cellMeters: number): GridRange {
  const [minX, minY] = lngLatToMercator(bounds.minLng, bounds.minLat);
  const [maxX, maxY] = lngLatToMercator(bounds.maxLng, bounds.maxLat);
  return {
    gxMin: Math.floor(Math.min(minX, maxX) / cellMeters),
    gxMax: Math.floor(Math.max(minX, maxX) / cellMeters),
    gyMin: Math.floor(Math.min(minY, maxY) / cellMeters),
    gyMax: Math.floor(Math.max(minY, maxY) / cellMeters),
  };
}

function distinct(values: Array<string | null>): string[] {
  const set = new Set<string>();
  for (const value of values) if (value) set.add(value);
  return [...set];
}

type ParsedCoverage = {
  neighborhoodKey: string;
  neighborhood: string;
  city: string;
  uf: string;
  cdoTotal: number;
  cdoAvailable: number;
  cdoUnavailable: number;
  availabilityRatio: number;
  coveredAreaKm2: number;
};

// Extrai o grupo `_coverage` das characteristics de um polígono de cobertura.
function parseCoverage(raw: string | null): ParsedCoverage | null {
  if (!raw) return null;
  let chars: Array<{ group?: string; name?: string; value?: unknown }>;
  try {
    chars = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(chars)) return null;
  const get = (name: string): unknown =>
    chars.find((entry) => entry?.group === '_coverage' && entry?.name === name)?.value;

  const neighborhoodKey = asString(get('neighborhoodKey'));
  if (!neighborhoodKey) return null;
  return {
    neighborhoodKey,
    neighborhood: asString(get('neighborhood')) ?? 'Sem bairro',
    city: asString(get('city')) ?? 'Sem município',
    uf: asString(get('uf')) ?? 'ZZ',
    cdoTotal: asNumber(get('cdoTotal')),
    cdoAvailable: asNumber(get('cdoAvailable')),
    cdoUnavailable: asNumber(get('cdoUnavailable')),
    availabilityRatio: asNumber(get('availabilityRatio')),
    coveredAreaKm2: asNumber(get('coveredAreaKm2')),
  };
}

function parseGeometry(raw: string): GeoJSONPolygon | null {
  try {
    const geometry = JSON.parse(raw);
    return geometry?.type === 'Polygon' ? (geometry as GeoJSONPolygon) : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
