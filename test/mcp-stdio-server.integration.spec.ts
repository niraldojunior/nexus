import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import {
  TEST_ORACLE_PREFIX,
  cleanupOracleTables,
  getOracleTestClient,
  isOracleTestConfigured,
} from './test-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '../src/modules/mcp/stdio-server.js');

// Skips unless ORACLE_* is configured, no mesmo padrão dos demais specs Oracle-backed.
const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

// stdio-server.ts builds its Oracle config from ambient ORACLE_* env vars via loadConfig(), not from
// a databaseUrl argument — so the child just inherits process.env, pinned to the test prefix.
const startStdioServer = () => {
  const child = spawn(process.execPath, ['--use-system-ca', serverPath], {
    env: {
      ...process.env,
      ORACLE_OBJECT_PREFIX: TEST_ORACLE_PREFIX,
      NODE_ENV: 'test',
      DOTENV_CONFIG_QUIET: 'true',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const rl = createInterface({ input: child.stdout });
  const pendingLines: JsonRpcResponse[] = [];
  const waiters: Array<(line: JsonRpcResponse) => void> = [];

  rl.on('line', (line) => {
    if (!line.trim()) return;
    const parsed = JSON.parse(line) as JsonRpcResponse;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      pendingLines.push(parsed);
    }
  });

  const nextMessage = (): Promise<JsonRpcResponse> => {
    const buffered = pendingLines.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolvePromise) => waiters.push(resolvePromise));
  };

  const send = (payload: unknown): void => {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  const sendRaw = (line: string): void => {
    child.stdin.write(`${line}\n`);
  };

  const stop = async (): Promise<void> => {
    rl.close();
    child.stdin.end();
    await new Promise<void>((resolvePromise) => {
      child.once('exit', () => resolvePromise());
      setTimeout(() => {
        child.kill();
        resolvePromise();
      }, 5000);
    });
  };

  return { send, sendRaw, nextMessage, stop };
};

test.skipIf(!oracleConfigured)(
  'MCP stdio server handles initialize, tools/list and tools/call over JSON-RPC',
  async () => {
    const server = startStdioServer();
    try {
      server.send({ id: 1, method: 'initialize' });
      const initResponse = await server.nextMessage();
      assert.equal(initResponse.id, 1);
      assert.equal((initResponse.result?.serverInfo as { name: string }).name, 'nexus-tmf-mcp');

      server.send({ id: 2, method: 'tools/list' });
      const listResponse = await server.nextMessage();
      const tools = listResponse.result?.tools as Array<{ name: string }>;
      assert.ok(tools.some((tool) => tool.name === 'geo.list_sites'));

      server.send({
        id: 3,
        method: 'tools/call',
        params: { name: 'geo.list_sites', arguments: {} },
      });
      const callResponse = await server.nextMessage();
      assert.equal((callResponse.result as { ok: boolean }).ok, true);
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);

test.skipIf(!oracleConfigured)(
  'MCP stdio server reports JSON-RPC errors for invalid input',
  async () => {
    const server = startStdioServer();
    try {
      server.send({ id: 1, method: 'initialize' });
      await server.nextMessage();

      server.sendRaw('not json');
      const parseError = await server.nextMessage();
      assert.equal(parseError.id, null);
      assert.equal(parseError.error?.code, -32700);

      server.send({ id: 2 });
      const missingMethod = await server.nextMessage();
      assert.equal(missingMethod.error?.code, -32600);

      server.send({ id: 3, method: 'unknown/method' });
      const unknownMethod = await server.nextMessage();
      assert.equal(unknownMethod.error?.code, -32601);

      server.send({ id: 4, method: 'tools/call', params: { name: 'missing.tool', arguments: {} } });
      const missingTool = await server.nextMessage();
      assert.equal((missingTool.result as { ok: boolean }).ok, false);
      assert.equal(
        (missingTool.result as { error: { code: string } }).error.code,
        'MCP_TOOL_NOT_FOUND',
      );
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);
