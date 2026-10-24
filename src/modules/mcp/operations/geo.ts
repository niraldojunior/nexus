// Operações de Geo expostas via MCP. Leitura executa direto; escrita é sempre prepare → commit,
// e ambos delegam ao GeoService com o RequestContext do ator (RBAC, audit e outbox do service).

import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import type { McpToolContext, McpToolRegistry } from '../module.js';
import type { JsonSchema } from '../schema.js';

const str: JsonSchema = { type: 'string' };
const emptySchema: JsonSchema = { type: 'object', properties: {}, additionalProperties: false };
const idSchema = (extra: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties: { id: str, ...extra },
  required: ['id', ...required],
  additionalProperties: false,
});
const payloadSchema: JsonSchema = {
  type: 'object',
  properties: { id: str, payload: { type: 'object', additionalProperties: true } },
  required: ['id', 'payload'],
  additionalProperties: false,
};
const confirmationTokenSchema: JsonSchema = {
  type: 'object',
  properties: { confirmationToken: str },
  required: ['confirmationToken'],
  additionalProperties: false,
};

export const registerGeoOperations = (registry: McpToolRegistry, runtime: NexusRuntime): void => {
  const geo = runtime.geoService;
  const tree = runtime.geoTreeService;
  const s = (value: unknown): string => String(value);
  const opt = (input: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((k) => [k, input[k]]));

  const read = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    run: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
  ) =>
    registry.register({
      name: `geo.${operation}`,
      description,
      inputSchema,
      handler: async (input, context) =>
        registry.successResult('geo', operation, context, await run(input, context)),
    });

  const write = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    summarize: (input: Record<string, unknown>) => string,
    execute: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
  ) => {
    registry.register({
      name: `geo.${operation}`,
      description: `Prepara: ${description} Retorna confirmationToken; a execução exige confirmação do usuário.`,
      inputSchema,
      handler: (input, context) =>
        registry.prepareMutation('geo', operation, input, context, () => ({
          summary: summarize(input),
        })),
    });
    registry.register({
      name: `geo.commit_${operation}`,
      description: `Confirma e executa: ${description}`,
      inputSchema: confirmationTokenSchema,
      handler: (input, context) =>
        registry.commitMutation('geo', operation, s(input.confirmationToken), context, (pending) =>
          execute(pending.payload, context),
        ),
    });
  };

  const payloadOf = (input: Record<string, unknown>) =>
    (input.payload ?? {}) as Record<string, never>;

  // Leituras
  read('get_location', 'Obtém uma Geographic Location por id.', idSchema(), (i, c) =>
    geo.getLocation(s(i.id), c.requestContext),
  );
  read('get_location_references', 'Lista o que referencia uma Location.', idSchema(), (i, c) =>
    geo.getLocationReferences(s(i.id), c.requestContext),
  );
  read('get_site_tree', 'Árvore de sub-sites de um Site.', idSchema(), (i, c) =>
    geo.getSiteTree(s(i.id), c.requestContext),
  );
  read('list_site_relationships', 'Relações de um Site com outros.', idSchema(), (i, c) =>
    geo.listSiteRelationships(s(i.id), c.requestContext),
  );
  read(
    'get_site_deactivation_impact',
    'Impacto de desativar/aposentar um Site.',
    idSchema(),
    (i, c) => geo.getSiteDeactivationImpact(s(i.id), c.requestContext),
  );
  read('list_site_history', 'Histórico de status de um Site.', idSchema(), (i, c) =>
    geo.listSiteHistory(s(i.id), c.requestContext),
  );
  read('list_site_audit', 'Trilha de auditoria de um Site.', idSchema(), (i, c) =>
    geo.listSiteAudit(s(i.id), c.requestContext),
  );
  read('get_address_references', 'Lista o que referencia um Address.', idSchema(), (i, c) =>
    geo.getAddressReferences(s(i.id), c.requestContext),
  );
  read('list_relationship_types', 'Catálogo de tipos de relação de Geo.', emptySchema, (_i) =>
    geo.listRelationshipTypes(),
  );
  read(
    'tree_search',
    'Busca na árvore geográfica (UF, município, localidade, estação).',
    {
      type: 'object',
      properties: { term: str, limit: { type: 'number' } },
      required: ['term'],
      additionalProperties: false,
    },
    (i) => tree.search(s(i.term), opt(i, ['limit'])),
  );
  read('tree_roots', 'Raízes da árvore geográfica.', emptySchema, () => tree.roots());
  read(
    'tree_children',
    'Filhos de um nó da árvore geográfica.',
    idSchema({ limit: { type: 'number' }, offset: { type: 'number' } }),
    (i) => tree.children(s(i.id), opt(i, ['limit', 'offset'])),
  );
  read('tree_path', 'Caminho (ancestrais) até um nó da árvore.', idSchema(), (i) =>
    tree.pathTo(s(i.id)),
  );

  // Escritas (prepare → commit)
  write(
    'update_site',
    'atualiza campos de um Site.',
    payloadSchema,
    (i) => `Site ${s(i.id)} será atualizado.`,
    (i, c) => geo.updateSite(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'transition_site',
    'muda o status de um Site (ex.: InDeactivation, Retired).',
    idSchema({ status: str, statusReason: str, statusDate: str }, ['status']),
    (i) => `Site ${s(i.id)} passará para o status ${s(i.status)}.`,
    (i, c) =>
      geo.transitionSite(
        s(i.id),
        { status: i.status as never, ...opt(i, ['statusReason', 'statusDate']) },
        c.requestContext,
      ),
  );
  write(
    'add_site_relationship',
    'cria uma relação entre dois Sites.',
    idSchema({ relatedSiteId: str, relationshipType: str }, ['relatedSiteId', 'relationshipType']),
    (i) => `Relação ${s(i.relationshipType)} entre ${s(i.id)} e ${s(i.relatedSiteId)} será criada.`,
    (i, c) =>
      geo.addSiteRelationship(
        s(i.id),
        s(i.relatedSiteId),
        s(i.relationshipType),
        undefined,
        c.requestContext,
      ),
  );
  write(
    'remove_site_relationship',
    'remove uma relação entre dois Sites.',
    idSchema({ relatedSiteId: str, relationshipType: str }, ['relatedSiteId', 'relationshipType']),
    (i) =>
      `Relação ${s(i.relationshipType)} entre ${s(i.id)} e ${s(i.relatedSiteId)} será removida.`,
    (i, c) =>
      geo.removeSiteRelationship(
        s(i.id),
        s(i.relatedSiteId),
        s(i.relationshipType),
        c.requestContext,
      ),
  );
  write(
    'update_location',
    'atualiza uma Location.',
    payloadSchema,
    (i) => `Location ${s(i.id)} será atualizada.`,
    (i, c) => geo.updateLocation(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'terminate_location',
    'encerra (soft-delete) uma Location.',
    idSchema(),
    (i) => `Location ${s(i.id)} será encerrada.`,
    (i, c) => geo.terminateLocation(s(i.id), c.requestContext),
  );
  write(
    'update_address',
    'atualiza um Address.',
    payloadSchema,
    (i) => `Address ${s(i.id)} será atualizado.`,
    (i, c) => geo.updateAddress(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'terminate_address',
    'encerra (soft-delete) um Address.',
    idSchema(),
    (i) => `Address ${s(i.id)} será encerrado.`,
    (i, c) => geo.terminateAddress(s(i.id), c.requestContext),
  );
  write(
    'update_site_specification',
    'atualiza uma Site Specification do catálogo.',
    payloadSchema,
    (i) => `Site Specification ${s(i.id)} será atualizada.`,
    (i, c) => geo.updateSpec(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'retire_site_specification',
    'aposenta uma Site Specification do catálogo.',
    idSchema(),
    (i) => `Site Specification ${s(i.id)} será aposentada.`,
    (i, c) => geo.retireSpec(s(i.id), c.requestContext),
  );
};
