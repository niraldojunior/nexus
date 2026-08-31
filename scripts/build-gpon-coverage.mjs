#!/usr/bin/env node
/**
 * Geração do mapa de calor de cobertura GPON, em três níveis de detalhe (REQ-MOD01-014).
 *
 * A partir da posição das CDOs (caixas de distribuição óptica) já inventariadas, calcula a
 * cobertura consolidando o disco de cobertura de cada CDO numa grade de células — e grava o
 * resultado em TRÊS ESCALAS (LOD), para o mapa nunca precisar pedir os 12 mil+ polígonos de
 * bairro numa visão de país inteiro:
 *
 *   · neighborhood (bairro)   — célula fina (--cell, default 50 m), agregada por
 *     `<uf>|<city>|<bairro>`. `reference_point` = "GPON:<uf>|<city>|<bairro>".
 *   · city (município)        — célula de COVERAGE_CITY_CELL_METERS (500 m), agregada por
 *     `<uf>|<city>`. `reference_point` = "GPON-CITY:<uf>|<city>".
 *   · uf (estado)              — célula de COVERAGE_UF_CELL_METERS (2000 m), agregada por
 *     `<uf>`. `reference_point` = "GPON-UF:<uf>".
 *
 * Cada polígono (qualquer nível) vira uma Location (TMF675) em tmf_geographic_location, com a
 * estatística do grupo `_coverage` em characteristics — igual a antes. O que muda é que cada
 * polígono TAMBÉM grava uma linha em geo_gpon_coverage_area (bbox + estatística desnormalizados,
 * ver src/modules/geo/coverage-service.ts), o índice que a API lê por viewport sem precisar
 * reparsear characteristics nem varrer a grade de células. A grade fina em si
 * (geo_gpon_coverage_cell) só é gravada para o nível `neighborhood` — city/uf não têm grade,
 * só o polígono e a linha de índice; o frontend escolhe o nível pela escala (mapScale.ts).
 *
 * A grade é estampada UMA VEZ, na resolução real (--cell/--radius, raio físico de uma CDO) — o
 * "chão de verdade". Os níveis city/uf NÃO re-estampam os pontos com um raio maior (isso inflava
 * a mancha bem além da cobertura real: uma CDO isolada "pintava" um disco de 2 km em vez dos
 * 200 m reais — falso positivo de cobertura numa área sem CDO nenhuma). Em vez disso, eles
 * AGREGAM a grade fina já estampada para a resolução mais grossa (aggregateCells, em
 * coverage-grid.ts): só a resolução do TRAÇADO muda por nível, a área coberta nunca passa da
 * real. A estatística (cdoTotal, disponibilidade, área coberta) sempre soma sobre a grade fina
 * remapeada para a chave do nível — não a agregada — para não herdar essa mesma distorção.
 *
 * Uma CDO é PhysicalResource com resource_type 'CTO' e nome começando em "CDO" (o tipo
 * sozinho traria CEO/CEOS, que são caixas de emenda — mesma regra da aba de Viabilidade).
 * Disponível = status 'active'; indisponível = 'suspended'/Bloqueada; 'terminated' fica de
 * fora (C6). O bairro vem de tmf_geographic_address.locality; quando o parser de endereço
 * da carga deixou ali um número (endereço curto), cai em "Sem bairro".
 *
 * Idempotente por escopo E por nível: cada execução SUBSTITUI a geração anterior do escopo em
 * cada nível ativo (apaga as Locations do prefixo daquele nível dentro do escopo e suas linhas
 * de índice/células, e reggrava). É exceção consciente a C6 — são artefatos derivados e
 * regeneráveis, não inventário (igual ao --truncate da carga de recursos).
 *
 * ⚠️ Regeneração parcial por `--city` é segura para os níveis `neighborhood` e `city` (o
 * agregado de cada um é auto-contido dentro do escopo pedido), mas NÃO para `uf` — o polígono
 * do estado precisa de TODAS as cidades daquele estado, não só da filtrada. Por isso, com
 * `--city` ativo, o nível `uf` é automaticamente pulado (nem apagado, nem regravado) — rode sem
 * `--city` (ou só com `--uf`) para atualizar o nível estadual.
 *
 * Requer o dist compilado (npm run build) — importa o algoritmo de coverage-grid.
 *
 * Uso:
 *   node scripts/build-gpon-coverage.mjs                        # dry-run, base inteira, 3 níveis
 *   node scripts/build-gpon-coverage.mjs --apply                # base inteira, 3 níveis
 *   node scripts/build-gpon-coverage.mjs --city "Niterói" --apply   # neighborhood + city só
 *   node scripts/build-gpon-coverage.mjs --uf RJ --apply
 *   node scripts/build-gpon-coverage.mjs --levels neighborhood --apply   # só o nível de bairro
 *   node scripts/build-gpon-coverage.mjs --cell 50 --radius 200 --apply  # a estampagem, base de todos os níveis
 *   node scripts/build-gpon-coverage.mjs --smooth 2 --apply        # corner-cutting do contorno
 *   # cross-DB: lê as CDOs do Oracle e grava a cobertura no Postgres/Neon
 *   node scripts/build-gpon-coverage.mjs --source oracle --target postgres --uf RJ --apply
 */

