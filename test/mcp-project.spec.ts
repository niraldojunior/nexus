// Tools MCP de Projeto: mesma capacidade da UI (criar, transitar, vincular, arquivar), com RBAC
// e confirmação humana. Projeto é entidade própria, independente de Geo e de Resource.

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
      requestContext: { actorSub, tenantId: 'default', roles, traceId: `project-${actorSub}` },
    });
  return { client, runtime, module, contextFor, cleanup: () => cleanupOracleTables(client) };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;
type Context = ReturnType<Fixture['contextFor']>;

const run = async (
  fixture: Fixture,
  context: Context,
  operation: string,
  input: Record<string, unknown>,
) => {
  const prepared = await fixture.module.registry.executeTool(
    `project.${operation}`,
    input,
    context,
  );
  assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
  const token = (prepared.data as { confirmationToken: string }).confirmationToken;
  return await fixture.module.registry.executeTool(
    `project.commit_${operation}`,
    { confirmationToken: token },
    context,
  );
};

test.skipIf(!oracleConfigured)(
  'MCP de Projeto: cria, vincula recurso, consulta e nega escrita ao leitor',
  async () => {
    const fixture = await createFixture();
    try {
      const editor = fixture.contextFor('editor-project', ['inventory.editor', 'inventory.reader']);
      const reader = fixture.contextFor('reader-project', ['inventory.reader']);

      const created = await run(fixture, editor, 'create_project', {
        payload: { name: 'Projeto MCP' },
      });
      assert.equal(created.ok, true, JSON.stringify(created.error));
      const projectId = (created.data as { id: string }).id;

      const listed = await fixture.module.registry.executeTool('project.list_projects', {}, reader);
      assert.equal(listed.ok, true);
      assert.ok((listed.data as Array<{ id: string }>).some((item) => item.id === projectId));

      const denied = await fixture.module.registry.executeTool(
        'project.update_project',
        { id: projectId, payload: { name: 'Sem permissão' } },
        reader,
      );
      assert.equal(denied.ok, false);
      assert.equal(denied.error?.code, 'MCP_FORBIDDEN');

      const missing = await fixture.module.registry.executeTool(
        'project.archive_project',
        { id: 'inexistente' },
        editor,
      );
      assert.equal(missing.ok, false, 'prepare deve recusar projeto inexistente');

      const resources = await fixture.module.registry.executeTool(
        'project.list_project_resources',
        { id: projectId },
        reader,
      );
      assert.equal(resources.ok, true, JSON.stringify(resources.error));
      assert.deepEqual((resources.data as { items: unknown[] }).items, []);

      const transitions = await fixture.module.registry.executeTool(
        'project.get_project_transitions',
        { id: projectId },
        reader,
      );
      assert.equal(transitions.ok, true, JSON.stringify(transitions.error));

      const early = await fixture.module.registry.executeTool(
        'project.commit_archive_project',
        { confirmationToken: 'x' },
        editor,
      );
      assert.equal(early.ok, false);
    } finally {
      await fixture.cleanup();
    }
  },
);

test.skipIf(!oracleConfigured)(
  'MCP de Projeto: arquivar exige estado terminal e grava audit com o ator real',
  async () => {
    const fixture = await createFixture();
    try {
      const editor = fixture.contextFor('editor-archive', ['inventory.editor', 'inventory.reader']);
      const created = await run(fixture, editor, 'create_project', {
        payload: { name: 'Projeto Arquivo' },
      });
      const projectId = (created.data as { id: string }).id;

      const archived = await run(fixture, editor, 'archive_project', { id: projectId });
      assert.equal(archived.ok, false);
      assert.equal(archived.error?.code, 'PROJECT_ARCHIVE_REQUIRES_TERMINAL_STATUS');

      const rows = await fixture.client.queryMany<{ entity_type: string }>(
        'SELECT entity_type FROM user_audit_log WHERE actor_sub = ?',
        ['editor-archive'],
      );
      assert.ok(rows.some((row) => row.entity_type === 'Project'));
    } finally {
      await fixture.cleanup();
    }
  },
);
