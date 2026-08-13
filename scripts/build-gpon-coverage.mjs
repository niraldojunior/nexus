#!/usr/bin/env node
/**
 * Geração do mapa de calor de cobertura GPON por bairro (REQ-MOD01-014).
 *
 * A partir da posição das CDOs (caixas de distribuição óptica) já inventariadas, calcula
 * a cobertura consolidando o disco de 300 m de cada CDO numa grade de células de 150 m
 * (ver src/modules/geo/coverage-grid.ts) e grava dois artefatos:
 *
 *   · POLÍGONO por bairro  → tmf_geographic_location (Polygon, TMF675), um por componente
 *     conexo da grade daquele bairro. `reference_point` = "GPON:<uf>|<city>|<bairro>" e as
 *     estatísticas do bairro em characteristics no grupo `_coverage`. É a geometria que o
 *     mapa desenha em escala de cidade/estado, e a fonte do balão de hover.
 *   · GRADE fina de 150 m   → geo_gpon_coverage_cell (projeção de leitura), com quantas
 *     CDOs (total e disponíveis) cobrem cada célula. A API agrega 150 m → 750 m por zoom.
 *
 * Uma CDO é PhysicalResource com resource_type 'CTO' e nome começando em "CDO" (o tipo
 * sozinho traria CEO/CEOS, que são caixas de emenda — mesma regra da aba de Viabilidade).
 * Disponível = status 'active'; indisponível = 'suspended'/Bloqueada; 'terminated' fica de
 * fora (C6). O bairro vem de tmf_geographic_address.locality; quando o parser de endereço
 * da carga deixou ali um número (endereço curto), cai em "Sem bairro".
 *
 * Idempotente por escopo: cada execução SUBSTITUI a geração anterior do escopo (apaga as
 * Locations "GPON:" daquele município e suas células, e reggrava). É exceção consciente a
 * C6 — são artefatos derivados e regeneráveis, não inventário (igual ao --truncate da carga
 * de recursos).
 *
 * Requer o dist compilado (npm run build) — importa o algoritmo de coverage-grid.
 *
 * Uso:
 *   node scripts/build-gpon-coverage.mjs                        # dry-run, base inteira
 *   node scripts/build-gpon-coverage.mjs --apply                # base inteira
 *   node scripts/build-gpon-coverage.mjs --city "Niterói" --apply
 *   node scripts/build-gpon-coverage.mjs --uf RJ --apply
 *   node scripts/build-gpon-coverage.mjs --cell 50 --radius 200 --apply
 *   node scripts/build-gpon-coverage.mjs --smooth 2 --apply        # corner-cutting do contorno
 *   # cross-DB: lê as CDOs do Oracle e grava a cobertura no Postgres/Neon
 *   node scripts/build-gpon-coverage.mjs --source oracle --target postgres --uf RJ --apply
 */

import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import {
  buildCoverage,
  COVERAGE_CELL_METERS,
  COVERAGE_RADIUS_METERS,
  COVERAGE_SMOOTH_ITERATIONS,
  COVERAGE_MIN_COMPONENT_CELLS,
} from '../dist/src/modules/geo/coverage-grid.js';

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const APPLY = has('--apply');
const CITY = argOf('--city', null);
const UF = argOf('--uf', null);
const TENANT = argOf('--tenant', 'default');
const CELL_METERS = Number(argOf('--cell', String(COVERAGE_CELL_METERS)));
const RADIUS_METERS = Number(argOf('--radius', String(COVERAGE_RADIUS_METERS)));

// Iterações de corner-cutting (Chaikin) aplicadas ao traçado do polígono — ver coverage-grid.ts.
// 0 desliga a suavização e volta ao contorno em escada.
const SMOOTH_ITERATIONS = Number(argOf('--smooth', String(COVERAGE_SMOOTH_ITERATIONS)));

// Descarta componentes conexos menores que isto (em células) antes de traçar o polígono — em
// área densa, o "bairro dominante por célula" deixa fragmentos de fronteira (1-3 células) para
// o bairro perdedor, que só poluem o mapa (sem CDO visível dentro, quase sempre vermelhos por
// serem sobra de um bairro pouco disponível). Não afeta a estatística do bairro (cdoTotal etc.
// continuam contando os CDOs reais). 0 desliga o filtro.
const MIN_COMPONENT_CELLS = Number(argOf('--min-cells', String(COVERAGE_MIN_COMPONENT_CELLS)));

