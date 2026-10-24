import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createNexusMcpModule } from '../src/modules/mcp/index.js';
import { createNexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

const partyPayload = (name: string) => ({
  payload: { '@type': 'Organization', name },
});

const createFixture = async () => {
  const client = await getOracleTestClient();
  const runtime = await createNexusRuntime(client);
  const module = createNexusMcpModule(runtime);
  const contextFor = (actorSub: string, roles: string[], tenantId = 'default') =>
    runtime.createToolContext({
      executionMode: 'internal-http',
      requestContext: { actorSub, tenantId, roles, traceId: `rbac-${actorSub}` },
    });
  return { client, runtime, module, contextFor, cleanup: () => cleanupOracleTables(client) };
};

test.skipIf(!oracleConfigured)('MCP nega escrita a quem so tem papel de leitura', async () => {
  const fixture = await createFixture();
  try {
    const reader = fixture.contextFor('reader-1', ['inventory.reader']);
    const prepared = await fixture.module.registry.executeTool(
      'party.create_party',
      partyPayload('Parte RBAC'),
      reader,
    );
    // O prepare de escrita ja exige o papel; sem ele nao existe token para confirmar.
    assert.equal(prepared.ok, false);
    assert.equal(prepared.error?.code, 'MCP_FORBIDDEN');
  } finally {
    await fixture.cleanup();
  }
});

test.skipIf(!oracleConfigured)('MCP nao deixa outro ator ou tenant confirmar o token', async () => {
  const fixture = await createFixture();
  try {
    const editor = fixture.contextFor('editor-1', ['inventory.editor']);
    const prepared = await fixture.module.registry.executeTool(
      'party.create_party',
      partyPayload('Parte Vinculada'),
      editor,
    );
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    const token = (prepared.data as { confirmationToken: string }).confirmationToken;

    const otherActor = await fixture.module.registry.executeTool(
      'party.commit_create_party',
      { confirmationToken: token },
      fixture.contextFor('editor-2', ['inventory.editor']),
    );
    assert.equal(otherActor.ok, false);
    assert.equal(otherActor.error?.code, 'MCP_CONFIRMATION_NOT_FOUND');

    const otherTenant = await fixture.module.registry.executeTool(
      'party.commit_create_party',
      { confirmationToken: token },
      fixture.contextFor('editor-1', ['inventory.editor'], 'outro-tenant'),
    );
    assert.equal(otherTenant.ok, false);
    assert.equal(otherTenant.error?.code, 'MCP_CONFIRMATION_NOT_FOUND');

    // As tentativas negadas nao podem consumir o token do dono.
    const owner = await fixture.module.registry.executeTool(
      'party.commit_create_party',
      { confirmationToken: token },
      editor,
    );
    assert.equal(owner.ok, true, JSON.stringify(owner.error));
  } finally {
    await fixture.cleanup();
  }
});

test.skipIf(!oracleConfigured)(
  'MCP consome o token uma unica vez em commits concorrentes',
  async () => {
    const fixture = await createFixture();
    try {
      const editor = fixture.contextFor('editor-1', ['inventory.editor']);
      const prepared = await fixture.module.registry.executeTool(
        'party.create_party',
        partyPayload('Parte Concorrente'),
        editor,
      );
      assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
      const token = (prepared.data as { confirmationToken: string }).confirmationToken;

      const results = await Promise.all(
        [1, 2, 3].map(() =>
          fixture.module.registry.executeTool(
            'party.commit_create_party',
            { confirmationToken: token },
            editor,
          ),
        ),
      );
      assert.equal(results.filter((result) => result.ok).length, 1);
      const parties = await fixture.runtime.partyService.listParties();
      assert.equal(
        parties.filter((party) => party.name === 'Parte Concorrente').length,
        1,
        'o bootstrap do namespace pode conter partes de outros testes; só esta mutação deve ser única',
      );
    } finally {
      await fixture.cleanup();
    }
  },
);

test.skipIf(!oracleConfigured)('MCP grava audit com o ator real no commit', async () => {
  const fixture = await createFixture();
  try {
    const editor = fixture.contextFor('editor-audit', ['inventory.editor']);
    const prepared = await fixture.module.registry.executeTool(
      'party.create_party',
      partyPayload('Parte Auditada'),
      editor,
    );
    const token = (prepared.data as { confirmationToken: string }).confirmationToken;
    const committed = await fixture.module.registry.executeTool(
      'party.commit_create_party',
      { confirmationToken: token },
      editor,
    );
    assert.equal(committed.ok, true, JSON.stringify(committed.error));

    const rows = await fixture.client.queryMany<{
      actor_sub: string;
      tenant_id: string;
      event_time: string;
    }>(
      'SELECT actor_sub, tenant_id, event_time FROM user_audit_log WHERE actor_sub = ? AND trace_id = ?',
      ['editor-audit', 'rbac-editor-audit'],
    );
    assert.ok(rows.length > 0);
    assert.equal(rows[0]?.tenant_id, 'default');

    // C7: o mesmo commit enfileira o evento no outbox, no tenant do ator.
    const outbox = await fixture.client.queryMany<{ tenant_id: string; status: string }>(
      'SELECT tenant_id, status FROM environment_outbox WHERE tenant_id = ?',
      ['default'],
    );
    assert.ok(outbox.length > 0, 'commit via MCP deve gravar environment_outbox');
  } finally {
    await fixture.cleanup();
  }
});
