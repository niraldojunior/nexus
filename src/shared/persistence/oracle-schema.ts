import { MIGRATIONS_SQL, SCHEMA_SQL } from './schema.js';

const CLOB_COLUMNS = new Set([
  'after_state',
  'allowed_characteristics',
  'allowed_child_spec_ids',
  'allowed_parent_spec_ids',
  'allowed_source_categories',
  'allowed_target_categories',
  'applicable_to_entity_types',
  'before_state',
  'characteristics',
  'content',
  'context',
  'event_data',
  'filters',
  'geometry',
  'metadata',
  'note',
  'payload',
  'place',
  'related_party',
  'resource_order_item',
  'results',
  'service_characteristic',
  'service_order_item',
  'service_qualification_item',
  'service_relationships',
  'site_addresses',
  'supporting_resources',
  'supporting_services',
  'warnings',
]);

const JSON_COLUMNS = new Set(
  [...CLOB_COLUMNS].filter(
    (column) => !['content', 'query', 'summary', 'title', 'description', 'message'].includes(column),
  ),
);

const oracleTextType = (column: string): string => {
  if (CLOB_COLUMNS.has(column)) return 'CLOB';
  if (column === 'id' || column === 'token' || column.endsWith('_id')) return 'VARCHAR2(36 CHAR)';
  if (['description', 'href', 'message', 'note', 'query', 'summary', 'title'].includes(column)) {
    return 'VARCHAR2(4000 CHAR)';
  }
  return 'VARCHAR2(255 CHAR)';
};

export const transformOracleSchemaSql = (sql: string): string => {
  let output = sql
    .replace(/--.*$/gm, '')
    .replace(/\bCREATE TABLE IF NOT EXISTS\b/gi, 'CREATE TABLE')
    .replace(/\bCREATE INDEX IF NOT EXISTS\b/gi, 'CREATE INDEX')
    .replace(/\bADD COLUMN IF NOT EXISTS\b/gi, 'ADD')
    .replace(/\bDROP CONSTRAINT IF EXISTS\b/gi, 'DROP CONSTRAINT')
    .replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP(6) WITH TIME ZONE')
    .replace(/\bDATETIME\b/g, 'TIMESTAMP(6) WITH TIME ZONE')
    .replace(/\bDOUBLE PRECISION\b/g, 'BINARY_DOUBLE')
    .replace(/\bREAL\b/g, 'BINARY_DOUBLE')
    .replace(/\bINTEGER\b/g, 'NUMBER(10)');

  output = output.replace(
    /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s+TEXT\b/gm,
    (_match, indent: string, column: string) => `${indent}${column} ${oracleTextType(column)}`,
  );
  output = output.replace(
    /\bADD\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+TEXT\b/g,
    (_match, column: string) => `ADD ${column} ${oracleTextType(column)}`,
  );
  output = output.replace(
    /json_extract\(event_data, '\$\.entityId'\)/g,
    "JSON_VALUE(event_data, '$.entityId' RETURNING VARCHAR2(36))",
  );
  output = output.replace(
    /\(\(geometry::jsonb->'coordinates'->>0\)::float8\)/g,
    "JSON_VALUE(geometry, '$.coordinates[0]' RETURNING NUMBER)",
  );
  output = output.replace(
    /\(\(geometry::jsonb->'coordinates'->>1\)::float8\)/g,
    "JSON_VALUE(geometry, '$.coordinates[1]' RETURNING NUMBER)",
  );
  return output;
};

export const ORACLE_SCHEMA_SQL = transformOracleSchemaSql(SCHEMA_SQL);
export const ORACLE_MIGRATIONS_SQL = transformOracleSchemaSql(MIGRATIONS_SQL);

let jsonConstraintIndex = 0;
export const ORACLE_JSON_CONSTRAINTS_SQL = splitOracleStatements(ORACLE_SCHEMA_SQL)
  .flatMap((statement) => {
    const table = statement.match(/^CREATE TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/i)?.[1];
    if (!table) return [];
    return [...JSON_COLUMNS]
      .filter((column) => new RegExp(`\\b${column}\\s+CLOB\\b`, 'i').test(statement))
      .map((column) => {
        jsonConstraintIndex += 1;
        return `ALTER TABLE ${table} ADD CONSTRAINT ck_nexus_json_${jsonConstraintIndex} CHECK (${column} IS JSON)`;
      });
  })
  .join(';\n');

export function splitOracleStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}
