// Read-model da cobertura GPON por bairro/município/estado (REQ-MOD01-014) — a fonte do mapa em
// escala de cidade/estado, no lugar dos recursos individuais e dos clusters.
//
// Lê os artefatos que `scripts/build-gpon-coverage.mjs` gravou:
//   · a grade fina de 50 m (geo_gpon_coverage_cell), usada pelos níveis `fine`/`coarse`
//     (grade de calor; hoje sem uso no frontend, mantidos pela API/testes);
//   · o ÍNDICE por polígono (geo_gpon_coverage_area), usado pelos níveis `neighborhood`/`city`/
//     `uf` — 1 linha por polígono de cobertura, com bbox e estatística já desnormalizados, para o
//     recorte por viewport não precisar varrer a grade nem reparsear `characteristics`;
//   · os POLÍGONOS em si (tmf_geographic_location, `reference_point` "GPON:"/"GPON-CITY:"/
//     "GPON-UF:"), sempre buscados pelo id.
// Existe separado de `GeoService`/`GeoTreeService` pelo mesmo motivo da árvore: é projeção de
// leitura que cruza módulos, fora do contrato TMF, então fala direto com o `DatabaseClient`.
//
// O recorte dos níveis fine/coarse reusa o índice inteiro da grade: o bbox em lng/lat é
// convertido para coordenadas de célula (Web Mercator) e a consulta filtra por `grid_x/grid_y
// BETWEEN`. Os níveis neighborhood/city/uf recortam por um simples teste de sobreposição de bbox
// (lng/lat) contra geo_gpon_coverage_area — nada de teste de interseção de polígono em SQL, em
// nenhum dos dois caminhos.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { GeoJSONPolygon } from './domain.js';
import {
  COVERAGE_CELL_METERS,
  COVERAGE_CITY_CELL_METERS,
  COVERAGE_COARSE_FACTOR,
  COVERAGE_UF_CELL_METERS,
  lngLatToMercator,
} from './coverage-grid.js';

export type CoverageLevel = 'fine' | 'coarse' | 'neighborhood' | 'city' | 'uf';
type CoverageAreaIndexLevel = 'neighborhood' | 'city' | 'uf';

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
  // [minLng, minLat, maxLng, maxLat] — vem pronto de geo_gpon_coverage_area (níveis
  // neighborhood/city/uf); ausente nos níveis fine/coarse. O canvas usa para culling sem
  // reprocessar a geometria a cada frame (ver CoverageOverlay.draw).
  bounds?: [number, number, number, number];
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

// Área de cobertura (bairro/cidade/UF) que contém um ponto — mesma estatística desnormalizada de
// CoverageNeighborhood, mas achatada (1 linha por área, sem índice compartilhado) porque a
// consulta inversa (`coverageForPoint`) nunca precisa deduplicar por bairro entre vários pontos.
export type CoveragePointArea = {
  level: CoverageAreaIndexLevel;
  id: string;
  neighborhoodKey: string;
  neighborhood: string;
  city: string;
  uf: string;
  cdoTotal: number;
  cdoAvailable: number;
  availabilityRatio: number;
  coveredAreaKm2: number;
  portsTotal: number | null;
  portsUsed: number | null;
};

export type CoveragePointCell = {
  gridX: number;
  gridY: number;
  cdoTotal: number;
  cdoAvailable: number;
  sizeMeters: number;
};

export type CoveragePointResult = {
  point: { lng: number; lat: number };
  cell: CoveragePointCell | null;
  areas: CoveragePointArea[];
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
  characteristics: string | null;
};

// Linha do índice geo_gpon_coverage_area já com a geometria trazida via JOIN — 1 round-trip por
// requisição de nível neighborhood/city/uf, sem precisar de uma segunda consulta por id.
type CoverageAreaIndexRow = {
  location_id: string;
  area_key: string;
  neighborhood: string | null;
  city: string | null;
  uf: string | null;
  cdo_total: number;
  cdo_available: number;
  covered_area_km2: number;
  ports_total: number | null;
  ports_used: number | null;
  cell_size_m: number;
  min_lng: number;
  min_lat: number;
  max_lng: number;
  max_lat: number;
  geometry: string | null;
};

// Linha da consulta inversa (`coverageForPoint`) — mesma estatística de CoverageAreaIndexRow, mas
// sem bbox/geometria (não precisamos redesenhar o polígono, só sua estatística) e com `lod_level`
// (aqui o nível não é um parâmetro da consulta, como em `areaIndexLevel` — o mesmo ponto pode
// aparecer em vários níveis ao mesmo tempo, então a linha precisa dizer a qual pertence).
type CoveragePointAreaRow = {
  location_id: string;
  area_key: string;
  lod_level: string;
  neighborhood: string | null;
  city: string | null;
  uf: string | null;
  cdo_total: number;
  cdo_available: number;
  covered_area_km2: number;
  ports_total: number | null;
  ports_used: number | null;
  cell_size_m: number;
};

