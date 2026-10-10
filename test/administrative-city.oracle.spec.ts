import assert from 'node:assert/strict';
import { afterAll, beforeEach, test } from 'vitest';
import { OracleGeoRepository } from '../src/modules/geo/oracle-repository.js';
import { OracleInternalPlantRepository } from '../src/modules/resource/internal-plant-oracle-repository.js';
import type {
  GeographicAddress,
  GeographicSite,
  GeographicSiteSpecification,
} from '../src/modules/geo/domain.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// Diretório geográfico canônico (issue #329) contra Oracle real: dual-write sem duplicação,
// serialização TMF673 pelo diretório e árvore de Locais (município → tipo → Site → Sub-Site).
const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

beforeEach(async () => {
  if (!oracleConfigured) return;
  await cleanupOracleTables(await getOracleTestClient());
});

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

const address = (id: string, city: string, uf: string): GeographicAddress => ({
  '@type': 'GeographicAddress',
  id,
  href: `/v1/geo/addresses/${id}`,
  tenantId: 'tenant-a',
  street: `Rua ${id}`,
  city,
  stateOrProvince: uf,
  country: 'Brasil',
  characteristic: [],
});

const spec = (id: string, name: string): GeographicSiteSpecification => ({
  '@type': 'GeographicSiteSpecification',
  id,
  href: `/v1/geo/site-specifications/${id}`,
  name,
  code: `C_${id.toUpperCase()}`,
  category: 'Site',
  siteRole: 'network',
  lifecycleStatus: 'Active',
  specCharacteristic: [],
  allowedParentSpec: [],
  allowedChildSpec: [],
  allowedParentSpecIds: [],
  allowedChildSpecIds: [],
});

const site = (
  id: string,
  specId: string,
  addressId: string | undefined,
  parentId?: string,
): GeographicSite => ({
  '@type': 'GeographicSite',
  id,
  href: `/v1/geo/sites/${id}`,
  tenantId: 'tenant-a',
  name: `Site ${id}`,
  status: 'Active',
  siteSpecificationId: specId,
  siteSpecification: { id: specId, '@referredType': 'GeographicSiteSpecification' },
  ...(addressId
    ? { address: { id: addressId, '@referredType': 'GeographicAddress' as const } }
    : {}),
  ...(parentId ? { parentSite: { id: parentId, '@referredType': 'GeographicSite' as const } } : {}),
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
});

test.skipIf(!oracleConfigured)(
  'upsertAddress vincula o município canônico sem duplicar e serializa pelo diretório',
  async () => {
    const client = await getOracleTestClient();
    const geo = new OracleGeoRepository(client);
    await geo.upsertAddress(address('a1', 'Niterói', 'rj'));
    await geo.upsertAddress(address('a2', 'NITEROI', 'RJ'));
    await geo.upsertAddress(address('a3', 'Sem UF', 'XX'));

    const cities = await client.all<{ id: string; city_name: string }>(
      'SELECT id, city_name FROM geo_administrative_city',
    );
    assert.equal(cities.length, 1, 'Niterói/NITEROI colapsam em um município');
    const linked = await client.all<{ id: string; administrative_city_id: string | null }>(
      'SELECT id, administrative_city_id FROM tmf_geographic_address ORDER BY id',
    );
    assert.equal(linked[0]?.administrative_city_id, cities[0]?.id);
    assert.equal(linked[1]?.administrative_city_id, cities[0]?.id);
    assert.equal(linked[2]?.administrative_city_id, null, 'UF inválida não gera diretório');

    const read = await geo.getAddress('a2');
    assert.equal(read?.stateOrProvince, 'RJ');
    assert.equal(read?.country, 'BR');

    const byCity = await geo.listAddresses({ city: 'niteroi', stateOrProvince: 'rj' });
    assert.deepEqual(byCity.map((item) => item.id).sort(), ['a1', 'a2']);
  },
);