// Resolução do ÍNDICE de células gravado (geo_gpon_coverage_cell), que serve só para achar
// polígonos por bbox — o polígono em si continua traçado em `--cell` (suave). Com `--index-cell`
// maior que `--cell`, agrega o índice (célula grossa → polígono dominante), reduzindo MUITO as
// linhas gravadas — útil quando o destino tem pouco espaço (ex.: Neon). Default: igual a --cell.
const INDEX_CELL_METERS = Number(argOf('--index-cell', String(CELL_METERS)));

// Cross-DB: `--source` é de onde vêm as CDOs; `--target` é onde a cobertura é gravada. Sem
// eles, cai no DATABASE_PROVIDER (mesmo banco para ler e gravar). Ex.: `--source oracle
// --target postgres` gera pelas CDOs do Oracle e persiste os polígonos no Neon.
const SOURCE_PROVIDER = argOf('--source', process.env.DATABASE_PROVIDER ?? 'postgres');
const TARGET_PROVIDER = argOf('--target', SOURCE_PROVIDER);

const GENERATED_AT = new Date().toISOString();
const GENERATOR = 'build-gpon-coverage';

// Só caixa de distribuição (CDO) entra: mesmo recorte da aba de Viabilidade.
const CDO_NAME = /^\s*CDO/i;

const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

// Bairro a partir do endereço da carga. O parser lê pelas pontas, então em endereço curto
// o "bairro" pode ter caído no número do logradouro — rejeita numérico puro ou igual ao nº.
function neighborhoodOf(row) {
  const locality = clean(row.locality);
  const streetNr = clean(row.street_nr);
  if (!locality) return 'Sem bairro';
  if (/^\d+$/.test(locality)) return 'Sem bairro';
  if (streetNr && locality === streetNr) return 'Sem bairro';
  return locality;
}

// Garante a tabela de projeção geo_gpon_coverage_cell — o loader é dono dela, então a cria
// se faltar em vez de depender de um restart do backend (schema init). DDL por provider: o
// translator do loader-db prefixa a tabela no CREATE TABLE do Oracle (verificado), mas NÃO no
// ON de um CREATE INDEX — por isso o índice fica a cargo do schema init do app (opcional; a
// tabela tem poucos milhares de linhas). Idempotente: ORA-00955 = tabela já existe.
async function ensureCoverageTable(client) {
  if (client.provider === 'oracle') {
    const ddl = `CREATE TABLE geo_gpon_coverage_cell (
      tenant_id VARCHAR2(36 CHAR) DEFAULT 'default' NOT NULL,
      grid_size_m NUMBER(10) NOT NULL,
      grid_x NUMBER(10) NOT NULL,
      grid_y NUMBER(10) NOT NULL,
      coverage_area_id VARCHAR2(36 CHAR),
      cdo_total NUMBER(10) DEFAULT 0 NOT NULL,
      cdo_available NUMBER(10) DEFAULT 0 NOT NULL,
      ports_total NUMBER(10),
      ports_used NUMBER(10),
      generated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, grid_size_m, grid_x, grid_y)
    )`;
    try {
      await client.query(ddl);
      console.log('Tabela geo_gpon_coverage_cell criada no Oracle.');
    } catch (error) {
      if (!/ORA-00955/.test(String(error?.message ?? error))) throw error;
    }
    return;
  }
  await client.query(`CREATE TABLE IF NOT EXISTS geo_gpon_coverage_cell (
    tenant_id TEXT NOT NULL DEFAULT 'default',
    grid_size_m INTEGER NOT NULL,
    grid_x INTEGER NOT NULL,
    grid_y INTEGER NOT NULL,
    coverage_area_id TEXT,
    cdo_total INTEGER NOT NULL DEFAULT 0,
    cdo_available INTEGER NOT NULL DEFAULT 0,
    ports_total INTEGER,
    ports_used INTEGER,
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, grid_size_m, grid_x, grid_y)
  )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_cell_xy ON geo_gpon_coverage_cell(grid_size_m, grid_x, grid_y)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_cell_area ON geo_gpon_coverage_cell(coverage_area_id)`,
  );
}

