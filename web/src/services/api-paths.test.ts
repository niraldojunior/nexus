import { expect, test } from 'vitest';
import { stripApiPrefix } from './api-paths';

test('stripApiPrefix removes the Vercel API prefix for local proxy forwarding', () => {
  expect(stripApiPrefix('/api/v1/research/sessions')).toBe('/v1/research/sessions');
  expect(stripApiPrefix('/api/tmf-api/resourceCatalogManagement/v4/resourceType')).toBe(
    '/tmf-api/resourceCatalogManagement/v4/resourceType',
  );
  expect(stripApiPrefix('/v1/research/sessions')).toBe('/v1/research/sessions');
});
