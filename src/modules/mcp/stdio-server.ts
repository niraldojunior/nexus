import { config as loadEnv } from 'dotenv';
import { createInterface } from 'node:readline';
import { loadConfig } from '../../shared/config/env.js';
import { createLogger } from '../../shared/logging/logger.js';
import { SqliteDatabase } from '../../shared/persistence/sqlite-database.js';
import { createNexusRuntime } from '../../shared/runtime/nexus-runtime.js';
import { createNexusMcpModule } from './module.js';

type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

loadEnv();

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
const db = SqliteDatabase.getInstance(config.databaseUrl);

const writeMessage = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const handleRequest = async (
  request: JsonRpcRequest,
  module: ReturnType<typeof createNexusMcpModule>,
  runtime: ReturnType<typeof createNexusRuntime>,
): Promise<void> => {
  const id = request.id ?? null;
  const method = request.method;

  if (!method) {
    writeMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'method is required' },
    });
    return;
  }

  if (method === 'initialize') {
    writeMessage({
      jsonrpc: '2.0',
      id,
      result: {
        serverInfo: {
          name: module.serverName,
          version: '0.1.0',
        },
        capabilities: {
          tools: true,
        },
      },
    });
    return;
  }

  if (method === 'tools/list') {
    writeMessage({
      jsonrpc: '2.0',
      id,
      result: {
        tools: module.registry.listTools().map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      },
    });
    return;
  }

  if (method === 'tools/call') {
    const name = typeof request.params?.name === 'string' ? request.params.name : '';
    const argumentsInput =
      request.params && typeof request.params.arguments === 'object' && request.params.arguments !== null
        ? (request.params.arguments as Record<string, unknown>)
        : {};
    const result = await module.registry.executeTool(
      name,
      argumentsInput,
      runtime.createToolContext({ executionMode: 'external-stdio' }),
    );
    writeMessage({
      jsonrpc: '2.0',
      id,
      result,
    });
    return;
  }

  writeMessage({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `method ${method} not found` },
  });
};

const main = async (): Promise<void> => {
  await db.initialize();
  const runtime = createNexusRuntime(db);
  const module = createNexusMcpModule(runtime);
  const reader = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  reader.on('line', (line) => {
    if (!line.trim()) return;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch (error) {
      writeMessage({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'invalid JSON' },
      });
      return;
    }

    void handleRequest(request, module, runtime).catch((error: unknown) => {
      logger.error({ error }, 'mcp stdio request failed');
      writeMessage({
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      });
    });
  });

  reader.on('close', () => {
    db.close();
  });
};

void main().catch((error: unknown) => {
  logger.error({ error }, 'mcp stdio server failed');
  process.exitCode = 1;
});
