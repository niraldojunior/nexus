// Operações de Party, Party Role, Party Role Types e Reference Data via MCP. Os services de
// party-role-type e reference-data já checam papel e governança do Studio (assertActiveDraft);
// o requiredRoles aqui só adianta a recusa com MCP_FORBIDDEN.

import {
  CATALOG_ADMIN_ROLES,
  INVENTORY_READ_ROLES,
  INVENTORY_WRITE_ROLES,
} from '../../../shared/http/roles.js';
import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import type { McpToolRegistry } from '../module.js';
import type { JsonSchema } from '../schema.js';
import {
  createOperationHelpers,
  createSchema,
  idSchema,
  obj,
  payloadOf,
  s,
  str,
  updateSchema,
} from './helpers.js';

const querySchema = { type: 'object', properties: {}, additionalProperties: true } as const;

export const registerPartyOperations = (registry: McpToolRegistry, runtime: NexusRuntime): void => {
  const party = runtime.partyService;
  const roleTypes = runtime.partyRoleTypeService;
  const { read, simpleWrite } = createOperationHelpers(registry, 'party', {
    read: INVENTORY_READ_ROLES,
    write: INVENTORY_WRITE_ROLES,
  });
  const admin = (
    operation: string,
    description: string,
    schema: Parameters<typeof simpleWrite>[2],
    summarize: Parameters<typeof simpleWrite>[3],
    run: Parameters<typeof simpleWrite>[4],
  ) => simpleWrite(operation, description, schema, summarize, run, CATALOG_ADMIN_ROLES);

  // ── Party e Party Role ───────────────────────────────────────────────────────────────────────
  read('list_party_roles', 'Lista papéis de parties (TMF669).', querySchema, (i, c) =>
    party.listPartyRoles(i as never, c.requestContext),
  );
  read('get_party_role', 'Obtém um papel de party.', idSchema(), (i) =>
    party.getPartyRole(s(i.id)),
  );
  simpleWrite(
    'update_party',
    'atualiza uma party.',
    updateSchema,
    (i) => `Party ${s(i.id)} será atualizada.`,
    (i, c) => party.updateParty(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'delete_party',
    'encerra uma party (soft-delete, C6).',
    idSchema(),
    (i) => `Party ${s(i.id)} será encerrada.`,
    (i, c) => party.deleteParty(s(i.id), c.requestContext),
  );
  simpleWrite(
    'update_party_role',
    'atualiza um papel de party.',
    updateSchema,
    (i) => `Papel ${s(i.id)} será atualizado.`,
    (i, c) => party.updatePartyRole(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'delete_party_role',
    'encerra um papel de party (soft-delete, C6).',
    idSchema(),
    (i) => `Papel ${s(i.id)} será encerrado.`,
    (i, c) => party.deletePartyRole(s(i.id), c.requestContext),
  );

  // ── Party Role Types (Studio -> Partes) ──────────────────────────────────────────────────────
  read(
    'list_party_role_types',
    'Lista os tipos de papel de party.',
    { type: 'object', properties: {}, additionalProperties: false },
    (_i, c) => roleTypes.list(c.requestContext),
  );
  read(
    'get_party_role_type_usage',
    'Uso de um tipo de papel (organizações e specifications que o usam).',
    idSchema(),
    async (i, c) => {
      const repo = runtime.partyRoleTypeRepository;
      const type = await repo.get(c.requestContext.tenantId, s(i.id));
      return type
        ? await repo.getUsage(c.requestContext.tenantId, type.roleName, type.id)
        : await repo.getUsage(c.requestContext.tenantId, s(i.id));
    },
  );
  read(
    'list_organizations_by_role_types',
    'Organizações que têm algum dos tipos de papel informados.',
    {
      type: 'object',
      properties: { ids: { type: 'array', items: str } },
      required: ['ids'],
      additionalProperties: false,
    },
    (i, c) =>
      runtime.partyRoleTypeRepository.listOrganizationsByRoleTypeIds(
        c.requestContext.tenantId,
        (i.ids as unknown[]).map(s),
      ),
  );
  read(
    'list_party_role_type_characteristics',
    'Características de um tipo de papel de party.',
    idSchema(),
    (i, c) =>
      runtime.partyRoleTypeCharacteristicRepository.list(c.requestContext.tenantId, s(i.id)),
  );
  admin(
    'create_party_role_type',
    'cria um tipo de papel de party (exige draft aberto de Partes no Studio).',
    createSchema,
    (i) => `Tipo de papel ${s((i.payload as { key?: unknown })?.key ?? '')} será criado.`,
    (i, c) => roleTypes.create(payloadOf(i), c.requestContext),
  );
  admin(
    'update_party_role_type',
    'atualiza um tipo de papel de party.',
    updateSchema,
    (i) => `Tipo de papel ${s(i.id)} será atualizado.`,
    (i, c) => roleTypes.update(s(i.id), payloadOf(i), c.requestContext),
  );
  admin(
    'deactivate_party_role_type',
    'inativa um tipo de papel de party; recusa se estiver em uso.',
    idSchema(),
    (i) => `Tipo de papel ${s(i.id)} será inativado.`,
    (i, c) => roleTypes.deactivate(s(i.id), c.requestContext),
  );

  // ── Reference Data (Studio -> Dados de referência) ───────────────────────────────────────────
  const ref = runtime.referenceDataService;
  const refRead = createOperationHelpers(registry, 'reference_data', {
    read: INVENTORY_READ_ROLES,
    write: CATALOG_ADMIN_ROLES,
  });
  refRead.read(
    'list_sets',
    'Lista os conjuntos de dados de referência.',
    { type: 'object', properties: {}, additionalProperties: false },
    (_i, c) => ref.listSets(c.requestContext),
  );
  refRead.read(
    'list_values',
    'Lista os valores de um conjunto de dados de referência.',
    {
      type: 'object',
      properties: { setId: str },
      required: ['setId'],
      additionalProperties: false,
    },
    (i, c) => ref.listValues(s(i.setId), c.requestContext),
  );
  refRead.simpleWrite(
    'create_set',
    'cria um conjunto de dados de referência.',
    createSchema,
    (i) => `Conjunto ${s((i.payload as { key?: unknown })?.key ?? '')} será criado.`,
    (i, c) => ref.createSet(payloadOf(i), c.requestContext),
  );
  refRead.simpleWrite(
    'update_set',
    'atualiza um conjunto de dados de referência.',
    updateSchema,
    (i) => `Conjunto ${s(i.id)} será atualizado.`,
    (i, c) => ref.updateSet(s(i.id), payloadOf(i), c.requestContext),
  );
  refRead.simpleWrite(
    'deactivate_set',
    'inativa um conjunto de dados de referência.',
    idSchema(),
    (i) => `Conjunto ${s(i.id)} será inativado.`,
    (i, c) => ref.deactivateSet(s(i.id), c.requestContext),
  );
  const valueSchema = (withPayload: boolean): JsonSchema => ({
    type: 'object',
    properties: { setId: str, ...(withPayload ? { payload: obj } : {}) },
    required: ['setId', ...(withPayload ? ['payload'] : [])],
    additionalProperties: false,
  });
  refRead.simpleWrite(
    'create_value',
    'cria um valor num conjunto de dados de referência.',
    valueSchema(true),
    (i) => `Valor será criado no conjunto ${s(i.setId)}.`,
    (i, c) => ref.createValue(s(i.setId), payloadOf(i), c.requestContext),
  );
  refRead.simpleWrite(
    'update_value',
    'atualiza um valor de dados de referência.',
    {
      type: 'object',
      properties: { setId: str, id: str, payload: { type: 'object', additionalProperties: true } },
      required: ['setId', 'id', 'payload'],
      additionalProperties: false,
    },
    (i) => `Valor ${s(i.id)} do conjunto ${s(i.setId)} será atualizado.`,
    (i, c) => ref.updateValue(s(i.setId), s(i.id), payloadOf(i), c.requestContext),
  );
  refRead.simpleWrite(
    'deactivate_value',
    'inativa um valor de dados de referência.',
    {
      type: 'object',
      properties: { setId: str, id: str },
      required: ['setId', 'id'],
      additionalProperties: false,
    },
    (i) => `Valor ${s(i.id)} do conjunto ${s(i.setId)} será inativado.`,
    (i, c) => ref.deactivateValue(s(i.setId), s(i.id), c.requestContext),
  );
};
