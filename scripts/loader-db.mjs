// Oracle persistence adapter for data loaders.
//
// Loaders use `$N`-parameterized SQL. This adapter preserves their `.query(sql, params)` and
// `.bulkInsert(table, columns, rows)` contract while converting placeholders to the runtime's
// Oracle binds and applying the configured object prefix.
//
// Requires a compiled runtime (`npm run build`) for the shared Oracle SQL and name helpers.

import oracledb from 'oracledb';
import { transformOracleQuery } from '../dist/src/shared/persistence/oracle-database.js';
import { prefixed } from '../dist/src/shared/persistence/oracle-object-names.js';

oracledb.fetchAsString = [oracledb.CLOB];

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

export async function openLoaderDb() {
  const prefix = process.env.ORACLE_OBJECT_PREFIX;
  if (!prefix) {
    throw new Error('ORACLE_OBJECT_PREFIX obrigatório (ex.: NEXUS_DEV_) para executar loaders.');
  }
  if (!process.env.ORACLE_CONNECTION_STRING || !process.env.ORACLE_USER || !process.env.ORACLE_PASSWORD) {
    throw new Error('ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD são obrigatórios.');
  }

  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECTION_STRING,
  });

  return {
    provider: 'oracle',
    query: (sql, params = []) => oracleQuery(conn, prefix, sql, params),
    bulkInsert: (table, columns, rows, opts) => bulkInsertOracle(conn, prefix, table, columns, rows, opts),
    gatherStats: (table) => gatherStatsOracle(conn, prefix, table),
    close: async () => {
      try {
        await conn.commit();
      } catch {
        // The connection may already have been rolled back by the caller.
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

const stripLegacyCasts = (sql) => sql.replace(/::(?:int|integer|bigint|smallint|text)\b/gi, '');

const toOracleSql = (sql, prefix) =>
  transformOracleQuery(stripLegacyCasts(sql).replace(/\$\d+/g, '?'), prefix);

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
      .map((item) => item.trim())
      .filter(Boolean)) {
      await conn.execute(`DELETE FROM ${prefixed(table, prefix)}`, [], { autoCommit: false });
    }
    return { rows: [], rowCount: 0 };
  }

  const result = await conn.execute(toOracleSql(sql, prefix), (params ?? []).map(normalizeBindValue), {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
    fetchArraySize: 2000,
    prefetchRows: 2000,
  });
  return {
    rows: (result.rows ?? []).map(lowerKeys),
    rowCount: result.rowsAffected ?? result.rows?.length ?? 0,
  };
}

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
    maxLen = Math.max(maxLen, Buffer.byteLength(text, 'utf8'));
  }
  if (allNull) return { type: oracledb.DB_TYPE_VARCHAR, maxSize: 1 };
  if (allNumber) return { type: oracledb.DB_TYPE_NUMBER };
  if (allDate) return { type: oracledb.DB_TYPE_TIMESTAMP_TZ };
  if (maxLen > 4000) return { type: oracledb.DB_TYPE_CLOB };
  return { type: oracledb.DB_TYPE_VARCHAR, maxSize: Math.min(4000, maxLen) };
};

const bindValueFor = (value, bindDef) => {
  if (value === null || value === undefined) return null;
  if (bindDef.type === oracledb.DB_TYPE_TIMESTAMP_TZ) return new Date(value);
  return value;
};

async function bulkInsertOracle(conn, prefix, table, columns, rows, { ignoreDuplicates = false } = {}) {
  if (rows.length === 0) return 0;
  const bindDefs = columns.map((column) => bindDefFor(column, rows));
  const sql = toOracleSql(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
    prefix,
  );
  let inserted = 0;
  for (const block of chunk(rows, 1000)) {
    const data = block.map((row) => columns.map((column, index) => bindValueFor(row[column], bindDefs[index])));
    const result = await conn.executeMany(sql, data, {
      autoCommit: false,
      bindDefs,
      batchErrors: ignoreDuplicates,
    });
    const errors = result.batchErrors ?? [];
    for (const error of errors) {
      if (error.errorNum !== 1 && !/\bORA-00001\b/.test(String(error.message ?? ''))) {
        throw new Error(`bulkInsert ${table}: ORA-${error.errorNum} ${error.message}`);
      }
    }
    inserted += block.length - errors.length;
  }
  return inserted;
}

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
