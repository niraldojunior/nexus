import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normalizeRequestUrl } from '../api/[...path].js';

test('Vercel handler strips the /api prefix from proxied routes', () => {
  assert.equal(normalizeRequestUrl('/api/v1/geo/sites?limit=10'), '/v1/geo/sites?limit=10');
});

test('Vercel handler preserves root path and query string', () => {
  assert.equal(normalizeRequestUrl('/api?includeEnded=true'), '/?includeEnded=true');
  assert.equal(normalizeRequestUrl('/health'), '/health');
});
