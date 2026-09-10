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
const serverPath = resolve(__dirname, '../dist/src/modules/mcp/stdio-server.js');
const RESPONSE_TIMEOUT_MS = 15_000;

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
  const waiters: Array<{
    resolve: (line: JsonRpcResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  const stderr: string[] = [];
  let terminalError: Error | undefined;

  const failWaiters = (error: Error): void => {
    terminalError ??= error;
    for (const waiter of waiters.splice(0)) waiter.reject(terminalError);
  };

  child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
  child.once('error', (error) => failWaiters(new Error(`MCP stdio child failed to start: ${error.message}`)));
  child.once('exit', (code, signal) => {
    if (code === 0 || signal === 'SIGTERM') return;
    const detail = stderr.join('').trim();
    failWaiters(
      new Error(
        `MCP stdio child exited before responding (code=${String(code)}, signal=${signal ?? 'none'})` +
          (detail ? `: ${detail}` : ''),
      ),
    );
  });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(line) as JsonRpcResponse;
    } catch {
      failWaiters(new Error(`MCP stdio child wrote invalid JSON to stdout: ${line}`));
      return;
    }
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(parsed);
    else pendingLines.push(parsed);
  });

  const nextMessage = (): Promise<JsonRpcResponse> => {
    const buffered = pendingLines.shift();
    if (buffered) return Promise.resolve(buffered);
    if (terminalError) return Promise.reject(terminalError);
    return new Promise((resolvePromise, rejectPromise) => {
      const waiter = { resolve: resolvePromise, reject: rejectPromise };
      const timeout = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        const detail = stderr.join('').trim();
        rejectPromise(
          new Error(
            `Timed out waiting ${RESPONSE_TIMEOUT_MS}ms for MCP stdio response` +
              (detail ? `: ${detail}` : ''),
          ),
        );
      }, RESPONSE_TIMEOUT_MS);
      waiter.resolve = (response) => {
        clearTimeout(timeout);
        resolvePromise(response);
      };
      waiter.reject = (error) => {
        clearTimeout(timeout);
        rejectPromise(error);
      };
      waiters.push(waiter);
    });
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
