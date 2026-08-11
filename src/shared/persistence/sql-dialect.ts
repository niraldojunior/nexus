import type { DatabaseProvider } from './database-client.js';

// Provider-specific SQL fragments for the few constructs that have no common form the OracleDatabase
// regex translator can bridge. Everything the translator CAN handle (binds, LIMIT/OFFSET, upsert →
// MERGE, JSON paths, table-name prefixing) stays there; this helper is only for shapes that differ
// structurally between the dialects.
export interface SqlDialect {
  readonly provider: DatabaseProvider;
  /**
   * An inline, single-column table of `count` bound-parameter rows, aliased `alias(column)`.
   * Postgres uses a VALUES constructor; Oracle has none, so it unions `SELECT ? FROM DUAL` rows.
   * Emits exactly `count` `?` placeholders — bind the row values in order. `count` must be >= 1.
   */
  inlineRows(count: number, alias: string, column: string): string;
}

const requirePositiveCount = (count: number): void => {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`inlineRows requires a positive row count, received ${count}.`);
  }
};

const postgresDialect: SqlDialect = {
  provider: 'postgres',
  inlineRows(count, alias, column) {
    requirePositiveCount(count);
    const rows = Array.from({ length: count }, () => '(?)').join(', ');
    return `(VALUES ${rows}) AS ${alias}(${column})`;
  },
};

const oracleDialect: SqlDialect = {
  provider: 'oracle',
  inlineRows(count, alias, column) {
    requirePositiveCount(count);
    const rows = Array.from({ length: count }, () => `SELECT ? AS ${column} FROM DUAL`).join(
      ' UNION ALL ',
    );
    return `(${rows}) ${alias}`;
  },
};

export const dialectFor = (provider: DatabaseProvider): SqlDialect =>
  provider === 'oracle' ? oracleDialect : postgresDialect;
