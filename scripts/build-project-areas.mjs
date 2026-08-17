#!/usr/bin/env node
/**
 * Geração das manchas de concentração/dispersão de um Projeto de trabalho (REQ-MOD01-017).
 *
 * Um Projeto (REQ-MOD01-015) carregado em massa acumula dezenas de milhares de
 * GeographicSite; olhar pin a pin não revela onde a planta está de fato concentrada nem onde
 * há erro de coordenada/cadastro (locais isolados, longe do resto). Este script agrupa os
 * locais do projeto por proximidade espacial (raio de 200 m, mesma técnica de
 * src/modules/geo/coverage-grid.ts — grade Mercator + componente conexo + contorno suavizado
 * via src/modules/geo/project-area-grid.ts) e grava:
 *
 *   · um POLÍGONO por mancha → tmf_geographic_location (Polygon, TMF675), `reference_point`
 *     "PROJECT:<projectId>". É a geometria que o mapa desenha em qualquer escala.
 *   · o VÍNCULO com o projeto → geo_project_area (kind, siteCount, siteIds de amostra,
 *     centroide, área), gêmea de geo_project_site.
 *
 * Mancha com `--min-sites` locais (default 5) ou mais é "concentration" (azul); abaixo disso é
 * "dispersion" (roxo) — candidato a erro de coordenada. O relatório lista as dispersões com a
 * distância ao centroide da maior concentração, para apontar o outlier a investigar.
 *
 * Idempotente por projeto: cada execução SUBSTITUI a geração anterior DAQUELE projeto (apaga as
 * Locations "PROJECT:<id>" e os vínculos, e regrava) — artefato derivado e regenerável, exceção
 * consciente a C6 (mesmo trade-off de geo_gpon_coverage_cell/build-gpon-coverage.mjs).
 *
 * Requer o dist compilado (npm run build) — importa o algoritmo de project-area-grid.
 *
 * Uso:
 *   node scripts/build-project-areas.mjs --project "Onitel - Novo Gama"            # dry-run
 *   node scripts/build-project-areas.mjs --project "Onitel - Novo Gama" --apply
 *   node scripts/build-project-areas.mjs --all --apply                            # todo projeto do tenant
 *   node scripts/build-project-areas.mjs --project "..." --radius 200 --min-sites 5 --apply
 *   # cross-DB: lê os locais do Oracle e grava as manchas no Postgres/Neon
 *   node scripts/build-project-areas.mjs --project "..." --source oracle --target postgres --apply
 */

import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import {
  buildProjectAreas,
  PROJECT_AREA_RADIUS_METERS,
  PROJECT_AREA_CELL_METERS,
  PROJECT_AREA_MIN_SITES,
} from '../dist/src/modules/geo/project-area-grid.js';
import { haversineMeters } from '../dist/src/modules/geo/coverage-grid.js';

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const APPLY = has('--apply');
const ALL = has('--all');
const PROJECT_NAME = argOf('--project', null);
const TENANT = argOf('--tenant', 'default');
const RADIUS_METERS = Number(argOf('--radius', String(PROJECT_AREA_RADIUS_METERS)));
const CELL_METERS = Number(argOf('--cell', String(PROJECT_AREA_CELL_METERS)));
const MIN_SITES = Number(argOf('--min-sites', String(PROJECT_AREA_MIN_SITES)));

// Cross-DB, mesmo padrão de build-gpon-coverage.mjs: `--source` é de onde vêm os locais,
// `--target` é onde as manchas são gravadas. Sem eles, cai no DATABASE_PROVIDER.
const SOURCE_PROVIDER = argOf('--source', process.env.DATABASE_PROVIDER ?? 'postgres');
const TARGET_PROVIDER = argOf('--target', SOURCE_PROVIDER);

const GENERATED_AT = new Date().toISOString();
const GENERATOR = 'build-project-areas';

async function main() {
  if (!PROJECT_NAME && !ALL) {
    throw new Error('informe --project "<nome>" ou --all');
  }
  if (PROJECT_NAME && ALL) {
    throw new Error('--project e --all são exclusivos');
  }
  if (!Number.isFinite(RADIUS_METERS) || RADIUS_METERS <= 0) throw new Error('--radius inválido');
  if (!Number.isFinite(CELL_METERS) || CELL_METERS <= 0) throw new Error('--cell inválido');
  if (!Number.isFinite(MIN_SITES) || MIN_SITES < 1) throw new Error('--min-sites inválido');

  const source = await openLoaderDb({ provider: SOURCE_PROVIDER });
  const target =
    TARGET_PROVIDER === SOURCE_PROVIDER
      ? source
      : await openLoaderDb({ provider: TARGET_PROVIDER });
  try {
    if (source !== target) {
      console.log(`Origem   : locais em ${SOURCE_PROVIDER} → manchas em ${TARGET_PROVIDER}`);
    }
    await ensureProjectAreaTable(target);

    const projects = await resolveProjects(source);
    if (projects.length === 0) {
      console.log('Nenhum projeto encontrado no escopo.');
      return;
    }

    for (const project of projects) {
      await processProject(source, target, project);
    }
  } finally {
    await target.close();
    if (target !== source) await source.close();
  }
}

