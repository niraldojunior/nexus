import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  assertListBounded,
  MAX_LIST_LIMIT,
  resolveListLimit,
} from '../src/shared/http/list-query.js';
import { AppError } from '../src/shared/errors/app-error.js';

test('resolveListLimit sem limit pede um a mais que o teto e marca implícito', () => {
  const resolved = resolveListLimit(undefined);

  assert.equal(resolved.limit, MAX_LIST_LIMIT + 1);
  assert.equal(resolved.implicit, true);
});

test('resolveListLimit com limit explícito faz clamp no teto', () => {
  const resolved = resolveListLimit(999_999);

  assert.equal(resolved.limit, MAX_LIST_LIMIT);
  assert.equal(resolved.implicit, false);
});

test('resolveListLimit com limit explícito dentro do teto não sofre clamp', () => {
  const resolved = resolveListLimit(500);

  assert.equal(resolved.limit, 500);
  assert.equal(resolved.implicit, false);
});

test('resolveListLimit com limit zero ou negativo cai para 1', () => {
  assert.equal(resolveListLimit(0).limit, 1);
  assert.equal(resolveListLimit(-5).limit, 1);
});

test('resolveListLimit trunca valores fracionários', () => {
  const resolved = resolveListLimit(10.9);

  assert.equal(resolved.limit, 10);
});

test('assertListBounded devolve as linhas quando dentro do teto, mesmo sem limit explícito', () => {
  const resolved = resolveListLimit(undefined);
  const rows = Array.from({ length: MAX_LIST_LIMIT }, (_, i) => i);

  const result = assertListBounded(rows, resolved);

  assert.equal(result, rows);
  assert.equal(result.length, MAX_LIST_LIMIT);
});

test('assertListBounded lança LIST_TOO_LARGE quando o resultado implícito encosta no teto', () => {
  const resolved = resolveListLimit(undefined);
  const rows = Array.from({ length: MAX_LIST_LIMIT + 1 }, (_, i) => i);

  assert.throws(
    () => assertListBounded(rows, resolved),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'LIST_TOO_LARGE');
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('assertListBounded nunca lança quando o limit foi explícito, mesmo com mais linhas que o pedido', () => {
  // Defesa em profundidade: um repositório que ignorasse o limit não deveria derrubar a request.
  const resolved = resolveListLimit(10);
  const rows = Array.from({ length: 10_000 }, (_, i) => i);

  assert.doesNotThrow(() => assertListBounded(rows, resolved));
});
