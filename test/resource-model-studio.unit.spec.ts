import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { ResourceRepository } from '../src/modules/resource/repository.js';
import { ResourceService } from '../src/modules/resource/service.js';
import { ResourceModelStudioAdapter } from '../src/modules/studio/adapters/resource-model-adapter.js';
import { StudioRepository } from '../src/modules/studio/repository.js';
import { StudioService } from '../src/modules/studio/service.js';
import type { ResourceModelSnapshot } from '../src/modules/resource/domain.js';

const context = {
  actorSub: 'user-admin',
  tenantId: 'vtal',
  roles: ['studio.admin', 'inventory.admin', 'catalog.admin'],
  traceId: 'trace-res-model',
};

const createTestServices = () => {
  const resourceRepo = new ResourceRepository();
  const eventService = {
    appendEvent: vi.fn(async () => ({ id: 'event-1', eventTime: '2026-09-04T12:00:00.000Z' })),
  };
  const resourceService = new ResourceService(resourceRepo, eventService as never);
  const studioRepo = new StudioRepository();
  const studioService = new StudioService(studioRepo, eventService as never);

  const adapter = new ResourceModelStudioAdapter(resourceService);
  studioService.registerAdapter(adapter);

  return { resourceRepo, resourceService, studioRepo, studioService, adapter };
};

test('ResourceService: reorders nodes under the same parent atomically', async () => {
  const { resourceService } = createTestServices();
  const catalog = await resourceService.createResourceCatalog(
    { code: 'cat-reorder', name: 'Catálogo Reorder' },
    context,
  );

  const nodeA = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'node-a', name: 'Nó A', kind: 'GROUP', sortOrder: 0 },
    context,
  );
  const nodeB = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'node-b', name: 'Nó B', kind: 'GROUP', sortOrder: 1 },
    context,
  );

  const reordered = await resourceService.reorderResourceCatalogNodes(
    catalog.id,
    { orderedNodeIds: [nodeB.id, nodeA.id] },
    context,
  );

  assert.equal(reordered.length, 2);
  assert.equal(reordered[0]?.id, nodeB.id);
  assert.equal(reordered[0]?.sortOrder, 0);
  assert.equal(reordered[1]?.id, nodeA.id);
  assert.equal(reordered[1]?.sortOrder, 1);
});

test('ResourceService: calculates impact of a node and its descendants', async () => {
  const { resourceService } = createTestServices();
  const catalog = await resourceService.createResourceCatalog(
    { code: 'cat-impact', name: 'Catálogo Impacto' },
    context,
  );

  const group = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'group-access', name: 'Grupo Acesso', kind: 'GROUP' },
    context,
  );

  const leaf = await resourceService.createResourceCatalogNode(
    catalog.id,
    {
      code: 'node-cto',
      name: 'Nó CTO',
      kind: 'RESOURCE_TYPE',
      parentNodeId: group.id,
    },
    context,
  );

  const impact = await resourceService.getResourceCatalogNodeImpact(catalog.id, group.id, context);
  assert.equal(impact.nodeId, group.id);
  assert.equal(impact.descendantCount, 1);
  assert.deepEqual(impact.descendantNodeIds, [leaf.id]);
  assert.ok(leaf.resourceTypeId);
  assert.equal(impact.resourceTypeIds.includes(leaf.resourceTypeId), true);
});

test('ResourceModelStudioAdapter: validates snapshot for cycles, missing codes, and invalid parents', async () => {
  const { adapter } = createTestServices();

  // Snapshot inválido: nó sem código
  const invalid1: Partial<ResourceModelSnapshot> = {
    catalog: { code: 'cat-test', name: 'Test' },
    nodes: [{ code: '', name: 'Sem Código', kind: 'GROUP' }],
  };
  const val1 = await adapter.validate(invalid1 as never);
  assert.equal(val1.valid, false);
  assert.equal(val1.issues.some((i) => i.code === 'NODE_CODE_REQUIRED'), true);

  // Snapshot inválido: ciclo entre nós
  const invalid2: Partial<ResourceModelSnapshot> = {
    catalog: { code: 'cat-test', name: 'Test' },
    nodes: [
      { code: 'g1', name: 'Grupo 1', kind: 'GROUP', parentCode: 'g2' },
      { code: 'g2', name: 'Grupo 2', kind: 'GROUP', parentCode: 'g1' },
    ],
  };
  const val2 = await adapter.validate(invalid2 as never);
  assert.equal(val2.valid, false);
  assert.equal(val2.issues.some((i) => i.code === 'NODE_CYCLE_DETECTED'), true);
});