async function resolveProjects(source) {
  if (ALL) {
    const { rows } = await source.query(
      `SELECT id, name FROM geo_project WHERE tenant_id = $1 ORDER BY name`,
      [TENANT],
    );
    return rows;
  }
  const { rows } = await source.query(
    `SELECT id, name FROM geo_project WHERE tenant_id = $1 AND name = $2`,
    [TENANT, PROJECT_NAME],
  );
  if (rows.length === 0) {
    throw new Error(`Nenhum projeto com o nome "${PROJECT_NAME}" (tenant ${TENANT}).`);
  }
  if (rows.length > 1) {
    throw new Error(
      `Mais de um projeto com o nome "${PROJECT_NAME}" — desambigue por id manualmente.`,
    );
  }
  return rows;
}

async function processProject(source, target, project) {
  console.log(`\n=== Projeto: ${project.name} (${project.id}) ===`);

  const { rows } = await source.query(
    `SELECT s.id, l.geometry
       FROM geo_project_site ps
       JOIN tmf_geographic_site s ON s.id = ps.site_id
       LEFT JOIN tmf_geographic_location l ON l.id = s.geographic_location_id
      WHERE ps.project_id = $1`,
    [project.id],
  );

  const points = [];
  let skippedGeometry = 0;
  for (const row of rows) {
    let geometry;
    try {
      geometry = JSON.parse(row.geometry);
    } catch {
      skippedGeometry += 1;
      continue;
    }
    const coordinates = geometry?.coordinates;
    if (geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2) {
      skippedGeometry += 1;
      continue;
    }
    const [lng, lat] = coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      skippedGeometry += 1;
      continue;
    }
    points.push({ siteId: row.id, lng, lat });
  }

  console.log(
    `Locais   : ${rows.length} vinculados · ${points.length} com coordenada válida` +
      (skippedGeometry ? ` · ${skippedGeometry} sem geometria` : ''),
  );

  if (points.length === 0) {
    console.log('Nenhum local com coordenada — nada a gerar.');
    return;
  }

  const { areas, orphanSiteIds } = buildProjectAreas(points, {
    radiusMeters: RADIUS_METERS,
    cellMeters: CELL_METERS,
    minSites: MIN_SITES,
  });

  const concentrations = areas.filter((area) => area.kind === 'concentration');
  const dispersions = areas.filter((area) => area.kind === 'dispersion');
  const sitesInConcentrations = concentrations.reduce((sum, area) => sum + area.siteCount, 0);
  const sitesInDispersions = dispersions.reduce((sum, area) => sum + area.siteCount, 0);

  console.log(
    `Grade    : célula ${CELL_METERS} m · raio ${RADIUS_METERS} m · limiar ${MIN_SITES} locais`,
  );
  console.log(
    `Manchas  : ${concentrations.length} concentração(ões) · ${sitesInConcentrations} locais`,
  );
  console.log(`           ${dispersions.length} dispersão(ões) · ${sitesInDispersions} locais`);
  if (orphanSiteIds.length > 0) {
    console.log(`Órfãos   : ${orphanSiteIds.length} locais sem mancha (grade degenerada)`);
  }

  if (dispersions.length > 0) {
    const largest = concentrations.slice().sort((a, b) => b.siteCount - a.siteCount)[0];
    console.log('\nDispersões (candidatas a erro de coordenada/cadastro):');
    const sorted = dispersions.slice().sort((a, b) => b.siteCount - a.siteCount);
    for (const area of sorted.slice(0, 20)) {
      const distanceKm = largest
        ? (
            haversineMeters(
              area.centroid[0],
              area.centroid[1],
              largest.centroid[0],
              largest.centroid[1],
            ) / 1000
          ).toFixed(1)
        : '?';
      console.log(
        `   ${area.siteCount} local(is) · [${area.centroid[0]}, ${area.centroid[1]}] · ` +
          `${distanceKm} km da maior concentração`,
      );
    }
    if (sorted.length > 20) console.log(`   … e mais ${sorted.length - 20} dispersão(ões).`);
  }

  if (!APPLY) {
    console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
    return;
  }

  const locations = areas.map((area) => {
    const locId = randomUUID();
    return {
      id: locId,
      href: `/tmf-api/geographicLocationManagement/v4/geographicLocation/${locId}`,
      area,
    };
  });

  await target.query('BEGIN');
  try {
    const { rows: existing } = await target.query(
      `SELECT location_id FROM geo_project_area WHERE project_id = $1`,
      [project.id],
    );
    if (existing.length > 0) {
      await target.query(`DELETE FROM geo_project_area WHERE project_id = $1`, [project.id]);
      await deleteByIds(
        target,
        'tmf_geographic_location',
        'id',
        existing.map((row) => row.location_id),
      );
    }

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
      locations.map((entry) => ({
        id: entry.id,
        href: entry.href,
        geometry_type: 'Polygon',
        geometry: JSON.stringify(entry.area.geometry),
        spatial_ref: 'EPSG:4326',
        reference_point: `PROJECT:${project.id}`.slice(0, 255),
        characteristics: JSON.stringify(areaChars(entry.area)),
      })),
    );

    const insertedAreas = await target.bulkInsert(
      'geo_project_area',
      [
        'project_id',
        'location_id',
        'kind',
        'site_count',
        'site_ids',
        'centroid_lng',
        'centroid_lat',
        'area_km2',
        'position',
      ],
      locations.map((entry, position) => ({
        project_id: project.id,
        location_id: entry.id,
        kind: entry.area.kind,
        site_count: entry.area.siteCount,
        site_ids: JSON.stringify(entry.area.siteIds),
        centroid_lng: entry.area.centroid[0],
        centroid_lat: entry.area.centroid[1],
        area_km2: entry.area.areaKm2,
        position,
      })),
    );

    await target.query(`UPDATE geo_project SET updated_at = $1 WHERE id = $2`, [
      GENERATED_AT,
      project.id,
    ]);

    await target.query('COMMIT');
    console.log(
      `\nGravado: ${insertedLocations} polígono(s) · ${insertedAreas} vínculo(s) ` +
        `(removidos ${existing.length} da geração anterior)`,
    );
  } catch (err) {
    await target.query('ROLLBACK');
    throw err;
  }
}

