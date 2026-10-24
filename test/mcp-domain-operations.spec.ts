// Operações por domínio (Service, Order, Party, Reference data, Studio): o papel exigido é o da
// rota HTTP equivalente, o publish do Studio precisa de draft aberto e a escrita segue
// prepare → commit com audit do ator real.

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createNexusMcpModule } from '../src/modules/mcp/index.js';
import { createNexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

const createFixture = async () => {
  const client = await getOracleTestClient();
  const runtime = await createNexusRuntime(client);
  const module = createNexusMcpModule(runtime);
  const contextFor = (actorSub: string, roles: string[]) =>
    runtime.createToolContext({
      executionMode: 'internal-http',
      requestContext: { actorSub, tenantId: 'default', roles, traceId: `dom-${actorSub}` },
    });
  return { module, contextFor, cleanup: () => cleanupOracleTables(client) };
};

test.skipIf(!oracleConfigured)(
  'escrita de catálogo e de Studio exige o papel da rota HTTP equivalente',
  async () => {
    const fixture = await createFixture();
    try {
      const run = (name: string, input: Record<string, unknown>, roles: string[]) =>
        fixture.module.registry.executeTool(
          name,
          input,
          fixture.contextFor(`rbac-${name}-${roles.join('-')}`, roles),
        );
      const denied = async (name: string, input: Record<string, unknown>, roles: string[]) => {
        const result = await run(name, input, roles);
        assert.equal(result.ok, false, `${name} deveria negar ${roles.join(',')}`);
        assert.equal(result.error?.code, 'MCP_FORBIDDEN', name);
      };

      // inventory.editor edita instância, mas não o catálogo (C9).
      await denied(
        'service.create_service_specification',
        { payload: { name: 'X', category: 'Y' } },
        ['inventory.editor'],
      );
      await denied('reference_data.create_set', { payload: { key: 'x' } }, ['inventory.editor']);
      await denied('party.create_party_role_type', { payload: { key: 'x' } }, ['inventory.editor']);
      // order.reader só lê; order.requester não opera (PATCH/DELETE).
      await denied('order.cancel_service_order', { id: 'x' }, ['order.reader']);
      await denied('order.cancel_service_order', { id: 'x' }, ['order.requester']);
      // Studio: editor rascunha, só admin publica ou descarta; reader não escreve.
      await denied('studio.save_draft', { domain: 'parties', snapshot: {} }, ['studio.reader']);
      await denied('studio.publish', { domain: 'parties' }, ['studio.editor']);
      await denied('studio.discard_draft', { domain: 'parties' }, ['studio.editor']);
    } finally {
      await fixture.cleanup();
    }
  },
);

test.skipIf(!oracleConfigured)(
  'studio.publish sem draft aberto falha no prepare, sem gerar token',
  async () => {
    const fixture = await createFixture();
    try {
      const result = await fixture.module.registry.executeTool(
        'studio.publish',
        { domain: 'parties' },
        fixture.contextFor('studio-admin', ['studio.admin']),
      );
      assert.equal(result.ok, false);
      assert.notEqual(result.error?.code, 'MCP_FORBIDDEN');
      assert.equal(
        (result.data as { confirmationToken?: string } | undefined)?.confirmationToken,
        undefined,
      );
    } finally {
      await fixture.cleanup();
    }
  },
);

test.skipIf(!oracleConfigured)('update_party segue prepare → commit com o ator real', async () => {
  const fixture = await createFixture();
  try {
    const editor = fixture.contextFor('editor-dom', ['inventory.editor', 'inventory.reader']);
    const run = async (name: string, input: Record<string, unknown>) => {
      const result = await fixture.module.registry.executeTool(name, input, editor);
      assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.error)}`);
      return result.data as Record<string, unknown>;
    };

    const prepCreate = await run('party.create_party', {
      payload: { '@type': 'Organization', name: 'Parte Domínio' },
    });
    const created = (await run('party.commit_create_party', {
      confirmationToken: prepCreate.confirmationToken,
    })) as { result?: { id?: string }; id?: string };
    const id = String(created.result?.id ?? created.id);

    const prepUpdate = await run('party.update_party', {
      id,
      payload: { name: 'Parte Domínio Renomeada' },
    });
    assert.ok(prepUpdate.confirmationToken, 'prepare deve devolver confirmationToken');
    await run('party.commit_update_party', { confirmationToken: prepUpdate.confirmationToken });

    const got = await run('party.get_party', { id });
    assert.equal(JSON.stringify(got).includes('Parte Domínio Renomeada'), true);
  } finally {
    await fixture.cleanup();
  }
});