test('ResourceModelStudioAdapter: publishes and materializes draft snapshot into canonical catalog tables', async () => {
  const { studioService, resourceService } = createTestServices();

  const types = await resourceService.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;

  const snapshot: ResourceModelSnapshot = {
    catalog: {
      code: 'catalog-studio-pub',
      name: 'Catálogo Publicado pelo Studio',
      description: 'Materializado pelo ResourceModelStudioAdapter',
    },
    nodes: [
      {
        code: 'root-gpon',
        name: 'Planta GPON',
        kind: 'GROUP',
        sortOrder: 0,
      },
      {
        code: 'sub-cto',
        name: 'Caixas CTO',
        kind: 'RESOURCE_TYPE',
        resourceTypeCode: ctoType.code,
        parentCode: 'root-gpon',
        sortOrder: 0,
      },
    ],
  };

  const draft = await studioService.saveDraft('resource-model', snapshot as never, context);
  const validation = await studioService.validateDraft('resource-model', context);
  assert.equal(validation.valid, true);

  const published = await studioService.publish('resource-model', context, draft.checksum);
  assert.equal(published.status, 'published');

  // Verifica materialização no catálogo
  const catalog = await resourceService.getResourceCatalogByCode('catalog-studio-pub', context);
  assert.ok(catalog);
  assert.equal(catalog.name, 'Catálogo Publicado pelo Studio');

  const tree = await resourceService.getResourceCatalogTree(catalog.id, context, true);
  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.code, 'root-gpon');
  assert.equal(tree[0]?.children.length, 1);
  assert.equal(tree[0]?.children[0]?.code, 'sub-cto');
  assert.equal(tree[0]?.children[0]?.kind, 'RESOURCE_TYPE');
});

test('ResourceService: snapshot source aggregates modeled types and rules in one repository call', async () => {
  const { resourceRepo, resourceService } = createTestServices();
  const catalog = await resourceService.createResourceCatalog(
    { code: 'catalog-snapshot-source', name: 'Catálogo Snapshot Source' },
    context,
  );
  await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'group-source', name: 'Grupo', kind: 'GROUP' },
    context,
  );
  const leaf = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'cdoe', name: 'CDOE', kind: 'RESOURCE_TYPE', mapPresence: true },
    context,
  );
  const inactiveLeaf = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'cdoi', name: 'CDOI', kind: 'RESOURCE_TYPE', mapPresence: true },
    context,
  );
  assert.ok(leaf.resourceTypeId);
  assert.ok(inactiveLeaf.resourceTypeId);
  await resourceService.updateResourceCatalogNode(
    catalog.id,
    inactiveLeaf.id,
    { status: 'inactive' },
    context,
  );
  const listRules = vi.spyOn(resourceRepo, 'listResourceTypeRelationshipRulesBySourceIds');

  const source = await resourceService.getResourceModelSnapshotSource(catalog.id, context);

  assert.equal(source.catalog.id, catalog.id);
  assert.equal(source.nodes.length, 2);
  assert.deepEqual(source.resourceTypes.map((type) => type.id), [leaf.resourceTypeId]);
  assert.equal(source.resourceTypes.some((type) => type.code === 'CTO'), false);
  assert.equal(listRules.mock.calls.length, 1);
  assert.deepEqual(listRules.mock.calls[0]?.[0], [leaf.resourceTypeId]);
});