test.skipIf(!oracleConfigured)(
  'árvore de Locais: diretório, tipos com volume, Sites raiz, Sub-Sites e isolamento de tenant',
  async () => {
    const client = await getOracleTestClient();
    const geo = new OracleGeoRepository(client);
    await geo.upsertAddress(address('a1', 'Niterói', 'RJ'));
    await geo.upsertSpec(spec('sp-co', 'Central Office'));
    await geo.upsertSpec(spec('sp-room', 'Sala'));
    await geo.upsertSite(site('root-1', 'sp-co', 'a1'));
    await geo.upsertSite(site('root-2', 'sp-co', 'a1'));
    await geo.upsertSite(site('orphan', 'sp-co', undefined));
    await geo.upsertSite(site('child-1', 'sp-room', undefined, 'root-1'));
    await geo.upsertSite({ ...site('other-tenant', 'sp-co', 'a1'), tenantId: 'tenant-b' });

    const repo = new OracleInternalPlantRepository(client);
    const roots = await repo.roots('tenant-a');
    const city = roots.find((node) => node.kind === 'city' && node.label === 'Niterói');
    assert.ok(city, 'município do diretório presente');
    assert.ok(
      roots.some((node) => node.id === 'city:none'),
      'ramificação sem município',
    );

    const page = { tenantId: 'tenant-a', limit: 50, offset: 0 };
    const types = await repo.children(city!.id, page);
    assert.equal(types.nodes.length, 1);
    assert.equal(types.nodes[0]?.childCount, 2, 'só raiz do tenant, sem tenant-b nem filhos');

    const sites = await repo.children(types.nodes[0]!.id, page);
    assert.deepEqual(sites.nodes.map((node) => node.refId).sort(), ['root-1', 'root-2']);
    assert.equal(sites.nodes.find((node) => node.refId === 'root-1')?.hasChildren, true);
    assert.equal(sites.nodes.find((node) => node.refId === 'root-2')?.hasChildren, false);

    const kids = await repo.children('site:root-1', page);
    assert.deepEqual(
      kids.nodes.map((node) => node.refId),
      ['child-1'],
    );

    const none = await repo.children('city:none', page);
    assert.equal(none.nodes[0]?.childCount, 1);
  },
);

test.skipIf(!oracleConfigured)(
  'recursos do Site: serving_site_id exato, sem descendentes e sem recursos internos, UF/município do ancestral com endereço',
  async () => {
    const client = await getOracleTestClient();
    const geo = new OracleGeoRepository(client);
    await geo.upsertAddress(address('a1', 'Niterói', 'RJ'));
    await geo.upsertSpec(spec('sp-co', 'Central Office'));
    await geo.upsertSite(site('root-1', 'sp-co', 'a1'));
    await geo.upsertSite(site('child-1', 'sp-co', undefined, 'root-1'));

    const now = new Date().toISOString();
    await client.run(
      `INSERT INTO tmf_resource_type (id, tenant_id, code, name, status, created_at, updated_at)
       VALUES ('rt-1', 'tenant-a', 'OLT', 'OLT', 'active', ?, ?)`,
      [now, now],
    );
    await client.run(
      `INSERT INTO tmf_resource_specification (id, tenant_id, name, resource_type_id)
       VALUES ('rs-1', 'tenant-a', 'OLT Spec', 'rt-1')`,
      [],
    );
    for (const [id, placeId] of [
      ['res-root', 'root-1'],
      ['res-child', 'child-1'],
    ] as const) {
      await client.run(
        `INSERT INTO tmf_physical_resource (id, tenant_id, name, resource_specification_id, status, serving_site_id)
         VALUES (?, 'tenant-a', ?, 'rs-1', 'active', ?)`,
        [id, id, placeId],
      );
    }
    // Recurso interno (porta/splitter): sem lugar próprio, só aparece pelo recurso que o contém.
    await client.run(
      `INSERT INTO tmf_physical_resource (id, tenant_id, name, resource_specification_id, status)
       VALUES ('res-internal', 'tenant-a', 'res-internal', 'rs-1', 'active')`,
      [],
    );

    const repo = new OracleInternalPlantRepository(client);
    const base = { tenantId: 'tenant-a', limit: 50, offset: 0 };
    const atRoot = await repo.listResources({ ...base, siteId: 'root-1' });
    assert.deepEqual(
      atRoot.items.map((item) => item.id),
      ['res-root'],
    );
    assert.equal(atRoot.total, 1, 'recurso interno sem serving_site_id fica fora da lista do Site');

    const atChild = await repo.listResources({ ...base, siteId: 'child-1' });
    assert.deepEqual(
      atChild.items.map((item) => item.id),
      ['res-child'],
    );
    assert.equal(atChild.items[0]?.city, 'Niterói', 'herda o município do ancestral');
    assert.equal(atChild.items[0]?.stateOrProvince, 'RJ');
  },
);
