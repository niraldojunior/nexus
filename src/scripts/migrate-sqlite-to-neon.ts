import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, types } from 'pg';
import { SqliteDatabase } from '../shared/persistence/sqlite-database.js';

// Preserve numeric semantics when reading back counts from Postgres.
types.setTypeParser(20, (value) => Number.parseInt(value, 10));
types.setTypeParser(1700, (value) => Number.parseFloat(value));

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

const SQLITE_SCHEMA_SOURCE_PATHS = [
  resolve(process.cwd(), 'src/shared/persistence/sqlite-database.ts'),
  resolve(process.cwd(), 'dist/src/shared/persistence/sqlite-database.js'),
];

const MIGRATIONS_SQL = `
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS place_id TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS place_type TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS administrative_state TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS operational_state TEXT;
  ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS usage_state TEXT;
  ALTER TABLE tmf_resource_specification ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS place_id TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS place_type TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS administrative_state TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS operational_state TEXT;
  ALTER TABLE tmf_logical_resource ADD COLUMN IF NOT EXISTS usage_state TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_type TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS start_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS end_date TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS is_service_enabled INTEGER;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS has_started INTEGER;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS supporting_services TEXT;
  ALTER TABLE tmf_customer_facing_service ADD COLUMN IF NOT EXISTS service_relationships TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_type TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS start_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS end_date TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS is_service_enabled INTEGER;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS has_started INTEGER;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS supporting_resources TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS supporting_services TEXT;
  ALTER TABLE tmf_resource_facing_service ADD COLUMN IF NOT EXISTS service_relationships TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS place TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS service_characteristic TEXT;
  ALTER TABLE tmf_service_qualification ADD COLUMN IF NOT EXISTS service_qualification_item TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS service_order_item TEXT;
  ALTER TABLE tmf_service_order ADD COLUMN IF NOT EXISTS note TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS related_party TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS resource_order_item TEXT;
  ALTER TABLE tmf_resource_order ADD COLUMN IF NOT EXISTS note TEXT;
`;

async function main(): Promise<void> {
  loadEnv();

  const sourceUrl = process.env.SOURCE_DATABASE_URL ?? 'sqlite://./data/nexus.db';
  const targetUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!targetUrl) {
    throw new Error('TARGET_DATABASE_URL or DATABASE_URL must be set to the Neon connection string before running this migration.');
  }

  console.log(`Source: ${sourceUrl}`);
  console.log(`Target: ${targetUrl}`);

  const sourceDb = SqliteDatabase.getInstance(sourceUrl);
  await sourceDb.initialize();

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
        const rows = sourceDb.all<TableRow>(`SELECT * FROM ${quoteIdentifier(table)}`);
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
    SqliteDatabase.resetForTesting();
  }
}

async function bootstrapTargetSchema(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
  const sqliteSchema = extractSqliteSchema();
  const statements = [...splitSqlStatements(transformSchemaSql(sqliteSchema)), ...splitSqlStatements(MIGRATIONS_SQL)];

  for (const statement of statements) {
    await client.query(statement);
  }
}

function extractSqliteSchema(): string {
  for (const path of SQLITE_SCHEMA_SOURCE_PATHS) {
    if (!existsSync(path)) continue;
    const source = readFileSync(path, 'utf8');
    const match = source.match(/db\.exec\(\s*`([\s\S]*?)`\s*\);/);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error('Unable to locate the SQLite schema source in src/shared/persistence/sqlite-database.ts');
}

function transformSchemaSql(sql: string): string {
  return sql
    .replace(/\bDATETIME\b/g, 'TIMESTAMPTZ')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    .replace(
      /CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event\(json_extract\(event_data, '\$\.(.+?)'\)\);/g,
      (_match, path: string) => `CREATE INDEX IF NOT EXISTS idx_tmf_event_entity ON tmf_event (((event_data)::jsonb->>'${path}'));`,
    )
    .replace(/--.*$/gm, '');
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('--'));
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
