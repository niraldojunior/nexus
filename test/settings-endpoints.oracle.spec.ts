import assert from 'node:assert/strict';
import { afterAll, test, vi } from 'vitest';
import { PartyService } from '../src/modules/party/service.js';
import { PostgresPartyRepository } from '../src/modules/party/postgres-repository.js';
import { ResourceService } from '../src/modules/resource/service.js';
import { PostgresResourceRepository } from '../src/modules/resource/postgres-repository.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// Regression coverage for issue #166: the Settings page's now-removed "Infraestrutura civil"
// (Resource Specification workspace) and "Recursos de Rede" (manufacturer party roles) tabs both
// 500'd on Oracle because `tenant_id` (C8) was declared in schema.ts but never migrated onto these
// tables under NEXUS_DEV_ — ORA-00904 "TENANT_ID": invalid identifier the first time a service
// injected the tenant filter. Those UI tabs are gone (issue #219 — this modeling now lives only in
// Studio, with governance), but this still exercises the same two service calls directly against a
// real Oracle instance so a future drift fails here instead of in the browser. Skips unless
// ORACLE_* is configured — same gate as oracle-roundtrip.spec.ts.
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
  'listPartyRoles filtra por tenant_id sem ORA-00904 (ex-aba Recursos de Rede)',
  async () => {
    const client = await getOracleTestClient();
    const service = new PartyService(new PostgresPartyRepository(client), stubEventService);

    const roles = await service.listPartyRoles({
      limit: 200,
      offset: 0,
      status: 'active',
      name: 'manufacturer',
    });

    assert.ok(Array.isArray(roles));
  },
);

test.skipIf(!oracleConfigured)(
  'listResourceSpecifications filtra por tenant_id sem ORA-00904 (ex-aba Infraestrutura civil)',
  async () => {
    const client = await getOracleTestClient();
    const service = new ResourceService(new PostgresResourceRepository(client), stubEventService);

    const specs = await service.listResourceSpecifications({ limit: 500, offset: 0 });

    assert.ok(Array.isArray(specs));
  },
);
