// Single-schema object prefixing for Oracle.
//
// The corporate Oracle instance hosts DEV/HML/PRD (and the test suite) in ONE schema, so every
// object name carries a per-environment prefix — `NEXUS_DEV_tmf_party`, `NEXUS_HML_tmf_party`, etc.
// The application SQL is authored with bare, Postgres-style table names; this module rewrites those
// names for the Oracle path only. Postgres keeps the bare names untouched.
//
// The rewrite is driven by TABLE_NAMES (a closed, known set) so it can be surgical: table names are
// only prefixed where a table can legally appear (anchored to FROM/JOIN/INTO/UPDATE/TABLE/
// REFERENCES), never by a bare word match — a column or alias that happens to equal a table name is
// never touched.

import { TABLE_NAMES } from './schema.js';

// OracleDatabase creates and queries `schema_migrations` itself (it is not part of TABLE_NAMES), but
// it must also be per-environment, so it joins the set of names that get prefixed.
export const PREFIXABLE_TABLE_NAMES: readonly string[] = [...TABLE_NAMES, 'schema_migrations'];

// Longest names first so a longer name (tmf_resource_relationship_generic) is attempted before a
// shorter one it contains (tmf_resource_relationship). The trailing \b in the pattern already guards
// this, but ordering keeps the intent explicit and the regex robust.
const TABLES_BY_LENGTH = [...PREFIXABLE_TABLE_NAMES].sort((a, b) => b.length - a.length);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TABLE_ALTERNATION = TABLES_BY_LENGTH.map(escapeRegExp).join('|');

// A table reference is one of the managed names immediately after a keyword that introduces a table.
const TABLE_REFERENCE = new RegExp(
  `(\\b(?:FROM|JOIN|INTO|UPDATE|TABLE|REFERENCES)\\s+)(${TABLE_ALTERNATION})\\b`,
  'gi',
);

// Postgres/SQLite let a statement reference its own table by its bare name anywhere in it — e.g.
// `UPDATE tmf_geographic_address SET x = (SELECT ... WHERE tmf_geographic_address.id = ...)`, a
// correlated subquery using the updated table as its own implicit alias. TABLE_REFERENCE only
// prefixes the `UPDATE tmf_geographic_address` occurrence (keyword-anchored); the bare correlated
// reference stays unprefixed and Oracle can't resolve it (ORA-00904). Matches only a managed table
// name immediately followed by `.`, so a column or alias that happens to share the name is untouched
// — same closed-set guarantee as TABLE_REFERENCE, just anchored on the trailing dot instead.
const TABLE_DOT_REFERENCE = new RegExp(`\\b(${TABLE_ALTERNATION})(?=\\.)`, 'gi');

/** `tmf_party` + `NEXUS_DEV_` → `NEXUS_DEV_tmf_party`. */
export const prefixed = (name: string, prefix: string): string => `${prefix}${name}`;

// Column names that are Oracle reserved words and must be double-quoted (lowercase) in both the DDL
// and every query that touches them, so the two agree on the case-sensitive quoted identifier. The
// application SQL uses them bare (valid in Postgres/SQLite). Keep this list minimal.
const ORACLE_RESERVED_COLUMNS = ['mode'];

// Quotes Oracle reserved-word columns wherever they appear as an identifier. Uses the UPPERCASE
// quoted form (`mode` → `"MODE"`) to match Oracle's default folding of every other unquoted
// identifier, so the DDL, the runtime translator and the migration all agree on the same name.
export const quoteOracleReservedColumns = (sql: string): string => {
  let output = sql;
  for (const column of ORACLE_RESERVED_COLUMNS) {
    output = output.replace(new RegExp(`\\b${column}\\b`, 'g'), `"${column.toUpperCase()}"`);
  }
  return output;
};

/**
 * Rewrites managed table names in a runtime query to their prefixed form. Only positions where a
 * table can legally appear are rewritten (keyword-anchored); CTE names, derived-table aliases and
 * columns are left alone because they are never in TABLE_NAMES / never follow these keywords as a
 * bare managed name.
 */
export const rewriteTableReferences = (sql: string, prefix: string): string => {
  const withKeywordRefs = sql.replace(
    TABLE_REFERENCE,
    (_match, keyword: string, table: string) => `${keyword}${prefix}${table}`,
  );
  return withKeywordRefs.replace(
    TABLE_DOT_REFERENCE,
    (_match, table: string) => `${prefix}${table}`,
  );
};

/**
 * Rewrites the names of objects a DDL statement CREATEs/ALTERs — tables, indexes and constraints —
 * plus any `REFERENCES <table>`. Index and constraint names must be prefixed too, otherwise two
 * environments would collide on the same identifier inside the shared schema.
 */
export const rewriteDdlObjectNames = (sql: string, prefix: string): string => {
  let output = sql.replace(
    /\b(CREATE\s+TABLE|ALTER\s+TABLE)\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
    (_match, keyword: string, name: string) => `${keyword} ${prefix}${name}`,
  );
  output = output.replace(
    /\b(CREATE(?:\s+UNIQUE)?\s+INDEX)\s+([A-Za-z_][A-Za-z0-9_]*)\s+ON\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
    (_match, keyword: string, index: string, table: string) =>
      `${keyword} ${prefix}${index} ON ${prefix}${table}`,
  );
  output = output.replace(
    /\bADD\s+CONSTRAINT\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
    (_match, name: string) => `ADD CONSTRAINT ${prefix}${name}`,
  );
  output = output.replace(
    /\bREFERENCES\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
    (_match, name: string) => `REFERENCES ${prefix}${name}`,
  );
  return output;
};
