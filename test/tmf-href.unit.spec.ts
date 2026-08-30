import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { buildHref, configureHrefBaseUrl, HREF_PATHS } from '../src/shared/tmf/index.js';

afterEach(() => {
  // Reset to the default (relative href) so other spec files aren't affected by leftover state —
  // configureHrefBaseUrl is a process-wide singleton by design (see src/shared/tmf/href.ts).
  configureHrefBaseUrl(undefined);
});

test('buildHref returns a relative path when no base URL is configured (default, matches historical behavior)', () => {
  configureHrefBaseUrl(undefined);
  assert.equal(
    buildHref('geographicSite', 'site-1'),
    '/tmf-api/geographicSiteManagement/v4/geographicSite/site-1',
  );
});

test('buildHref prefixes an absolute base URL when configured', () => {
  configureHrefBaseUrl('https://api.vtal.example.com');
  assert.equal(
    buildHref('resource', 'res-1'),
    'https://api.vtal.example.com/tmf-api/resourceInventoryManagement/v4/resource/res-1',
  );
});

test('configureHrefBaseUrl strips trailing slashes', () => {
  configureHrefBaseUrl('https://api.vtal.example.com/');
  assert.equal(
    buildHref('party', 'party-1'),
    'https://api.vtal.example.com/tmf-api/partyManagement/v4/party/party-1',
  );
});

test('configureHrefBaseUrl treats an empty/whitespace-only value as no base URL', () => {
  configureHrefBaseUrl('   ');
  assert.equal(buildHref('party', 'party-1'), '/tmf-api/partyManagement/v4/party/party-1');
});

test('buildHref percent-encodes the key, including free-text codes like geographicRelationshipType', () => {
  configureHrefBaseUrl(undefined);
  assert.equal(
    buildHref('geographicRelationshipType', 'contains/child'),
    '/v1/geo/relationship-types/contains%2Fchild',
  );
});

test('every HREF_PATHS value is an absolute path with no trailing slash', () => {
  for (const [entity, path] of Object.entries(HREF_PATHS)) {
    assert.match(path, /^\//, `${entity} path must start with /`);
    assert.doesNotMatch(path, /\/$/, `${entity} path must not end with /`);
  }
});
