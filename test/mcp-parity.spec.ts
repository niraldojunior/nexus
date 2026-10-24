import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { PARITY_MAP } from '../src/modules/mcp/parity-map.js';
import { createNexusMcpModule } from '../src/modules/mcp/index.js';
import { createNexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// Guarda de paridade (épico #387): todo caminho de API chamado por web/src precisa ter operação
// MCP equivalente ou exclusão justificada em src/modules/mcp/parity-map.ts.
const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

/**
 * Caminhos `/v1/...` e `/tmf-api/...` de web/src (sem testes), normalizados: literais diretos e
 * também `${BASE}/...` quando BASE é uma constante de módulo (`const BASE_URL = '/v1/projects'`).
 */
const extractFrontendPaths = (): Set<string> => {
  const paths = new Set<string>();
  const normalize = (raw: string) => raw.replace(/\$\{[^}]*\}/g, '{}');
  const files = walk(join(process.cwd(), 'web', 'src')).filter(
    (file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file),
  );
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const bases = new Map<string, string>();
    for (const match of text.matchAll(/const (\w+) = '(\/(?:v1|tmf-api)[^']*)'/g)) {
      bases.set(match[1] ?? '', match[2] ?? '');
    }
    for (const match of text.matchAll(
      /[`'"](\/(?:v1|tmf-api)\/[^`'"?$ ]*(?:\$\{[^}]*\}[^`'"?$ ]*)*)/g,
    )) {
      paths.add(normalize(match[1] ?? ''));
    }
    for (const match of text.matchAll(/\$\{(\w+)\}(\/[^`'"?$ ]*(?:\$\{[^}]*\}[^`'"?$ ]*)*)/g)) {
      const base = bases.get(match[1] ?? '');
      if (base !== undefined) paths.add(normalize(base + (match[2] ?? '')));
    }
  }
  // Resíduos de concatenação (`/sites{}`, `/v1/studio{}`) caem no caminho base.
  return new Set([...paths].map((path) => path.replace(/([^/])\{\}$/, '$1')));
};

test('todo caminho de API do frontend tem operação MCP ou exclusão justificada', () => {
  const missing = [...extractFrontendPaths()].filter((path) => !(path in PARITY_MAP)).sort();
  assert.deepEqual(
    missing,
    [],
    `caminhos do frontend sem entrada em parity-map.ts:\n${missing.join('\n')}`,
  );
});

test('exclusões de paridade trazem justificativa', () => {
  for (const [path, entry] of Object.entries(PARITY_MAP)) {
    if ('excluded' in entry) assert.ok(entry.excluded.trim().length > 10, path);
    else assert.ok(entry.ops.length > 0, path);
  }
});

test.skipIf(!oracleConfigured)(
  'operações citadas no mapa de paridade existem no registro',
  async () => {
    const client = await getOracleTestClient();
    try {
      const module = createNexusMcpModule(await createNexusRuntime(client));
      const registered = new Set(module.registry.listTools().map((tool) => tool.name));
      const unknown = Object.entries(PARITY_MAP).flatMap(([path, entry]) =>
        'ops' in entry
          ? entry.ops.filter((op) => !registered.has(op)).map((op) => `${path} -> ${op}`)
          : [],
      );
      assert.deepEqual(unknown, [], `operações inexistentes:\n${unknown.join('\n')}`);
    } finally {
      await cleanupOracleTables(client);
    }
  },
);

test.skipIf(!oracleConfigured)(
  'toda operação de escrita nega usuário sem papel e exige admin no catálogo de status',
  async () => {
    const client = await getOracleTestClient();
    try {
      const runtime = await createNexusRuntime(client);
      const module = createNexusMcpModule(runtime);
      const contextFor = (roles: string[]) =>
        runtime.createToolContext({
          executionMode: 'internal-http',
          requestContext: {
            actorSub: 'parity-user',
            tenantId: 'default',
            roles,
            traceId: 'parity',
          },
        });
      const names = module.registry.listTools().map((tool) => tool.name);
      const writes = names.filter((name) => names.includes(name.replace(/\.(\w+)$/, '.commit_$1')));
      assert.ok(writes.length > 50, 'deveria haver dezenas de operações de escrita');
      for (const name of writes) {
        const result = await module.registry.executeTool(name, {}, contextFor([]));
        assert.equal(result.error?.code, 'MCP_FORBIDDEN', name);
      }
      const editor = await module.registry.executeTool(
        'project.create_project_status',
        { name: 'X', behavior: 'planning' },
        contextFor(['inventory.editor']),
      );
      assert.equal(editor.error?.code, 'MCP_FORBIDDEN');
      const closing = await module.registry.executeTool(
        'project.create_project_status',
        { name: 'X', behavior: 'close-release' },
        contextFor(['tenant.admin']),
      );
      assert.equal(closing.error?.code, 'PROJECT_STATUS_TERMINAL_RESERVED');
    } finally {
      await cleanupOracleTables(client);
    }
  },
);
