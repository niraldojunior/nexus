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

test('GeoService persists source/accuracy provenance on Location and Address', async () => {
  const service = new GeoService(new GeoRepository());
  const location = await service.createLocation({
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
    accuracy: 'ROOFTOP',
    sourceSystem: 'GOOGLE_MAPS',
    sourceRef: 'place-id-123',
    accuracyLevel: 'high',
  });

  assert.equal(location.sourceSystem, 'GOOGLE_MAPS');
  assert.equal(location.sourceRef, 'place-id-123');
  assert.equal(location.accuracyLevel, 'high');

  const reloaded = await service.getLocation(location.id);
  assert.equal(reloaded?.sourceSystem, 'GOOGLE_MAPS');
  assert.equal(reloaded?.accuracyLevel, 'high');

  const address = await service.createAddress({
    street: 'Rua Cinco de Julho',
    streetNr: '237',
    city: 'Niterói',
    stateOrProvince: 'RJ',
    postcode: '24220110',
    sourceSystem: 'GEONET',
    sourceRef: 'geonet-addr-1',
  });
  assert.equal(address.sourceSystem, 'GEONET');
  assert.equal(address.sourceRef, 'geonet-addr-1');

  const reloadedAddress = await service.getAddress(address.id);
  assert.equal(reloadedAddress?.sourceSystem, 'GEONET');
  assert.equal(reloadedAddress?.sourceRef, 'geonet-addr-1');
});

test('GeoService persists Site.note and keeps it across an update that does not mention it', async () => {
  const service = new GeoService(new GeoRepository());
  const spec = await service.createSpec({ name: 'Central Office', category: 'Site' });
  const created = await service.createSite({
    name: 'CO Icaraí',
    siteSpecificationId: spec.id,
    note: 'Observação inicial',
  });
  assert.equal(created.note, 'Observação inicial');

  const untouched = await service.updateSite(created.id, { name: 'CO Icaraí Renomeado' });
  assert.equal(untouched.name, 'CO Icaraí Renomeado');
  assert.equal(untouched.note, 'Observação inicial');

  const cleared = await service.updateSite(created.id, { note: null });
  assert.equal(cleared.note ?? null, null);
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

  assert.equal(bootstrap.specs.length, 12);

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

test('GeoService self-heals duplicate bootstrap specifications left by a boot race', async () => {
  const repository = new GeoRepository();
  const service = new GeoService(repository);

  const first = await service.ensureBootstrapSpecifications();
  const customerSite = first.specs.find((item) => item.code === 'CUSTOMER_SITE');
  assert.ok(customerSite);

  // Simula duas instâncias do backend subindo ao mesmo tempo: a segunda monta seu próprio
  // snapshot antes de ver o commit da primeira e insere outra linha Active com o mesmo code.
  const duplicate = await repository.upsertSpec({
    ...customerSite,
    id: '00000000-0000-7000-8000-000000000001',
    href: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/00000000-0000-7000-8000-000000000001',
  });
  const strandedSite = await service.createSite({
    name: 'CUSTOMER_SITE orfao',
    siteSpecificationId: duplicate.id,
  });

  const healed = await service.ensureBootstrapSpecifications();
  const survivors = healed.specs.filter(
    (item) => item.code === 'CUSTOMER_SITE' && item.lifecycleStatus === 'Active',
  );
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0]?.id, customerSite.id);

  const retiredDuplicate = healed.specs.find((item) => item.id === duplicate.id);
  assert.equal(retiredDuplicate?.lifecycleStatus, 'Retired');

  const repairedSite = await service.getSite(strandedSite.id);
  assert.equal(repairedSite?.siteSpecificationId, customerSite.id);
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
