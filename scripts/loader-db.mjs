// Provider-aware persistence adapter for the data loaders.
//
// The loaders author plain, `$N`-parameterized Postgres SQL. This adapter is a drop-in for the pg
// `client` they used before: `.query(sql, params)` behaves identically on Postgres, and on Oracle it
// prefixes managed table names, converts `$N`→`:n`, rewrites upserts/casts, and routes bulk inserts
// through `executeMany`. Select the provider with DATABASE_PROVIDER (+ ORACLE_* / ORACLE_OBJECT_PREFIX).
//
// Requires the compiled dist (npm run build) — it reuses the runtime's Oracle translator and prefix.

import pg from 'pg';
import oracledb from 'oracledb';
import { sslFor } from './pg-ssl.mjs';
import { transformOracleQuery } from '../dist/src/shared/persistence/oracle-database.js';
import { prefixed } from '../dist/src/shared/persistence/oracle-object-names.js';

oracledb.fetchAsString = [oracledb.CLOB];

const isOracle = () => (process.env.DATABASE_PROVIDER ?? 'postgres') === 'oracle';

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

// Abre a conexão de carga. Sem argumento, escolhe pelo DATABASE_PROVIDER (compatível com os
// loaders existentes). Com `{ provider }` explícito, permite ler de um banco e gravar em outro
// (ex.: gerar cobertura a partir das CDOs no Oracle e persistir os polígonos no Postgres/Neon).
export async function openLoaderDb(options = {}) {
  const provider = options.provider ?? (isOracle() ? 'oracle' : 'postgres');
  return provider === 'oracle' ? openOracle() : openPostgres();
}

// --------------------------------------------------------------- Postgres ----
// Identical behavior to the loaders' previous inline pg client + bulkInsert.

async function openPostgres() {
  const url = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_DEV (ou DATABASE_URL) não definido no .env');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: sslFor(url),
    connectionTimeoutMillis: 20_000,
  });
  const client = await pool.connect();
  return {
    provider: 'postgres',
    query: (sql, params) => client.query(sql, params),
    bulkInsert: (table, columns, rows, opts) => bulkInsertPg(client, table, columns, rows, opts),
    gatherStats: (table) => client.query(`ANALYZE ${table}`),
    close: async () => {
      client.release();
      await pool.end();
    },
  };
}

async function bulkInsertPg(client, table, columns, rows, { onConflict = '' } = {}) {
  if (rows.length === 0) return 0;
  const perStatement = Math.max(1, Math.floor(60000 / columns.length));
  let total = 0;
  for (const block of chunk(rows, Math.min(perStatement, 500))) {
    const values = [];
    const tuples = block.map((row, r) => {
      const ph = columns.map((_, c) => `$${r * columns.length + c + 1}`);
      values.push(...columns.map((col) => row[col] ?? null));
      return `(${ph.join(', ')})`;
    });
    const sql =
      `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) ` +
      `VALUES ${tuples.join(', ')} ${onConflict}`;
    const res = await client.query(sql, values);
    total += res.rowCount ?? 0;
  }
  return total;
}

// ----------------------------------------------------------------- Oracle ----

async function openOracle() {
  const prefix = process.env.ORACLE_OBJECT_PREFIX;
  if (!prefix)
    throw new Error(
      'ORACLE_OBJECT_PREFIX obrigatório (ex.: NEXUS_DEV_) quando DATABASE_PROVIDER=oracle',
    );
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECTION_STRING ?? process.env.ORACLE_CONNECT_STRING,
  });
  return {
    provider: 'oracle',
    query: (sql, params = []) => oracleQuery(conn, prefix, sql, params),
    bulkInsert: (table, columns, rows, opts) =>
      bulkInsertOracle(conn, prefix, table, columns, rows, opts),
    gatherStats: (table) => gatherStatsOracle(conn, prefix, table),
    close: async () => {
      try {
        await conn.commit();
      } catch {
        /* nothing pending */
      }
      await conn.close();
    },
  };
}

const lowerKeys = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key === key.toUpperCase() ? key.toLowerCase() : key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );

// Strip Postgres integer/text casts the runtime translator does not handle (e.g. count(*)::int).
const stripPgCasts = (sql) => sql.replace(/::(?:int|integer|bigint|smallint|text)\b/gi, '');

const toOracleSql = (sql, prefix) =>
  transformOracleQuery(stripPgCasts(sql).replace(/\$\d+/g, '?'), prefix);

