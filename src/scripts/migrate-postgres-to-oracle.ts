import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Pool as PostgresPool } from 'pg';
import oracledb, { type Connection } from 'oracledb';
import { TABLE_NAMES } from '../shared/persistence/schema.js';

loadEnv();
oracledb.fetchAsString = [oracledb.CLOB];

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const resume = args.has('--resume');
const verifyOnly = args.has('--verify-only');
const batchSize = positiveInteger(process.env.MIGRATION_BATCH_SIZE, 1_000);
const sourceUrl = required('SOURCE_DATABASE_URL');
const targetConnectString = required('TARGET_ORACLE_CONNECT_STRING');
const targetUser = required('TARGET_ORACLE_USER');
const targetPassword = required('TARGET_ORACLE_PASSWORD');

const source = new PostgresPool({ connectionString: sourceUrl, max: 2 });
const targetPool = await oracledb.createPool({
  connectString: targetConnectString,
  user: targetUser,
  password: targetPassword,
  poolMin: 1,
  poolMax: 2,
  poolIncrement: 1,
});

type TableReport = {
  table: string;
  sourceCount: number;
  targetCount: number;
  sourceHash: string;
  targetHash: string;
  copied: number;
  valid: boolean;
};

try {
  const target = await targetPool.getConnection();
  try {
    await assertSchemaVersions(target);
    if (!dryRun && !verifyOnly) await ensureCheckpointTable(target);
    const reports: TableReport[] = [];
    for (const table of TABLE_NAMES) {
      reports.push(await migrateTable(target, table));
    }
    const valid = reports.every((report) => report.valid);
    process.stdout.write(
      `${JSON.stringify({ dryRun, resume, verifyOnly, batchSize, valid, tables: reports }, null, 2)}\n`,
    );
    if (!valid) process.exitCode = 2;
  } finally {
    await target.close();
  }
} finally {
  await source.end();
  await targetPool.close(10);
}

