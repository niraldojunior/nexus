import { afterEach, expect, test, vi } from 'vitest';
import { installApiFetchRewrite, resetApiFetchRewriteForTesting } from './fetch-compat';

afterEach(() => {
  resetApiFetchRewriteForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('installApiFetchRewrite prefixes v1 requests with /api', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify({ ok: true, input: String(input) })));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5200' } });

  installApiFetchRewrite();

  await fetch('/v1/research/sessions');
  await fetch('/tmf-api/resourceCatalogManagement/v4/resourceCategory');

  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/research/sessions');
  expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/tmf-api/resourceCatalogManagement/v4/resourceCategory');
});

test('installApiFetchRewrite is idempotent', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify({ ok: true, input: String(input) })));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5200' } });

  installApiFetchRewrite();
  installApiFetchRewrite();

  await fetch('/v1/chat/completions');

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/chat/completions');
});
