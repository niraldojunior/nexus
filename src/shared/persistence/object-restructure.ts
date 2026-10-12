// Issue #344: planejamento do cutover dos nomes físicos Oracle (legado → domínio). Este módulo é
// puro (sem I/O) para ser testável; a execução e o ledger ficam em src/scripts/restructure-database-objects.ts.
import { CONSTRAINT_RENAMES, INDEX_RENAMES } from './legacy-object-names.js';
import { LEGACY_TABLE_NAMES, TABLE_RENAMES } from './database-object-names.js';

export const RESTRUCTURE_LEDGER_TABLE = 'migration_database_object_rename';
export const ORACLE_IDENTIFIER_MAX_BYTES = 128;

export type RenameKind = 'table' | 'index' | 'constraint';

export type RenameOperation = {
  kind: RenameKind;
  source: string;
  target: string;
  /** Tabela dona (já com nome atual no momento da execução) — só para constraints. */
  table?: string;
};

export type Catalog = {
  tables: ReadonlySet<string>;
  indexes: ReadonlySet<string>;
  /** nome da constraint → nome da tabela dona (ambos uppercase). */
  constraints: ReadonlyMap<string, string>;
};

export type OperationState = 'pending' | 'done' | 'absent' | 'conflict';

const MIGRATION_LEDGER_LEGACY = 'schema_migrations';

/** Tabelas primeiro (ledger de migrations por último), depois índices e constraints. */
export const planRenames = (prefix: string): RenameOperation[] => {
  const upper = (name: string): string => `${prefix}${name}`.toUpperCase();
  const tables = LEGACY_TABLE_NAMES.filter((legacy) => TABLE_RENAMES[legacy] !== legacy)
    .filter((legacy) => legacy !== MIGRATION_LEDGER_LEGACY)
    .map<RenameOperation>((legacy) => ({
      kind: 'table',
      source: upper(legacy),
      target: upper(TABLE_RENAMES[legacy]),
    }));
  const indexes = Object.entries(INDEX_RENAMES).map<RenameOperation>(([source, target]) => ({
    kind: 'index',
    source: upper(source),
    target: upper(target),
  }));
  const constraints = Object.entries(CONSTRAINT_RENAMES).map<RenameOperation>(
    ([source, target]) => ({ kind: 'constraint', source: upper(source), target: upper(target) }),
  );
  const ledger: RenameOperation = {
    kind: 'table',
    source: upper(MIGRATION_LEDGER_LEGACY),
    target: upper(TABLE_RENAMES[MIGRATION_LEDGER_LEGACY]),
  };
  return [...tables, ...indexes, ...constraints, ledger];
};

const existsInCatalog = (catalog: Catalog, kind: RenameKind, name: string): boolean =>
  kind === 'table'
    ? catalog.tables.has(name)
    : kind === 'index'
      ? catalog.indexes.has(name)
      : catalog.constraints.has(name);

/**
 * Estado de uma operação diante do catálogo. `conflict` = origem e destino coexistem (abortar,
 * nunca escolher pela contagem de linhas). `absent` = nenhum dos dois existe (objeto opcional).
 */
export const stateOf = (operation: RenameOperation, catalog: Catalog): OperationState => {
  const source = existsInCatalog(catalog, operation.kind, operation.source);
  const target = existsInCatalog(catalog, operation.kind, operation.target);
  if (source && target) return 'conflict';
  if (source) return 'pending';
  if (target) return 'done';
  return 'absent';
};

export type PreflightProblem = { operation?: RenameOperation; message: string };

export const preflight = (
  operations: readonly RenameOperation[],
  catalog: Catalog,
): PreflightProblem[] => {
  const problems: PreflightProblem[] = [];
  const seen = new Map<string, RenameOperation>();
  for (const operation of operations) {
    for (const name of [operation.source, operation.target]) {
      if (Buffer.byteLength(name, 'utf8') > ORACLE_IDENTIFIER_MAX_BYTES) {
        problems.push({ operation, message: `Identificador acima de 128 bytes: ${name}.` });
      }
    }
    const key = `${operation.kind}:${operation.target}`;
    const previous = seen.get(key);
    if (previous) {
      problems.push({
        operation,
        message: `${previous.source} e ${operation.source} resolvem para ${operation.target}.`,
      });
    }
    seen.set(key, operation);
    if (stateOf(operation, catalog) === 'conflict') {
      problems.push({
        operation,
        message: `Origem ${operation.source} e destino ${operation.target} já coexistem.`,
      });
    }
    // Índice, constraint e tabela dividem o namespace de objetos do schema Oracle.
    if (operation.kind !== 'table' && catalog.tables.has(operation.target)) {
      problems.push({ operation, message: `${operation.target} colide com uma tabela.` });
    }
  }
  return problems;
};

export const renameStatement = (operation: RenameOperation, tableOf?: string): string => {
  switch (operation.kind) {
    case 'table':
      return `ALTER TABLE ${operation.source} RENAME TO ${operation.target}`;
    case 'index':
      return `ALTER INDEX ${operation.source} RENAME TO ${operation.target}`;
    case 'constraint':
      if (!tableOf) throw new Error(`Constraint ${operation.source} sem tabela dona.`);
      return `ALTER TABLE ${tableOf} RENAME CONSTRAINT ${operation.source} TO ${operation.target}`;
  }
};

/** Inverte uma operação (rollback). */
export const invert = (operation: RenameOperation): RenameOperation => ({
  ...operation,
  source: operation.target,
  target: operation.source,
});