function areaChars(area) {
  return [
    { group: '_projectArea', name: 'kind', value: area.kind, valueType: 'string' },
    { group: '_projectArea', name: 'siteCount', value: area.siteCount, valueType: 'integer' },
    { group: '_projectArea', name: 'areaKm2', value: area.areaKm2, valueType: 'decimal' },
    { group: '_projectArea', name: 'radiusMeters', value: RADIUS_METERS, valueType: 'integer' },
    { group: '_projectArea', name: 'cellSizeMeters', value: CELL_METERS, valueType: 'integer' },
    { group: '_projectArea', name: 'minSites', value: MIN_SITES, valueType: 'integer' },
    { group: '_projectArea', name: 'generatedAt', value: GENERATED_AT, valueType: 'date' },
    { group: '_projectArea', name: 'generator', value: GENERATOR, valueType: 'string' },
  ];
}

// Insere ids em blocos e apaga por bloco — mesmo padrão de build-gpon-coverage.mjs (evita
// estourar o limite de parâmetros de uma única query com milhares de ids).
async function deleteByIds(client, table, column, ids) {
  for (let i = 0; i < ids.length; i += 500) {
    const block = ids.slice(i, i + 500);
    const placeholders = block.map((_, index) => `$${index + 1}`).join(', ');
    await client.query(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`, block);
  }
}

// Garante geo_project_area — a tabela já entra no schema init do app (schema.ts), mas o script
// pode rodar contra um banco de dev que ainda não subiu o backend depois da migração; cria se
// faltar em vez de depender de um restart (mesmo raciocínio de ensureCoverageTable).
async function ensureProjectAreaTable(client) {
  if (client.provider === 'oracle') {
    const ddl = `CREATE TABLE geo_project_area (
      project_id VARCHAR2(36 CHAR) NOT NULL,
      location_id VARCHAR2(36 CHAR) NOT NULL,
      kind VARCHAR2(255 CHAR) NOT NULL,
      site_count NUMBER(10) DEFAULT 0 NOT NULL,
      site_ids CLOB,
      centroid_lng BINARY_DOUBLE,
      centroid_lat BINARY_DOUBLE,
      area_km2 BINARY_DOUBLE,
      position NUMBER(10) DEFAULT 0 NOT NULL,
      generated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, location_id)
    )`;
    try {
      await client.query(ddl);
      console.log('Tabela geo_project_area criada no Oracle.');
    } catch (error) {
      if (!/ORA-00955/.test(String(error?.message ?? error))) throw error;
    }
    return;
  }
  await client.query(`CREATE TABLE IF NOT EXISTS geo_project_area (
    project_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    site_count INTEGER NOT NULL DEFAULT 0,
    site_ids TEXT,
    centroid_lng REAL,
    centroid_lat REAL,
    area_km2 REAL,
    position INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, location_id)
  )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_project_area_project ON geo_project_area(project_id, position)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
