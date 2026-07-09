import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

test('vercel config routes API traffic to the concrete server function before SPA fallback', () => {
  const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    routes?: Array<{ src?: string; dest?: string; handle?: string }>;
  };

  const routes = vercelConfig.routes ?? [];
  const fallbackIndex = routes.findIndex((route) => route.src === '/(.*)' && route.dest === '/index.html');
  const apiV1RouteIndex = routes.findIndex(
    (route) => route.src === '/api/v1/(.*)' && route.dest === '/api/server?__nexusPath=/v1/$1',
  );
  const apiTmfRouteIndex = routes.findIndex(
    (route) => route.src === '/api/tmf-api/(.*)' && route.dest === '/api/server?__nexusPath=/tmf-api/$1',
  );
  const v1RouteIndex = routes.findIndex((route) => route.src === '/v1/(.*)' && route.dest === '/api/server?__nexusPath=/v1/$1');

  assert.ok(fallbackIndex >= 0, 'expected SPA fallback route to exist');
  assert.ok(apiV1RouteIndex >= 0, 'expected /api/v1 rewrite route to exist');
  assert.ok(apiTmfRouteIndex >= 0, 'expected /api/tmf-api rewrite route to exist');
  assert.ok(v1RouteIndex >= 0, 'expected /v1 compatibility rewrite route to exist');
  assert.ok(apiV1RouteIndex < fallbackIndex, 'expected /api/v1 route to run before SPA fallback');
  assert.ok(apiTmfRouteIndex < fallbackIndex, 'expected /api/tmf-api route to run before SPA fallback');
  assert.ok(v1RouteIndex < fallbackIndex, 'expected /v1 route to run before SPA fallback');
});
