import { MIGRATION_BATCHES, MIGRATIONS_SQL, SCHEMA_SQL, type MigrationBatch } from './schema.js';
import { quoteOracleReservedColumns } from './oracle-object-names.js';

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
  'icon_data_url',
  'metadata',
  'note',
  'observation',
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
  'site_ids',
  'sub_address',
  'supporting_resources',
  'supporting_services',
  'warnings',
]);

const JSON_COLUMNS = new Set(
  [...CLOB_COLUMNS].filter(
    (column) =>
      ![
        'content',
        'query',
        'summary',
        'title',
        'description',
        'message',
        'icon_data_url',
        'observation',
      ].includes(column),
  ),
);

const oracleTextType = (column: string): string => {
  if (CLOB_COLUMNS.has(column)) return 'CLOB';
  if (column === 'id' || column === 'token' || column.endsWith('_id')) return 'VARCHAR2(36 CHAR)';
  if (['description', 'message', 'note', 'query', 'summary', 'title'].includes(column)) {
    return 'VARCHAR2(4000 CHAR)';
  }
  return 'VARCHAR2(255 CHAR)';
};

export const transformOracleSchemaSql = (sql: string): string => {
  let output = sql
    .replace(/--.*$/gm, '')
    .replace(/\bCREATE TABLE IF NOT EXISTS\b/gi, 'CREATE TABLE')
    .replace(/\bCREATE UNIQUE INDEX IF NOT EXISTS\b/gi, 'CREATE UNIQUE INDEX')
    .replace(/\bCREATE INDEX IF NOT EXISTS\b/gi, 'CREATE INDEX')
    .replace(/\bADD COLUMN IF NOT EXISTS\b/gi, 'ADD')
    .replace(/\bDROP CONSTRAINT IF EXISTS\b/gi, 'DROP CONSTRAINT')
    .replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP(6) WITH TIME ZONE')
    .replace(/\bDATETIME\b/g, 'TIMESTAMP(6) WITH TIME ZONE')
    .replace(/\bDOUBLE PRECISION\b/g, 'BINARY_DOUBLE')
    .replace(/\bREAL\b/g, 'BINARY_DOUBLE')
    .replace(/\bINTEGER\b/g, 'NUMBER(10)');

  // Oracle não implementa índices parciais (`WHERE detached_at IS NULL`). A expressão
  // indexada entrega a mesma regra: valores NULL não participam da unicidade, logo só o
  // vínculo ainda aberto de um Resource é exclusivo.
  output = output.replace(
    /CREATE UNIQUE INDEX\s+([a-zA-Z0-9_]+)\s+ON\s+([a-zA-Z0-9_]+)\s*\(resource_id\)\s+WHERE\s+detached_at\s+IS\s+NULL/gi,
    'CREATE UNIQUE INDEX $1 ON $2(CASE WHEN detached_at IS NULL THEN resource_id END)',
  );

  output = output.replace(
    /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s+TEXT\b/gm,
    (_match, indent: string, column: string) => `${indent}${column} ${oracleTextType(column)}`,
  );
  output = output.replace(
    /\bADD\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+TEXT\b/g,
    (_match, column: string) => `ADD ${column} ${oracleTextType(column)}`,
  );
  // Oracle requires DEFAULT before the inline NOT NULL constraint (SQLite/Postgres accept either
  // order). Reorder `NOT NULL DEFAULT <value>` → `DEFAULT <value> NOT NULL`, preserving any trailing
  // CHECK(...) — the default value is always a single token (quoted string or number/keyword).
  output = output.replace(/\bNOT NULL DEFAULT\s+('[^']*'|[^\s,)]+)/gi, 'DEFAULT $1 NOT NULL');
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
  // Oracle has no partial indexes. The only one is the point lng/lat functional index; drop its
  // predicate — JSON_VALUE(... RETURNING NUMBER) is NULL for non-Point geometries (their
  // coordinates[0] is an array, not a number), so those rows are excluded from the index anyway.
  output = output.replace(/\s+WHERE\s+geometry_type\s*=\s*'Point'/gi, '');
  // text_pattern_ops is a Postgres-only operator class (LIKE-optimized btree over an
  // expression). Oracle has no equivalent syntax — the same `LOWER(name)` functional index,
  // without the suffix, already serves `LOWER(name) LIKE 'prefix%'` there.
  output = output.replace(/\s+text_pattern_ops\b/gi, '');
  // Oracle has no LIMIT — mesmo dentro de uma subquery correlacionada de UPDATE...SET (ver
  // Backfill 2/3 em schema.ts), sem isto o parser Oracle estoura ORA-00907 no `)` que segue.
  // FETCH FIRST n ROWS ONLY é ANSI e válido nos dois contextos (SELECT de topo e subquery).
  output = output.replace(/\bLIMIT\s+(\d+)\b/gi, 'FETCH FIRST $1 ROWS ONLY');
  output = quoteOracleReservedColumns(output);
  return output;
};

export const ORACLE_SCHEMA_SQL = transformOracleSchemaSql(SCHEMA_SQL);
export const ORACLE_MIGRATIONS_SQL = transformOracleSchemaSql(MIGRATIONS_SQL);

// Oracle-dialect mirror of schema.ts's MIGRATION_BATCHES — same versions/names, SQL rewritten
// per statement so OracleDatabase.applyMigrations() can apply/skip per batch like Postgres does.
export const ORACLE_MIGRATION_BATCHES: readonly MigrationBatch[] = MIGRATION_BATCHES.map(
  (batch) => ({ ...batch, sql: transformOracleSchemaSql(batch.sql) }),
);

// `context` holds JSON in mcp_confirmation but free-form markdown (the Nexus Copilot system prompt)
// in research_session, so the IS JSON check must be skipped for that column there. Keyed by
// `table.column` so the exclusion is surgical — every other `context` column stays constrained.
const JSON_CONSTRAINT_EXCLUSIONS = new Set(['research_session.context']);

let jsonConstraintIndex = 0;
export const ORACLE_JSON_CONSTRAINTS_SQL = splitOracleStatements(ORACLE_SCHEMA_SQL)
  .flatMap((statement) => {
    const table = statement.match(/^CREATE TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/i)?.[1];
    if (!table) return [];
    return [...JSON_COLUMNS]
      .filter((column) => new RegExp(`\\b${column}\\s+CLOB\\b`, 'i').test(statement))
      .flatMap((column) => {
        // Increment for every candidate column so constraint numbers stay stable across
        // environments even when a column is excluded; just skip emitting the excluded one.
        jsonConstraintIndex += 1;
        if (JSON_CONSTRAINT_EXCLUSIONS.has(`${table}.${column}`)) return [];
        return [
          `ALTER TABLE ${table} ADD CONSTRAINT ck_nexus_json_${jsonConstraintIndex} CHECK (${column} IS JSON)`,
        ];
      });
  })
  .join(';\n');

export function splitOracleStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}