async function oracleQuery(conn, prefix, sql, params) {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'BEGIN') return { rows: [], rowCount: 0 };
  if (upper === 'COMMIT') {
    await conn.commit();
    return { rows: [], rowCount: 0 };
  }
  if (upper === 'ROLLBACK') {
    await conn.rollback();
    return { rows: [], rowCount: 0 };
  }
  const truncate = trimmed.match(/^TRUNCATE TABLE\s+([\s\S]+?)(?:\s+RESTART IDENTITY)?\s*$/i);
  if (truncate) {
    for (const table of truncate[1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)) {
      await conn.execute(`DELETE FROM ${prefixed(table, prefix)}`, [], { autoCommit: false });
    }
    return { rows: [], rowCount: 0 };
  }
  // fetchArraySize default (100) forces a round-trip every 100 rows — the loaders' bootstrap
  // SELECTs (specs, projects, existing sites/addresses) can return tens of thousands of rows.
  const res = await conn.execute(toOracleSql(sql, prefix), (params ?? []).map(normalizeBindValue), {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
    fetchArraySize: 2000,
    prefetchRows: 2000,
  });
  return {
    rows: (res.rows ?? []).map(lowerKeys),
    rowCount: res.rowsAffected ?? res.rows?.length ?? 0,
  };
}

// ISO datetime strings bind to TIMESTAMP columns as Dates; everything else passes through.
const normalizeBindValue = (value) =>
  typeof value === 'string' && ISO_DATETIME.test(value) ? new Date(value) : (value ?? null);

const bindDefFor = (column, rows) => {
  let maxLen = 1;
  let allNull = true;
  let allNumber = true;
  let allDate = true;
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    allNull = false;
    if (typeof value === 'number') {
      allDate = false;
      continue;
    }
    allNumber = false;
    const text = String(value);
    if (!ISO_DATETIME.test(text)) allDate = false;
    // Oracle VARCHAR bind maxSize is in BYTES; accented UTF-8 chars are multi-byte.
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > maxLen) maxLen = bytes;
  }
  if (allNull) return { type: oracledb.DB_TYPE_VARCHAR, maxSize: 1 };
  if (allNumber) return { type: oracledb.DB_TYPE_NUMBER };
  if (allDate) return { type: oracledb.DB_TYPE_TIMESTAMP_TZ };
  if (maxLen > 4000) return { type: oracledb.DB_TYPE_CLOB };
  return { type: oracledb.DB_TYPE_VARCHAR, maxSize: Math.min(4000, Math.max(1, maxLen)) };
};

const bindValueFor = (value, bindDef) => {
  if (value === null || value === undefined) return null;
  if (bindDef.type === oracledb.DB_TYPE_TIMESTAMP_TZ) return new Date(value);
  return value;
};

async function bulkInsertOracle(conn, prefix, table, columns, rows, { onConflict = '' } = {}) {
  if (rows.length === 0) return 0;
  const bindDefs = columns.map((column) => bindDefFor(column, rows));
  // Build the INSERT through the same translator the query path uses: it prefixes the table and
  // leaves the columns UNQUOTED so Oracle folds them to its uppercase schema names. Hand-quoting them
  // as "col" pinned case-sensitive lowercase identifiers that don't exist (ORA-00904 "characteristics").
  const sql = toOracleSql(
    `INSERT INTO ${table} (${columns.join(', ')}) ` +
      `VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    prefix,
  );
  const ignoreDuplicates = /DO NOTHING/i.test(onConflict);
  let inserted = 0;
  for (const block of chunk(rows, 1000)) {
    const data = block.map((row) =>
      columns.map((column, i) => bindValueFor(row[column], bindDefs[i])),
    );
    const result = await conn.executeMany(sql, data, {
      autoCommit: false,
      bindDefs,
      batchErrors: ignoreDuplicates,
    });
    const errors = result.batchErrors ?? [];
    for (const error of errors) {
      // ORA-00001 = unique constraint violation, the Oracle analogue of ON CONFLICT DO NOTHING.
      // Some node-oracledb builds return the batch-error entry with `errorNum` UNDEFINED and only
      // the "ORA-00001..." text in `message`, so match either — otherwise a legitimate duplicate
      // skip is rethrown (breaks coverage cells and any DO NOTHING path on Oracle).
      const isUnique = error.errorNum === 1 || /\bORA-00001\b/.test(String(error.message ?? ''));
      if (!isUnique) throw new Error(`bulkInsert ${table}: ORA-${error.errorNum} ${error.message}`);
    }
    inserted += block.length - errors.length;
  }
  return inserted;
}

// Optimizer statistics go stale after any bulk load — the CBO then picks plans sized for the row
// counts it saw at the last GATHER (e.g. it once thought geo_project_site had 6 rows when it had
// 62,492), turning cheap joins into nested-loop scans. Table names fold to uppercase unquoted, same
// as every other DDL/DML this adapter emits — GATHER_TABLE_STATS' tabname is looked up against the
// data dictionary, which stores unquoted identifiers uppercase.
async function gatherStatsOracle(conn, prefix, table) {
  const tableName = prefixed(table, prefix).toUpperCase();
  await conn.execute(
    `BEGIN DBMS_STATS.GATHER_TABLE_STATS(
       ownname => USER, tabname => :1, cascade => TRUE,
       estimate_percent => DBMS_STATS.AUTO_SAMPLE_SIZE,
       method_opt => 'FOR ALL COLUMNS SIZE AUTO'
     ); END;`,
    [tableName],
    { autoCommit: false },
  );
}