test('ResourceModelStudioAdapter: unchanged snapshot skips catalog, node, type, and move writes', async () => {
  const { adapter, resourceService } = createTestServices();
  const catalog = await resourceService.createResourceCatalog(
    { code: 'catalog-noop', name: 'Catálogo No-op' },
    context,
  );
  const group = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'group-noop', name: 'Grupo', kind: 'GROUP', sortOrder: 0 },
    context,
  );
  const leaf = await resourceService.createResourceCatalogNode(
    catalog.id,
    {
      code: 'cdoe-noop',
      name: 'CDOE',
      kind: 'RESOURCE_TYPE',
      parentNodeId: group.id,
      sortOrder: 0,
      mapPresence: true,
    },
    context,
  );
  assert.ok(leaf.resourceTypeId);
  const source = await resourceService.getResourceModelSnapshotSource(catalog.id, context, true);
  const typeById = new Map(source.resourceTypes.map((type) => [type.id, type]));
  const snapshot: ResourceModelSnapshot = {
    catalog: {
      id: catalog.id,
      code: catalog.code,
      name: catalog.name,
      ...(catalog.description !== undefined ? { description: catalog.description } : {}),
    },
    nodes: source.nodes.map((node) => {
      const type = node.resourceTypeId ? typeById.get(node.resourceTypeId) : undefined;
      return {
        id: node.id,
        code: node.code,
        name: node.name,
        ...(node.description !== undefined ? { description: node.description } : {}),
        kind: node.kind,
        ...(node.resourceTypeId !== undefined ? { resourceTypeId: node.resourceTypeId } : {}),
        ...(node.resourceType?.code !== undefined
          ? { resourceTypeCode: node.resourceType.code }
          : {}),
        parentNodeId: node.parentNodeId ?? null,
        sortOrder: node.sortOrder,
        status: node.status,
        ...(node.metadata !== undefined ? { metadata: node.metadata } : {}),
        ...(type
          ? {
              resourceType: {
                name: type.name,
                ...(type.description !== undefined ? { description: type.description } : {}),
                status: type.status,
                nature: type.nature,
                mapPresence: type.mapPresence,
                ...(type.resourceTypeCharacteristic !== undefined
                  ? { resourceTypeCharacteristic: type.resourceTypeCharacteristic }
                  : {}),
              },
            }
          : {}),
        ...(node.kind === 'RESOURCE_TYPE' ? { relationshipRules: [] } : {}),
      };
    }),
  };
  const updateCatalog = vi.spyOn(resourceService, 'updateResourceCatalog');
  const updateNode = vi.spyOn(resourceService, 'updateResourceCatalogNode');
  const updateType = vi.spyOn(resourceService, 'updateResourceType');
  const moveNode = vi.spyOn(resourceService, 'moveResourceCatalogNode');

  await adapter.materialize(snapshot as never, { tenantId: context.tenantId });

  assert.equal(updateCatalog.mock.calls.length, 0);
  assert.equal(updateNode.mock.calls.length, 0);
  assert.equal(updateType.mock.calls.length, 0);
  assert.equal(moveNode.mock.calls.length, 0);
});

test('ResourceModelStudioAdapter: applies ResourceType details when materializing a new leaf', async () => {
  const { adapter, resourceService } = createTestServices();
  const existingType = (await resourceService.listResourceTypes(context)).find(
    (type) => type.code === 'CTO',
  );
  assert.ok(existingType);
  const characteristics: NonNullable<
    ResourceModelSnapshot['nodes'][number]['resourceType']
  >['resourceTypeCharacteristic'] = [
    { name: 'capacity', valueType: 'integer', value: 48 },
    { name: 'connector', valueType: 'string', value: 'SC/APC' },
  ];
  const snapshot: ResourceModelSnapshot = {
    catalog: {
      code: 'catalog-new-leaf-details',
      name: 'Catálogo Nova Folha',
    },
    nodes: [
      {
        id: 'snapshot-new-leaf',
        code: 'CDOE_NEW',
        name: 'CDOE Nova',
        description: 'Caixa modelada no Studio',
        kind: 'RESOURCE_TYPE',
        resourceTypeCode: existingType.code,
        parentNodeId: null,
        sortOrder: 0,
        status: 'active',
        resourceType: {
          name: 'CDOE Nova',
          description: 'Caixa modelada no Studio',
          status: 'active',
          nature: 'PhysicalResource',
          mapPresence: true,
          resourceTypeCharacteristic: characteristics,
        },
        relationshipRules: [],
      },
    ],
  };

  await adapter.materialize(snapshot, { tenantId: context.tenantId });

  const catalog = await resourceService.getResourceCatalogByCode(
    snapshot.catalog.code,
    context,
  );
  assert.ok(catalog);
  const nodes = await resourceService.listResourceCatalogNodes(catalog.id, context, true);
  const leaf = nodes.find((node) => node.code === 'CDOE_NEW');
  assert.ok(leaf?.resourceTypeId);
  const materializedType = (await resourceService.listResourceTypes(context)).find(
    (type) => type.id === leaf.resourceTypeId,
  );
  assert.equal(materializedType?.description, 'Caixa modelada no Studio');
  assert.equal(materializedType?.nature, 'PhysicalResource');
  assert.equal(materializedType?.mapPresence, true);
  assert.deepEqual(materializedType?.resourceTypeCharacteristic, characteristics);
});

