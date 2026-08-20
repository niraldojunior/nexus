#!/usr/bin/env node
/**
 * Linha de base de performance do mapa (Fase 0 do plano de reengenharia da exibição de
 * recursos — issue #69). Roda os MESMOS caminhos de código que o endpoint
 * `GET /v1/geo/tree/viewport` usa (GeoTreeService.resourcesInViewport / sitesInViewport),
 * contra um conjunto fixo de bboxes reais, e reporta tempo, contagem de linhas e bytes de
 * payload. Serve para medir "antes" de cada fase e comparar "depois" com o mesmo comando.
 *
 * Uso:
 *   npm run build
 *   node scripts/bench-viewport.mjs                 # todas as áreas, 3 repetições cada
 *   node scripts/bench-viewport.mjs --reps 5
 *   node scripts/bench-viewport.mjs --area niteroi-denso
 *   node scripts/bench-viewport.mjs --explain        # inclui EXPLAIN ANALYZE do SQL de viewport
 */
import { config as loadEnv } from 'dotenv';
import { PostgresDatabase } from '../dist/src/shared/persistence/postgres-database.js';
import { GeoTreeService } from '../dist/src/modules/geo/tree-service.js';

loadEnv({ quiet: true });

const args = process.argv.slice(2);
const argOf = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const reps = Number(argOf('--reps') ?? 3);
const areaFilter = argOf('--area');
const explain = args.includes('--explain');

// Bboxes fixos, escolhidos para cobrir o espectro de densidade que o mapa enfrenta hoje —
// mesma coordenada-âncora que scripts/seed-gpon-niteroi.mjs usa para Icaraí. `meters` é o
// lado aproximado do quadrado, na régua de escala de detalhe do mapa (PASSIVE_INFRA_MAX_SCALE_METERS
// = 50 m — ver web/src/utils/mapScale.ts); os bboxes "amplo" simulam um zoom-out acima do
// teto de escala, para medir o pior caso de fora do LOD de detalhe.
const AREAS = [
  { name: 'niteroi-denso-200m', center: [-43.1062, -22.9028], meters: 200 },
  { name: 'niteroi-denso-1km', center: [-43.1062, -22.9028], meters: 1000 },
  { name: 'rio-centro-1km', center: [-43.1729, -22.9068], meters: 1000 },
  { name: 'rj-amplo-20km', center: [-43.1062, -22.9028], meters: 20_000 },
  { name: 'go-goiania-1km', center: [-49.2643, -16.6799], meters: 1000 },
  { name: 'pr-curitiba-1km', center: [-49.2733, -25.4284], meters: 1000 },
  { name: 'area-vazia-1km', center: [-51.9253, -14.235], meters: 1000 },
];

// Conversão metro → grau na latitude do centro (mesma aproximação usada nos scripts de seed).
function bboxFor(center, meters) {
  const [lng, lat] = center;
  const dLat = meters / 2 / 111_320;
  const dLng = meters / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { minLng: lng - dLng, minLat: lat - dLat, maxLng: lng + dLng, maxLat: lat + dLat };
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function fmtMs(ms) {
  return `${ms.toFixed(1)}ms`;
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

async function benchArea(geoTreeService, area) {
  const bounds = bboxFor(area.center, area.meters);
  const timingsMs = [];
  let rowCount = 0;
  let bytes = 0;

  for (let i = 0; i < reps; i += 1) {
    const t0 = performance.now();
    const [resources, sites] = await Promise.all([
      geoTreeService.resourcesInViewport(bounds),
      geoTreeService.sitesInViewport(bounds),
    ]);
    const elapsed = performance.now() - t0;
    timingsMs.push(elapsed);
    rowCount = resources.length + sites.length;
    bytes = Buffer.byteLength(JSON.stringify([...resources, ...sites]), 'utf8');
  }

  timingsMs.sort((a, b) => a - b);
  return {
    area: area.name,
    meters: area.meters,
    rows: rowCount,
    bytes,
    minMs: timingsMs[0],
    p50Ms: percentile(timingsMs, 0.5),
    p95Ms: percentile(timingsMs, 0.95),
    maxMs: timingsMs[timingsMs.length - 1],
  };
}

async function explainArea(db, area) {
  const bounds = bboxFor(area.center, area.meters);
  const quad = [bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat];
  // Mesmo bloco de ponto que viewportBlock(PhysicalResource, VIEWPORT_POINT_WHERE) monta —
  // reproduzido aqui só para o EXPLAIN; não reimplementa a busca de verdade (essa vem do
  // GeoTreeService acima).
  const sql = `EXPLAIN ANALYZE
    SELECT r.id FROM tmf_physical_resource r
      JOIN tmf_geographic_location l ON l.id = r.place_id
     WHERE r.status <> 'terminated'
       AND l.geometry_type = 'Point'
       AND r.resource_type IS DISTINCT FROM 'Splitter'
       AND (l.geometry::jsonb->'coordinates'->>0)::float8 BETWEEN $1 AND $2
       AND (l.geometry::jsonb->'coordinates'->>1)::float8 BETWEEN $3 AND $4`;
  const result = await db.all(sql, quad);
  console.log(`\n--- EXPLAIN ANALYZE (bloco ponto, PhysicalResource) — ${area.name} ---`);
  for (const row of result) console.log(Object.values(row)[0]);
}

async function main() {
  const url = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_DEV (ou DATABASE_URL) não definido no .env');

  const db = PostgresDatabase.getInstance(url);
  await db.initialize();
  const geoTreeService = new GeoTreeService(db);

  const areas = areaFilter ? AREAS.filter((a) => a.name === areaFilter) : AREAS;
  if (areas.length === 0) {
    console.error(`Área "${areaFilter}" não encontrada. Disponíveis: ${AREAS.map((a) => a.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Bench viewport — ${reps} repetições por área\n`);
  const results = [];
  for (const area of areas) {
    process.stdout.write(`  ${area.name}... `);
    const result = await benchArea(geoTreeService, area);
    results.push(result);
    console.log('ok');
    if (explain) await explainArea(db, area);
  }

  console.log('\n' + '='.repeat(96));
  console.log(
    'área'.padEnd(22),
    'lado'.padStart(8),
    'linhas'.padStart(8),
    'bytes'.padStart(10),
    'min'.padStart(9),
    'p50'.padStart(9),
    'p95'.padStart(9),
    'max'.padStart(9),
  );
  console.log('-'.repeat(96));
  for (const r of results) {
    console.log(
      r.area.padEnd(22),
      `${r.meters}m`.padStart(8),
      String(r.rows).padStart(8),
      fmtBytes(r.bytes).padStart(10),
      fmtMs(r.minMs).padStart(9),
      fmtMs(r.p50Ms).padStart(9),
      fmtMs(r.p95Ms).padStart(9),
      fmtMs(r.maxMs).padStart(9),
    );
  }
  console.log('='.repeat(96));

  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