// Insere ids em blocos e devolve uma cláusula DELETE ... WHERE col IN (...) por bloco.
async function deleteByIds(client, table, column, ids) {
  let removed = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const block = ids.slice(i, i + 500);
    const placeholders = block.map((_, index) => `$${index + 1}`).join(', ');
    const result = await client.query(
      `DELETE FROM ${table} WHERE ${column} IN (${placeholders})`,
      block,
    );
    removed += result.rowCount ?? 0;
  }
  return removed;
}

async function main() {
  if (!Number.isFinite(CELL_METERS) || CELL_METERS <= 0) throw new Error('--cell inválido');
  if (!Number.isFinite(RADIUS_METERS) || RADIUS_METERS <= 0) throw new Error('--radius inválido');
  if (!Number.isFinite(INDEX_CELL_METERS) || INDEX_CELL_METERS < CELL_METERS) {
    throw new Error('--index-cell deve ser >= --cell');
  }
  if (!Number.isFinite(SMOOTH_ITERATIONS) || SMOOTH_ITERATIONS < 0) {
    throw new Error('--smooth inválido');
  }
  if (!Number.isFinite(MIN_COMPONENT_CELLS) || MIN_COMPONENT_CELLS < 0) {
    throw new Error('--min-cells inválido');
  }

  const source = await openLoaderDb({ provider: SOURCE_PROVIDER });
  const target =
    TARGET_PROVIDER === SOURCE_PROVIDER
      ? source
      : await openLoaderDb({ provider: TARGET_PROVIDER });
  try {
    if (source !== target) {
      console.log(`Origem   : CDOs em ${SOURCE_PROVIDER} → cobertura em ${TARGET_PROVIDER}`);
    }
    // ---- CDOs do escopo (lidas da ORIGEM) ----
    const filters = [];
    const params = [];
    if (CITY) {
      params.push(CITY);
      filters.push(`a.city = $${params.length}`);
    }
    if (UF) {
      params.push(UF);
      filters.push(`a.state_or_province = $${params.length}`);
    }
    const scopeWhere = filters.length ? ` AND ${filters.join(' AND ')}` : '';

    const { rows } = await source.query(
      `SELECT r.id, r.name, r.status, l.geometry,
              a.locality, a.city, a.state_or_province, a.street_nr
         FROM tmf_physical_resource r
         JOIN tmf_geographic_location l ON l.id = r.place_id
         LEFT JOIN tmf_geographic_address a ON a.geographic_location_id = r.place_id
        WHERE r.resource_type = 'CTO'
          AND r.status <> 'terminated'
          AND l.geometry_type = 'Point'
          AND UPPER(r.name) LIKE 'CDO%'${scopeWhere}`,
      params,
    );

    const cdos = [];
    let skippedGeometry = 0;
    for (const row of rows) {
      if (!CDO_NAME.test(row.name ?? '')) continue;
      let geometry;
      try {
        geometry = JSON.parse(row.geometry);
      } catch {
        skippedGeometry += 1;
        continue;
      }
      const coordinates = geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        skippedGeometry += 1;
        continue;
      }
      const [lng, lat] = coordinates;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        skippedGeometry += 1;
        continue;
      }
      const city = clean(row.city) || 'Sem município';
      const uf = clean(row.state_or_province).toUpperCase() || 'ZZ';
      const neighborhood = neighborhoodOf(row);
      cdos.push({
        lng,
        lat,
        available: row.status === 'active',
        neighborhood,
        city,
        uf,
        neighborhoodKey: `${uf}|${city}|${neighborhood}`,
      });
    }

    const scopeLabel =
      [CITY && `city=${CITY}`, UF && `uf=${UF}`].filter(Boolean).join(' · ') || 'base inteira';
    console.log(`Escopo   : ${scopeLabel}`);
    console.log(
      `Grade    : célula ${CELL_METERS} m · raio de cobertura ${RADIUS_METERS} m · suavização ${SMOOTH_ITERATIONS}x · mínimo ${MIN_COMPONENT_CELLS} células`,
    );
    console.log(
      `CDOs     : ${cdos.length} elegíveis${skippedGeometry ? ` (${skippedGeometry} sem geometria válida)` : ''}`,
    );

    if (cdos.length === 0) {
      console.log('\nNenhuma CDO no escopo — nada a gerar.');
      return;
    }

    // ---- algoritmo ----
    const { components, neighborhoods } = buildCoverage(cdos, {
      cellMeters: CELL_METERS,
      radiusMeters: RADIUS_METERS,
      smoothIterations: SMOOTH_ITERATIONS,
      minComponentCells: MIN_COMPONENT_CELLS,
    });
    const cellCount = components.reduce((sum, component) => sum + component.cells.length, 0);
    const vertexCount = components.reduce(
      (sum, component) =>
        sum + component.geometry.coordinates.reduce((inner, ring) => inner + ring.length, 0),
      0,
    );
    const avgVertices = components.length ? (vertexCount / components.length).toFixed(1) : '0';

    neighborhoods.sort((a, b) => b.cdoTotal - a.cdoTotal);
    console.log(`Bairros  : ${neighborhoods.length}`);
    console.log(`Componentes (polígonos): ${components.length}`);
    console.log(`Células  : ${cellCount}`);
    console.log(`Vértices : ${vertexCount} total · ${avgVertices} em média por polígono`);
    console.log('\nTop bairros por CDOs:');
    for (const stat of neighborhoods.slice(0, 10)) {
      const pct = (stat.availabilityRatio * 100).toFixed(1);
      console.log(
        `   ${stat.neighborhood} (${stat.city}/${stat.uf}): ` +
          `${stat.cdoTotal} CDOs · ${stat.cdoAvailable} disp. (${pct}%) · ${stat.coveredAreaKm2.toFixed(2)} km²`,
      );
    }

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
      return;
    }

    // ---- gravação ----
    const statByKey = new Map(neighborhoods.map((stat) => [stat.key, stat]));
    const locations = [];
    const cells = [];
    for (const component of components) {
      const stat = statByKey.get(component.neighborhoodKey);
      if (!stat) continue;
      const locId = randomUUID();
      locations.push({
        id: locId,
        href: `/tmf-api/geographicLocationManagement/v4/geographicLocation/${locId}`,
        geometry_type: 'Polygon',
        geometry: JSON.stringify(component.geometry),
        spatial_ref: 'EPSG:4326',
        reference_point: `GPON:${component.neighborhoodKey}`.slice(0, 255),
        characteristics: JSON.stringify(coverageChars(stat)),
      });
      for (const cell of component.cells) {
        cells.push({
          tenant_id: TENANT,
          grid_size_m: CELL_METERS,
          grid_x: cell.gridX,
          grid_y: cell.gridY,
          coverage_area_id: locId,
          cdo_total: cell.cdoTotal,
          cdo_available: cell.cdoAvailable,
        });
      }
    }

    // ---- gravação no DESTINO ----
    // A tabela de projeção é do loader — cria se faltar (dispensa restart do backend).
    await ensureCoverageTable(target);

    await target.query('BEGIN');

    // Substitui a geração anterior DO ESCOPO: acha as Locations "GPON:" do escopo, apaga
    // suas células e depois as próprias Locations. Filtra o escopo em JS (uf/city do
    // reference_point) para não depender de LIKE com acento/caractere especial.
    const { rows: existing } = await target.query(
      `SELECT id, reference_point FROM tmf_geographic_location WHERE reference_point LIKE 'GPON:%'`,
    );
    const staleIds = existing.filter((row) => inScope(row.reference_point)).map((row) => row.id);
    const removedCells = await deleteByIds(
      target,
      'geo_gpon_coverage_cell',
      'coverage_area_id',
      staleIds,
    );
    const removedAreas = await deleteByIds(target, 'tmf_geographic_location', 'id', staleIds);

    const insertedLocations = await target.bulkInsert(
      'tmf_geographic_location',
      [
        'id',
        'href',
        'geometry_type',
        'geometry',
        'spatial_ref',
        'reference_point',
        'characteristics',
      ],
      locations,
    );
    // Índice de células gravado na resolução de --index-cell (agrega o fino se for maior).
    const indexCells = aggregateIndex(cells);
    // DO NOTHING protege a fronteira entre municípios em cargas por-cidade: uma célula já
    // gravada por outro município (não apagada por este escopo) é preservada.
    const insertedCells = await target.bulkInsert(
      'geo_gpon_coverage_cell',
      [
        'tenant_id',
        'grid_size_m',
        'grid_x',
        'grid_y',
        'coverage_area_id',
        'cdo_total',
        'cdo_available',
      ],
      indexCells,
      { onConflict: 'ON CONFLICT (tenant_id, grid_size_m, grid_x, grid_y) DO NOTHING' },
    );

    await target.query('COMMIT');

    console.log('\nGravado:');
    console.log(`  removidos (regeneração): ${removedAreas} polígonos · ${removedCells} células`);
    console.log(`  polígonos de cobertura : ${insertedLocations}`);
    console.log(`  células de grade        : ${insertedCells}`);
  } finally {
    await target.close();
    if (target !== source) await source.close();
  }
}

