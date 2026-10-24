// Meta-tools de descoberta (search → describe → invoke): filtro por permissão, commit fora do
// alcance e escrita sempre em duas etapas, com domain/operation reais no resultado.

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
      requestContext: { actorSub, tenantId: 'default', roles, traceId: `meta-${actorSub}` },
    });
  return { runtime, module, contextFor, cleanup: () => cleanupOracleTables(client) };
};

type Found = { operations: Array<{ name: string; kind: 'read' | 'write' }> };

test.skipIf(!oracleConfigured)('search_operations lista só o que o papel permite', async () => {
  const fixture = await createFixture();
  try {
    const search = async (roles: string[]) =>
      (
        await fixture.module.registry.executeTool(
          'nexus.search_operations',
          { query: 'party' },
          fixture.contextFor(`s-${roles.join('-')}`, roles),
        )
      ).data as Found;

    const reader = await search(['inventory.reader']);
    const editor = await search(['inventory.editor']);

    assert.ok(reader.operations.some((op) => op.name === 'party.list_parties'));
    assert.ok(!reader.operations.some((op) => op.name === 'party.create_party'));
    assert.ok(editor.operations.some((op) => op.name === 'party.create_party'));
    assert.equal(editor.operations.find((op) => op.name === 'party.create_party')?.kind, 'write');
    for (const op of [...reader.operations, ...editor.operations]) {
      assert.ok(!op.name.includes('.commit_'), `commit exposto: ${op.name}`);
      assert.ok(!op.name.startsWith('nexus.'), `meta-tool exposta: ${op.name}`);
    }
  } finally {
    await fixture.cleanup();
  }
});

test.skipIf(!oracleConfigured)('describe_operation devolve schema e recusa commit', async () => {
  const fixture = await createFixture();
  try {
    const ctx = fixture.contextFor('d-1', ['inventory.editor']);
    const described = await fixture.module.registry.executeTool(
      'nexus.describe_operation',
      { name: 'party.create_party' },
      ctx,
    );
    const data = described.data as { inputSchema?: unknown; kind?: string };
    assert.ok(data.inputSchema);
    assert.equal(data.kind, 'write');

    const commit = await fixture.module.registry.executeTool(
      'nexus.describe_operation',
      { name: 'party.commit_create_party' },
      ctx,
    );
    assert.equal(commit.data, null);
  } finally {
    await fixture.cleanup();
  }
});

test.skipIf(!oracleConfigured)(
  'invoke_operation: escrita só prepara, nega sem papel e não alcança commit',
  async () => {
    const fixture = await createFixture();
    try {
      const body = { '@type': 'Organization', name: 'Parte Meta' };

      const denied = await fixture.module.registry.executeTool(
        'nexus.invoke_operation',
        { name: 'party.create_party', input: { payload: body } },
        fixture.contextFor('i-reader', ['inventory.reader']),
      );
      assert.equal(denied.ok, false);
      assert.equal(denied.error?.code, 'MCP_FORBIDDEN');

      const editor = fixture.contextFor('i-editor', ['inventory.editor']);
      const prepared = await fixture.module.registry.executeTool(
        'nexus.invoke_operation',
        { name: 'party.create_party', input: { payload: body } },
        editor,
      );
      assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
      // Card de confirmação depende de domain/operation reais, não da meta-tool.
      assert.equal(prepared.domain, 'party');
      assert.equal(prepared.operation, 'create_party');
      const token = (prepared.data as { confirmationToken?: string }).confirmationToken;
      assert.ok(token);

      const before = await fixture.runtime.partyService.listParties();
      assert.ok(!before.some((party) => party.name === 'Parte Meta'), 'prepare não grava');

      // O modelo não consegue acionar o commit pela meta-tool.
      const viaMeta = await fixture.module.registry.executeTool(
        'nexus.invoke_operation',
        { name: 'party.commit_create_party', input: { confirmationToken: token } },
        editor,
      );
      assert.equal(viaMeta.data, null);
      assert.ok(
        !(await fixture.runtime.partyService.listParties()).some(
          (party) => party.name === 'Parte Meta',
        ),
      );

      // Só o commit direto (clique do usuário) grava.
      const committed = await fixture.module.registry.executeTool(
        'party.commit_create_party',
        { confirmationToken: token },
        editor,
      );
      assert.equal(committed.ok, true, JSON.stringify(committed.error));
    } finally {
      await fixture.cleanup();
    }
  },
);

test.skipIf(!oracleConfigured)(
  'operações de Geo: leitor só lê, editor prepara escrita',
  async () => {
    const fixture = await createFixture();
    try {
      const reader = fixture.contextFor('g-reader', ['inventory.reader']);
      const editor = fixture.contextFor('g-editor', ['inventory.editor']);

      const found = (
        await fixture.module.registry.executeTool(
          'nexus.search_operations',
          { query: 'site', domain: 'geo' },
          reader,
        )
      ).data as Found;
      assert.ok(found.operations.some((op) => op.name === 'geo.list_site_history'));
      assert.ok(!found.operations.some((op) => op.name === 'geo.transition_site'));

      const denied = await fixture.module.registry.executeTool(
        'geo.transition_site',
        { id: 'x', status: 'Retired' },
        reader,
      );
      assert.equal(denied.error?.code, 'MCP_FORBIDDEN');

      const prepared = await fixture.module.registry.executeTool(
        'geo.transition_site',
        { id: 'x', status: 'Retired' },
        editor,
      );
      assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
      assert.ok((prepared.data as { confirmationToken?: string }).confirmationToken);
    } finally {
      await fixture.cleanup();
    }
  },
);