export class GeoCoverageService {
  // Resolução REAL da grade fina gravada (usada só pelos níveis fine/coarse) — consultada uma vez
  // por processo: a grade não muda em runtime, só quando scripts/build-gpon-coverage.mjs roda de
  // novo (que implica reiniciar o backend). Sem o cache, toda requisição de fine/coarse pagava um
  // GROUP BY varrendo geo_gpon_coverage_cell inteira (~0,7 s medido com 1,8 M linhas) só para
  // redescobrir o mesmo número.
  private cellMetersCache: number | undefined;

  public constructor(private readonly db: DatabaseClient) {}

  public async coverage(bounds: CoverageBounds, level: CoverageLevel): Promise<CoverageResponse> {
    if (level === 'neighborhood' || level === 'city' || level === 'uf') {
      return this.areaIndexLevel(bounds, level);
    }
    const cellMeters = await this.resolveCellSize();
    const range = gridRange(bounds, cellMeters);
    if (level === 'coarse') return this.coarseLevel(range, cellMeters);
    return this.fineLevel(range, cellMeters);
  }

  // Consulta inversa (REQ-MOD01-014, issue #171 Fase 4): dado o ponto de um recurso, devolve
  // a célula fina que o contém (se existir cobertura ali) e as áreas de bairro/cidade/UF cujo
  // bbox o contém — sem `LIMIT`/truncamento, porque um único ponto cai em poucas áreas por nível
  // (nunca nas milhares de um bbox de viewport, ver `areaIndexLevel`). Usado por
  // `GET /v1/geo/coverage/by-resource/:id`, que já resolveu o `id` de recurso para este ponto.
  public async coverageForPoint(lng: number, lat: number): Promise<CoveragePointResult> {
    const cellMeters = await this.resolveCellSize();
    const [x, y] = lngLatToMercator(lng, lat);
    const gridX = Math.floor(x / cellMeters);
    const gridY = Math.floor(y / cellMeters);

    const [cellRow, areaRows] = await Promise.all([
      this.db.get<CoverageCellRow>(
        `SELECT grid_x, grid_y, cdo_total, cdo_available, coverage_area_id
           FROM geo_gpon_coverage_cell
          WHERE grid_size_m = ? AND grid_x = ? AND grid_y = ?`,
        [cellMeters, gridX, gridY],
      ),
      this.db.all<CoveragePointAreaRow>(
        `SELECT a.location_id, a.area_key, a.lod_level, a.neighborhood, a.city, a.uf,
                a.cdo_total, a.cdo_available, a.covered_area_km2,
                a.ports_total, a.ports_used, a.cell_size_m
           FROM geo_gpon_coverage_area a
          WHERE a.min_lng <= ? AND a.max_lng >= ?
            AND a.min_lat <= ? AND a.max_lat >= ?`,
        [lng, lng, lat, lat],
      ),
    ]);

    const cell: CoveragePointCell | null = cellRow
      ? {
          gridX: cellRow.grid_x,
          gridY: cellRow.grid_y,
          cdoTotal: cellRow.cdo_total,
          cdoAvailable: cellRow.cdo_available,
          sizeMeters: cellMeters,
        }
      : null;

    const areas: CoveragePointArea[] = areaRows.map((row) => ({
      level: row.lod_level as CoverageAreaIndexLevel,
      id: row.location_id,
      neighborhoodKey: row.area_key,
      neighborhood: row.neighborhood ?? row.city ?? row.uf ?? 'Sem bairro',
      city: row.city ?? row.uf ?? 'Sem município',
      uf: row.uf ?? 'ZZ',
      cdoTotal: row.cdo_total,
      cdoAvailable: row.cdo_available,
      availabilityRatio: row.cdo_total > 0 ? row.cdo_available / row.cdo_total : 0,
      coveredAreaKm2: row.covered_area_km2,
      portsTotal: row.ports_total,
      portsUsed: row.ports_used,
    }));

    return { point: { lng, lat }, cell, areas };
  }

  // Resolução dominante presente em geo_gpon_coverage_cell (a mais frequente, para ignorar
  // sobras de uma geração anterior em outra resolução). Cai no default se a tabela estiver vazia.
  private async resolveCellSize(): Promise<number> {
    if (this.cellMetersCache !== undefined) return this.cellMetersCache;
    const row = await this.db.get<{ grid_size_m: number }>(
      `SELECT grid_size_m FROM geo_gpon_coverage_cell GROUP BY grid_size_m ORDER BY COUNT(*) DESC`,
    );
    this.cellMetersCache = row?.grid_size_m ?? COVERAGE_CELL_METERS;
    return this.cellMetersCache;
  }

