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
        geometry: {
          type: 'LineString',
          coordinates: [
            [-43, -22],
            [-42, -21],
          ],
        },
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
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
          ],
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

test('GeoService validates governed containment rules and stores relatedSite', () => {
  const service = new GeoService(new GeoRepository());
  service.ensureBootstrapRelationshipTypes();
  const regionSpec = service.createSpec({
    name: 'Region',
    category: 'Region',
    allowedChildSpecIds: [],
  });
  const centralSpec = service.createSpec({
    name: 'Central Office',
    category: 'Site',
    allowedParentSpecIds: [regionSpec.id],
  });
  service.updateSpec(regionSpec.id, { allowedChildSpecIds: [centralSpec.id] });

  const cabinetSpec = service.createSpec({
    name: 'Cabinet',
    category: 'Site',
  });
  const invalidParent = service.createSite({
    name: 'Cabinet Icarai',
    siteSpecificationId: cabinetSpec.id,
  });

  assert.throws(
    () =>
      service.createSite({
        name: 'CO Icarai',
        siteSpecificationId: centralSpec.id,
        parentSiteId: invalidParent.id,
      }),
    /parent-child specification containment not allowed/,
  );

  const region = service.createSite({ name: 'Niteroi', siteSpecificationId: regionSpec.id });
  const central = service.createSite({
    name: 'CO Icarai',
    siteSpecificationId: centralSpec.id,
    parentSiteId: region.id,
  });
  const ctoSpec = service.createSpec({ name: 'CTO', category: 'Site' });
  const cto = service.createSite({ name: 'CTO ICA-014', siteSpecificationId: ctoSpec.id });

  service.addSiteRelationship(cto.id, central.id, 'fedBy');
  const stored = service.getSite(cto.id);

  assert.equal(stored?.parentSite, undefined);
  assert.equal(stored?.relatedSite[0]?.id, central.id);
  assert.equal(stored?.relatedSite[0]?.relationshipType, 'fedBy');
});

test('GeoService bootstraps governed specifications and blocks containment changes with impact', () => {
  const service = new GeoService(new GeoRepository());
  const bootstrap = service.ensureBootstrapSpecifications();

  assert.equal(bootstrap.specs.length, 9);

  const regionSpec = bootstrap.specs.find((item) => item.code === 'REGION');
  const centralSpec = bootstrap.specs.find((item) => item.code === 'CO');
  assert.ok(regionSpec);
  assert.ok(centralSpec);
  assert.equal(
    service.getAllowedChildren(regionSpec.id).some((item) => item.code === 'CO'),
    true,
  );

  const region = service.createSite({ name: 'RJ', siteSpecificationId: regionSpec.id });
  service.createSite({
    name: 'CO Botafogo',
    siteSpecificationId: centralSpec.id,
    parentSiteId: region.id,
  });

  const impact = service.analyzeContainmentImpact(regionSpec.id, { allowedChildSpecIds: [] });
  assert.equal(impact.blocking, true);
  assert.ok(impact.impactedSiteIds.length > 0);

  assert.throws(
    () => service.updateSpec(regionSpec.id, { allowedChildSpecIds: [] }),
    /protected child containment rule cannot be removed|containment rule change has impacted sites/,
  );
});

test('GeoService updates status and records TMF688 events', () => {
  const service = new GeoService(new GeoRepository());
  const spec = service.createSpec({ name: 'Ponto de Instalacao', category: 'Site' });
  const site = service.createSite({ name: 'PI Belisario', siteSpecificationId: spec.id });

  const updated = service.updateSite(site.id, { status: 'active' });
  const events = service.listSiteEvents(site.id);

  assert.equal(updated.status, 'Active');
  assert.ok(events.some((event) => event.eventType === 'GeographicSiteStatusChangeEvent'));
});