// Agrega o índice fino de células à resolução de INDEX_CELL_METERS: cada célula grossa recebe
// o polígono (coverage_area_id) DOMINANTE entre as finas que a compõem. Isso reduz muito o número
// de linhas gravadas sem mexer na geometria do polígono (traçada em CELL_METERS). Quando
// INDEX_CELL_METERS == CELL_METERS, o índice fino é gravado sem alteração.
function aggregateIndex(cells) {
  const factor = Math.round(INDEX_CELL_METERS / CELL_METERS);
  if (factor <= 1) return cells;
  const agg = new Map();
  for (const cell of cells) {
    const cx = Math.floor(cell.grid_x / factor);
    const cy = Math.floor(cell.grid_y / factor);
    const key = `${cx},${cy}`;
    let bucket = agg.get(key);
    if (!bucket) {
      bucket = { cx, cy, total: 0, avail: 0, tally: new Map() };
      agg.set(key, bucket);
    }
    bucket.total += cell.cdo_total;
    bucket.avail += cell.cdo_available;
    bucket.tally.set(cell.coverage_area_id, (bucket.tally.get(cell.coverage_area_id) ?? 0) + 1);
  }
  const out = [];
  for (const bucket of agg.values()) {
    let dominant = null;
    let best = -1;
    for (const [id, count] of bucket.tally) {
      if (count > best) {
        best = count;
        dominant = id;
      }
    }
    out.push({
      tenant_id: TENANT,
      grid_size_m: INDEX_CELL_METERS,
      grid_x: bucket.cx,
      grid_y: bucket.cy,
      coverage_area_id: dominant,
      cdo_total: bucket.total,
      cdo_available: bucket.avail,
    });
  }
  return out;
}

