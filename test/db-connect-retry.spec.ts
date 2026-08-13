import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  TRANSIENT_CONNECT_ERROR,
  retryOnTransient,
} from '../src/shared/persistence/postgres-database.js';

const noSleep = async (): Promise<void> => {};
const isTransient = (message: string): boolean => TRANSIENT_CONNECT_ERROR.test(message);

test('retryOnTransient retorna no primeiro sucesso, sem retry', async () => {
  let calls = 0;
  const result = await retryOnTransient(
    async () => {
      calls += 1;
      return 'ok';
    },
    isTransient,
    [1, 1, 1],
    noSleep,
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retryOnTransient tenta de novo em erro transitório (cold-start do Neon) e depois vence', async () => {
  let calls = 0;
  const result = await retryOnTransient(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('Connection terminated unexpectedly');
      return 'conectou';
    },
    isTransient,
    [1, 1, 1, 1],
    noSleep,
  );
  assert.equal(result, 'conectou');
  assert.equal(calls, 3);
});

test('retryOnTransient re-lança erro permanente na primeira tentativa (sem retry)', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      retryOnTransient(
        async () => {
          calls += 1;
          throw new Error('password authentication failed for user "neondb_owner"');
        },
        isTransient,
        [1, 1, 1],
        noSleep,
      ),
    /password authentication failed/,
  );
  assert.equal(calls, 1);
});

test('retryOnTransient desiste após esgotar o backoff, propagando o último erro transitório', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      retryOnTransient(
        async () => {
          calls += 1;
          throw new Error('ETIMEDOUT');
        },
        isTransient,
        [1, 1], // 1 tentativa inicial + 2 retries = 3 chamadas
        noSleep,
      ),
    /ETIMEDOUT/,
  );
  assert.equal(calls, 3);
});

test('TRANSIENT_CONNECT_ERROR classifica cold-start como transitório e auth como permanente', () => {
  assert.ok(TRANSIENT_CONNECT_ERROR.test('Connection terminated due to connection timeout'));
  assert.ok(TRANSIENT_CONNECT_ERROR.test('read ECONNRESET'));
  assert.equal(TRANSIENT_CONNECT_ERROR.test('password authentication failed'), false);
  assert.equal(TRANSIENT_CONNECT_ERROR.test('database "nexus" does not exist'), false);
});
