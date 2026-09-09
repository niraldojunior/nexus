import assert from 'node:assert/strict';
import { afterAll, test, vi } from 'vitest';
import { ResourceService } from '../src/modules/resource/service.js';
import { OracleResourceRepository } from '../src/modules/resource/oracle-repository.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// Oracle round-trip coverage for the resource repository. Runs against a real Oracle instance,
// same pattern as oracle-roundtrip.spec.ts — skips unless ORACLE_* is configured, so `npm run
// test:unit` never tries to connect. Run with `npm run test:oracle`.
const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

test.skipIf(!oracleConfigured)(
  'Resource repository persists validFor when a resource specification is terminated',
  async () => {
    const client = await getOracleTestClient();
    const repository = new OracleResourceRepository(client);
    const appendEvent = vi.fn(() => undefined);
    const service = new ResourceService(repository, { appendEvent } as never);

    const created = await service.createResourceSpecification({
      name: 'OLT MA5800',
      resourceTypeId: 'rt-olt',
    });

    assert.equal(created.validFor, undefined);

    const terminated = await service.deleteResourceSpecification(created.id);
    assert.ok(terminated.validFor?.endDateTime);

    const persisted = await repository.getResourceSpecification(created.id);
    assert.ok(persisted?.validFor?.endDateTime);
    assert.equal(persisted?.validFor?.endDateTime, terminated.validFor?.endDateTime);
    assert.equal(
      (await repository.listResourceSpecifications({ resourceTypeId: 'rt-olt' })).length,
      0,
    );
    assert.equal(
      (
        await repository.listResourceSpecifications({
          resourceTypeId: 'rt-olt',
          includeEnded: true,
        })
      ).length,
      1,
    );
  },
);

test.skipIf(!oracleConfigured)(
  'Resource repository projects splitter ports from bidirectional drop connections',
  async () => {
    const client = await getOracleTestClient();
    const repository = new OracleResourceRepository(client);
    await repository.initialize();
    const service = new ResourceService(repository, {
      appendEvent: vi.fn(() => undefined),
    } as never);
    const ctoSpec = await service.createResourceSpecification({
      name: 'CTO de teste',
      resourceTypeId: 'rt-cto',
    });
    const splitterSpec = await service.createResourceSpecification({
      name: 'Splitter de teste',
      resourceTypeId: 'rt-splitter',
    });
    const portSpec = await service.createResourceSpecification({
      name: 'Porta de teste',
      resourceTypeId: 'rt-port',
    });
    const dropSpec = await service.createResourceSpecification({
      name: 'Cabo drop de teste',
      resourceTypeId: 'rt-drop-cable',
    });
    const ontSpec = await service.createResourceSpecification({
      name: 'ONT de teste',
      resourceTypeId: 'rt-ont',
    });
    const cto = await service.createPhysicalResource({
      name: 'CTO-1',
      resourceSpecificationId: ctoSpec.id,
    });
    const splitter = await service.createPhysicalResource({
      name: 'Splitter-1',
      resourceSpecificationId: splitterSpec.id,
      characteristic: [{ name: 'razao', value: '1:8', valueType: 'string' }],
    });
    const port = await service.createPhysicalResource({
      name: 'FO.O.1',
      resourceSpecificationId: portSpec.id,
      characteristic: [
        { name: 'role', value: 'FO.O', valueType: 'string' },
        { name: 'index', value: '1', valueType: 'string' },
      ],
    });
    const drop = await service.createPhysicalResource({
      name: 'DROP-1',
      resourceSpecificationId: dropSpec.id,
    });
    const ont = await service.createPhysicalResource({
      name: 'ONT-1',
      resourceSpecificationId: ontSpec.id,
    });
    await service.addResourceRelationship(cto.id, {
      id: splitter.id,
      relationshipType: 'containsAsChild',
      '@referredType': 'Resource',
    });
    await service.addResourceRelationship(splitter.id, {
      id: port.id,
      relationshipType: 'containsAsChild',
      '@referredType': 'Resource',
    });
    await service.addResourceRelationship(drop.id, {
      id: port.id,
      relationshipType: 'connectedTo',
      '@referredType': 'Resource',
    });
    await service.addResourceRelationship(drop.id, {
      id: ont.id,
      relationshipType: 'connectedTo',
      '@referredType': 'Resource',
    });

    const splitterDetail = await repository.getPhysicalResourceDetail(splitter.id);
    assert.equal(splitterDetail?.parent?.id, cto.id);
    assert.equal(splitterDetail?.parent?.resourceType, 'CTO');

    const view = await repository.getResourcePortsView(cto.id);
    assert.equal(view?.groups.length, 1);
    assert.equal(view?.groups[0]?.ports[0]?.resource.usageState, 'active');
    assert.equal(view?.groups[0]?.ports[0]?.drops[0]?.resource.id, drop.id);
    assert.equal(view?.groups[0]?.ports[0]?.drops[0]?.ont?.id, ont.id);

    const detail = await repository.getResourcePortDetail(port.id);
    assert.equal(detail?.splitter?.id, splitter.id);
    assert.equal(detail?.cto?.id, cto.id);
    assert.equal(detail?.splitRatio, '1:8');
    assert.equal(detail?.drops[0]?.ont?.id, ont.id);
    assert.equal((await repository.listIncidentResourceRelationships(port.id)).length, 2);
  },
);

test.skipIf(!oracleConfigured)(
  'Resource repository persists resource specification characteristics and related parties',
  async () => {
    const client = await getOracleTestClient();
    const repository = new OracleResourceRepository(client);
    const appendEvent = vi.fn(() => undefined);
    const service = new ResourceService(repository, { appendEvent } as never);

    const created = await service.createResourceSpecification({
      name: 'CPE',
      resourceTypeId: 'rt-cpe',
      resourceSpecificationCharacteristic: [
        { name: 'manufacturer', value: 'V.tal', valueType: 'string', group: 'commercial' },
        { name: 'stockable', value: true, valueType: 'boolean', group: 'capability' },
      ],
      relatedParty: [{ id: 'party-1', '@referredType': 'Organization', role: 'manufacturer' }],
    });

    const persisted = await repository.getResourceSpecification(created.id);
    assert.equal(persisted?.resourceSpecificationCharacteristic.length, 2);
    assert.equal(persisted?.resourceSpecificationCharacteristic[0]?.name, 'manufacturer');
    assert.equal(persisted?.relatedParty.length, 1);
    assert.equal(persisted?.relatedParty[0]?.role, 'manufacturer');
  },
);