test('ResourceModelStudioAdapter: materializes a snapshot linking parents by parentNodeId (UUID), the shape the real UI sends (issue #214)', async () => {
  // O Studio real (`ResourceModelStudio.tsx: handleCaptureAsDraft`) nunca envia `parentCode` —
  // só `id` + `parentNodeId`, ambos os UUIDs reais dos nós no momento da captura. Publicar isso
  // chegou a derrubar a hierarquia inteira (todo nó virava raiz) porque a resolução de pai só
  // sabia casar por código. Este teste reproduz exatamente essa forma de payload.
  const { studioService, resourceService } = createTestServices();

  const snapshot: ResourceModelSnapshot = {
    catalog: {
      code: 'catalog-studio-pub-by-id',
      name: 'Catálogo Publicado por parentNodeId',
    },
    nodes: [
      {
        id: 'client-uuid-root',
        code: 'root-uuid',
        name: 'Planta GPON',
        kind: 'GROUP',
        parentNodeId: null,
        sortOrder: 0,
      },
      {
        id: 'client-uuid-child',
        code: 'child-uuid',
        name: 'Subgrupo',
        kind: 'GROUP',
        parentNodeId: 'client-uuid-root',
        sortOrder: 0,
      },
      {
        id: 'client-uuid-grandchild',
        code: 'grandchild-uuid',
        name: 'Distribuição',
        kind: 'GROUP',
        parentNodeId: 'client-uuid-child',
        sortOrder: 0,
      },
    ],
  };

  const draft = await studioService.saveDraft('resource-model', snapshot as never, context);
  const validation = await studioService.validateDraft('resource-model', context);
  assert.equal(validation.valid, true);

  const published = await studioService.publish('resource-model', context, draft.checksum);
  assert.equal(published.status, 'published');

  const catalog = await resourceService.getResourceCatalogByCode('catalog-studio-pub-by-id', context);
  assert.ok(catalog);

  const tree = await resourceService.getResourceCatalogTree(catalog.id, context, true);
  assert.equal(tree.length, 1, 'apenas o nó raiz deve estar no nível 0 — os demais têm pai');
  assert.equal(tree[0]?.code, 'root-uuid');
  assert.equal(tree[0]?.children.length, 1);
  assert.equal(tree[0]?.children[0]?.code, 'child-uuid');
  assert.equal(tree[0]?.children[0]?.children.length, 1);
  assert.equal(tree[0]?.children[0]?.children[0]?.code, 'grandchild-uuid');
});

