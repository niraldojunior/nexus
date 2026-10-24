import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createGoogleGeocodingGateway } from '../src/modules/geo/geocoding-gateway.js';

const okBody = {
  status: 'OK',
  results: [{ formatted_address: 'Rua A, 10', geometry: { location: { lat: -22.9, lng: -43.1 } } }],
};
const fetchReturning = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

test('sem GOOGLE_MAPS_API_KEY o gateway se declara não configurado', async () => {
  const gateway = createGoogleGeocodingGateway({}, fetchReturning(okBody));
  assert.equal(gateway.configured, false);
  assert.equal(await gateway.geocode(['Rua A']), undefined);
});

test('geocodifica e usa somente a chave de backend', async () => {
  let requested = '';
  const fetchImpl = (async (url: URL) => {
    requested = url.toString();
    return { ok: true, json: async () => okBody };
  }) as unknown as typeof fetch;
  const gateway = createGoogleGeocodingGateway(
    { GOOGLE_MAPS_API_KEY: 'k-backend', VITE_GOOGLE_MAPS_API_KEY: 'k-front' },
    fetchImpl,
  );
  assert.deepEqual(await gateway.geocode(['Rua A', '10', undefined, 'Niterói']), {
    lng: -43.1,
    lat: -22.9,
    formattedAddress: 'Rua A, 10',
  });
  assert.match(requested, /key=k-backend/);
  assert.doesNotMatch(requested, /k-front/);
});

test('erro do provedor, status ≠ OK e texto vazio viram "não resolvido"', async () => {
  const env = { GOOGLE_MAPS_API_KEY: 'k' };
  assert.equal(
    await createGoogleGeocodingGateway(env, fetchReturning({}, false)).geocode(['x']),
    undefined,
  );
  assert.equal(
    await createGoogleGeocodingGateway(env, fetchReturning({ status: 'ZERO_RESULTS' })).geocode([
      'x',
    ]),
    undefined,
  );
  assert.equal(
    await createGoogleGeocodingGateway(env, fetchReturning(okBody)).geocode(['  ', undefined]),
    undefined,
  );
  const throwing = (async () => {
    throw new Error('rede');
  }) as unknown as typeof fetch;
  assert.equal(await createGoogleGeocodingGateway(env, throwing).geocode(['x']), undefined);
});
