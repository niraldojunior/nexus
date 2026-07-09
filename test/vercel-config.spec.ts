import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

test('vercel config routes /api requests before SPA fallback', () => {
  const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    routes?: Array<{ src?: string; dest?: string; handle?: string }>;
  };

  const routes = vercelConfig.routes ?? [];
  const apiRouteIndex = routes.findIndex((route) => route.src === '/api/(.*)' && route.dest === '/api/$1');
  const fallbackIndex = routes.findIndex((route) => route.src === '/(.*)' && route.dest === '/index.html');

  assert.ok(apiRouteIndex >= 0, 'expected /api/(.*) route to exist');
  assert.ok(fallbackIndex >= 0, 'expected SPA fallback route to exist');
  assert.ok(apiRouteIndex < fallbackIndex, 'expected /api route to run before SPA fallback');
});