test('ResourceModelStudioAdapter: republishing without parent info preserves the existing hierarchy instead of uprooting', async () => {
  // Uma segunda publicação cujo snapshot omite `parentNodeId`/`parentCode` para um nó (ex.: um
  // consumidor externo que só atualiza nome/status) não pode silenciosamente jogar esse nó pra
  // raiz — a ausência de informação de pai não é o mesmo que "sem pai".
  const { studioService, resourceService } = createTestServices();

  const first: ResourceModelSnapshot = {
    catalog: { code: 'catalog-studio-preserve', name: 'Catálogo Preserva Hierarquia' },
    nodes: [
      { id: 'r1', code: 'root-preserve', name: 'Raiz', kind: 'GROUP', parentNodeId: null, sortOrder: 0 },
      {
        id: 'c1',
        code: 'child-preserve',
        name: 'Filho',
        kind: 'GROUP',
        parentNodeId: 'r1',
        sortOrder: 0,
      },
    ],
  };
  const draft1 = await studioService.saveDraft('resource-model', first as never, context);
  await studioService.publish('resource-model', context, draft1.checksum);

  const catalog = await resourceService.getResourceCatalogByCode('catalog-studio-preserve', context);
  assert.ok(catalog);
  const treeAfterFirst = await resourceService.getResourceCatalogTree(catalog.id, context, true);
  assert.equal(treeAfterFirst[0]?.children[0]?.code, 'child-preserve');

  // Segunda publicação: mesmo catálogo, nó `child-preserve` sem NENHUMA chave de pai.
  const second: ResourceModelSnapshot = {
    catalog: { code: 'catalog-studio-preserve', name: 'Catálogo Preserva Hierarquia' },
    nodes: [
      { code: 'root-preserve', name: 'Raiz', kind: 'GROUP', sortOrder: 0 } as never,
      { code: 'child-preserve', name: 'Filho Renomeado', kind: 'GROUP', sortOrder: 0 } as never,
    ],
  };
  const draft2 = await studioService.saveDraft('resource-model', second as never, context);
  await studioService.publish('resource-model', context, draft2.checksum);

  const treeAfterSecond = await resourceService.getResourceCatalogTree(catalog.id, context, true);
  assert.equal(treeAfterSecond.length, 1, 'child-preserve não deve ter migrado para a raiz');
  assert.equal(treeAfterSecond[0]?.children[0]?.code, 'child-preserve');
  assert.equal(treeAfterSecond[0]?.children[0]?.name, 'Filho Renomeado');
});

test('StudioService.discardDraft: restores the domain to the baseline captured when the draft was opened (revert real do "Cancelar")', async () => {
  // Reproduz o fluxo real: cada mutação do Studio grava imediatamente nas tabelas canônicas
  // (sem draft em memória). O "Editar" captura o estado vivo como `baselineSnapshot`; editar
  // à vontade e depois "Cancelar" deve devolver exatamente esse estado — não apenas descartar a
  // linha de governança.
  const { studioService, resourceService } = createTestServices();

  const catalog = await resourceService.createResourceCatalog(
    { code: 'catalog-revert', name: 'Catálogo Revert' },
    context,
  );
  const root = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'root-revert', name: 'Raiz', kind: 'GROUP', sortOrder: 0 },
    context,
  );
  const groupA = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'group-a', name: 'Grupo A', kind: 'GROUP', parentNodeId: root.id, sortOrder: 0 },
    context,
  );
  const groupB = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'group-b', name: 'Grupo B', kind: 'GROUP', parentNodeId: root.id, sortOrder: 1 },
    context,
  );
  const movable = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'node-movable', name: 'Nó Móvel', kind: 'GROUP', parentNodeId: groupA.id, sortOrder: 0 },
    context,
  );
  const toInactivate = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'node-to-inactivate', name: 'Nó a Inativar', kind: 'GROUP', parentNodeId: groupB.id, sortOrder: 0 },
    context,
  );

  // "Editar": captura a baseline do estado vivo atual (o que `ResourceModelStudio.buildSnapshot`
  // faria).
  const allNodes = await resourceService.listResourceCatalogNodes(catalog.id, context, true);
  const baseline = {
    catalog: { id: catalog.id, code: catalog.code, name: catalog.name, description: catalog.description },
    nodes: allNodes.map((n) => ({
      id: n.id,
      code: n.code,
      name: n.name,
      description: n.description,
      kind: n.kind,
      resourceTypeId: n.resourceTypeId,
      resourceTypeCode: n.resourceType?.code,
      parentNodeId: n.parentNodeId ?? null,
      sortOrder: n.sortOrder,
      status: n.status,
      metadata: n.metadata,
    })),
  };
  const draft = await studioService.saveDraft('resource-model', baseline as never, context);

  // Diverge o catálogo enquanto o draft está aberto: cria, renomeia, move e inativa nós.
  const createdDuringEdit = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'node-created-during-edit', name: 'Nó Novo', kind: 'GROUP', parentNodeId: root.id, sortOrder: 2 },
    context,
  );
  await resourceService.updateResourceCatalogNode(
    catalog.id,
    groupA.id,
    { code: 'group-a-renamed', name: 'Grupo A Renomeado' },
    context,
  );
  await resourceService.moveResourceCatalogNode(
    catalog.id,
    movable.id,
    { parentNodeId: groupB.id, sortOrder: 1 },
    context,
  );
  await resourceService.deleteResourceCatalogNode(catalog.id, toInactivate.id, context);

  // "Cancelar": descarta o draft — e deve restaurar o estado capturado na baseline.
  await studioService.discardDraft('resource-model', context, draft.checksum);

  const restoredNodes = await resourceService.listResourceCatalogNodes(catalog.id, context, true);
  const byId = new Map(restoredNodes.map((n) => [n.id, n]));

  // Renomeado durante a edição -> volta ao nome/código original.
  assert.equal(byId.get(groupA.id)?.code, 'group-a');
  assert.equal(byId.get(groupA.id)?.name, 'Grupo A');

  // Movido durante a edição -> volta ao pai original.
  assert.equal(byId.get(movable.id)?.parentNodeId, groupA.id);

  // Inativado durante a edição -> reativado.
  assert.equal(byId.get(toInactivate.id)?.status, 'active');

  // Criado durante a edição, ausente da baseline -> inativado (poda), não apagado (C6).
  assert.equal(byId.get(createdDuringEdit.id)?.status, 'inactive');
});