test('GeoService enforces RBAC, tenant isolation and origin governance', () => {
  const service = new GeoService(new GeoRepository());
  const admin = {
    actorSub: 'admin',
    tenantId: 'tenant-a',
    roles: ['inventory.reader', 'inventory.editor', 'catalog.admin', 'platform.admin'],
    traceId: 'trace-admin',
  };
  const reader = {
    actorSub: 'reader',
    tenantId: 'tenant-a',
    roles: ['inventory.reader'],
    traceId: 'trace-reader',
  };
  const otherTenant = {
    ...admin,
    tenantId: 'tenant-b',
    traceId: 'trace-other',
  };

  const spec = service.createSpec({ name: 'Central Office', category: 'Site' }, admin);
  assert.throws(
    () =>
      service.createLocation(
        {
          geometryType: 'Point',
          geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
        },
        reader,
      ),
    /operation forbidden by RBAC/,
  );
  assert.throws(
    () =>
      service.createSite(
        {
          name: 'CO Origin',
          siteSpecificationId: spec.id,
          characteristic: [{ name: '_origin.id', value: 'LEG-1', valueType: 'string' }],
        },
        admin,
      ),
    /migration-only/,
  );

  const site = service.createSite({ name: 'CO Tenant A', siteSpecificationId: spec.id }, admin);
  assert.equal(service.getSite(site.id, otherTenant), undefined);
  assert.equal(service.getSite(site.id, admin)?.tenantId, 'tenant-a');
  assert.equal(service.listSiteAudit(site.id, admin).length, 1);
});

test('GeoService applies canonical lifecycle transitions', () => {
  const service = new GeoService(new GeoRepository());
  const editor = {
    actorSub: 'editor',
    tenantId: 'tenant-a',
    roles: ['inventory.reader', 'inventory.editor', 'catalog.admin'],
    traceId: 'trace-editor',
  };
  const platform = {
    ...editor,
    roles: ['inventory.reader', 'inventory.editor', 'catalog.admin', 'platform.admin'],
    traceId: 'trace-platform',
  };
  const spec = service.createSpec({ name: 'Central Office', category: 'Site' }, editor);
  const site = service.createSite(
    { name: 'CO Lifecycle', siteSpecificationId: spec.id, status: 'active' },
    editor,
  );

  assert.equal(site.status, 'Active');
  assert.throws(
    () => service.transitionSite(site.id, { status: 'Retired' }, editor),
    /statusReason is required/,
  );

  const deactivating = service.transitionSite(
    site.id,
    { status: 'InDeactivation', statusReason: 'obra' },
    editor,
  );
  assert.equal(deactivating.status, 'InDeactivation');
  const retired = service.transitionSite(
    site.id,
    { status: 'Retired', statusReason: 'descomissionado' },
    editor,
  );
  assert.equal(retired.status, 'Retired');
  assert.throws(
    () => service.transitionSite(site.id, { status: 'Active', statusReason: 'retorno' }, editor),
    /requires platform admin/,
  );
  assert.equal(
    service.transitionSite(site.id, { status: 'Active', statusReason: 'retorno' }, platform).status,
    'Active',
  );
  assert.ok(service.listSiteHistory(site.id, platform).length >= 4);
});

test('GeoService creates inverse governed site relationships', () => {
  const service = new GeoService(new GeoRepository());
  service.ensureBootstrapRelationshipTypes();
  const spec = service.createSpec({ name: 'Central Office', category: 'Site' });
  const source = service.createSite({ name: 'CO A', siteSpecificationId: spec.id });
  const target = service.createSite({ name: 'CO B', siteSpecificationId: spec.id });

  service.addSiteRelationship(source.id, target.id, 'isFedBy');

  assert.equal(service.listSiteRelationships(source.id)[0]?.relationshipType, 'fedBy');
  assert.equal(service.listSiteRelationships(target.id)[0]?.relationshipType, 'feeds');
  assert.throws(
    () => service.addSiteRelationship(source.id, source.id, 'fedBy'),
    /cannot reference itself/,
  );
});
