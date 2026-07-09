import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normalizeRequestUrl as rootNormalizeRequestUrl } from '../api/[...path].js';
import { config as rootHealthConfig } from '../api/health.js';
import { config as rootServerConfig } from '../api/server.js';
import { config as rootTmfConfig } from '../api/tmf-api/[...path].js';
import { config as rootV1Config } from '../api/v1/[...path].js';
import { normalizeRequestUrl as webNormalizeRequestUrl } from '../web/api/[...path].js';
import { config as webHealthConfig } from '../web/api/health.js';
import { config as webServerConfig } from '../web/api/server.js';
import { config as webTmfConfig } from '../web/api/tmf-api/[...path].js';
import { config as webV1Config } from '../web/api/v1/[...path].js';

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
  assert.equal(rootNormalizeRequestUrl('/api/server?__nexusPath=/v1/research/sessions'), '/v1/research/sessions');
  assert.equal(
    rootNormalizeRequestUrl('/api/server?__nexusPath=/tmf-api/resourceCatalogManagement/v4/resourceType'),
    '/tmf-api/resourceCatalogManagement/v4/resourceType',
  );
});

test('Vercel exposes concrete API entrypoints for root and web deployments', () => {
  for (const config of [
    rootHealthConfig,
    rootServerConfig,
    rootTmfConfig,
    rootV1Config,
    webHealthConfig,
    webServerConfig,
    webTmfConfig,
    webV1Config,
  ]) {
    assert.equal(config.runtime, 'nodejs');
  }
});
