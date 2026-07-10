import { config as loadEnv } from 'dotenv';
import { isPostgresDatabaseUrl } from '../shared/config/env.js';
import { SqliteDatabase } from '../shared/persistence/sqlite-database.js';

type TableRow = Record<string, unknown>;

const TABLE_ORDER = [
  'users',
  'searches',
  'tmf_geographic_location',
  'tmf_geographic_address',
  'tmf_geographic_site_specification',
  'tmf_geographic_site',
  'tmf_geographic_site_relationship',
  'tmf_resource_specification',
  'tmf_resource_category',
  'tmf_resource_type',
  'tmf_resource_function_specification',
  'tmf_physical_resource',
  'tmf_logical_resource',
  'tmf_resource_relationship',
  'tmf_resource_relationship_generic',
  'tmf_service_specification',
  'tmf_service_category',
  'tmf_service_candidate',
  'tmf_customer_facing_service',
  'tmf_resource_facing_service',
  'tmf_service_relationship',
  'tmf_service_qualification',
  'tmf_service_order',
  'tmf_resource_order',
  'tmf_party',
  'tmf_party_role',
  'tmf_party_relationship',
  'tmf_event',
  'research_session',
  'research_message',
  'mcp_confirmation',
  'tmf_relationship_type_catalog',
  'tmf_characteristic_group_catalog',
] as const;

const SELF_REFERENCING_PARENT_COLUMNS: Record<string, string> = {
  tmf_geographic_site: 'parent_site_id',
  tmf_service_category: 'parent_category_id',
};

async function main(): Promise<void> {
  loadEnv();

  const sourceUrl = process.env.SOURCE_DATABASE_URL ?? 'sqlite://./data/nexus.db';
  const targetUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!targetUrl) {
    throw new Error(
      'TARGET_DATABASE_URL or DATABASE_URL must be set to the Neon connection string before running this migration.',
    );
  }

  console.log(`Source: ${sourceUrl}`);
  console.log(`Target: ${targetUrl}`);

  const sourceDb = SqliteDatabase.getInstance(sourceUrl);
  const targetDb = SqliteDatabase.getInstance(targetUrl);

  await sourceDb.initialize();
  targetDb.initialize();

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
  const reverseTables = [...orderedTables].reverse();

  console.log('Cleaning target tables...');
  if (isPostgresDatabaseUrl(targetUrl)) {
    targetDb.exec(
      `TRUNCATE TABLE ${orderedTables.map((table) => quoteIdentifier(table)).join(', ')} RESTART IDENTITY CASCADE`,
    );
  } else {
    targetDb.transaction(() => {
      for (const table of reverseTables) {
        targetDb.exec(`DELETE FROM ${quoteIdentifier(table)}`);
      }
    });
  }

  console.log('Copying data...');
  targetDb.transaction(() => {
    for (const table of orderedTables) {
      const columns = getColumns(sourceDb, table);
      const rows = sourceDb.all<TableRow>(`SELECT * FROM ${table}`);
      const orderedRows = orderRowsForTable(table, rows);

      if (orderedRows.length === 0) {
        console.log(`- ${table}: 0 rows`);
        continue;
      }

      const columnSql = columns.map((column) => quoteIdentifier(column)).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${placeholders})`;

      for (const row of orderedRows) {
        const values = columns.map((column) => normalizeValue(row[column]));
        targetDb.run(insertSql, values);
      }

      console.log(`- ${table}: ${orderedRows.length} rows`);
    }
  });

  console.log('Migration completed successfully.');
}

function getTableNames(db: SqliteDatabase): string[] {
  const rows = db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

function getColumns(db: SqliteDatabase, table: string): string[] {
  const rows = db.all<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(table)})`);
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
