import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GeoRepository, GeoService } from '../src/modules/geo/index.js';

test('GeoService creates canonical location payloads', () => {
  const service = new GeoService(new GeoRepository());
  const location = service.createLocation({
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
    accuracy: 'GPS',
    referencePoint: 'Rua principal',
  });

  assert.equal(location['@type'], 'GeographicLocation');
  assert.equal(location.geometryType, 'Point');
  assert.equal(location.spatialRef, 'EPSG:4326');
  assert.equal(location.accuracy, 'GPS');
  assert.equal(location.referencePoint, 'Rua principal');
  assert.match(location.id, /^[0-9a-f-]{36}$/);
});

test('GeoService rejects malformed geometry payloads', () => {
  const service = new GeoService(new GeoRepository());

  assert.throws(
    () =>
      service.createLocation({
        geometryType: 'Point',
        geometry: { type: 'LineString', coordinates: [[-43, -22], [-42, -21]] },
      }),
    /geometry type mismatch/,
  );

  assert.throws(
    () =>
      service.createLocation({
        geometryType: 'LineString',
        geometry: { type: 'LineString', coordinates: [[-43, -22]] },
      }),
    /linestring needs at least 2 points/,
  );

  assert.throws(
    () =>
      service.createLocation({
        geometryType: 'Polygon',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
        },
      }),
    /polygon ring must be closed/,
  );
});

test('GeoService keeps repository state isolated from returned objects', () => {
  const service = new GeoService(new GeoRepository());
  const spec = service.createSpec({ name: 'Central Office', category: 'Site' });
  const site = service.createSite({ name: 'CO Botafogo', siteSpecificationId: spec.id });

  site.name = 'mutated locally';

  const stored = service.listSites()[0];
  assert.ok(stored);
  assert.equal(stored.name, 'CO Botafogo');
});

test('GeoService validates containment rules and stores relatedSite', () => {
  const service = new GeoService(new GeoRepository());
  const regionSpec = service.createSpec({ name: 'Region', category: 'Region' });
  const centralSpec = service.createSpec({
    name: 'Central Office',
    category: 'Site',
    allowedParentSpecIds: [regionSpec.id],
  });
  const popSpec = service.createSpec({ name: 'POP', category: 'Site' });
  const invalidParent = service.createSite({ name: 'POP Icaraí', siteSpecificationId: popSpec.id });

  assert.throws(
    () => service.createSite({ name: 'CO Icaraí', siteSpecificationId: centralSpec.id, parentSiteId: invalidParent.id }),
    /parent specification not allowed/,
  );

  const region = service.createSite({ name: 'Niterói', siteSpecificationId: regionSpec.id });
  const central = service.createSite({ name: 'CO Icaraí', siteSpecificationId: centralSpec.id, parentSiteId: region.id });
  const cto = service.createSite({ name: 'CTO ICA-014', siteSpecificationId: popSpec.id });

  service.addSiteRelationship(cto.id, central.id, 'fedBy');
  const stored = service.getSite(cto.id);

  assert.equal(stored?.parentSite, undefined);
  assert.equal(stored?.relatedSite[0]?.id, central.id);
  assert.equal(stored?.relatedSite[0]?.relationshipType, 'fedBy');
});

test('GeoService updates status and records TMF688 events', () => {
  const service = new GeoService(new GeoRepository());
  const spec = service.createSpec({ name: 'Ponto de Instalação', category: 'SubSite' });
  const site = service.createSite({ name: 'PI Belisário', siteSpecificationId: spec.id });

  const updated = service.updateSite(site.id, { status: 'active' });
  const events = service.listSiteEvents(site.id);

  assert.equal(updated.status, 'active');
  assert.ok(events.some((event) => event.eventType === 'GeographicSiteStatusChangeEvent'));
});
