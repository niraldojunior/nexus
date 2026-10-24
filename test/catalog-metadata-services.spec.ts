// Services de tipos de party e dados de referência (Studio): papel, draft ativo, audit e evento.
// Antes viviam nas rotas de app.ts; agora HTTP e MCP compartilham o mesmo caminho.

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { RequestContext } from '../src/shared/http/request-context.js';
import { createNexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

const ctx = (actorSub: string, roles: string[]): RequestContext => ({
  actorSub,
  tenantId: 'default',
  roles,
  traceId: `catalog-${actorSub}`,
});

const admin = (actorSub: string) =>
  ctx(actorSub, ['catalog.admin', 'inventory.reader', 'studio.editor', 'studio.admin']);

const createFixture = async () => {
  const client = await getOracleTestClient();
  const runtime = await createNexusRuntime(client);
  return { client, runtime, cleanup: () => cleanupOracleTables(client) };
};

test.skipIf(!oracleConfigured)(
  'PartyRoleTypeService: exige papel e draft, e grava audit com o ator real',
  async () => {
    const { client, runtime, cleanup } = await createFixture();
    try {
      const service = runtime.partyRoleTypeService;
      const body = { key: 'parceiro-x', roleName: 'parceiro-x', label: 'Parceiro X' };

      await assert.rejects(
        service.create(body, ctx('reader-prt', ['inventory.reader'])),
        (error: { statusCode?: number }) => error.statusCode === 403,
      );

      const actor = admin('admin-prt');
      await assert.rejects(
        service.create(body, actor),
        (error: { code?: string }) => error.code === 'STUDIO_NO_DRAFT',
      );

      await runtime.studioService.saveDraft('parties', { partyRoleTypes: [] }, actor);
      const created = await service.create(body, actor);
      assert.equal(created.key, 'parceiro-x');
      await assert.rejects(
        service.create(body, actor),
        (error: { code?: string }) => error.code === 'PARTY_ROLE_TYPE_CONFLICT',
      );

      const deactivated = await service.deactivate(created.id, actor);
      assert.equal(deactivated?.active, false);

      const rows = await client.queryMany<{ action: string }>(
        `SELECT action FROM user_audit_log WHERE actor_sub = ? AND entity_type = 'PartyRoleType'`,
        ['admin-prt'],
      );
      assert.deepEqual(rows.map((row) => row.action).sort(), ['create', 'delete']);
    } finally {
      await cleanup();
    }
  },
);

test.skipIf(!oracleConfigured)(
  'ReferenceDataService: exige papel e draft, e audita conjunto e valor',
  async () => {
    const { client, runtime, cleanup } = await createFixture();
    try {
      const service = runtime.referenceDataService;
      const setBody = { key: 'motivos', name: 'Motivos' };

      await assert.rejects(
        service.createSet(setBody, ctx('reader-rd', ['inventory.reader'])),
        (error: { statusCode?: number }) => error.statusCode === 403,
      );

      const actor = admin('admin-rd');
      await assert.rejects(
        service.createSet(setBody, actor),
        (error: { code?: string }) => error.code === 'STUDIO_NO_DRAFT',
      );

      await runtime.studioService.saveDraft('reference-data', { sets: [] }, actor);
      const set = await service.createSet(setBody, actor);
      const value = await service.createValue(set.id, { key: 'falha', label: 'Falha' }, actor);
      assert.equal(value.setId, set.id);

      await assert.rejects(
        service.updateValue('outro-conjunto', value.id, { key: 'falha', label: 'x' }, actor),
        (error: { code?: string }) => error.code === 'REFERENCE_DATA_VALUE_NOT_FOUND',
      );

      await service.deactivateValue(set.id, value.id, actor);
      await service.deactivateSet(set.id, actor);

      const rows = await client.queryMany<{ entity_type: string; action: string }>(
        `SELECT entity_type, action FROM user_audit_log WHERE actor_sub = ?`,
        ['admin-rd'],
      );
      const kinds = rows
        .filter((row) => row.entity_type.startsWith('ReferenceData'))
        .map((row) => `${row.entity_type}:${row.action}`)
        .sort();
      assert.deepEqual(kinds, [
        'ReferenceDataSet:create',
        'ReferenceDataSet:delete',
        'ReferenceDataValue:create',
        'ReferenceDataValue:delete',
      ]);
    } finally {
      await cleanup();
    }
  },
);
