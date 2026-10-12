import { describe, expect, it } from 'vitest';
import { TABLE_NAMES, TABLE_RENAMES, databaseDomainOf } from '../src/shared/persistence/database-object-names.js';
import { INDEX_RENAMES } from '../src/shared/persistence/legacy-object-names.js';
import {
  invert,
  planRenames,
  preflight,
  renameStatement,
  stateOf,
  type Catalog,
} from '../src/shared/persistence/object-restructure.js';

const catalogOf = (tables: string[], indexes: string[] = [], constraints: [string, string][] = []): Catalog => ({
  tables: new Set(tables),
  indexes: new Set(indexes),
  constraints: new Map(constraints),
});

describe('registro de nomes canônicos', () => {
  it('classifica toda tabela em um dos nove domínios, sem TMF', () => {
    for (const canonical of Object.values(TABLE_RENAMES)) {
      expect(() => databaseDomainOf(canonical)).not.toThrow();
      expect(canonical).not.toMatch(/tmf/i);
    }
  });

  it('não repete destino de tabela nem de índice', () => {
    const tables = Object.values(TABLE_RENAMES);
    expect(new Set(tables).size).toBe(tables.length);
    const indexes = Object.values(INDEX_RENAMES);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it('TABLE_NAMES do runtime só contém nomes canônicos', () => {
    const canonical = new Set(Object.values(TABLE_RENAMES));
    for (const name of TABLE_NAMES) expect(canonical.has(name)).toBe(true);
  });
});

describe('planejamento do cutover', () => {
  const plan = planRenames('NX_DEV9_');

  it('deixa o ledger de migrations por último', () => {
    expect(plan.at(-1)).toMatchObject({
      source: 'NX_DEV9_SCHEMA_MIGRATIONS',
      target: 'NX_DEV9_MIGRATION_SCHEMA',
    });
  });

  it('gera o exemplo do usuário', () => {
    const party = plan.find((operation) => operation.source === 'NX_DEV9_TMF_PARTY_ROLE');
    expect(party?.target).toBe('NX_DEV9_PARTY_ROLE');
  });

  it('estado: pendente, concluída, ausente e conflito', () => {
    const operation = plan[0]!;
    expect(stateOf(operation, catalogOf([operation.source]))).toBe('pending');
    expect(stateOf(operation, catalogOf([operation.target]))).toBe('done');
    expect(stateOf(operation, catalogOf([]))).toBe('absent');
    expect(stateOf(operation, catalogOf([operation.source, operation.target]))).toBe('conflict');
  });

  it('preflight aborta quando origem e destino coexistem', () => {
    const operation = plan[0]!;
    const problems = preflight(plan, catalogOf([operation.source, operation.target]));
    expect(problems.some((problem) => problem.message.includes('coexistem'))).toBe(true);
  });

  it('preflight acusa índice colidindo com tabela', () => {
    const index = plan.find((operation) => operation.kind === 'index')!;
    const problems = preflight(plan, catalogOf([index.target]));
    expect(problems.some((problem) => problem.message.includes('colide'))).toBe(true);
  });

  it('plano limpo passa no preflight e cabe em 128 bytes', () => {
    expect(preflight(plan, catalogOf(plan.filter((o) => o.kind === 'table').map((o) => o.source)))).toEqual([]);
  });

  it('rollback inverte origem e destino', () => {
    const operation = plan[0]!;
    expect(invert(operation)).toMatchObject({ source: operation.target, target: operation.source });
  });

  it('emite SQL por tipo', () => {
    expect(renameStatement({ kind: 'table', source: 'A', target: 'B' })).toBe('ALTER TABLE A RENAME TO B');
    expect(renameStatement({ kind: 'index', source: 'A', target: 'B' })).toBe('ALTER INDEX A RENAME TO B');
    expect(renameStatement({ kind: 'constraint', source: 'A', target: 'B' }, 'T')).toBe(
      'ALTER TABLE T RENAME CONSTRAINT A TO B',
    );
  });
});
