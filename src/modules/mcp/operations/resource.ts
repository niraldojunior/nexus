import { AppError } from '../../../shared/errors/app-error.js';
// Operações de Resource, Planta Interna e Resource Catalog expostas via MCP. Delegam aos services
// com o RequestContext do ator; catálogo (tipos, regras, nós, specs) exige catalog.admin como as
// rotas HTTP (C9). Nomes já registrados em module.ts não são repetidos aqui.

import {
  CATALOG_ADMIN_ROLES,
  INVENTORY_READ_ROLES,
  INVENTORY_WRITE_ROLES,
} from '../../../shared/http/roles.js';
import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import type { McpToolRegistry } from '../module.js';
import type { JsonSchema } from '../schema.js';
import {
  bool,
  createOperationHelpers,
  createSchema,
  idSchema,
  listPaging,
  num,
  obj,
  opt,
  payloadOf,
  s,
  str,
  updateSchema,
} from './helpers.js';

const catalogNodeSchema = (extra: Record<string, JsonSchema> = {}): JsonSchema => ({
  type: 'object',
  properties: { catalogId: str, nodeId: str, ...extra },
  required: ['catalogId', 'nodeId'],
  additionalProperties: false,
});

export const registerResourceOperations = (
  registry: McpToolRegistry,
  runtime: NexusRuntime,
): void => {
  const svc = runtime.resourceService;
  const plant = runtime.internalPlantService;
  const { read, simpleWrite } = createOperationHelpers(registry, 'resource', {
    read: INVENTORY_READ_ROLES,
    write: INVENTORY_WRITE_ROLES,
  });
  const catalogRead = (
    operation: string,
    description: string,
    schema: Parameters<typeof read>[2],
    run: Parameters<typeof read>[3],
  ) => read(operation, description, schema, run);
  const catalogWrite = (
    operation: string,
    description: string,
    schema: Parameters<typeof simpleWrite>[2],
    summarize: Parameters<typeof simpleWrite>[3],
    run: Parameters<typeof simpleWrite>[4],
  ) => simpleWrite(operation, description, schema, summarize, run, CATALOG_ADMIN_ROLES);

  // ── Recursos: detalhe, vistas e auditoria ────────────────────────────────────────────────────
  read(
    'get_resource_detail',
    'Detalhe de um recurso físico (relações, local, projeto).',
    idSchema(),
    (i, c) => svc.getPhysicalResourceDetail(s(i.id), c.requestContext),
  );
  read(
    'get_resource_ports_view',
    'Portas de uma CTO/CDO e seu estado de uso.',
    idSchema(),
    (i, c) => svc.getResourcePortsView(s(i.id), c.requestContext),
  );
  read(
    'get_resource_port_detail',
    'Detalhe de uma porta (conexões e serviço atendido).',
    idSchema(),
    (i, c) => svc.getResourcePortDetail(s(i.id), c.requestContext),
  );
  read('get_resource_connections', 'Conexões de um recurso.', idSchema(), (i, c) =>
    svc.getResourceConnectionsView(s(i.id), c.requestContext),
  );
  read(
    'get_resource_components',
    'Componentes contidos em um recurso (árvore interna).',
    idSchema({ maxDepth: num }),
    (i, c) =>
      svc.getResourceComponentsView(
        s(i.id),
        opt(i, ['maxDepth']) as { maxDepth?: number },
        c.requestContext,
      ),
  );
  read(
    'list_resource_audit',
    'Trilha de auditoria de um recurso.',
    idSchema({ limit: num }),
    (i, c) =>
      svc.listResourceAudit(
        s(i.id),
        c.requestContext,
        i.limit === undefined ? undefined : Number(i.limit),
      ),
  );
  read('list_resource_relationships', 'Relações de um recurso com outros.', idSchema(), (i, c) =>
    svc.listResourceRelationships(s(i.id), c.requestContext),
  );
  read(
    'get_resource_editor_snapshot',
    'Agregado de edição de um recurso (Planta Interna).',
    idSchema(),
    (i, c) => svc.getResourceEditorSnapshot(s(i.id), c.requestContext),
  );
  read(
    'list_resource_status_catalog',
    'Catálogo de status de recurso, opcionalmente por tipo.',
    {
      type: 'object',
      properties: { resourceTypeId: str },
      additionalProperties: false,
    },
    (i, c) =>
      svc.listResourceStatusCatalog(
        i.resourceTypeId ? s(i.resourceTypeId) : undefined,
        c.requestContext,
      ),
  );

  // ── Planta Interna ───────────────────────────────────────────────────────────────────────────
  read(
    'internal_plant_roots',
    'Raízes da árvore de locais da Planta Interna.',
    {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    (_i, c) => plant.roots(c.requestContext),
  );
  read(
    'internal_plant_children',
    'Filhos de um nó da árvore de locais da Planta Interna.',
    idSchema(listPaging),
    (i, c) => plant.children(s(i.id), opt(i, ['limit', 'offset']) as never, c.requestContext),
  );
  read(
    'internal_plant_site_context',
    'Contexto de um local na Planta Interna.',
    idSchema(),
    (i, c) => plant.getSiteContext(s(i.id), c.requestContext),
  );
  read(
    'internal_plant_search_sites',
    'Busca locais na Planta Interna.',
    {
      type: 'object',
      properties: { q: str, ...listPaging },
      additionalProperties: false,
    },
    (i, c) => plant.searchSites(opt(i, ['q', 'limit', 'offset']) as never, c.requestContext),
  );
  read(
    'internal_plant_list_resources',
    'Lista recursos da Planta Interna por texto, local ou tipo.',
    {
      type: 'object',
      properties: {
        q: str,
        siteId: str,
        resourceTypeIdIn: { type: 'array', items: str },
        ...listPaging,
      },
      additionalProperties: false,
    },
    (i, c) =>
      plant.listResources(
        opt(i, ['q', 'siteId', 'resourceTypeIdIn', 'limit', 'offset']) as never,
        c.requestContext,
      ),
  );

  // ── Recursos: escrita ────────────────────────────────────────────────────────────────────────
  simpleWrite(
    'save_resource_aggregate',
    'grava um recurso com componentes, relações e vínculos de local numa só operação (editor da Planta Interna).',
    createSchema,
    (i) =>
      `Recurso ${s((i.payload as { name?: unknown })?.name ?? '')} será salvo com seus componentes.`,
    (i, c) => svc.saveResourceAggregate(payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'add_resource_relationship',
    'cria uma relação entre dois recursos (ex.: containsAsChild).',
    updateSchema,
    (i) => `Relação será criada a partir do recurso ${s(i.id)}.`,
    (i, c) => svc.addResourceRelationship(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'remove_resource_relationship',
    'remove uma relação entre dois recursos.',
    idSchema({ relatedResourceId: str, relationshipType: str }, [
      'relatedResourceId',
      'relationshipType',
    ]),
    (i) =>
      `Relação ${s(i.relationshipType)} entre ${s(i.id)} e ${s(i.relatedResourceId)} será removida.`,
    (i, c) =>
      svc.removeResourceRelationship(
        s(i.id),
        s(i.relatedResourceId),
        s(i.relationshipType),
        c.requestContext,
      ),
  );
  simpleWrite(
    'update_logical_resource',
    'atualiza um recurso lógico.',
    updateSchema,
    (i) => `Recurso lógico ${s(i.id)} será atualizado.`,
    (i, c) => svc.updateLogicalResource(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'terminate_resource',
    'encerra um recurso e seus contidos (soft-delete, C6).',
    idSchema(),
    (i) => `Recurso ${s(i.id)} e seus contidos serão encerrados.`,
    (i, c) => svc.terminateResourceCascade(s(i.id), c.requestContext),
  );

  // ── Resource Catalog: leitura ────────────────────────────────────────────────────────────────
  catalogRead(
    'list_resource_catalogs',
    'Lista os catálogos de recurso.',
    {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
    (i, c) => svc.listResourceCatalogs(i as never, c.requestContext),
  );
  catalogRead('get_resource_catalog', 'Obtém um catálogo de recurso.', idSchema(), (i, c) =>
    svc.getResourceCatalog(s(i.id), c.requestContext),
  );
  catalogRead(
    'get_resource_catalog_tree',
    'Árvore de nós de um catálogo de recurso.',
    idSchema({ includeInactive: bool }),
    (i, c) => svc.getResourceCatalogTree(s(i.id), c.requestContext, i.includeInactive === true),
  );
  catalogRead(
    'list_resource_catalog_nodes',
    'Nós de um catálogo (lista plana).',
    idSchema({ includeInactive: bool }),
    (i, c) => svc.listResourceCatalogNodes(s(i.id), c.requestContext, i.includeInactive === true),
  );
  catalogRead(
    'get_resource_catalog_node',
    'Obtém um nó de catálogo.',
    catalogNodeSchema(),
    (i, c) => svc.getResourceCatalogNode(s(i.catalogId), s(i.nodeId), c.requestContext),
  );
  catalogRead(
    'get_resource_catalog_node_path',
    'Caminho de um nó até a raiz do catálogo.',
    catalogNodeSchema(),
    (i, c) => svc.getResourceCatalogNodePath(s(i.catalogId), s(i.nodeId), c.requestContext),
  );
  catalogRead(
    'get_resource_catalog_node_impact',
    'Impacto de alterar ou remover um nó.',
    catalogNodeSchema(),
    (i, c) => svc.getResourceCatalogNodeImpact(s(i.catalogId), s(i.nodeId), c.requestContext),
  );
  catalogRead(
    'get_resource_model_snapshot_source',
    'Fonte do snapshot do modelo de recurso (Studio).',
    idSchema({ includeInactive: bool }),
    (i, c) =>
      svc.getResourceModelSnapshotSource(s(i.id), c.requestContext, i.includeInactive === true),
  );
  catalogRead(
    'get_resource_type_catalog_context',
    'Onde um tipo de recurso aparece no catálogo.',
    idSchema({ includeEndedSpecifications: bool, includeInactivePaths: bool }),
    (i, c) =>
      svc.getResourceTypeCatalogContext(
        s(i.id),
        c.requestContext,
        i.includeEndedSpecifications === true,
        i.includeInactivePaths === true,
      ),
  );
  catalogRead(
    'preview_resource_catalog_ai_optimization',
    'Pré-visualiza a otimização do catálogo por IA (não grava).',
    idSchema(),
    (i, c) => svc.previewResourceCatalogAiOptimization(s(i.id), c.requestContext),
  );
  catalogRead(
    'list_resource_relationship_types',
    'Tipos de relação entre recursos.',
    {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    (_i, c) => svc.listResourceRelationshipTypes(c.requestContext),
  );
  catalogRead(
    'list_resource_type_relationship_rules',
    'Regras de relação de um tipo de recurso.',
    idSchema({ includeRetired: bool }),
    (i, c) =>
      svc.listResourceTypeRelationshipRules(s(i.id), c.requestContext, i.includeRetired === true),
  );
  catalogRead(
    'list_resource_function_specifications',
    'Specifications de função de recurso.',
    {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
    (i, c) => svc.listResourceFunctionSpecifications(i as never, c.requestContext),
  );
  catalogRead(
    'get_resource_function_specification',
    'Obtém uma Resource Function Specification.',
    idSchema(),
    (i, c) => svc.getResourceFunctionSpecification(s(i.id), c.requestContext),
  );

  catalogWrite(
    'bulk_create_resource_specifications',
    'cria várias Resource Specifications (até 2000); cada item é { line, input }. Falhas por item não abortam o lote.',
    {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
      required: ['items'],
      additionalProperties: false,
    },
    (i) =>
      `${Array.isArray(i.items) ? i.items.length : 0} Resource Specifications serão criadas em lote.`,
    (i, c) => {
      const items = Array.isArray(i.items) ? i.items : [];
      if (items.length === 0 || items.length > 2000) {
        throw new AppError('items must have between 1 and 2000 entries', {
          code: 'INVALID_BULK_IMPORT_PAYLOAD',
          statusCode: 400,
        });
      }
      return svc.bulkCreateResourceSpecifications(items as never, c.requestContext);
    },
  );
  // ── Resource Catalog: escrita (catalog.admin) ────────────────────────────────────────────────
  catalogWrite(
    'create_resource_catalog',
    'cria um catálogo de recurso.',
    createSchema,
    (i) => `Catálogo ${s((i.payload as { name?: unknown })?.name ?? '')} será criado.`,
    (i, c) => svc.createResourceCatalog(payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'update_resource_catalog',
    'atualiza um catálogo de recurso.',
    updateSchema,
    (i) => `Catálogo ${s(i.id)} será atualizado.`,
    (i, c) => svc.updateResourceCatalog(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'delete_resource_catalog',
    'remove um catálogo de recurso.',
    idSchema(),
    (i) => `Catálogo ${s(i.id)} será removido.`,
    (i, c) => svc.deleteResourceCatalog(s(i.id), c.requestContext),
  );
  catalogWrite(
    'create_resource_catalog_node',
    'cria um nó no catálogo.',
    idSchema({ payload: obj }, ['payload']),
    (i) =>
      `Nó ${s((i.payload as { name?: unknown })?.name ?? '')} será criado no catálogo ${s(i.id)}.`,
    (i, c) => svc.createResourceCatalogNode(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'update_resource_catalog_node',
    'atualiza um nó de catálogo.',
    catalogNodeSchema({ payload: obj }),
    (i) => `Nó ${s(i.nodeId)} será atualizado.`,
    (i, c) =>
      svc.updateResourceCatalogNode(s(i.catalogId), s(i.nodeId), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'move_resource_catalog_node',
    'move um nó para outro pai.',
    catalogNodeSchema({ payload: obj }),
    (i) => `Nó ${s(i.nodeId)} será movido.`,
    (i, c) =>
      svc.moveResourceCatalogNode(s(i.catalogId), s(i.nodeId), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'reorder_resource_catalog_nodes',
    'reordena nós irmãos de um catálogo.',
    idSchema({ payload: obj }, ['payload']),
    (i) => `Os nós do catálogo ${s(i.id)} serão reordenados.`,
    (i, c) => svc.reorderResourceCatalogNodes(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'delete_resource_catalog_node',
    'remove um nó do catálogo.',
    catalogNodeSchema(),
    (i) => `Nó ${s(i.nodeId)} será removido.`,
    (i, c) => svc.deleteResourceCatalogNode(s(i.catalogId), s(i.nodeId), c.requestContext),
  );
  catalogWrite(
    'apply_resource_catalog_ai_proposal',
    'aplica uma proposta de otimização do catálogo por IA.',
    idSchema({ payload: obj }, ['payload']),
    (i) => `A proposta de otimização será aplicada ao catálogo ${s(i.id)}.`,
    (i, c) => svc.applyResourceCatalogAiProposal(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'update_resource_type',
    'atualiza um Resource Type.',
    updateSchema,
    (i) => `Resource Type ${s(i.id)} será atualizado.`,
    (i, c) => svc.updateResourceType(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'update_resource_specification',
    'atualiza uma Resource Specification.',
    updateSchema,
    (i) => `Resource Specification ${s(i.id)} será atualizada.`,
    (i, c) => svc.updateResourceSpecification(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'delete_resource_specification',
    'remove uma Resource Specification.',
    idSchema(),
    (i) => `Resource Specification ${s(i.id)} será removida.`,
    (i, c) => svc.deleteResourceSpecification(s(i.id), c.requestContext),
  );
  catalogWrite(
    'create_resource_relationship_type',
    'cria um tipo de relação entre recursos.',
    createSchema,
    (i) => `Tipo de relação ${s((i.payload as { code?: unknown })?.code ?? '')} será criado.`,
    (i, c) => svc.createResourceRelationshipType(payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'update_resource_relationship_type',
    'atualiza um tipo de relação entre recursos (id = código).',
    updateSchema,
    (i) => `Tipo de relação ${s(i.id)} será atualizado.`,
    (i, c) => svc.updateResourceRelationshipType(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'retire_resource_relationship_type',
    'aposenta um tipo de relação entre recursos (id = código).',
    idSchema(),
    (i) => `Tipo de relação ${s(i.id)} será aposentado.`,
    (i, c) => svc.retireResourceRelationshipType(s(i.id), c.requestContext),
  );
  catalogWrite(
    'create_resource_type_relationship_rule',
    'cria uma regra de relação para um Resource Type.',
    idSchema({ payload: obj }, ['payload']),
    (i) => `Regra de relação será criada para o tipo ${s(i.id)}.`,
    (i, c) => svc.createResourceTypeRelationshipRule(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'update_resource_type_relationship_rule',
    'atualiza uma regra de relação de um Resource Type.',
    idSchema({ ruleId: str, payload: obj }, ['ruleId', 'payload']),
    (i) => `Regra ${s(i.ruleId)} do tipo ${s(i.id)} será atualizada.`,
    (i, c) =>
      svc.updateResourceTypeRelationshipRule(s(i.id), s(i.ruleId), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'create_resource_function_specification',
    'cria uma Resource Function Specification.',
    createSchema,
    (i) =>
      `Function Specification ${s((i.payload as { name?: unknown })?.name ?? '')} será criada.`,
    (i, c) => svc.createResourceFunctionSpecification(payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'update_resource_function_specification',
    'atualiza uma Resource Function Specification.',
    updateSchema,
    (i) => `Function Specification ${s(i.id)} será atualizada.`,
    (i, c) => svc.updateResourceFunctionSpecification(s(i.id), payloadOf(i), c.requestContext),
  );
  catalogWrite(
    'delete_resource_function_specification',
    'remove uma Resource Function Specification.',
    idSchema(),
    (i) => `Function Specification ${s(i.id)} será removida.`,
    (i, c) => svc.deleteResourceFunctionSpecification(s(i.id), c.requestContext),
  );
};
