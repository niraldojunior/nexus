import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteJson, patchJson, postJson } from './geoApi';
import { MAP_TILES_INVALIDATED_EVENT } from '../utils/mapTileCache';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function listenInvalidation() {
  const listener = vi.fn();
  window.addEventListener(MAP_TILES_INVALIDATED_EVENT, listener);
  return {
    listener,
    stop: () => window.removeEventListener(MAP_TILES_INVALIDATED_EVENT, listener),
  };
}

// Issue #425: SiteAddressModal, SiteSubSitesTab, ResourceAddressSection e o Studio espacial
// escrevem em Location/Site/Address direto pelos helpers — sem invalidar o cache, o mapa
// continuava mostrando a posição antiga até um pan/zoom.
describe('invalidação do mapa nos helpers de escrita Geo', () => {
  it.each([
    ['PATCH location', () => patchJson('/v1/geo/locations/loc-1', {})],
    ['POST location', () => postJson('/v1/geo/locations', {})],
    ['PATCH address', () => patchJson('/v1/geo/addresses/addr-1', {})],
    ['PATCH site', () => patchJson('/v1/geo/sites/site-1', {})],
    ['DELETE site', () => deleteJson('/v1/geo/sites/site-1')],
  ])('%s invalida os tiles do mapa', async (_label, write) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'x' })));
    const { listener, stop } = listenInvalidation();
    await write();
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('escrita fora de Location/Site/Address (ex.: catálogo de specs) não invalida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => jsonResponse({ id: 'spec-1' })),
    );
    const { listener, stop } = listenInvalidation();
    await patchJson('/v1/geo/site-specifications/spec-1', {});
    await postJson('/v1/geo/sites-lookup', {});
    stop();
    expect(listener).not.toHaveBeenCalled();
  });

  it('escrita que falha não invalida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    const { listener, stop } = listenInvalidation();
    await expect(patchJson('/v1/geo/locations/loc-1', {})).rejects.toThrow();
    stop();
    expect(listener).not.toHaveBeenCalled();
  });
});
