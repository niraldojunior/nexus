import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DECLARED_COLUMNS,
  findColumnDrift,
  parseDeclaredColumns,
  TABLE_NAMES,
} from '../src/shared/persistence/schema.js';

// Tables that `service.ts` scopes by tenant (C8) — see the migration block's own comment in
// schema.ts for why relationship tables are excluded. Kept as a literal list here (not derived from
// schema.ts) so this test fails loudly if the migration block is ever edited without updating this
// contract too.
const TENANT_SCOPED_TABLES = [
  'tmf_resource_specification',
  'tmf_resource_type',
  'tmf_resource_function_specification',
  'tmf_physical_resource',
  'tmf_logical_resource',
  'tmf_service_specification',
  'tmf_service_category',
  'tmf_service_candidate',
  'tmf_resource_facing_service',
  'tmf_customer_facing_service',
  'tmf_service_qualification',
  'tmf_service_order',
  'tmf_resource_order',
  'tmf_party',
  'tmf_party_role',
];

test('parseDeclaredColumns covers every table in TABLE_NAMES', () => {
  const declaredTables = new Set(DECLARED_COLUMNS.keys());
  const missing = TABLE_NAMES.filter((table) => !declaredTables.has(table));
  assert.deepEqual(missing, [], `parser did not resolve columns for: ${missing.join(', ')}`);
});

test('tenant_id is declared for every table service.ts scopes by tenant (C8, issue #166)', () => {
  for (const table of TENANT_SCOPED_TABLES) {
    const columns = DECLARED_COLUMNS.get(table);
    assert.ok(columns, `table ${table} is not declared at all`);
    assert.ok(
      columns.has('tenant_id'),
      `${table}.tenant_id is not declared in SCHEMA_SQL/MIGRATIONS_SQL`,
    );
  }
});

test('findColumnDrift reports every declared column missing from the live database', () => {
  // Simulate a database where tenant_id never landed, mirroring the NEXUS_DEV_ Oracle gap.
  const actual = new Map<string, Set<string>>();
  for (const [table, columns] of DECLARED_COLUMNS) {
    actual.set(table, new Set([...columns].filter((column) => column !== 'tenant_id')));
  }
  const missing = findColumnDrift(actual);
  const missingSet = new Set(missing);
  for (const table of TENANT_SCOPED_TABLES) {
    assert.ok(missingSet.has(`${table}.tenant_id`), `expected drift to report ${table}.tenant_id`);
  }
});

test('findColumnDrift is silent when the live database matches the declared schema', () => {
  const missing = findColumnDrift(DECLARED_COLUMNS);
  assert.deepEqual(missing, []);
});

test('findColumnDrift ignores a whole missing table (different failure mode, not column drift)', () => {
  const actual = new Map(DECLARED_COLUMNS);
  actual.delete('tmf_party_role');
  const missing = findColumnDrift(actual);
  assert.ok(!missing.some((entry) => entry.startsWith('tmf_party_role.')));
});

test('findColumnDrift compares column names case-insensitively (Oracle uppercase-folds, Postgres does not)', () => {
  const actual = new Map<string, Set<string>>();
  for (const [table, columns] of DECLARED_COLUMNS) {
    actual.set(table, new Set([...columns].map((column) => column.toUpperCase())));
  }
  assert.deepEqual(findColumnDrift(actual), []);
});

test('parseDeclaredColumns picks up both CREATE TABLE columns and ADD COLUMN IF NOT EXISTS migrations', () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS widget (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      FOREIGN KEY (name) REFERENCES other(name)
    );
    ALTER TABLE widget ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
  `;
  const declared = parseDeclaredColumns(sql);
  assert.deepEqual([...declared.get('widget')!].sort(), ['id', 'name', 'tenant_id']);
});

test('parseDeclaredColumns ignores SQL comments before a column definition', () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS widget (
      id TEXT PRIMARY KEY,
      -- Descrição da coluna canônica abaixo, não uma definição adicional.
      status_code TEXT
    );
  `;
  const declared = parseDeclaredColumns(sql);
  assert.deepEqual([...declared.get('widget')!].sort(), ['id', 'status_code']);
});