import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import {
  aggregateCells,
  neighborhoodStats,
  stampCells,
  tracePolygonsFromCells,
  COVERAGE_CELL_METERS,
  COVERAGE_CITY_CELL_METERS,
  COVERAGE_RADIUS_METERS,
  COVERAGE_SMOOTH_ITERATIONS,
  COVERAGE_MIN_COMPONENT_CELLS,
  COVERAGE_UF_CELL_METERS,
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

// A estampagem real (raio físico de uma CDO) — base de TODOS os níveis, inclusive city/uf, que
// agregam esta grade fina em vez de re-estampar com uma célula/raio maior (ver cabeçalho).
const CELL_METERS = Number(argOf('--cell', String(COVERAGE_CELL_METERS)));
const RADIUS_METERS = Number(argOf('--radius', String(COVERAGE_RADIUS_METERS)));

// Iterações de corner-cutting (Chaikin) aplicadas ao traçado do polígono — ver coverage-grid.ts.
// 0 desliga a suavização e volta ao contorno em escada. Vale para os três níveis.
const SMOOTH_ITERATIONS = Number(argOf('--smooth', String(COVERAGE_SMOOTH_ITERATIONS)));

// Descarta componentes conexos menores que isto (em células) antes de traçar o polígono — em
// área densa, o "bairro dominante por célula" deixa fragmentos de fronteira (1-3 células) para
// o bairro perdedor, que só poluem o mapa (sem CDO visível dentro, quase sempre vermelhos por
// serem sobra de um bairro pouco disponível). Não afeta a estatística do bairro (cdoTotal etc.
// continuam contando os CDOs reais). 0 desliga o filtro. Só para `neighborhood` — city/uf usam
// 1 (uma cidade pequena pode ser só 1-2 células na grade grossa; descartar seria perder o
// município inteiro do mapa).
const MIN_COMPONENT_CELLS = Number(argOf('--min-cells', String(COVERAGE_MIN_COMPONENT_CELLS)));

// Resolução do ÍNDICE de células gravado (geo_gpon_coverage_cell), que serve só para achar
// polígonos por bbox — o polígono em si continua traçado em `--cell` (suave). Com `--index-cell`
// maior que `--cell`, agrega o índice (célula grossa → polígono dominante), reduzindo MUITO as
// linhas gravadas — útil quando o destino tem pouco espaço (ex.: Neon). Default: igual a --cell.
// Só se aplica ao nível `neighborhood` (o único que grava geo_gpon_coverage_cell).
const INDEX_CELL_METERS = Number(argOf('--index-cell', String(CELL_METERS)));

// Quais níveis (re)gerar nesta execução — default os três. Útil para iterar rápido num nível só
// (ex.: ajustar --smooth do bairro sem regravar city/uf, que são baratos mas desnecessários).
const LEVELS_ARG = argOf('--levels', 'neighborhood,city,uf')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

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

// Descrição de cada nível de LOD: célula de traçado, piso de componente, o prefixo de
// reference_point usado tanto para gravar quanto para escopar a regeneração, e `keyOf` — deriva
// a chave do nível a partir da chave de BAIRRO (`<uf>|<city>|<bairro>`, já a forma de
// `cdo.neighborhoodKey`/`cell.neighborhoodKey`) por simples truncamento, sem re-estampar nada.
// `active` é reavaliado em main() depois que --levels/--city são conhecidos.
const LEVELS = [
  {
    level: 'neighborhood',
    prefix: 'GPON:',
    cellMeters: CELL_METERS,
    minComponentCells: MIN_COMPONENT_CELLS,
    keyOf: (bairroKey) => bairroKey,
  },
  {
    level: 'city',
    prefix: 'GPON-CITY:',
    cellMeters: COVERAGE_CITY_CELL_METERS,
    minComponentCells: 1,
    keyOf: (bairroKey) => bairroKey.split('|').slice(0, 2).join('|'),
  },
  {
    level: 'uf',
    prefix: 'GPON-UF:',
    cellMeters: COVERAGE_UF_CELL_METERS,
    minComponentCells: 1,
    keyOf: (bairroKey) => bairroKey.split('|')[0],
  },
];
const KNOWN_LEVELS = new Set(LEVELS.map((entry) => entry.level));

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

// Garante geo_gpon_coverage_area — mesmo espírito/motivo de ensureCoverageTable acima. Os
// índices por bbox (idx_geo_gpon_coverage_area_bbox/_rank) ficam a cargo do schema init do app
// no Oracle, igual a geo_gpon_coverage_cell; no Postgres o próprio script já os cria.
async function ensureCoverageAreaTable(client) {
  if (client.provider === 'oracle') {
    const ddl = `CREATE TABLE geo_gpon_coverage_area (
      tenant_id VARCHAR2(36 CHAR) DEFAULT 'default' NOT NULL,
      location_id VARCHAR2(36 CHAR) NOT NULL,
      lod_level VARCHAR2(255 CHAR) NOT NULL,
      cell_size_m NUMBER(10) NOT NULL,
      min_lng BINARY_DOUBLE NOT NULL,
      min_lat BINARY_DOUBLE NOT NULL,
      max_lng BINARY_DOUBLE NOT NULL,
      max_lat BINARY_DOUBLE NOT NULL,
      area_key VARCHAR2(255 CHAR) NOT NULL,
      neighborhood VARCHAR2(255 CHAR),
      city VARCHAR2(255 CHAR),
      uf VARCHAR2(255 CHAR),
      cdo_total NUMBER(10) DEFAULT 0 NOT NULL,
      cdo_available NUMBER(10) DEFAULT 0 NOT NULL,
      covered_area_km2 BINARY_DOUBLE DEFAULT 0 NOT NULL,
      ports_total NUMBER(10),
      ports_used NUMBER(10),
      generated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, location_id)
    )`;
    try {
      await client.query(ddl);
      console.log('Tabela geo_gpon_coverage_area criada no Oracle.');
    } catch (error) {
      if (!/ORA-00955/.test(String(error?.message ?? error))) throw error;
    }
    return;
  }
  await client.query(`CREATE TABLE IF NOT EXISTS geo_gpon_coverage_area (
    tenant_id TEXT NOT NULL DEFAULT 'default',
    location_id TEXT NOT NULL,
    lod_level TEXT NOT NULL,
    cell_size_m INTEGER NOT NULL,
    min_lng REAL NOT NULL,
    min_lat REAL NOT NULL,
    max_lng REAL NOT NULL,
    max_lat REAL NOT NULL,
    area_key TEXT NOT NULL,
    neighborhood TEXT,
    city TEXT,
    uf TEXT,
    cdo_total INTEGER NOT NULL DEFAULT 0,
    cdo_available INTEGER NOT NULL DEFAULT 0,
    covered_area_km2 REAL NOT NULL DEFAULT 0,
    ports_total INTEGER,
    ports_used INTEGER,
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, location_id)
  )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_area_bbox ON geo_gpon_coverage_area(tenant_id, lod_level, min_lng, max_lng, min_lat, max_lat)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_area_rank ON geo_gpon_coverage_area(tenant_id, lod_level, cdo_total)`,
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

// Bbox [minLng, minLat, maxLng, maxLat] do anel externo do polígono — vai para
// geo_gpon_coverage_area, é o que a API usa pra recortar por viewport sem tocar na geometria.
function polygonBounds(geometry) {
  const ring = geometry.coordinates[0] ?? [];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

// Escopo em JS: reference_point = "<prefix><uf>|<city>|<bairro>" (neighborhood),
// "<prefix><uf>|<city>" (city) ou "<prefix><uf>" (uf). Sem --city/--uf, tudo entra. Um filtro
// que o nível não tem componente para (ex.: --city num reference_point de nível `uf`, que só
// tem uf) é ignorado nesse componente — mas esse caso nunca chega aqui: o nível `uf` é
// desativado inteiro quando --city está setado (ver activeLevels).
function inScope(referencePoint, prefix) {
  const key = String(referencePoint ?? '').slice(prefix.length);
  const [uf, city] = key.split('|');
  if (UF && (uf ?? '').toUpperCase() !== UF.toUpperCase()) return false;
  if (CITY && city !== undefined && city !== CITY) return false;
  return true;
}

// Quais níveis esta execução deve (re)gerar: interseção de --levels com a lista conhecida,
// exceto `uf` quando --city está ativo (ver ⚠️ no cabeçalho do arquivo — polígono estadual
// precisa de todas as cidades do estado, não só da filtrada).
function activeLevels() {
  const requested = LEVELS_ARG.filter((name) => KNOWN_LEVELS.has(name));
  const invalid = LEVELS_ARG.filter((name) => !KNOWN_LEVELS.has(name));
  if (invalid.length > 0) throw new Error(`--levels desconhecido(s): ${invalid.join(', ')}`);
  if (requested.length === 0) throw new Error('--levels não pode ficar vazio');
  return LEVELS.filter((entry) => {
    if (!requested.includes(entry.level)) return false;
    if (entry.level === 'uf' && CITY) return false;
    return true;
  });
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
  const levels = activeLevels();
  if (CITY && LEVELS_ARG.includes('uf')) {
    console.log('Nível uf : pulado (regeneração parcial por --city não cobre o estado inteiro)');
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

    // `resource_type` não é coluna de tmf_physical_resource — o schema canônico (schema.ts)
    // nunca a declarou ali; resourceType é sempre derivado via JOIN com a especificação, igual
    // ao resto da aplicação (ex.: resource/service.ts). Uma coluna homônima chegou a existir só
    // no Oracle NEXUS_DEV_ como drift de schema (nunca migrada de fato) e foi removida — ler por
    // ela aqui já estava incorreto mesmo antes disso, só não dava erro OBS-01400/coluna ausente
    // no Postgres por a coluna nunca ter existido lá.
    const { rows } = await source.query(
      `SELECT r.id, r.name, r.status, l.geometry,
              a.locality, a.city, a.state_or_province, a.street_nr
         FROM tmf_physical_resource r
         JOIN tmf_resource_specification s ON s.id = r.resource_specification_id
         JOIN tmf_geographic_location l ON l.id = r.place_id
         LEFT JOIN tmf_geographic_address a ON a.geographic_location_id = r.place_id
        WHERE s.resource_type = 'CTO'
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
    console.log(`Níveis   : ${levels.map((entry) => entry.level).join(', ')}`);
    console.log(
      `CDOs     : ${cdos.length} elegíveis${skippedGeometry ? ` (${skippedGeometry} sem geometria válida)` : ''}`,
    );

    if (cdos.length === 0) {
      console.log('\nNenhuma CDO no escopo — nada a gerar.');
      return;
    }

    // ---- algoritmo ----
    // Estampagem ÚNICA, na resolução real (--cell/--radius) — o chão de verdade de onde vem a
    // geometria dos três níveis (ver cabeçalho do arquivo). writesByLevel guarda o que cada nível
    // vai gravar (locations/areaRows/cells), calculado já no dry-run para o relatório sair
    // idêntico ao --apply real.
    const fineCells = stampCells(cdos, CELL_METERS, RADIUS_METERS);
    const writesByLevel = [];
    for (const levelConfig of levels) {
      const isNeighborhood = levelConfig.level === 'neighborhood';
      const cdosForLevel = isNeighborhood
        ? cdos
        : cdos.map((cdo) => ({ ...cdo, neighborhoodKey: levelConfig.keyOf(cdo.neighborhoodKey) }));

      // Estatística (CDOs reais, disponibilidade, área coberta) sempre soma a grade FINA — só
      // remapeada para a chave do nível — nunca a agregada, para não herdar a distorção que a
      // agregação evita na geometria.
      const statsCells = isNeighborhood
        ? fineCells
        : fineCells.map((cell) => ({ ...cell, neighborhoodKey: levelConfig.keyOf(cell.neighborhoodKey) }));
      const neighborhoods = neighborhoodStats(cdosForLevel, statsCells, CELL_METERS);

      // Geometria (o traçado do polígono) usa a grade agregada na resolução do nível — mais
      // barata de transmitir, mas nunca maior que onde a grade fina real já mostrava cobertura.
      const geometryCells = isNeighborhood
        ? fineCells
        : aggregateCells(fineCells, CELL_METERS, levelConfig.cellMeters, levelConfig.keyOf);
      const components = tracePolygonsFromCells(geometryCells, levelConfig.cellMeters, {
        smoothIterations: SMOOTH_ITERATIONS,
        minComponentCells: levelConfig.minComponentCells,
      });
      const cellCount = components.reduce((sum, component) => sum + component.cells.length, 0);
      const vertexCount = components.reduce(
        (sum, component) =>
          sum + component.geometry.coordinates.reduce((inner, ring) => inner + ring.length, 0),
        0,
      );
      const avgVertices = components.length ? (vertexCount / components.length).toFixed(1) : '0';

      neighborhoods.sort((a, b) => b.cdoTotal - a.cdoTotal);
      console.log(`\n[${levelConfig.level}] célula ${levelConfig.cellMeters} m`);
      console.log(`  áreas      : ${neighborhoods.length}`);
      console.log(`  componentes: ${components.length}`);
      console.log(`  células    : ${cellCount}`);
      console.log(`  vértices   : ${vertexCount} total · ${avgVertices} em média por polígono`);
      console.log('  top 5 por CDOs:');
      for (const stat of neighborhoods.slice(0, 5)) {
        const pct = (stat.availabilityRatio * 100).toFixed(1);
        const label =
          levelConfig.level === 'uf' ? stat.uf : levelConfig.level === 'city' ? stat.city : stat.neighborhood;
        console.log(
          `     ${label}: ${stat.cdoTotal} CDOs · ${stat.cdoAvailable} disp. (${pct}%) · ${stat.coveredAreaKm2.toFixed(2)} km²`,
        );
      }

      const statByKey = new Map(neighborhoods.map((stat) => [stat.key, stat]));
      const locations = [];
      const areaRows = [];
      const cells = [];
      for (const component of components) {
        const stat = statByKey.get(component.neighborhoodKey);
        if (!stat) continue;
        const locId = randomUUID();
        locations.push({
          id: locId,
          geometry_type: 'Polygon',
          geometry: JSON.stringify(component.geometry),
          spatial_ref: 'EPSG:4326',
          reference_point: `${levelConfig.prefix}${component.neighborhoodKey}`.slice(0, 255),
          characteristics: JSON.stringify(coverageChars(stat, levelConfig)),
        });
        const bounds = polygonBounds(component.geometry);
        areaRows.push({
          tenant_id: TENANT,
          location_id: locId,
          lod_level: levelConfig.level,
          cell_size_m: levelConfig.cellMeters,
          min_lng: bounds.minLng,
          min_lat: bounds.minLat,
          max_lng: bounds.maxLng,
          max_lat: bounds.maxLat,
          area_key: component.neighborhoodKey,
          neighborhood: levelConfig.level === 'neighborhood' ? stat.neighborhood : null,
          city: levelConfig.level === 'uf' ? null : stat.city,
          uf: stat.uf,
          cdo_total: stat.cdoTotal,
          cdo_available: stat.cdoAvailable,
          covered_area_km2: stat.coveredAreaKm2,
          ports_total: null,
          ports_used: null,
        });
        if (levelConfig.level === 'neighborhood') {
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
      }
      writesByLevel.push({ levelConfig, locations, areaRows, cells });
    }

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
      return;
    }

    // ---- gravação no DESTINO ----
    // As tabelas de projeção são do loader — cria se faltar (dispensa restart do backend).
    await ensureCoverageTable(target);
    await ensureCoverageAreaTable(target);

    await target.query('BEGIN');
    // ROLLBACK explícito em erro: no Oracle o `close()` do loader-db faz commit() no
    // finally, então sem isto uma falha no meio (ex.: insert de células) deixaria os
    // polígonos já inseridos comitados — cobertura parcial. Como é idempotente por
    // escopo/nível, a próxima execução limparia, mas melhor não gravar lixo de saída.
    try {
      let removedAreasTotal = 0;
      let removedCellsTotal = 0;
      let removedIndexTotal = 0;
      let insertedLocationsTotal = 0;
      let insertedCellsTotal = 0;
      let insertedIndexTotal = 0;

      for (const { levelConfig, locations, areaRows, cells } of writesByLevel) {
        // Substitui a geração anterior DO ESCOPO, NESTE NÍVEL: acha as Locations do prefixo do
        // nível, apaga suas células/índice e depois as próprias Locations. Filtra o escopo em JS
        // (uf/city do reference_point) para não depender de LIKE com acento/caractere especial.
        const { rows: existing } = await target.query(
          `SELECT id, reference_point FROM tmf_geographic_location WHERE reference_point LIKE $1`,
          [`${levelConfig.prefix}%`],
        );
        const staleIds = existing
          .filter((row) => inScope(row.reference_point, levelConfig.prefix))
          .map((row) => row.id);

        if (levelConfig.level === 'neighborhood') {
          removedCellsTotal += await deleteByIds(
            target,
            'geo_gpon_coverage_cell',
            'coverage_area_id',
            staleIds,
          );
        }
        removedIndexTotal += await deleteByIds(
          target,
          'geo_gpon_coverage_area',
          'location_id',
          staleIds,
        );
        removedAreasTotal += await deleteByIds(target, 'tmf_geographic_location', 'id', staleIds);

        insertedLocationsTotal += await target.bulkInsert(
          'tmf_geographic_location',
          [
            'id',
                'geometry_type',
            'geometry',
            'spatial_ref',
            'reference_point',
            'characteristics',
          ],
          locations,
        );
        insertedIndexTotal += await target.bulkInsert(
          'geo_gpon_coverage_area',
          [
            'tenant_id',
            'location_id',
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
            'cdo_total',
            'cdo_available',
            'covered_area_km2',
            'ports_total',
            'ports_used',
          ],
          areaRows,
        );
        if (levelConfig.level === 'neighborhood') {
          // Índice de células gravado na resolução de --index-cell (agrega o fino se for maior).
          const indexCells = aggregateIndex(cells);
          // DO NOTHING protege a fronteira entre municípios em cargas por-cidade: uma célula já
          // gravada por outro município (não apagada por este escopo) é preservada.
          insertedCellsTotal += await target.bulkInsert(
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
        }
      }

      await target.query('COMMIT');

      console.log('\nGravado:');
      console.log(
        `  removidos (regeneração): ${removedAreasTotal} polígonos · ${removedCellsTotal} células · ${removedIndexTotal} linhas de índice`,
      );
      console.log(`  polígonos de cobertura : ${insertedLocationsTotal}`);
      console.log(`  linhas de índice (área): ${insertedIndexTotal}`);
      console.log(`  células de grade        : ${insertedCellsTotal}`);
    } catch (err) {
      await target.query('ROLLBACK');
      throw err;
    }
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
  if (factor <= 1) {
    // Sem agregação de índice, mas ainda é preciso COLAPSAR células repetidas: a
    // mesma grid_x/grid_y aparece em componentes vizinhos (fronteira de bairro), e
    // sem dedup dá violação da PK (tenant_id, grid_size_m, grid_x, grid_y). Mantém a
    // PRIMEIRA ocorrência — mesma semântica do ON CONFLICT DO NOTHING do Postgres.
    const seen = new Map();
    for (const cell of cells) {
      const key = `${cell.grid_size_m},${cell.grid_x},${cell.grid_y}`;
      if (!seen.has(key)) seen.set(key, cell);
    }
    return [...seen.values()];
  }
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

function coverageChars(stat, levelConfig) {
  return [
    { group: '_coverage', name: 'kind', value: 'GponCoverage', valueType: 'string' },
    { group: '_coverage', name: 'level', value: levelConfig.level, valueType: 'string' },
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
    {
      group: '_coverage',
      name: 'radiusMeters',
      value: RADIUS_METERS,
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'cellSizeMeters',
      value: levelConfig.cellMeters,
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'smoothIterations',
      value: SMOOTH_ITERATIONS,
      valueType: 'integer',
    },
    {
      group: '_coverage',
      name: 'minComponentCells',
      value: levelConfig.minComponentCells,
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