// Escopo em JS: reference_point = "GPON:<uf>|<city>|<bairro>". Sem --city/--uf, tudo entra.
function inScope(referencePoint) {
  const key = String(referencePoint ?? '').replace(/^GPON:/, '');
  const [uf, city] = key.split('|');
  if (UF && (uf ?? '').toUpperCase() !== UF.toUpperCase()) return false;
  if (CITY && (city ?? '') !== CITY) return false;
  return true;
}

function coverageChars(stat) {
  return [
    { group: '_coverage', name: 'kind', value: 'GponCoverage', valueType: 'string' },
    { group: '_coverage', name: 'neighborhood', value: stat.neighborhood, valueType: 'string' },
    { group: '_coverage', name: 'city', value: stat.city, valueType: 'string' },
    { group: '_coverage', name: 'uf', value: stat.uf, valueType: 'string' },
    { group: '_coverage', name: 'neighborhoodKey', value: stat.key, valueType: 'string' },
    { group: '_coverage', name: 'cdoTotal', value: stat.cdoTotal, valueType: 'integer' },
    { group: '_coverage', name: 'cdoAvailable', value: stat.cdoAvailable, valueType: 'integer' },
    {
      group: '_coverage',
      name: 'cdoUnavailable',
      value: stat.cdoUnavailable,
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
    { group: '_coverage', name: 'radiusMeters', value: RADIUS_METERS, valueType: 'integer' },
    { group: '_coverage', name: 'cellSizeMeters', value: CELL_METERS, valueType: 'integer' },
    {
      group: '_coverage',
      name: 'smoothIterations',
      value: SMOOTH_ITERATIONS,
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'minComponentCells',
      value: MIN_COMPONENT_CELLS,
      valueType: 'integer',
    },
    { group: '_coverage', name: 'generatedAt', value: GENERATED_AT, valueType: 'date' },
    { group: '_coverage', name: 'generator', value: GENERATOR, valueType: 'string' },
  ];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
