import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

test('vercel config keeps api functions native and routes /v1 before SPA fallback', () => {
  const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    routes?: Array<{ src?: string; dest?: string; handle?: string }>;
  };

  const routes = vercelConfig.routes ?? [];
  const fallbackIndex = routes.findIndex((route) => route.src === '/(.*)' && route.dest === '/index.html');
  const v1RouteIndex = routes.findIndex((route) => route.src === '/v1/(.*)' && route.dest === '/api/v1/$1');

  assert.ok(fallbackIndex >= 0, 'expected SPA fallback route to exist');
  assert.ok(v1RouteIndex >= 0, 'expected /v1 rewrite route to exist');
  assert.ok(v1RouteIndex < fallbackIndex, 'expected /v1 route to run before SPA fallback');
});
