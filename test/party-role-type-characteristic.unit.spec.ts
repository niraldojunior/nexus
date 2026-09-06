// Catálogo de características por "tipo de party" (Studio -> Partes, issue #220).
// PartyRoleTypeCharacteristicRepository fala com o DatabaseClient direto, sem passar por
// IPartyRepository/PartyService — como os demais specs do plano de trabalho do Nexus Studio, este
// teste NÃO toca o Neon (test-utils.ts/createTestDatabase): valida direto contra Oracle de
// desenvolvimento, no mesmo padrão de test/service-repository.oracle.spec.ts. Sem `OracleXxxRepository`
// separada (achado 1 do plano) — a mesma classe roda com o client Oracle. Skips unless ORACLE_* is
// configured.

import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import { PartyRoleTypeCharacteristicRepository } from '../src/modules/party/party-role-type-characteristic-repository.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

const oracleConfigured = isOracleTestConfigured() && process.env.DATABASE_PROVIDER === 'oracle';
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

const TENANT_ID = 'default';
const OTHER_TENANT_ID = 'outro-tenant';

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

test.skipIf(!oracleConfigured)(
  'ensureManufacturerCnpjSeed cria a característica cnpj uma única vez, mesmo chamada de novo',
  async () => {
    const client = await getOracleTestClient();
    const repository = new PartyRoleTypeCharacteristicRepository(client);

    await repository.ensureManufacturerCnpjSeed(TENANT_ID);
    await repository.ensureManufacturerCnpjSeed(TENANT_ID);

    const list = await repository.list(TENANT_ID, 'manufacturer');
    const cnpjEntries = list.filter((item) => item.name === 'cnpj');
    assert.equal(cnpjEntries.length, 1, 'seed idempotente não deve duplicar a linha');
    assert.equal(cnpjEntries[0]?.valueType, 'string');
  },
);

test.skipIf(!oracleConfigured)(
  'create/get/update/deactivate: CRUD completo com soft-delete (C6)',
  async () => {
    const client = await getOracleTestClient();
    const repository = new PartyRoleTypeCharacteristicRepository(client);

    const created = await repository.create(TENANT_ID, 'manufacturer', {
      name: 'segmento',
      valueType: 'list',
      group: 'Comercial',
      description: 'Segmento de atuação do fornecedor',
      allowedValues: ['Óptico', 'Elétrico'],
      sortOrder: 20,
    });
    assert.equal(created.name, 'segmento');
    assert.equal(created.group, 'Comercial');
    assert.deepEqual(created.allowedValues, ['Óptico', 'Elétrico']);
    assert.equal(created.active, true);
    assert.equal(created.tenantId, TENANT_ID);

    const fetched = await repository.get(TENANT_ID, created.id);
    assert.deepEqual(fetched, created);

    const updated = await repository.update(TENANT_ID, created.id, {
      description: 'Segmento de atuação atualizado',
      allowedValues: ['Óptico'],
    });
    assert.equal(updated?.description, 'Segmento de atuação atualizado');
    assert.deepEqual(updated?.allowedValues, ['Óptico']);
    // Campos não enviados no patch permanecem inalterados.
    assert.equal(updated?.name, 'segmento');
    assert.equal(updated?.group, 'Comercial');

    const deactivated = await repository.deactivate(TENANT_ID, created.id);
    assert.equal(deactivated?.active, false);

    // Soft-delete (C6): a linha continua existindo, só marcada inativa — nunca DELETE físico.
    const stillThere = await repository.get(TENANT_ID, created.id);
    assert.ok(stillThere);
    assert.equal(stillThere?.active, false);
  },
);

test.skipIf(!oracleConfigured)('list() isola por tenant e por roleName', async () => {
  const client = await getOracleTestClient();
  const repository = new PartyRoleTypeCharacteristicRepository(client);

  await repository.create(TENANT_ID, 'manufacturer', { name: 'campo-a', valueType: 'string' });
  await repository.create(TENANT_ID, 'other-role', { name: 'campo-b', valueType: 'string' });
  await repository.create(OTHER_TENANT_ID, 'manufacturer', {
    name: 'campo-c',
    valueType: 'string',
  });

  const manufacturerDefault = await repository.list(TENANT_ID, 'manufacturer');
  assert.ok(manufacturerDefault.some((item) => item.name === 'campo-a'));
  assert.ok(!manufacturerDefault.some((item) => item.name === 'campo-b'));
  assert.ok(!manufacturerDefault.some((item) => item.name === 'campo-c'));

  const otherRole = await repository.list(TENANT_ID, 'other-role');
  assert.deepEqual(
    otherRole.map((item) => item.name),
    ['campo-b'],
  );

  const otherTenant = await repository.list(OTHER_TENANT_ID, 'manufacturer');
  assert.deepEqual(
    otherTenant.map((item) => item.name),
    ['campo-c'],
  );
});

test.skipIf(!oracleConfigured)(
  'update()/get()/deactivate() em tenant diferente não enxergam o registro',
  async () => {
    const client = await getOracleTestClient();
    const repository = new PartyRoleTypeCharacteristicRepository(client);

    const created = await repository.create(TENANT_ID, 'manufacturer', {
      name: 'isolado',
      valueType: 'string',
    });

    const wrongTenantGet = await repository.get(OTHER_TENANT_ID, created.id);
    assert.equal(wrongTenantGet, null);

    const wrongTenantUpdate = await repository.update(OTHER_TENANT_ID, created.id, {
      name: 'sequestrado',
    });
    assert.equal(wrongTenantUpdate, null);

    const wrongTenantDeactivate = await repository.deactivate(OTHER_TENANT_ID, created.id);
    assert.equal(wrongTenantDeactivate, null);

    const stillIntact = await repository.get(TENANT_ID, created.id);
    assert.equal(stillIntact?.name, 'isolado');
    assert.equal(stillIntact?.active, true);
  },
);
