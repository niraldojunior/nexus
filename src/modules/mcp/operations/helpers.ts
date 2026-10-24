// Helpers compartilhados pelos módulos de operações do MCP (resource, service, order, party,
// reference-data, studio). Leitura executa direto; escrita é sempre prepare → commit, e os dois
// lados checam os mesmos papéis (os da rota HTTP equivalente).

import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import type { McpToolContext, McpToolRegistry } from '../module.js';
import type { JsonSchema } from '../schema.js';

export const str: JsonSchema = { type: 'string' };
export const num: JsonSchema = { type: 'number' };
export const bool: JsonSchema = { type: 'boolean' };
export const obj: JsonSchema = { type: 'object', additionalProperties: true };
export const emptySchema: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

export const idSchema = (
  extra: Record<string, JsonSchema> = {},
  required: string[] = [],
): JsonSchema => ({
  type: 'object',
  properties: { id: str, ...extra },
  required: ['id', ...required],
  additionalProperties: false,
});

/** `{ payload }` — criação. */
export const createSchema: JsonSchema = {
  type: 'object',
  properties: { payload: obj },
  required: ['payload'],
  additionalProperties: false,
};

/** `{ id, payload }` — atualização. */
export const updateSchema: JsonSchema = {
  type: 'object',
  properties: { id: str, payload: obj },
  required: ['id', 'payload'],
  additionalProperties: false,
};

const confirmationTokenSchema: JsonSchema = {
  type: 'object',
  properties: { confirmationToken: str },
  required: ['confirmationToken'],
  additionalProperties: false,
};

export const s = (value: unknown): string => String(value);
export const payloadOf = <T = never>(input: Record<string, unknown>): T =>
  (input.payload ?? {}) as T;

/** Copia só as chaves definidas (exactOptionalPropertyTypes não aceita `undefined` explícito). */
export const opt = (input: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((k) => [k, input[k]]));

export const listPaging = { limit: num, offset: num } satisfies Record<string, JsonSchema>;

type Prepared = { summary: string; payload?: Record<string, unknown> };

export const createOperationHelpers = (
  registry: McpToolRegistry,
  domain: string,
  roles: { read: readonly string[]; write: readonly string[] },
) => {
  const read = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    run: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
    requiredRoles: readonly string[] = roles.read,
  ) =>
    registry.register({
      name: `${domain}.${operation}`,
      description,
      inputSchema,
      requiredRoles,
      handler: async (input, context) =>
        registry.successResult(domain, operation, context, await run(input, context)),
    });

  /**
   * `prepare` pode devolver um `payload` enriquecido (ex.: checksum lido no momento do prepare) que
   * é o que o commit reaplica; sem ele, vale o input original.
   */
  const write = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    prepare: (
      input: Record<string, unknown>,
      context: McpToolContext,
    ) => Prepared | Promise<Prepared>,
    execute: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
    requiredRoles: readonly string[] = roles.write,
  ) => {
    registry.register({
      name: `${domain}.${operation}`,
      description: `Prepara: ${description} Retorna confirmationToken; a execução exige confirmação do usuário.`,
      inputSchema,
      requiredRoles,
      handler: async (input, context) => {
        const prepared = await prepare(input, context);
        return registry.prepareMutation(
          domain,
          operation,
          prepared.payload ?? input,
          context,
          () => ({
            summary: prepared.summary,
          }),
        );
      },
    });
    registry.register({
      name: `${domain}.commit_${operation}`,
      description: `Confirma e executa: ${description}`,
      inputSchema: confirmationTokenSchema,
      requiredRoles,
      handler: (input, context) =>
        registry.commitMutation(domain, operation, s(input.confirmationToken), context, (pending) =>
          execute(pending.payload, context),
        ),
    });
  };

  /** Atalho: resumo fixo, payload original. */
  const simpleWrite = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    summarize: (input: Record<string, unknown>) => string,
    execute: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
    requiredRoles?: readonly string[],
  ) =>
    write(
      operation,
      description,
      inputSchema,
      (i) => ({ summary: summarize(i) }),
      execute,
      requiredRoles,
    );

  return { read, write, simpleWrite };
};

export type OperationHelpers = ReturnType<typeof createOperationHelpers>;
export type RegisterOperations = (registry: McpToolRegistry, runtime: NexusRuntime) => void;
