// Operações de Service Inventory/Catalog via MCP. Espelham os gates de routeServiceRequest:
// specification/category/candidate são catálogo (catalog.admin, C9); instância e relações de
// serviço seguem inventory.editor.

import {
  CATALOG_ADMIN_ROLES,
  INVENTORY_READ_ROLES,
  INVENTORY_WRITE_ROLES,
} from '../../../shared/http/roles.js';
import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import type { McpToolRegistry } from '../module.js';
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

export const registerServiceOperations = (
  registry: McpToolRegistry,
  runtime: NexusRuntime,
): void => {
  const svc = runtime.serviceService;
  const { read, simpleWrite } = createOperationHelpers(registry, 'service', {
    read: INVENTORY_READ_ROLES,
    write: INVENTORY_WRITE_ROLES,
  });
  const nameOf = (i: Record<string, unknown>) => s((i.payload as { name?: unknown })?.name ?? '');
  const admin = (
    operation: string,
    description: string,
    schema: Parameters<typeof simpleWrite>[2],
    summarize: Parameters<typeof simpleWrite>[3],
    run: Parameters<typeof simpleWrite>[4],
  ) => simpleWrite(operation, description, schema, summarize, run, CATALOG_ADMIN_ROLES);

  // ── Leitura ──────────────────────────────────────────────────────────────────────────────────
  read('count_services', 'Conta serviços por filtro (estado, tipo, tenant).', querySchema, (i, c) =>
    svc.countServices(i as never, c.requestContext),
  );
  read('list_service_relationships', 'Relações de um serviço com outros.', idSchema(), (i, c) =>
    svc.listServiceRelationships(s(i.id), c.requestContext),
  );
  read('list_service_specifications', 'Lista Service Specifications.', querySchema, (i, c) =>
    svc.listServiceSpecifications(i as never, c.requestContext),
  );
  read('get_service_specification', 'Obtém uma Service Specification.', idSchema(), (i, c) =>
    svc.getServiceSpecification(s(i.id), c.requestContext),
  );
  read('list_service_categories', 'Lista Service Categories.', querySchema, (i, c) =>
    svc.listServiceCategories(i as never, c.requestContext),
  );
  read('get_service_category', 'Obtém uma Service Category.', idSchema(), (i, c) =>
    svc.getServiceCategory(s(i.id), c.requestContext),
  );
  read('list_service_candidates', 'Lista Service Candidates.', querySchema, (i, c) =>
    svc.listServiceCandidates(i as never, c.requestContext),
  );
  read('get_service_candidate', 'Obtém um Service Candidate.', idSchema(), (i, c) =>
    svc.getServiceCandidate(s(i.id), c.requestContext),
  );

  // ── Instância (inventory.editor) ─────────────────────────────────────────────────────────────
  simpleWrite(
    'update_service',
    'atualiza um serviço (CFS ou RFS).',
    updateSchema,
    (i) => `Serviço ${s(i.id)} será atualizado.`,
    (i, c) => svc.updateService(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'terminate_service',
    'encerra um serviço (soft-terminate, C6).',
    idSchema(),
    (i) => `Serviço ${s(i.id)} será encerrado.`,
    (i, c) => svc.deleteService(s(i.id), c.requestContext),
  );
  simpleWrite(
    'add_service_relationship',
    'cria uma relação entre serviços (ex.: CFS -> RFS).',
    idSchema({ relationship: obj }, ['relationship']),
    (i) => `Relação será criada a partir do serviço ${s(i.id)}.`,
    (i, c) => svc.addServiceRelationship(s(i.id), i.relationship as never, c.requestContext),
  );
  simpleWrite(
    'remove_service_relationship',
    'remove uma relação entre serviços.',
    idSchema({ relatedServiceId: str, relationshipType: str }, [
      'relatedServiceId',
      'relationshipType',
    ]),
    (i) =>
      `Relação ${s(i.relationshipType)} entre ${s(i.id)} e ${s(i.relatedServiceId)} será removida.`,
    (i, c) =>
      svc.removeServiceRelationship(
        s(i.id),
        s(i.relatedServiceId),
        s(i.relationshipType),
        c.requestContext,
      ),
  );

  // ── Catálogo (catalog.admin) ─────────────────────────────────────────────────────────────────
  admin(
    'create_service_specification',
    'cria uma Service Specification.',
    createSchema,
    (i) => `Service Specification ${nameOf(i)} será criada.`,
    (i, c) => svc.createServiceSpecification(payloadOf(i), c.requestContext),
  );
  admin(
    'update_service_specification',
    'atualiza uma Service Specification.',
    updateSchema,
    (i) => `Service Specification ${s(i.id)} será atualizada.`,
    (i, c) => svc.updateServiceSpecification(s(i.id), payloadOf(i), c.requestContext),
  );
  admin(
    'delete_service_specification',
    'remove uma Service Specification.',
    idSchema(),
    (i) => `Service Specification ${s(i.id)} será removida.`,
    (i, c) => svc.deleteServiceSpecification(s(i.id), c.requestContext),
  );
  admin(
    'bulk_create_service_specifications',
    'cria várias Service Specifications; cada item é { line, input }. Falhas por item não abortam o lote.',
    {
      type: 'object',
      properties: { items: { type: 'array', items: obj } },
      required: ['items'],
      additionalProperties: false,
    },
    (i) =>
      `${Array.isArray(i.items) ? i.items.length : 0} Service Specifications serão criadas em lote.`,
    (i, c) => svc.bulkCreateServiceSpecifications(i.items as never, c.requestContext),
  );
  admin(
    'create_service_category',
    'cria uma Service Category.',
    createSchema,
    (i) => `Service Category ${nameOf(i)} será criada.`,
    (i, c) => svc.createServiceCategory(payloadOf(i), c.requestContext),
  );
  admin(
    'update_service_category',
    'atualiza uma Service Category.',
    updateSchema,
    (i) => `Service Category ${s(i.id)} será atualizada.`,
    (i, c) => svc.updateServiceCategory(s(i.id), payloadOf(i), c.requestContext),
  );
  admin(
    'delete_service_category',
    'remove uma Service Category.',
    idSchema(),
    (i) => `Service Category ${s(i.id)} será removida.`,
    (i, c) => svc.deleteServiceCategory(s(i.id), c.requestContext),
  );
  admin(
    'create_service_candidate',
    'cria um Service Candidate.',
    createSchema,
    (i) => `Service Candidate ${nameOf(i)} será criado.`,
    (i, c) => svc.createServiceCandidate(payloadOf(i), c.requestContext),
  );
  admin(
    'update_service_candidate',
    'atualiza um Service Candidate.',
    updateSchema,
    (i) => `Service Candidate ${s(i.id)} será atualizado.`,
    (i, c) => svc.updateServiceCandidate(s(i.id), payloadOf(i), c.requestContext),
  );
  admin(
    'delete_service_candidate',
    'remove um Service Candidate.',
    idSchema(),
    (i) => `Service Candidate ${s(i.id)} será removido.`,
    (i, c) => svc.deleteServiceCandidate(s(i.id), c.requestContext),
  );
};
