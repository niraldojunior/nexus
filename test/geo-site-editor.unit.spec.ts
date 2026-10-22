import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GeoRepository, GeoService } from '../src/modules/geo/index.js';

async function setup() {
  const service = new GeoService(new GeoRepository());
  const subSpec = await service.createSpec({ name: 'Sala', category: 'SubSite' });
  const rootSpec = await service.createSpec({
    name: 'Central Office',
    category: 'Site',
    allowedChildSpecIds: [subSpec.id],
  });
  await service.updateSpec(subSpec.id, { allowedParentSpecIds: [rootSpec.id] });
  const root = await service.createSite({ name: 'CO', siteSpecificationId: rootSpec.id });
  return { service, rootSpec, subSpec, root };
}

test('saveSiteEditor exige município e logradouro para local raiz', async () => {
  const { service, rootSpec } = await setup();
  await assert.rejects(
    async () =>
      await service.saveSiteEditor(
        { site: { name: 'CO 2', siteSpecificationId: rootSpec.id } },
        undefined,
      ),
  );
});

test('saveSiteEditor edita local raiz já cadastrado sem endereço sem exigir um', async () => {
  const { service, rootSpec, root } = await setup();
  const otherSpec = await service.createSpec({ name: 'Posição Submarina', category: 'Site' });
  const edited = await service.saveSiteEditor(
    { site: { name: 'CO renomeado', siteSpecificationId: otherSpec.id } },
    root.id,
  );
  assert.equal(edited.site.name, 'CO renomeado');
  assert.equal(edited.site.siteSpecificationId, otherSpec.id);
  assert.equal(edited.address, undefined);

  // Endereço informado pela metade continua rejeitado.
  await assert.rejects(
    async () =>
      await service.saveSiteEditor(
        { site: { name: 'CO renomeado', siteSpecificationId: rootSpec.id }, street: 'Rua A' },
        root.id,
      ),
  );
});

test('saveSiteEditor cria e edita sub-local sem município e logradouro', async () => {
  const { service, subSpec, root } = await setup();
  const created = await service.saveSiteEditor(
    { site: { name: 'Sala 1', siteSpecificationId: subSpec.id, parentSiteId: root.id } },
    undefined,
  );
  assert.equal(created.site.name, 'Sala 1');
  assert.equal(created.address, undefined);
  assert.equal(created.administrativeCity, undefined);

  const edited = await service.saveSiteEditor(
    { site: { name: 'Sala 2', siteSpecificationId: subSpec.id } },
    created.site.id,
  );
  assert.equal(edited.site.name, 'Sala 2');
});