async function migrateTable(target: Connection, table: string): Promise<TableReport> {
  const columns = await commonColumns(target, table);
  if (columns.length === 0)
    throw new Error(`Tabela ${table} sem colunas comuns entre origem e destino.`);
  const primaryKeys = await postgresPrimaryKeys(table);
  if (primaryKeys.length === 0)
    throw new Error(`Tabela ${table} sem chave primaria; carga idempotente recusada.`);
  const orderBy = primaryKeys.map(quotePostgres).join(', ');
  const sourceCount = await countPostgres(table);
  let copied = 0;
  let offset = resume && !dryRun && !verifyOnly ? await checkpoint(target, table) : 0;

  if (!verifyOnly && !dryRun) {
    while (offset < sourceCount) {
      const result = await source.query<Record<string, unknown>>(
        `SELECT ${columns.map(quotePostgres).join(', ')} FROM ${quotePostgres(table)} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
        [batchSize, offset],
      );
      if (result.rows.length === 0) break;
      await upsertBatch(target, table, columns, primaryKeys, result.rows);
      offset += result.rows.length;
      copied += result.rows.length;
      await saveCheckpoint(target, table, offset);
    }
  }

  const [sourceDigest, targetDigest] = await Promise.all([
    digestPostgres(table, columns, orderBy),
    digestOracle(target, table, columns, primaryKeys),
  ]);
  return {
    table,
    sourceCount,
    targetCount: targetDigest.count,
    sourceHash: sourceDigest.hash,
    targetHash: targetDigest.hash,
    copied,
    valid: sourceCount === targetDigest.count && sourceDigest.hash === targetDigest.hash,
  };
}

async function upsertBatch(
  target: Connection,
  table: string,
  columns: string[],
  primaryKeys: string[],
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const sourceProjection = columns
    .map((column, index) => `:${index + 1} ${quoteOracle(column)}`)
    .join(', ');
  const on = primaryKeys
    .map((column) => `target.${quoteOracle(column)} = source.${quoteOracle(column)}`)
    .join(' AND ');
  const mutable = columns.filter((column) => !primaryKeys.includes(column));
  const update =
    mutable.length > 0
      ? `WHEN MATCHED THEN UPDATE SET ${mutable.map((column) => `target.${quoteOracle(column)} = source.${quoteOracle(column)}`).join(', ')}`
      : '';
  const sql = `MERGE INTO ${quoteOracle(table)} target USING (SELECT ${sourceProjection} FROM DUAL) source ON (${on}) ${update}
    WHEN NOT MATCHED THEN INSERT (${columns.map(quoteOracle).join(', ')}) VALUES (${columns.map((column) => `source.${quoteOracle(column)}`).join(', ')})`;
  const binds = rows.map((row) => columns.map((column) => oracleValue(row[column])));
  const result = await target.executeMany(sql, binds, { autoCommit: true, batchErrors: true });
  if (result.batchErrors && result.batchErrors.length > 0) {
    const codes = result.batchErrors.map((error) => error.errorNum).join(',');
    throw new Error(`Falha no lote da tabela ${table}; codigos Oracle: ${codes}.`);
  }
}

async function commonColumns(target: Connection, table: string): Promise<string[]> {
  const sourceColumns = await source.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  const targetColumns = await target.execute<{ COLUMN_NAME: string }>(
    `SELECT column_name AS "COLUMN_NAME" FROM user_tab_columns WHERE table_name = :1`,
    [table.toUpperCase()],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const available = new Set((targetColumns.rows ?? []).map((row) => row.COLUMN_NAME.toLowerCase()));
  return sourceColumns.rows.map((row) => row.column_name).filter((column) => available.has(column));
}

async function postgresPrimaryKeys(table: string): Promise<string[]> {
  const result = await source.query<{ column_name: string }>(
    `SELECT a.attname AS column_name FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
     WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY array_position(i.indkey, a.attnum)`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function digestPostgres(
  table: string,
  columns: string[],
  orderBy: string,
): Promise<{ count: number; hash: string }> {
  const hash = createHash('sha256');
  let count = 0;
  for (let offset = 0; ; offset += batchSize) {
    const result = await source.query<Record<string, unknown>>(
      `SELECT ${columns.map(quotePostgres).join(', ')} FROM ${quotePostgres(table)} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
      [batchSize, offset],
    );
    for (const row of result.rows) hash.update(normalizeRecord(row, columns));
    count += result.rows.length;
    if (result.rows.length < batchSize) break;
  }
  return { count, hash: hash.digest('hex') };
}

async function digestOracle(
  target: Connection,
  table: string,
  columns: string[],
  primaryKeys: string[],
): Promise<{ count: number; hash: string }> {
  const hash = createHash('sha256');
  let count = 0;
  for (let offset = 0; ; offset += batchSize) {
    const result = await target.execute<Record<string, unknown>>(
      `SELECT ${columns.map((column) => `${quoteOracle(column)} AS "${column}"`).join(', ')} FROM ${quoteOracle(table)}
       ORDER BY ${primaryKeys.map(quoteOracle).join(', ')} OFFSET :1 ROWS FETCH NEXT :2 ROWS ONLY`,
      [offset, batchSize],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of result.rows ?? []) hash.update(normalizeRecord(row, columns));
    count += result.rows?.length ?? 0;
    if ((result.rows?.length ?? 0) < batchSize) break;
  }
  return { count, hash: hash.digest('hex') };
}

async function countPostgres(table: string): Promise<number> {
  const result = await source.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${quotePostgres(table)}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function assertSchemaVersions(target: Connection): Promise<void> {
  const sourceVersion = await source.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
  );
  const targetVersion = await target.execute<{ version: number }>(
    'SELECT version AS "version" FROM schema_migrations ORDER BY version DESC FETCH FIRST 1 ROWS ONLY',
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (
    !sourceVersion.rows[0] ||
    !targetVersion.rows?.[0] ||
    Number(sourceVersion.rows[0].version) !== Number(targetVersion.rows[0].version)
  ) {
    throw new Error('Versoes de schema incompatíveis entre PostgreSQL e Oracle.');
  }
}

async function ensureCheckpointTable(target: Connection): Promise<void> {
  try {
    await target.execute(
      `CREATE TABLE nexus_migration_checkpoint (table_name VARCHAR2(128 CHAR) PRIMARY KEY, rows_processed NUMBER(19) NOT NULL, updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL)`,
      [],
      { autoCommit: true },
    );
  } catch (error) {
    if (!String(error).includes('ORA-00955')) throw error;
  }
}

async function checkpoint(target: Connection, table: string): Promise<number> {
  const result = await target.execute<{ rowsProcessed: number }>(
    `SELECT rows_processed AS "rowsProcessed" FROM nexus_migration_checkpoint WHERE table_name=:1`,
    [table],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return Number(result.rows?.[0]?.rowsProcessed ?? 0);
}

async function saveCheckpoint(
  target: Connection,
  table: string,
  rowsProcessed: number,
): Promise<void> {
  await target.execute(
    `MERGE INTO nexus_migration_checkpoint t USING (SELECT :1 table_name, :2 rows_processed FROM DUAL) s ON (t.table_name=s.table_name)
     WHEN MATCHED THEN UPDATE SET t.rows_processed=s.rows_processed, t.updated_at=CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN INSERT (table_name, rows_processed, updated_at) VALUES (s.table_name, s.rows_processed, CURRENT_TIMESTAMP)`,
    [table, rowsProcessed],
    { autoCommit: true },
  );
}

const normalizeRecord = (row: Record<string, unknown>, columns: string[]): string =>
  `${JSON.stringify(columns.map((column) => normalizeValue(row[column] ?? row[column.toUpperCase()])))}\n`;

const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value ?? null;
};

const oracleValue = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Buffer.isBuffer(value)
    ? JSON.stringify(value)
    : (value ?? null);

const quotePostgres = (name: string): string => `"${name.replaceAll('"', '""')}"`;
const quoteOracle = (name: string): string => `"${name.toUpperCase().replaceAll('"', '""')}"`;
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error('MIGRATION_BATCH_SIZE must be a positive integer.');
  return parsed;
}
