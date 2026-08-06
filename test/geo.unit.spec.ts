import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GeoRepository, GeoService } from '../src/modules/geo/index.js';

test('GeoService creates canonical location payloads', async () => {
  const service = new GeoService(new GeoRepository());
  const location = await service.createLocation({
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

test('GeoService rejects malformed geometry payloads', async () => {
  const service = new GeoService(new GeoRepository());

  await assert.rejects(
    async () =>
      await service.createLocation({
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

  await assert.rejects(
    async () =>
      await service.createLocation({
        geometryType: 'LineString',
        geometry: { type: 'LineString', coordinates: [[-43, -22]] },
      }),
    /linestring needs at least 2 points/,
  );

  await assert.rejects(
    async () =>
      await service.createLocation({
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

test('GeoService keeps repository state isolated from returned objects', async () => {
  const service = new GeoService(new GeoRepository());
  const spec = await service.createSpec({ name: 'Central Office', category: 'Site' });
  const site = await service.createSite({ name: 'CO Botafogo', siteSpecificationId: spec.id });

  site.name = 'mutated locally';

  const stored = (await service.listSites())[0];
  assert.ok(stored);
  assert.equal(stored.name, 'CO Botafogo');
});

test('GeoService validates governed containment rules and stores relatedSite', async () => {
  const service = new GeoService(new GeoRepository());
  await service.ensureBootstrapRelationshipTypes();
  const regionSpec = await service.createSpec({
    name: 'Region',
    category: 'Region',
    allowedChildSpecIds: [],
  });
  const centralSpec = await service.createSpec({
    name: 'Central Office',
    category: 'Site',
    allowedParentSpecIds: [regionSpec.id],
  });
  await service.updateSpec(regionSpec.id, { allowedChildSpecIds: [centralSpec.id] });

  const cabinetSpec = await service.createSpec({
    name: 'Cabinet',
    category: 'Site',
  });
  const invalidParent = await service.createSite({
    name: 'Cabinet Icarai',
    siteSpecificationId: cabinetSpec.id,
  });

  await assert.rejects(
    async () =>
      await service.createSite({
        name: 'CO Icarai',
        siteSpecificationId: centralSpec.id,
        parentSiteId: invalidParent.id,
      }),
    /parent-child specification containment not allowed/,
  );

  const region = await service.createSite({ name: 'Niteroi', siteSpecificationId: regionSpec.id });
  const central = await service.createSite({
    name: 'CO Icarai',
    siteSpecificationId: centralSpec.id,
    parentSiteId: region.id,
  });
  const ctoSpec = await service.createSpec({ name: 'CTO', category: 'Site' });
  const cto = await service.createSite({ name: 'CTO ICA-014', siteSpecificationId: ctoSpec.id });

  await service.addSiteRelationship(cto.id, central.id, 'fedBy');
  const stored = await service.getSite(cto.id);

  assert.equal(stored?.parentSite, undefined);
  assert.equal(stored?.relatedSite[0]?.id, central.id);
  assert.equal(stored?.relatedSite[0]?.relationshipType, 'fedBy');
});

test('GeoService bootstraps governed specifications and blocks containment changes with impact', async () => {
  const service = new GeoService(new GeoRepository());
  const bootstrap = await service.ensureBootstrapSpecifications();

  assert.equal(bootstrap.specs.length, 9);

  const regionSpec = bootstrap.specs.find((item) => item.code === 'REGION');
  const centralSpec = bootstrap.specs.find((item) => item.code === 'CO');
  assert.ok(regionSpec);
  assert.ok(centralSpec);
  assert.equal(
    (await service.getAllowedChildren(regionSpec.id)).some((item) => item.code === 'CO'),
    true,
  );

  const region = await service.createSite({ name: 'RJ', siteSpecificationId: regionSpec.id });
  await service.createSite({
    name: 'CO Botafogo',
    siteSpecificationId: centralSpec.id,
    parentSiteId: region.id,
  });

  const impact = await service.analyzeContainmentImpact(regionSpec.id, { allowedChildSpecIds: [] });
  assert.equal(impact.blocking, true);
  assert.ok(impact.impactedSiteIds.length > 0);

  await assert.rejects(
    () => service.updateSpec(regionSpec.id, { allowedChildSpecIds: [] }),
    /protected child containment rule cannot be removed|containment rule change has impacted sites/,
  );
});

test('GeoService updates status and records TMF688 events', async () => {
  const service = new GeoService(new GeoRepository());
  const spec = await service.createSpec({ name: 'Ponto de Instalacao', category: 'Site' });
  const site = await service.createSite({ name: 'PI Belisario', siteSpecificationId: spec.id });

  const updated = await service.updateSite(site.id, { status: 'active' });
  const events = await service.listSiteEvents(site.id);

  assert.equal(updated.status, 'Active');
  assert.ok(events.some((event) => event.eventType === 'GeographicSiteStatusChangeEvent'));
});

test('GeoService enforces RBAC, tenant isolation and origin governance', async () => {
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

  const spec = await service.createSpec({ name: 'Central Office', category: 'Site' }, admin);
  await assert.rejects(
    async () =>
      await service.createLocation(
        {
          geometryType: 'Point',
          geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
        },
        reader,
      ),
    /operation forbidden by RBAC/,
  );
  await assert.rejects(
    async () =>
      await service.createSite(
        {
          name: 'CO Origin',
          siteSpecificationId: spec.id,
          characteristic: [{ name: '_origin.id', value: 'LEG-1', valueType: 'string' }],
        },
        admin,
      ),
    /migration-only/,
  );

  const site = await service.createSite(
    { name: 'CO Tenant A', siteSpecificationId: spec.id },
    admin,
  );
  assert.equal(await service.getSite(site.id, otherTenant), undefined);
  assert.equal((await service.getSite(site.id, admin))?.tenantId, 'tenant-a');
  assert.equal((await service.listSiteAudit(site.id, admin)).length, 1);
});

test('GeoService applies canonical lifecycle transitions', async () => {
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
  const spec = await service.createSpec({ name: 'Central Office', category: 'Site' }, editor);
  const site = await service.createSite(
    { name: 'CO Lifecycle', siteSpecificationId: spec.id, status: 'active' },
    editor,
  );

  assert.equal(site.status, 'Active');
  await assert.rejects(
    () => service.transitionSite(site.id, { status: 'Retired' }, editor),
    /statusReason is required/,
  );

  const deactivating = await service.transitionSite(
    site.id,
    { status: 'InDeactivation', statusReason: 'obra' },
    editor,
  );
  assert.equal(deactivating.status, 'InDeactivation');
  const retired = await service.transitionSite(
    site.id,
    { status: 'Retired', statusReason: 'descomissionado' },
    editor,
  );
  assert.equal(retired.status, 'Retired');
  await assert.rejects(
    () => service.transitionSite(site.id, { status: 'Active', statusReason: 'retorno' }, editor),
    /requires platform admin/,
  );
  assert.equal(
    (await service.transitionSite(site.id, { status: 'Active', statusReason: 'retorno' }, platform))
      .status,
    'Active',
  );
  assert.ok((await service.listSiteHistory(site.id, platform)).length >= 4);
});

test('GeoService creates inverse governed site relationships', async () => {
  const service = new GeoService(new GeoRepository());
  await service.ensureBootstrapRelationshipTypes();
  const spec = await service.createSpec({ name: 'Central Office', category: 'Site' });
  const source = await service.createSite({ name: 'CO A', siteSpecificationId: spec.id });
  const target = await service.createSite({ name: 'CO B', siteSpecificationId: spec.id });

  await service.addSiteRelationship(source.id, target.id, 'isFedBy');

  assert.equal((await service.listSiteRelationships(source.id))[0]?.relationshipType, 'fedBy');
  assert.equal((await service.listSiteRelationships(target.id))[0]?.relationshipType, 'feeds');
  await assert.rejects(
    () => service.addSiteRelationship(source.id, source.id, 'fedBy'),
    /cannot reference itself/,
  );
});