  // Escala de município/estado (REQ-MOD01-014, LOD): 1 query indexada por bbox contra
  // geo_gpon_coverage_area, já com a estatística desnormalizada e a geometria trazida via JOIN —
  // substitui o antigo caminho (DISTINCT na grade de 1,8 M células + 8 blocos sequenciais de
  // characteristics) por um único round-trip. `ORDER BY cdo_total DESC` faz o truncamento por
  // MAX_AREAS priorizar as áreas mais relevantes em vez de um corte arbitrário.
  private async areaIndexLevel(
    bounds: CoverageBounds,
    level: CoverageAreaIndexLevel,
  ): Promise<CoverageResponse> {
    const rows = await this.db.all<CoverageAreaIndexRow>(
      `SELECT a.location_id, a.area_key, a.neighborhood, a.city, a.uf,
              a.cdo_total, a.cdo_available, a.covered_area_km2,
              a.ports_total, a.ports_used, a.cell_size_m,
              a.min_lng, a.min_lat, a.max_lng, a.max_lat, l.geometry
         FROM geo_gpon_coverage_area a
         JOIN tmf_geographic_location l ON l.id = a.location_id
        WHERE a.lod_level = ?
          AND a.min_lng <= ? AND a.max_lng >= ?
          AND a.min_lat <= ? AND a.max_lat >= ?
        ORDER BY a.cdo_total DESC
        LIMIT ?`,
      [level, bounds.maxLng, bounds.minLng, bounds.maxLat, bounds.minLat, MAX_AREAS + 1],
    );
    const truncated = rows.length > MAX_AREAS;
    const scoped = truncated ? rows.slice(0, MAX_AREAS) : rows;

    const indexByKey = new Map<string, number>();
    const neighborhoods: CoverageNeighborhood[] = [];
    const areas: CoverageArea[] = [];
    let cellMeters = 0;

    for (const row of scoped) {
      cellMeters = row.cell_size_m;
      let idx = indexByKey.get(row.area_key);
      if (idx === undefined) {
        idx = neighborhoods.length;
        indexByKey.set(row.area_key, idx);
        neighborhoods.push({
          id: idx,
          areaIds: [],
          neighborhoodKey: row.area_key,
          neighborhood: row.neighborhood ?? row.city ?? row.uf ?? 'Sem bairro',
          city: row.city ?? row.uf ?? 'Sem município',
          uf: row.uf ?? 'ZZ',
          cdoTotal: row.cdo_total,
          cdoAvailable: row.cdo_available,
          cdoUnavailable: row.cdo_total - row.cdo_available,
          availabilityRatio: row.cdo_total > 0 ? row.cdo_available / row.cdo_total : 0,
          coveredAreaKm2: row.covered_area_km2,
          portsTotal: row.ports_total,
          portsUsed: row.ports_used,
        });
      }
      const neighborhood = neighborhoods[idx]!;
      neighborhood.areaIds.push(row.location_id);
      const geometry = row.geometry ? parseGeometry(row.geometry) : null;
      if (!geometry) continue;
      areas.push({
        id: row.location_id,
        neighborhoodIndex: idx,
        geometry,
        bounds: [row.min_lng, row.min_lat, row.max_lng, row.max_lat],
      });
    }

    return {
      level,
      grid: { sizeMeters: cellMeters || defaultCellFor(level), projection: 'EPSG:3857' },
      cells: [],
      areas,
      neighborhoods,
      truncated,
    };
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
      if (index !== undefined)
        bucket.tally.set(index, (bucket.tally.get(index) ?? 0) + row.cdo_total);
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

  private fetchCells(
    range: GridRange,
    cellMeters: number,
    limit: number,
  ): Promise<CoverageCellRow[]> {
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
  // Só usado pelos níveis fine/coarse (grade de calor); neighborhood/city/uf lêem a estatística
  // já desnormalizada de geo_gpon_coverage_area (ver areaIndexLevel), sem tocar em characteristics.
  private async loadNeighborhoods(areaIds: string[]): Promise<{
    neighborhoods: CoverageNeighborhood[];
    indexByAreaId: Map<string, number>;
  }> {
    const indexByAreaId = new Map<string, number>();
    const byKey = new Map<string, CoverageNeighborhood>();
    if (areaIds.length === 0) return { neighborhoods: [], indexByAreaId };

    const rows = await this.fetchAreaRows(areaIds);
    for (const row of rows) {
      const coverage = parseCoverage(row.characteristics);
      if (!coverage) continue;

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

    return { neighborhoods: [...byKey.values()], indexByAreaId };
  }

  private async fetchAreaRows(areaIds: string[]): Promise<CoverageAreaRow[]> {
    const rows: CoverageAreaRow[] = [];
    for (let i = 0; i < areaIds.length; i += 500) {
      const block = areaIds.slice(i, i + 500);
      const placeholders = block.map(() => '?').join(', ');
      const page = await this.db.all<CoverageAreaRow>(
        `SELECT id, characteristics
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

// Fallback de `grid.sizeMeters` quando o bbox não devolveu nenhuma linha (nada para ler
// `cell_size_m` de) — mesma resolução que scripts/build-gpon-coverage.mjs usa por nível.
function defaultCellFor(level: CoverageAreaIndexLevel): number {
  if (level === 'city') return COVERAGE_CITY_CELL_METERS;
  if (level === 'uf') return COVERAGE_UF_CELL_METERS;
  return COVERAGE_CELL_METERS;
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
