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

  const types = await resourceService.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;

  const leaf = await resourceService.createResourceCatalogNode(
    catalog.id,
    {
      code: 'node-cto',
      name: 'Nó CTO',
      kind: 'RESOURCE_TYPE',
      resourceTypeId: ctoType.id,
      parentNodeId: group.id,
    },
    context,
  );

  const impact = await resourceService.getResourceCatalogNodeImpact(catalog.id, group.id, context);
  assert.equal(impact.nodeId, group.id);
  assert.equal(impact.descendantCount, 1);
  assert.deepEqual(impact.descendantNodeIds, [leaf.id]);
  assert.equal(impact.resourceTypeIds.includes(ctoType.id), true);
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
