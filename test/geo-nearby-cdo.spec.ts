// findNearbyCdos em SQL Oracle nativo: raio por haversine, recorte do nome "CDO" e isolamento por
// tenant (C8) quando o chamador informa o tenant (MCP); sem tenant é o modo de lote dos scripts.

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { findNearbyCdos } from '../src/modules/geo/nearby-cdo.js';
import { createNexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

test.skipIf(!oracleConfigured)('findNearbyCdos filtra raio, nome e tenant', async () => {
  const client = await getOracleTestClient();
  const runtime = await createNexusRuntime(client);
  try {
    const admin = {
      actorSub: 'nearby-admin',
      tenantId: 'default',
      roles: ['platform.admin'],
      traceId: 'nearby',
    };
    await runtime.geoService.ensureBootstrapSpecifications(admin);
    const [siteSpec] = await runtime.geoService.listSpecs({ code: 'CABINET', limit: 1 }, admin);
    assert.ok(siteSpec, 'spec bootstrap CABINET');
    const boxSpec = await runtime.resourceService.createResourceSpecification(
      { name: 'CDOE nearby', resourceTypeId: 'rt-cto' },
      admin,
    );

    const origin = { lng: -43.106, lat: -22.906 };
    const placeCdo = async (name: string, lng: number, lat: number) => {
      const location = await runtime.geoService.createLocation(
        { geometryType: 'Point', geometry: { type: 'Point', coordinates: [lng, lat] } },
        admin,
      );
      const site = await runtime.geoService.createSite(
        { name: `Site ${name}`, siteSpecificationId: siteSpec.id, placeId: location.id },
        admin,
      );
      return await runtime.resourceService.createPhysicalResource(
        { name, resourceSpecificationId: boxSpec.id, placeId: site.id, status: 'active' },
        admin,
      );
    };

    const near = await placeCdo('CDO-PERTO', -43.1062, -22.9061);
    await placeCdo('CEO-PERTO', -43.1061, -22.9061); // caixa de emenda: fora do recorte
    await placeCdo('CDO-LONGE', -43.2, -22.95); // fora do raio

    const batch = await findNearbyCdos(client, origin, { radiusMeters: 500, limit: 10 });
    assert.deepEqual(
      batch.map((cdo) => cdo.name),
      ['CDO-PERTO'],
    );
    assert.equal(batch[0]?.id, near.id);

    const sameTenant = await findNearbyCdos(client, origin, {
      radiusMeters: 500,
      limit: 10,
      tenantId: 'default',
    });
    assert.equal(sameTenant.length, 1);

    const otherTenant = await findNearbyCdos(client, origin, {
      radiusMeters: 500,
      limit: 10,
      tenantId: 'outro-tenant',
    });
    assert.equal(otherTenant.length, 0);
  } finally {
    await cleanupOracleTables(client);
  }
});
