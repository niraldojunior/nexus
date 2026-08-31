#!/usr/bin/env node
/**
 * Gera o índice de exibição do mapa (`geo_map_feature` — Fase 2 do plano de reengenharia da
 * performance do mapa, issue #69). Artefato derivado e regenerável, mesmo espírito de
 * `build-gpon-coverage.mjs`: varre a planta outdoor + Sites e grava, por tile (z16 — ver
 * `src/modules/geo/map-tile.js`), o que o endpoint `GET /v1/geo/map/tile` lê depois sem JOIN,
 * sem parse de JSON e sem grafo de relacionamentos — a PK da tabela É o índice de leitura.
 *
 * O que entra:
 *   · PhysicalResource/LogicalResource com geometria própria (Point ou LineString),
 *     status <> 'terminated', resource_type <> 'Splitter' (ele não tem ponto próprio — mora na
 *     Location da caixa que o contém) e cujo ResourceType tem map_presence = 1 no catálogo (ou
 *     é desconhecido — tipo sem linha em tmf_resource_type entra por padrão, mesma régua de
 *     resourcePlant() no cliente: esconder o que não se sabe classificar é pior que mostrar
 *     demais).
 *   · GeographicSite de categoria 'Site', fora de um Projeto de trabalho em curso — mesmo
 *     recorte de GeoTreeService.sitesInViewport.
 * Um Point vira 1 linha (shape='point'), no tile que contém a coordenada. Um LineString vira
 * 1+ linhas (shape='line'), uma por tile atravessado, com a geometria já recortada (com
 * margem) naquele tile — nunca a rota inteira replicada em cada tile.
 *
 * Idempotente por escopo: sem --uf/--city, TRUNCATE + reconstrução completa do tenant. Com
 * --uf/--city, apaga só as linhas cujo entity_id está no escopo filtrado antes de reinserir —
 * não mexe no resto do índice.
 *
 * ⚠️ --uf/--city filtram pelo endereço da PRÓPRIA Location do recurso (mesmo JOIN de
 * build-gpon-coverage.mjs), não pela geometria em si — um cabo cuja Location não tem endereço
 * associado (comum: endereço é conceito de ponto, uma rota geralmente não tem um) fica de fora
 * de um rebuild escopado, mesmo que passe fisicamente pela região. Rode sem --uf/--city (base
 * inteira) sempre que houver cabo no escopo tocado, ou depois de qualquer carga de cabos.
 *
 * Requer o dist compilado (npm run build).
 *
 * Uso:
 *   node scripts/build-map-features.mjs                       # dry-run, base inteira
 *   node scripts/build-map-features.mjs --apply                # base inteira
 *   node scripts/build-map-features.mjs --city "Niterói" --apply
 *   node scripts/build-map-features.mjs --uf RJ --apply
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import {
  MAP_TILE_ZOOM,
  tileForPoint,
  tileSegmentsForLine,
} from '../dist/src/modules/geo/map-tile.js';
import { excludeInternalResourceTypesSql } from '../dist/src/modules/geo/map-visibility.js';

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
const PROVIDER = argOf('--provider', process.env.DATABASE_PROVIDER ?? 'postgres');

async function ensureMapFeatureTable(client) {
  if (client.provider === 'oracle') {
    const ddl = `CREATE TABLE geo_map_feature (
      tenant_id VARCHAR2(36 CHAR) DEFAULT 'default' NOT NULL,
      tile_z NUMBER(10) NOT NULL,
      tile_x NUMBER(10) NOT NULL,
      tile_y NUMBER(10) NOT NULL,
      entity_id VARCHAR2(36 CHAR) NOT NULL,
      shape VARCHAR2(255 CHAR) NOT NULL,
      feature_kind VARCHAR2(255 CHAR) NOT NULL,
      entity_type VARCHAR2(255 CHAR) NOT NULL,
      type_code VARCHAR2(255 CHAR),
      site_category VARCHAR2(255 CHAR),
      status VARCHAR2(255 CHAR),
      label VARCHAR2(255 CHAR) NOT NULL,
      sublabel VARCHAR2(255 CHAR),
      lng BINARY_DOUBLE NOT NULL,
      lat BINARY_DOUBLE NOT NULL,
      geometry CLOB,
      rank NUMBER(10) DEFAULT 0 NOT NULL,
      generated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, tile_z, tile_x, tile_y, entity_id, shape)
    )`;
    try {
      await client.query(ddl);
      console.log('Tabela geo_map_feature criada no Oracle.');
    } catch (error) {
      if (!/ORA-00955/.test(String(error?.message ?? error))) throw error;
    }
    return;
  }
  await client.query(`CREATE TABLE IF NOT EXISTS geo_map_feature (
    tenant_id TEXT NOT NULL DEFAULT 'default',
    tile_z INTEGER NOT NULL,
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    entity_id TEXT NOT NULL,
    shape TEXT NOT NULL,
    feature_kind TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    type_code TEXT,
    site_category TEXT,
    status TEXT,
    label TEXT NOT NULL,
    sublabel TEXT,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    geometry TEXT,
    rank INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, tile_z, tile_x, tile_y, entity_id, shape)
  )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_map_feature_tile ON geo_map_feature(tenant_id, tile_z, tile_x, tile_y, rank)`,
  );
}

// Recursos outdoor (Point ou LineString), já filtrados por map_presence do catálogo — mesmo
// espírito de viewportBlock em tree-service.ts, com o filtro de tipo movido para o catálogo
// (C9) e a lista de tipos internos (Splitter, Porta) compartilhada com map-visibility.ts, para
// não divergir do write-through (map-feature-synchronizer.ts) — foi essa divergência que deixou
// Porta de Splitter vazar no mapa. `resource_type` mora na ResourceSpecification, não no
// exemplar (r); daí o JOIN em tmf_resource_specification. LEFT JOIN em tmf_resource_type: um
// resource_type sem linha no catálogo (migração antiga, código nunca cadastrado) tem
// map_presence NULL, e COALESCE(..., 1) deixa passar — mesma régua de resourcePlant() no
// cliente para tipo sem ícone. map_presence é INTEGER (1/0, não BOOLEAN — ver schema.ts).
function resourceSource(entity, scopeWhere) {
  const table = entity === 'PhysicalResource' ? 'tmf_physical_resource' : 'tmf_logical_resource';
  return `
    SELECT r.id, r.name, '${entity}' AS entity_type, rs.resource_type, r.status,
           l.geometry_type, l.geometry
      FROM ${table} r
      JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
      JOIN tmf_geographic_location l ON l.id = r.place_id
      LEFT JOIN tmf_resource_type rt ON rt.code = rs.resource_type
      LEFT JOIN tmf_geographic_address a ON a.geographic_location_id = r.place_id
     WHERE r.status <> 'terminated'
       AND ${excludeInternalResourceTypesSql('rs')}
       AND COALESCE(rt.map_presence, 1) = 1
       AND l.geometry_type IN ('Point', 'LineString')${scopeWhere}`;
}

// Sites de categoria 'Site' fora de um projeto em curso — mesmo recorte de
// GeoTreeService.sitesInViewport (tree-service.ts), sem o corte por bbox (aqui é a base
// inteira do escopo).
const SITE_SOURCE = (scopeWhere) => `
    SELECT s.id, s.name, s.status, sp.category AS spec_category, l.geometry_type, l.geometry
      FROM tmf_geographic_site s
      JOIN tmf_geographic_site_specification sp ON sp.id = s.site_specification_id
      JOIN tmf_geographic_location l ON l.id = s.geographic_location_id
      LEFT JOIN tmf_geographic_address a ON a.id = s.geographic_address_id
     WHERE sp.category = 'Site'
       AND s.status NOT IN ('Retired', 'terminated')
       AND l.geometry_type = 'Point'
       AND NOT EXISTS (
             SELECT 1 FROM geo_project_site ps
               JOIN geo_project p ON p.id = ps.project_id
              WHERE ps.site_id = s.id AND p.status <> 'terminated'
           )${scopeWhere}`;

function scopeFilter(params) {
  const filters = [];
  if (CITY) {
    params.push(CITY);
    filters.push(`a.city = $${params.length}`);
  }
  if (UF) {
    params.push(UF);
    filters.push(`a.state_or_province = $${params.length}`);
  }
  return filters.length ? ` AND ${filters.join(' AND ')}` : '';
}

async function deleteByEntityIds(client, entityIds) {
  if (entityIds.length === 0) return 0;
  const CHUNK = 500;
  let removed = 0;
  for (let i = 0; i < entityIds.length; i += CHUNK) {
    const chunk = entityIds.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, index) => `$${index + 2}`).join(', ');
    const result = await client.query(
      `DELETE FROM geo_map_feature WHERE tenant_id = $1 AND entity_id IN (${placeholders})`,
      [TENANT, ...chunk],
    );
    removed += result.rowCount ?? 0;
  }
  return removed;
}

function pointRow({ entityId, kind, entityType, typeCode, siteCategory, status, label, sublabel, coordinates }) {
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const tile = tileForPoint([lng, lat], MAP_TILE_ZOOM);
  return {
    tenant_id: TENANT,
    tile_z: tile.z,
    tile_x: tile.x,
    tile_y: tile.y,
    entity_id: entityId,
    shape: 'point',
    feature_kind: kind,
    entity_type: entityType,
    type_code: typeCode ?? null,
    site_category: siteCategory ?? null,
    status: status ?? null,
    label,
    sublabel: sublabel ?? null,
    lng,
    lat,
    geometry: null,
    rank: 0,
  };
}

function lineRows({ entityId, entityType, typeCode, status, label, geometry }) {
  const segments = tileSegmentsForLine(geometry, MAP_TILE_ZOOM);
  return segments.map(({ tile, coordinates }) => {
    const anchor = coordinates[Math.floor(coordinates.length / 2)];
    return {
      tenant_id: TENANT,
      tile_z: tile.z,
      tile_x: tile.x,
      tile_y: tile.y,
      entity_id: entityId,
      shape: 'line',
      feature_kind: 'resource',
      entity_type: entityType,
      type_code: typeCode ?? null,
      site_category: null,
      status: status ?? null,
      label,
      sublabel: null,
      lng: anchor[0],
      lat: anchor[1],
      geometry: JSON.stringify({ type: 'LineString', coordinates }),
      rank: 0,
    };
  });
}

const FEATURE_COLUMNS = [
  'tenant_id', 'tile_z', 'tile_x', 'tile_y', 'entity_id', 'shape', 'feature_kind',
  'entity_type', 'type_code', 'site_category', 'status', 'label', 'sublabel',
  'lng', 'lat', 'geometry', 'rank',
];

async function main() {
  const client = await openLoaderDb({ provider: PROVIDER });
  try {
    const params = [];
    const scopeWhere = scopeFilter(params);
    const scopeLabel = [CITY && `city=${CITY}`, UF && `uf=${UF}`].filter(Boolean).join(' · ') || 'base inteira';
    console.log(`Escopo   : ${scopeLabel} (tenant=${TENANT})`);

    const resourceRows = [
      ...(await client.query(resourceSource('PhysicalResource', scopeWhere), params)).rows,
      ...(await client.query(resourceSource('LogicalResource', scopeWhere), params)).rows,
    ];
    const siteRows = (await client.query(SITE_SOURCE(scopeWhere), params)).rows;

    console.log(`Recursos : ${resourceRows.length} candidatos (Point + LineString)`);
    console.log(`Sites    : ${siteRows.length} candidatos`);

    const features = [];
    let skippedGeometry = 0;
    for (const row of resourceRows) {
      let geometry;
      try {
        geometry = JSON.parse(row.geometry);
      } catch {
        skippedGeometry += 1;
        continue;
      }
      if (row.geometry_type === 'Point') {
        const feature = pointRow({
          entityId: row.id,
          kind: 'resource',
          entityType: row.entity_type,
          typeCode: row.resource_type,
          status: row.status,
          label: row.name,
          coordinates: geometry.coordinates,
        });
        if (feature) features.push(feature);
        else skippedGeometry += 1;
      } else if (row.geometry_type === 'LineString') {
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
          skippedGeometry += 1;
          continue;
        }
        features.push(
          ...lineRows({
            entityId: row.id,
            entityType: row.entity_type,
            typeCode: row.resource_type,
            status: row.status,
            label: row.name,
            geometry,
          }),
        );
      }
    }
    for (const row of siteRows) {
      let geometry;
      try {
        geometry = JSON.parse(row.geometry);
      } catch {
        skippedGeometry += 1;
        continue;
      }
      const feature = pointRow({
        entityId: row.id,
        kind: 'site',
        entityType: 'GeographicSite',
        siteCategory: row.spec_category,
        status: row.status,
        label: row.name,
        coordinates: geometry.coordinates,
      });
      if (feature) features.push(feature);
      else skippedGeometry += 1;
    }

    console.log(
      `Features : ${features.length} linhas de geo_map_feature${skippedGeometry ? ` (${skippedGeometry} descartadas por geometria inválida)` : ''}`,
    );

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
      return;
    }

    await ensureMapFeatureTable(client);

    const entityIds = [...new Set(features.map((f) => f.entity_id))];
    await client.query('BEGIN');
    try {
      let removed;
      if (!CITY && !UF) {
        await client.query(`DELETE FROM geo_map_feature WHERE tenant_id = $1`, [TENANT]);
        removed = 'tenant inteiro';
      } else {
        removed = await deleteByEntityIds(client, entityIds);
      }
      const inserted = await client.bulkInsert('geo_map_feature', FEATURE_COLUMNS, features);
      await client.query('COMMIT');
      console.log('\nGravado:');
      console.log(`  removidos (regeneração): ${removed}`);
      console.log(`  inseridos               : ${inserted}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    await client.gatherStats('geo_map_feature');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
