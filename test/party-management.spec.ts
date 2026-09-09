import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createApp } from '../src/shared/http/app.js';
import {
  cleanupOracleTables,
  createTestConfig,
  createTestLogger,
  getOracleTestClient,
  isOracleTestConfigured,
  requestJson,
} from './test-utils.js';

const oracleConfigured = isOracleTestConfigured();

test.skipIf(!oracleConfigured)(
  'TMF632 and TMF669 party endpoints create, search and terminate parties',
  async () => {
    const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
    const port = await server.start();
    try {
      const party = await requestJson(port, 'POST', '/tmf-api/partyManagement/v4/party', {
        name: 'ISP Alfa',
        partyType: 'Organization',
        partyCharacteristic: [
          { name: 'documentNumber', value: '12.345.678/0001-90', valueType: 'string' },
        ],
      });
      assert.equal(party.statusCode, 201);
      assert.equal((party.body as { name: string }).name, 'ISP Alfa');

      const role = await requestJson(port, 'POST', '/tmf-api/partyRoleManagement/v4/partyRole', {
        partyId: (party.body as { id: string }).id,
        name: 'tenant',
      });
      assert.equal(role.statusCode, 201);
      assert.equal((role.body as { name: string }).name, 'tenant');

      const searchByName = await requestJson(
        port,
        'GET',
        '/tmf-api/partyManagement/v4/party?name=ISP',
      );
      assert.equal(searchByName.statusCode, 200);
      assert.ok(Array.isArray(searchByName.body));
      assert.equal((searchByName.body as Array<{ id: string }>).length, 1);

      const searchByDocument = await requestJson(
        port,
        'GET',
        '/tmf-api/partyManagement/v4/party?document=12.345.678/0001-90',
      );
      assert.equal(searchByDocument.statusCode, 200);
      assert.equal((searchByDocument.body as Array<{ id: string }>).length, 1);

      const terminated = await requestJson(
        port,
        'DELETE',
        `/tmf-api/partyManagement/v4/party/${(party.body as { id: string }).id}`,
      );
      assert.equal(terminated.statusCode, 200);
      assert.equal((terminated.body as { status: string }).status, 'terminated');

      const events = await requestJson(
        port,
        'GET',
        '/tmf-api/eventManagement/v4/event?source=party.Organization',
      );
      assert.equal(events.statusCode, 200);
      assert.ok(
        (events.body as Array<{ eventType: string }>).some(
          (event) => event.eventType === 'PartyCreateEvent',
        ),
      );
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);

test.skipIf(!oracleConfigured)(
  'bootstrap seeds manufacturer party roles for resource catalog combos',
  async () => {
    const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
    const port = await server.start();
    try {
      const response = await requestJson(
        port,
        'GET',
        '/tmf-api/partyRoleManagement/v4/partyRole?status=active',
      );
      assert.equal(response.statusCode, 200);
      assert.ok(Array.isArray(response.body));

      const names = (response.body as Array<{ party: { name?: string }; name: string }>).map(
        (item) => item.party.name ?? item.name,
      );
      for (const expected of [
        'VANTIVA',
        'BLU-CASTLE',
        'DATACOM',
        'HUAWEI',
        'ZTE',
        'SAGEMCOM',
        'NOKIA',
        'TELLESCOM',
        'ARCADYAN',
      ]) {
        assert.ok(names.includes(expected), `expected bootstrap to include ${expected}`);
      }
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);
