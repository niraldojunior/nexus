import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isOracleTestConfigured, startHttpTestApp } from './test-utils.js';

const oracleConfigured = isOracleTestConfigured();

test.skipIf(!oracleConfigured)(
  'TMF688 event endpoint lists and resolves events emitted by Geo',
  async () => {
    const app = await startHttpTestApp();
    try {
      const spec = await app.requestJson('POST', '/v1/geo/site-specifications', {
        name: 'Central Office',
        category: 'Site',
      });
      assert.equal(spec.statusCode, 201);

      const location = await app.requestJson('POST', '/v1/geo/locations', {
        geometryType: 'Point',
        geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
      });
      assert.equal(location.statusCode, 201);

      const site = await app.requestJson('POST', '/v1/geo/sites', {
        name: 'CO Botafogo',
        siteSpecificationId: (spec.body as { id: string }).id,
        placeId: (location.body as { id: string }).id,
      });
      assert.equal(site.statusCode, 201);

      const events = await app.requestJson(
        'GET',
        '/tmf-api/eventManagement/v4/event?eventType=GeographicSiteCreateEvent&source=geo.GeographicSite',
      );
      assert.equal(events.statusCode, 200);
      assert.ok(Array.isArray(events.body));
      assert.ok((events.body as Array<{ id: string; eventType: string }>).length > 0);

      const siteEvent = (events.body as Array<{ id: string; eventType: string }>)[0];
      assert.ok(siteEvent);
      assert.equal(siteEvent.eventType, 'GeographicSiteCreateEvent');

      const eventById = await app.requestJson(
        'GET',
        `/tmf-api/eventManagement/v4/event/${siteEvent.id}`,
      );
      assert.equal(eventById.statusCode, 200);
      assert.equal((eventById.body as { id: string }).id, siteEvent.id);
    } finally {
      await app.cleanup();
    }
  },
);
