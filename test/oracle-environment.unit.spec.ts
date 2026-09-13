import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  discoverOracleEnvironments,
  generateTemporaryPassword,
  isTemporaryPasswordStrong,
  orderedTablesForDestruction,
} from '../src/shared/persistence/oracle-environment.js';
import { PREFIXABLE_TABLE_NAMES } from '../src/shared/persistence/oracle-object-names.js';

test('descobre ambientes completos e parciais apenas por tabelas Nexus permitidas', () => {
  const tables = [
    'NX_DEV_USERS',
    'NX_DEV_TMF_PARTY',
    'NX_DEV_SCHEMA_MIGRATIONS',
    'NX_PARTIAL_USERS',
    'NX_PARTIAL_TMF_PARTY',
    'UNRELATED_TABLE',
    'NX_NOISE_AUDIT_LOG',
  ];
  const environments = discoverOracleEnvironments(tables);

  assert.deepEqual(
    environments.map(({ prefix, status, tableCount }) => ({ prefix, status, tableCount })),
    [
      { prefix: 'NX_DEV_', status: 'partial', tableCount: 3 },
      { prefix: 'NX_PARTIAL_', status: 'partial', tableCount: 2 },
    ],
  );
});

test('ambiente com todas as tabelas gerenciadas é completo', () => {
  const environment = discoverOracleEnvironments(
    PREFIXABLE_TABLE_NAMES.map((table) => `NX_READY_${table}`),
  );

  assert.equal(environment.length, 1);
  assert.equal(environment[0]?.prefix, 'NX_READY_');
  assert.equal(environment[0]?.status, 'complete');
  assert.equal(environment[0]?.tableCount, PREFIXABLE_TABLE_NAMES.length);
});

test('destruição mantém schema_migrations por último', () => {
  const order = orderedTablesForDestruction(['users', 'tmf_party', 'schema_migrations']);
  assert.equal(order.at(-1), 'schema_migrations');
  assert.deepEqual(new Set(order), new Set(['users', 'tmf_party', 'schema_migrations']));
});

test('senha temporária é forte e não é determinística', () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();

  assert.notEqual(first, second);
  assert.ok(isTemporaryPasswordStrong(first));
  assert.ok(isTemporaryPasswordStrong(second));
});
