// Handler JSON-RPC 2.0 do MCP, compartilhado pelo transporte stdio e pelo `POST /mcp`
// (Streamable HTTP). Segue a spec MCP: `initialize` negocia `protocolVersion`, notifications não
// têm resposta, `ping` responde `{}` e `tools/call` devolve `content[]` + `structuredContent`.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpToolContext, McpToolResult, createNexusMcpModule } from './module.js';

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

const readPackageVersion = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
        if (parsed.version) return parsed.version;
      } catch {
        break;
      }
    }
    dir = dirname(dir);
  }
  return '0.0.0';
};

const SERVER_VERSION = readPackageVersion();

export const toMcpCallResult = (result: McpToolResult) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  structuredContent: result,
  isError: !result.ok,
});

export type JsonRpcDependencies = {
  module: ReturnType<typeof createNexusMcpModule>;
  createContext: () => McpToolContext;
};

/** Devolve `null` para notifications (sem resposta no protocolo). */
export const handleJsonRpcMessage = async (
  request: JsonRpcRequest,
  { module, createContext }: JsonRpcDependencies,
): Promise<JsonRpcResponse | null> => {
  const hasId = request.id !== undefined;
  const id = request.id ?? null;
  const method = request.method;

  if (!method) {
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'method is required' } };
  }

  // Notification: sem `id`. Nunca recebe resposta, nem de erro.
  if (!hasId) return null;

  if (method === 'initialize') {
    const requested = request.params?.protocolVersion;
    const protocolVersion =
      typeof requested === 'string' &&
      (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0];
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion,
        serverInfo: { name: module.serverName, version: SERVER_VERSION },
        capabilities: { tools: { listChanged: false } },
      },
    };
  }

  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: module.registry.listTools({ exposeToModelOnly: true }).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      },
    };
  }

  if (method === 'tools/call') {
    const name = typeof request.params?.name === 'string' ? request.params.name : '';
    const args =
      request.params &&
      typeof request.params.arguments === 'object' &&
      request.params.arguments !== null
        ? (request.params.arguments as Record<string, unknown>)
        : {};
    const result = await module.registry.executeExternal(name, args, createContext());
    return { jsonrpc: '2.0', id, result: toMcpCallResult(result) };
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method ${method} not found` } };
};
