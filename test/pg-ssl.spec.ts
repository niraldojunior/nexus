import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sslFor } from '../scripts/pg-ssl.mjs';

// O helper que decide a opção `ssl` do `pg` a partir da connection string. É o
// que faz os loaders de carga funcionarem tanto contra o Neon (TLS obrigatório)
// quanto contra o Postgres do contêiner (sem TLS) — ver AGENTS.md e o plano de
// migração para VPS/Docker.

test('sslFor relaxes TLS for a Neon URL (sslmode=require)', () => {
  const ssl = sslFor('postgresql://user:pass@ep-neon-pooler.neon.tech/db?sslmode=require');
  assert.deepEqual(ssl, { rejectUnauthorized: false });
});

test('sslFor disables TLS for a container URL without sslmode', () => {
  assert.equal(sslFor('postgresql://nexus:pass@nexus-pg:5432/nexus'), false);
});

test('sslFor disables TLS when sslmode=disable is explicit', () => {
  assert.equal(sslFor('postgresql://nexus:pass@nexus-pg:5432/nexus?sslmode=disable'), false);
});

test('sslFor keeps the historical relaxed TLS for any other sslmode', () => {
  assert.deepEqual(sslFor('postgresql://h/db?sslmode=verify-full'), {
    rejectUnauthorized: false,
  });
});

test('sslFor falls back to relaxed TLS on a malformed URL', () => {
  assert.deepEqual(sslFor('not a url'), { rejectUnauthorized: false });
});
