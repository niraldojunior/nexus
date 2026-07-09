import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normalizeRequestUrl as rootNormalizeRequestUrl } from '../api/[...path].js';
import { normalizeRequestUrl as webNormalizeRequestUrl } from '../web/api/[...path].js';

test('Vercel handler strips the /api prefix from proxied routes', () => {
  assert.equal(rootNormalizeRequestUrl('/api/v1/geo/sites?limit=10'), '/v1/geo/sites?limit=10');
});

test('Vercel handler preserves root path and query string', () => {
  assert.equal(webNormalizeRequestUrl('/api?includeEnded=true'), '/?includeEnded=true');
  assert.equal(webNormalizeRequestUrl('/health'), '/health');
});

test('Vercel handler exports the same normalization behavior from repo root and web root', () => {
  assert.equal(rootNormalizeRequestUrl('/api/tmf-api/resourceType'), '/tmf-api/resourceType');
  assert.equal(webNormalizeRequestUrl('/api/tmf-api/resourceType'), '/tmf-api/resourceType');
});
