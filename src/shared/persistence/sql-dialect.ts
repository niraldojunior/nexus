import type { DatabaseProvider } from './database-client.js';

// Provider-specific SQL fragments for the few constructs that have no common form the OracleDatabase
// regex translator can bridge. Everything the translator CAN handle (binds, LIMIT/OFFSET, upsert →
// MERGE, JSON paths, table-name prefixing) stays there; this helper is only for shapes that differ
// structurally between the dialects.
export interface SqlDialect {
  readonly provider: DatabaseProvider;
  /**
   * An inline, single-column table of the given `values`, aliased `alias(column)`, plus the binds to
   * pass in order. Postgres uses a VALUES constructor (one bind per value). Oracle uses JSON_TABLE
   * over a single JSON-array bind — a VALUES-style `SELECT ? FROM DUAL UNION ALL …` would be an
   * N-branch statement that Oracle parses/executes in super-linear time (seconds for a few thousand
   * rows). `values` must be non-empty.
   */
  inlineRows(
    values: readonly unknown[],
    alias: string,
    column: string,
  ): { sql: string; binds: unknown[] };
  /**
   * A bind-free SQL expression that evaluates to a fresh random id string per row — for
   * `INSERT ... SELECT` statements that create one row per candidate without a JS-side loop
   * generating an id per row (impractical at bulk-operation scale, tens of thousands of rows).
   * Not a canonical UUID v7 (C5 governs entity ids like Site/Resource/Service; this is a
   * derived audit-trail row, same trade-off already accepted by the bulk data loaders).
   */
  newRowId(): string;
}

const requireNonEmpty = (values: readonly unknown[]): void => {
  if (values.length < 1) throw new Error('inlineRows requires at least one value.');
};

const postgresDialect: SqlDialect = {
  provider: 'postgres',
  inlineRows(values, alias, column) {
    requireNonEmpty(values);
    const rows = values.map(() => '(?)').join(', ');
    return { sql: `(VALUES ${rows}) AS ${alias}(${column})`, binds: [...values] };
  },
  newRowId: () => 'gen_random_uuid()::text',
};

const oracleDialect: SqlDialect = {
  provider: 'oracle',
  inlineRows(values, alias, column) {
    requireNonEmpty(values);
    // One JSON-array bind, expanded by JSON_TABLE — scales to any row count with a single parse.
    const sql =
      `(SELECT ${column} FROM JSON_TABLE(?, '$[*]' ` +
      `COLUMNS (${column} VARCHAR2(4000) PATH '$'))) ${alias}`;
    return { sql, binds: [JSON.stringify(values)] };
  },
  newRowId: () => 'LOWER(RAWTOHEX(SYS_GUID()))',
};

export const dialectFor = (provider: DatabaseProvider): SqlDialect =>
  provider === 'oracle' ? oracleDialect : postgresDialect;
