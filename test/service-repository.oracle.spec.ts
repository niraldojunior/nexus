import assert from 'node:assert/strict';
import { afterAll, test, vi } from 'vitest';
import { ServiceService } from '../src/modules/service/service.js';
import { PostgresServiceRepository } from '../src/modules/service/postgres-repository.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// Cobertura da issue #180: distinguir "drop instalado" de "drop com serviço ativo" exige uma
// consulta em lote — `listActiveSupportingResourceIds` — que confirma RFS `active` contra o array
// TMF completo de `supportingResource`, não só a coluna indexada do primeiro item. Como o método
// depende do dialeto SQL real (placeholders `?`→`:n`, JSON LIKE), o teste sobe contra Oracle de
// verdade, no mesmo padrão de settings-endpoints.oracle.spec.ts. `OracleServiceRepository` só
// herda `PostgresServiceRepository` sem sobrescrever nada, então exercitar a classe Postgres com o
// client Oracle já cobre os dois provedores. Skips unless ORACLE_* is configured.
const oracleConfigured = isOracleTestConfigured() && process.env.DATABASE_PROVIDER === 'oracle';
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

const stubEventService = { appendEvent: vi.fn(() => undefined) } as never;

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

test.skipIf(!oracleConfigured)(
  'listActiveSupportingResourceIds resolve RFS ativo, inclusive na segunda posição de supportingResource, e isola por tenant',
  async () => {
    const client = await getOracleTestClient();
    const repository = new PostgresServiceRepository(client);
    const service = new ServiceService(repository, stubEventService, {
      lookupParty: () => undefined,
      lookupPlace: () => undefined,
      lookupResource: (id) => ({ id, '@referredType': 'PhysicalResource', href: `/resource/${id}` }),
      lookupService: () => undefined,
    });

    const rfsSpec = await service.createServiceSpecification({
      name: 'GPON Access (Oracle spec test)',
      category: 'Broadband',
      serviceType: 'RFS',
    });

    const activePort = 'oracle-port-active';
    const ontResource = 'oracle-ont-1';
    const secondPositionPort = 'oracle-port-second';
    const terminatedPort = 'oracle-port-terminated';

    const rfsActive = await service.createService({
      '@type': 'ResourceFacingService',
      name: 'RFS ativo (Oracle)',
      serviceSpecificationId: rfsSpec.id,
      supportingResource: [{ id: activePort, '@referredType': 'PhysicalResource', role: 'access' }],
    });
    await service.updateService(rfsActive.id, { state: 'active' });

    const rfsSecondPosition = await service.createService({
      '@type': 'ResourceFacingService',
      name: 'RFS ativo, porta na segunda posição (Oracle)',
      serviceSpecificationId: rfsSpec.id,
      supportingResource: [
        { id: ontResource, '@referredType': 'PhysicalResource', role: 'ont' },
        { id: secondPositionPort, '@referredType': 'PhysicalResource', role: 'access' },
      ],
    });
    await service.updateService(rfsSecondPosition.id, { state: 'active' });

    const rfsTerminated = await service.createService({
      '@type': 'ResourceFacingService',
      name: 'RFS encerrado (Oracle)',
      serviceSpecificationId: rfsSpec.id,
      supportingResource: [{ id: terminatedPort, '@referredType': 'PhysicalResource', role: 'access' }],
    });
    await service.deleteService(rfsTerminated.id);

    const activeIds = await service.listActiveSupportingResourceIds([
      activePort,
      secondPositionPort,
      terminatedPort,
    ]);
    assert.equal(activeIds.has(activePort), true);
    assert.equal(activeIds.has(secondPositionPort), true);
    assert.equal(activeIds.has(terminatedPort), false);

    const scopedToOtherTenant = await repository.listActiveSupportingResourceIds([activePort], {
      tenantId: 'tenant-que-nao-existe',
    });
    assert.equal(scopedToOtherTenant.size, 0);

    assert.equal((await service.listActiveSupportingResourceIds([])).size, 0);
  },
);
