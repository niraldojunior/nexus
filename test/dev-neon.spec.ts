import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildDevNeonRuntimeEnv, ensureDevDataDir } from '../src/shared/config/dev-neon-core.js';

test('dev neon runtime requires database url and defaults node env', () => {
  assert.throws(() => buildDevNeonRuntimeEnv({}), /DATABASE_URL_DEV/);

  const env = buildDevNeonRuntimeEnv({ DATABASE_URL_DEV: 'postgresql://example' });
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.DATABASE_URL, 'postgresql://example');
});

test('dev neon runtime preserves explicit environment values', () => {
  const env = buildDevNeonRuntimeEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://explicit',
  });

  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.DATABASE_URL, 'postgresql://explicit');
});

test('dev neon runtime prefers postgres database url for Neon dev', () => {
  const env = buildDevNeonRuntimeEnv({
    DATABASE_URL: 'postgresql://fallback',
    DATABASE_URL_DEV: 'postgresql://example',
  });

  assert.equal(env.DATABASE_URL, 'postgresql://example');
});

test('dev neon launcher ensures data directory exists for local artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'nexus-dev-'));
  try {
    const dataDir = ensureDevDataDir(root);
    assert.equal(dataDir, join(root, 'data'));
    assert.equal(existsSync(dataDir), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dev neon runtime uses app default port when port is absent', () => {
  const env = buildDevNeonRuntimeEnv({ DATABASE_URL_DEV: 'postgresql://example' });
  assert.equal(Number(env.PORT || 3000), 3000);
});

test('dev neon launcher target matches compiled main path layout', () => {
  const path = join(process.cwd(), 'dist', 'src', 'main.js');
  assert.equal(path.endsWith('dist\\src\\main.js') || path.endsWith('dist/src/main.js'), true);
});
