import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestDatabase as createPostgresTestDatabase } from './test-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '../src/modules/mcp/stdio-server.js');

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

const startStdioServer = (databaseUrl: string) => {
  const child = spawn(process.execPath, ['--use-system-ca', serverPath], {
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test', DOTENV_CONFIG_QUIET: 'true' },
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

const createTestDatabase = () => createPostgresTestDatabase('nexus-mcp-stdio-');

test('MCP stdio server handles initialize, tools/list and tools/call over JSON-RPC', async (t) => {
  const database = createTestDatabase();
  const server = startStdioServer(database.databaseUrl);
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  server.send({ id: 1, method: 'initialize' });
  const initResponse = await server.nextMessage();
  assert.equal(initResponse.id, 1);
  assert.equal((initResponse.result?.serverInfo as { name: string }).name, 'nexus-tmf-mcp');

  server.send({ id: 2, method: 'tools/list' });
  const listResponse = await server.nextMessage();
  const tools = listResponse.result?.tools as Array<{ name: string }>;
  assert.ok(tools.some((tool) => tool.name === 'geo.list_sites'));

  server.send({ id: 3, method: 'tools/call', params: { name: 'geo.list_sites', arguments: {} } });
  const callResponse = await server.nextMessage();
  assert.equal((callResponse.result as { ok: boolean }).ok, true);
});

test('MCP stdio server reports JSON-RPC errors for invalid input', async (t) => {
  const database = createTestDatabase();
  const server = startStdioServer(database.databaseUrl);
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

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
  assert.equal((missingTool.result as { error: { code: string } }).error.code, 'MCP_TOOL_NOT_FOUND');
});
