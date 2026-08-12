// Dialect safety net that needs no database.
//
// The corporate Oracle instance is behind credentials, so the default CI run never executes Oracle.
// This module is the gate that runs anyway: it applies the same transform OracleDatabase applies and
// asserts that no Postgres-only construct survives. If someone writes a new query the translator (or
// the sql-dialect helper) does not cover, `assertOracleCompatible` fails in the unit suite — long
// before the SQL reaches a real Oracle server.

import { transformOracleQuery } from './oracle-database.js';

// A representative test prefix; the residue check below is prefix-independent.
const LINT_PREFIX = 'NEXUS_LINT_';

type Postgresism = { readonly pattern: RegExp; readonly label: string };

// Constructs that are valid in Postgres but not in Oracle. After transformOracleQuery has run, none
// of these should remain. Note the VALUES check is anchored to `(VALUES` (the table constructor) so
// it does not flag the legal `INSERT (...) VALUES (...)` clause a MERGE emits.
const POSTGRESISMS: readonly Postgresism[] = [
  { pattern: /::[A-Za-z]/, label: ':: cast' },
  { pattern: /\bjsonb_array_elements\b/i, label: 'jsonb_array_elements' },
  { pattern: /\bjson_extract\b/i, label: 'json_extract' },
  { pattern: /->/, label: '-> / ->> JSON access' },
  { pattern: /\bIS\s+DISTINCT\s+FROM\b/i, label: 'IS DISTINCT FROM' },
  { pattern: /\bLIMIT\b/i, label: 'LIMIT' },
  { pattern: /\bON\s+CONFLICT\b/i, label: 'ON CONFLICT' },
  { pattern: /\bWITH\s+RECURSIVE\b/i, label: 'WITH RECURSIVE' },
  { pattern: /\)\s+AS\s+[a-z_][a-z0-9_]*/, label: 'AS <alias> after )' },
  { pattern: /\(\s*VALUES\b/i, label: 'VALUES constructor' },
];

/** The Postgres-only constructs still present in an already-translated Oracle SQL string. */
export const findPostgresisms = (oracleSql: string): string[] =>
  POSTGRESISMS.filter(({ pattern }) => pattern.test(oracleSql)).map(({ label }) => label);

/**
 * Translates `sql` for Oracle and throws if any Postgres-only construct survives. `sql` must be the
 * exact string a repository emits for the Oracle path (i.e. after any sql-dialect fragment has been
 * substituted), which is what the runtime hands to OracleDatabase.
 */
export const assertOracleCompatible = (sql: string, prefix: string = LINT_PREFIX): void => {
  const translated = transformOracleQuery(sql, prefix);
  const remaining = findPostgresisms(translated);
  if (remaining.length > 0) {
    throw new Error(
      `SQL não traduz para Oracle; construções remanescentes: ${remaining.join(', ')}\n${translated}`,
    );
  }
};
