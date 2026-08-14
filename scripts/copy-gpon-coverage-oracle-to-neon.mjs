#!/usr/bin/env node
/**
 * Copia a cobertura GPON (REQ-MOD01-014) JÁ GERADA no Oracle para um Postgres/Neon de destino,
 * sem recalcular nada — cópia crua de linha por linha (diferente de
 * scripts/build-gpon-coverage.mjs, que reconstrói o polígono a partir das CDOs).
 *
 * Copia os dois artefatos que build-gpon-coverage.mjs grava:
 *   · tmf_geographic_location  (Polygon, reference_point 'GPON:%')
 *   · geo_gpon_coverage_cell   (grade fina que indexa os polígonos por bbox)
 *
 * Substituição total no destino: apaga TODAS as linhas desses dois artefatos no destino antes
 * de inserir as do Oracle (mesma semântica de "artefato regenerável, substituído inteiro" que
 * build-gpon-coverage.mjs já usa por escopo — aqui o escopo é a base inteira). Preserva os IDs
 * do Oracle, então coverage_area_id das células continua batendo com o id do polígono copiado.
 *
 * Segurança deliberada (ver memória do incidente de PRD zerado por fallback de URL):
 *   · Destino SÓ vem de --target-url (ou TARGET_DATABASE_URL no ambiente) — nunca cai para
 *     DATABASE_URL_DEV/DATABASE_URL. Sem o valor explícito, o script recusa rodar.
 *   · Dry-run é o padrão: mostra contagens de origem/destino sem alterar nada.
 *   · Escrita exige --apply E --confirm-prod (duas flags, de propósito).
 *
 * Origem (Oracle) usa as mesmas ORACLE_* do .env (ver scripts/loader-db.mjs).
 *
 * Uso:
 *   node scripts/copy-gpon-coverage-oracle-to-neon.mjs --target-url "postgresql://...neon.../db?sslmode=require"
 *   node scripts/copy-gpon-coverage-oracle-to-neon.mjs --target-url "..." --apply --confirm-prod
 */

import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { sslFor } from './pg-ssl.mjs';
import { openLoaderDb } from './loader-db.mjs';

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const APPLY = has('--apply');
const CONFIRM_PROD = has('--confirm-prod');
const TARGET_URL = argOf('--target-url', process.env.TARGET_DATABASE_URL ?? null);
const CELL_BATCH = Number(argOf('--cell-batch', '2000'));
const POLY_BATCH = Number(argOf('--poly-batch', '500'));
const PROGRESS_EVERY = Number(argOf('--progress-every', '100000'));

const POLY_COLUMNS = ['id', 'href', 'geometry_type', 'geometry', 'spatial_ref', 'reference_point', 'characteristics'];
const CELL_COLUMNS = [
  'tenant_id', 'grid_size_m', 'grid_x', 'grid_y', 'coverage_area_id', 'cdo_total', 'cdo_available', 'ports_total', 'ports_used',
];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function describeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '<connection string inválida>';
  }
}

async function openTarget(url) {
  const pool = new pg.Pool({ connectionString: url, ssl: sslFor(url), connectionTimeoutMillis: 20_000 });
  const client = await pool.connect();
  return {
    query: (sql, params) => client.query(sql, params),
    close: async () => {
      client.release();
      await pool.end();
    },
  };
}

// INSERT em blocos, sem ON CONFLICT — o destino foi limpo antes, então não deve haver colisão.
async function bulkInsert(client, table, columns, rows, batchSize, label) {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const block of chunk(rows, batchSize)) {
    const values = [];
    const tuples = block.map((row, r) => {
      const ph = columns.map((_, c) => `$${r * columns.length + c + 1}`);
      values.push(...columns.map((col) => row[col] ?? null));
      return `(${ph.join(', ')})`;
    });
    const sql = `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${tuples.join(', ')}`;
    const res = await client.query(sql, values);
    total += res.rowCount ?? 0;
    if (label && total % PROGRESS_EVERY < batchSize) console.log(`  ... ${label}: ${total}/${rows.length}`);
  }
  return total;
}

