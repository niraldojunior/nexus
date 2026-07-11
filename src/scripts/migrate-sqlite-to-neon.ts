import Database from 'better-sqlite3';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Pool, types } from 'pg';
import { MIGRATIONS_SQL, SCHEMA_SQL, TABLE_NAMES, transformSchemaSql } from '../shared/persistence/schema.js';

// Preserve numeric semantics when reading back counts from Postgres.
types.setTypeParser(20, (value) => Number.parseInt(value, 10));
types.setTypeParser(1700, (value) => Number.parseFloat(value));

type TableRow = Record<string, unknown>;

// Parent-before-child order for FK-safe inserts (shared with the test-suite TRUNCATE logic).
const TABLE_ORDER = TABLE_NAMES;

const SELF_REFERENCING_PARENT_COLUMNS: Record<string, string> = {
  tmf_geographic_site: 'parent_site_id',
  tmf_service_category: 'parent_category_id',
};

async function main(): Promise<void> {
  loadEnv();

  const sourceUrl = process.env.SOURCE_DATABASE_URL ?? 'sqlite://./data/nexus.db';
  const targetUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!targetUrl) {
    throw new Error('TARGET_DATABASE_URL or DATABASE_URL must be set to the Neon connection string before running this migration.');
  }

  const sourcePath = resolveSqlitePath(sourceUrl);
  console.log(`Source: ${sourceUrl}`);
  console.log(`Target: ${targetUrl}`);

  const sourceDb = new Database(sourcePath, { readonly: true });

  const pool = new Pool({
    connectionString: targetUrl,
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 15_000),
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await bootstrapTargetSchema(client);

    const tableNames = getTableNames(sourceDb);
    const missingTables = TABLE_ORDER.filter((table) => !tableNames.includes(table));
    if (missingTables.length > 0) {
      throw new Error(`Source database is missing expected tables: ${missingTables.join(', ')}`);
    }

    const extraTables = tableNames.filter((table) => !TABLE_ORDER.includes(table as (typeof TABLE_ORDER)[number]));
    if (extraTables.length > 0) {
      console.log(`Additional source tables detected and will be ignored: ${extraTables.join(', ')}`);
    }

    const orderedTables = TABLE_ORDER.filter((table) => tableNames.includes(table));

    console.log('Cleaning target tables...');
    await client.query('BEGIN');
    try {
      if (orderedTables.length > 0) {
        await client.query(
          `TRUNCATE TABLE ${orderedTables.map((table) => quoteIdentifier(table)).join(', ')} RESTART IDENTITY CASCADE`,
        );
      }

      console.log('Copying data...');
      for (const table of orderedTables) {
        const columns = getColumns(sourceDb, table);
        const rows = sourceDb.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as TableRow[];
        const orderedRows = orderRowsForTable(table, rows);

        if (orderedRows.length === 0) {
          console.log(`- ${table}: 0 rows`);
          continue;
        }

        const insertSql = buildInsertSql(table, columns);
        for (const row of orderedRows) {
          const values = columns.map((column) => normalizeValue(row[column]));
          await client.query(insertSql, values);
        }

        console.log(`- ${table}: ${orderedRows.length} rows`);
      }

      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failures during error propagation.
      }
      throw error;
    }

    console.log('Migration completed successfully.');
  } finally {
    client.release();
    await pool.end();
    sourceDb.close();
  }
}

async function bootstrapTargetSchema(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
  const statements = [...splitSqlStatements(transformSchemaSql(SCHEMA_SQL)), ...splitSqlStatements(MIGRATIONS_SQL)];

  for (const statement of statements) {
    await client.query(statement);
  }
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('--'));
}

// Resolves a `sqlite://<path>` URL (or a bare filesystem path) to an absolute file path.
function resolveSqlitePath(sourceUrl: string): string {
  const filePath = sourceUrl.startsWith('sqlite://') ? sourceUrl.slice('sqlite://'.length) : sourceUrl;
  return resolve(process.cwd(), filePath);
}

function getTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function getColumns(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function orderRowsForTable(table: string, rows: TableRow[]): TableRow[] {
  const parentColumn = SELF_REFERENCING_PARENT_COLUMNS[table];
  if (!parentColumn) {
    return rows;
  }

  const rowsById = new Map<string, TableRow>();
  for (const row of rows) {
    const id = row.id;
    if (typeof id !== 'string') {
      throw new Error(`Table ${table} contains a row without a string id`);
    }
    rowsById.set(id, row);
  }

  const ordered: TableRow[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (row: TableRow): void => {
    const id = row.id;
    if (typeof id !== 'string') return;
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Cycle detected while ordering rows for ${table}`);
    }

    visiting.add(id);
    const parentId = row[parentColumn];
    if (typeof parentId === 'string' && rowsById.has(parentId)) {
      visit(rowsById.get(parentId)!);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(row);
  };

  for (const row of rows) {
    visit(row);
  }

  return ordered;
}

function buildInsertSql(table: string, columns: string[]): string {
  const columnSql = columns.map((column) => quoteIdentifier(column)).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  return `INSERT INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${placeholders})`;
}

function normalizeValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
