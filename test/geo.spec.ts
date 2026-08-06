import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GeoRepository, GeoService } from '../src/modules/geo/index.js';

test('GeoService validates reference geometry and containment', async () => {
  const service = new GeoService(new GeoRepository());
  const location = await service.createLocation({
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
  });

  assert.equal(location.geometryType, 'Point');
  assert.equal(location.spatialRef, 'EPSG:4326');

  await assert.rejects(
    async () =>
      await service.createLocation({
        geometryType: 'Point',
        geometry: { type: 'Point', coordinates: [181, 0] },
      }),
    /coordinate out of range/,
  );

  const spec = await service.createSpec({ name: 'Central Office', category: 'Site' });
  const site = await service.createSite({
    name: 'CO Botafogo',
    siteSpecificationId: spec.id,
    placeId: location.id,
  });

  assert.equal(site.place?.id, location.id);
  assert.equal((await service.listSites()).length, 1);
});