test('StudioService.discardDraft: reactivates an inactive ResourceType from the baseline', async () => {
  const { studioService, resourceService } = createTestServices();
  const catalog = await resourceService.createResourceCatalog(
    { code: 'catalog-revert-type', name: 'Catálogo Reverte Tipo' },
    context,
  );
  const leaf = await resourceService.createResourceCatalogNode(
    catalog.id,
    { code: 'type-revert', name: 'Tipo Reverte', kind: 'RESOURCE_TYPE', sortOrder: 0 },
    context,
  );
  assert.ok(leaf.resourceTypeId);

  const baseline = {
    catalog: { id: catalog.id, code: catalog.code, name: catalog.name },
    nodes: [
      {
        id: leaf.id,
        code: leaf.code,
        name: leaf.name,
        kind: leaf.kind,
        resourceTypeId: leaf.resourceTypeId,
        parentNodeId: null,
        sortOrder: leaf.sortOrder,
        status: 'active',
        resourceType: { status: 'active' },
      },
    ],
  };
  const draft = await studioService.saveDraft('resource-model', baseline as never, context);

  await resourceService.updateResourceCatalogNode(catalog.id, leaf.id, { status: 'inactive' }, context);

  await studioService.discardDraft('resource-model', context, draft.checksum);

  const restoredType = (await resourceService.listResourceTypes(context)).find(
    (type) => type.id === leaf.resourceTypeId,
  );
  assert.equal(restoredType?.status, 'active');
});

test('ResourceService.updateResourceType: persists resourceTypeCharacteristic (issue #216)', async () => {
  const { resourceService } = createTestServices();
  const types = await resourceService.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;

  const updated = await resourceService.updateResourceType(
    ctoType.id,
    {
      resourceTypeCharacteristic: [
        { name: 'portCount', value: 16, valueType: 'integer' },
        { name: 'connectorType', value: 'SC/APC', valueType: 'string' },
      ],
    },
    context,
  );

  assert.equal(updated.resourceTypeCharacteristic?.length, 2);
  assert.equal(updated.resourceTypeCharacteristic?.[0]?.name, 'portCount');

  // Persistido de fato — releitura via listResourceTypes reflete o novo estado.
  const reloaded = (await resourceService.listResourceTypes(context)).find((t) => t.id === ctoType.id);
  assert.equal(reloaded?.resourceTypeCharacteristic?.length, 2);
});

test('ResourceService.updateResourceType: rejects forbidden characteristic names (manufacturer/networkType)', async () => {
  const { resourceService } = createTestServices();
  const types = await resourceService.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;

  await assert.rejects(
    resourceService.updateResourceType(
      ctoType.id,
      { resourceTypeCharacteristic: [{ name: 'manufacturer', value: 'Acme' }] },
      context,
    ),
  );
});