async function ensureCellTable(target) {
  await target.query(`CREATE TABLE IF NOT EXISTS geo_gpon_coverage_cell (
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
  await target.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_cell_xy ON geo_gpon_coverage_cell(grid_size_m, grid_x, grid_y)`,
  );
  await target.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_gpon_coverage_cell_area ON geo_gpon_coverage_cell(coverage_area_id)`,
  );
}

async function targetCounts(target) {
  const { rows: poly } = await target.query(
    `SELECT COUNT(*) AS n FROM tmf_geographic_location WHERE reference_point LIKE 'GPON:%'`,
  );
  let cellN = '(tabela ainda não existe)';
  try {
    const { rows: cell } = await target.query(`SELECT COUNT(*) AS n FROM geo_gpon_coverage_cell`);
    cellN = cell[0].n;
  } catch {
    /* tabela ainda não existe no destino — ok, dry-run só informa */
  }
  return { polygons: poly[0].n, cells: cellN };
}

async function main() {
  if (!TARGET_URL) {
    throw new Error(
      'Informe o destino com --target-url "postgresql://...neon-pooler.../db?sslmode=require" ' +
        '(ou defina TARGET_DATABASE_URL só para este comando). Este script nunca cai para ' +
        'DATABASE_URL_DEV/DATABASE_URL — é deliberado, ver comentário no topo do arquivo.',
    );
  }
  if (!/^postgres(ql)?:\/\//.test(TARGET_URL)) {
    throw new Error('--target-url não parece uma connection string Postgres válida.');
  }

  console.log(`Origem : Oracle (prefixo ${process.env.ORACLE_OBJECT_PREFIX ?? '<ORACLE_OBJECT_PREFIX não definido>'})`);
  console.log(`Destino: ${describeUrl(TARGET_URL)}`);

  const source = await openLoaderDb({ provider: 'oracle' });
  const target = await openTarget(TARGET_URL);
  try {
    const [{ rows: srcPoly }, { rows: srcCell }] = await Promise.all([
      source.query(`SELECT COUNT(*) AS n FROM tmf_geographic_location WHERE reference_point LIKE 'GPON:%'`),
      source.query(`SELECT COUNT(*) AS n FROM geo_gpon_coverage_cell`),
    ]);
    console.log(`Oracle : ${srcPoly[0].n} polígonos · ${srcCell[0].n} células`);

    const before = await targetCounts(target);
    console.log(
      `Destino (antes): ${before.polygons} polígonos GPON · ${before.cells} células ` +
        `— serão apagados e substituídos pelos do Oracle`,
    );

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi alterado. Use --apply --confirm-prod para gravar. —');
      return;
    }
    if (!CONFIRM_PROD) {
      throw new Error('Faltou --confirm-prod — flag extra de confirmação exigida para escrever no destino.');
    }

    console.log('\nLendo polígonos e células do Oracle...');
    const { rows: polygons } = await source.query(
      `SELECT id, href, geometry_type, geometry, spatial_ref, reference_point, characteristics
         FROM tmf_geographic_location WHERE reference_point LIKE 'GPON:%'`,
    );
    const { rows: cells } = await source.query(
      `SELECT tenant_id, grid_size_m, grid_x, grid_y, coverage_area_id, cdo_total, cdo_available, ports_total, ports_used
         FROM geo_gpon_coverage_cell`,
    );
    console.log(`Lido   : ${polygons.length} polígonos · ${cells.length} células`);

    await target.query('BEGIN');
    try {
      await ensureCellTable(target);

      const deletedCells = await target.query(`DELETE FROM geo_gpon_coverage_cell`);
      const deletedPolys = await target.query(
        `DELETE FROM tmf_geographic_location WHERE reference_point LIKE 'GPON:%'`,
      );
      console.log(`Apagado (destino): ${deletedPolys.rowCount} polígonos · ${deletedCells.rowCount} células`);

      const insertedPolys = await bulkInsert(target, 'tmf_geographic_location', POLY_COLUMNS, polygons, POLY_BATCH);
      console.log(`Gravado: ${insertedPolys} polígonos`);

      const insertedCells = await bulkInsert(target, 'geo_gpon_coverage_cell', CELL_COLUMNS, cells, CELL_BATCH, 'células');
      console.log(`Gravado: ${insertedCells} células`);

      await target.query('COMMIT');
      console.log('\nOK — cobertura GPON do Oracle copiada para o destino.');
    } catch (err) {
      await target.query('ROLLBACK');
      throw err;
    }
  } finally {
    await target.close();
    await source.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
