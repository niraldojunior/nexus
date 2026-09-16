import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceModelStudio } from './ResourceModelStudio';
import * as resourceCatalogApi from '../../../services/resourceCatalogApi';
import type { ResourceCatalog, ResourceCatalogTreeNode } from '../../../services/resourceCatalogApi';

vi.mock('../../../services/resourceCatalogApi', () => ({
  listResourceCatalogs: vi.fn(),
  createResourceCatalog: vi.fn(),
  getResourceCatalogTree: vi.fn(),
  createResourceCatalogNode: vi.fn(),
  updateResourceCatalogNode: vi.fn(),
  deleteResourceCatalogNode: vi.fn(),
  moveResourceCatalogNode: vi.fn(),
  reorderResourceCatalogNodes: vi.fn(),
  listResourceCatalogNodes: vi.fn(),
  getResourceCatalogNodeImpact: vi.fn().mockResolvedValue({
    nodeId: 'leaf-1',
    descendantCount: 0,
    activeDescendantCount: 0,
    descendantNodeIds: [],
    resourceTypeIds: ['rt-1'],
    specificationCount: 0,
    activePhysicalResourceCount: 0,
    activeLogicalResourceCount: 0,
  }),
  getResourceCatalogNodePath: vi.fn().mockResolvedValue({
    nodes: [{ id: 'grp-1', name: 'Acesso', code: 'grp-access', kind: 'GROUP' }],
  }),
}));

vi.mock('../../../services/resourceApi', () => ({
  listResourceTypes: vi.fn().mockResolvedValue([]),
  listResourceTypeRelationshipRules: vi.fn().mockResolvedValue([]),
  listResourceSpecifications: vi.fn().mockResolvedValue([]),
  getResourceTypeCatalogContext: vi.fn().mockResolvedValue({
    resourceType: { id: 'rt-1', code: 'OLT', name: 'OLT', status: 'active' },
    catalogPaths: [],
    specifications: [],
  }),
}));

vi.mock('../../../services/studioApi', () => ({
  getStudioStatus: vi.fn().mockResolvedValue({
    workspace: { domain: 'resource-model' },
    draftVersion: undefined,
  }),
  saveStudioDraft: vi.fn().mockResolvedValue({}),
}));

const mockCatalog: ResourceCatalog = {
  '@type': 'ResourceCatalog',
  id: 'cat-1',
  href: '/v1/resource-catalogs/cat-1',
  code: 'main-catalog',
  name: 'Catálogo de Recursos',
  status: 'active',
  isDefault: true,
  tenantId: 'vtal',
  sortOrder: 0,
};

const mockTree: ResourceCatalogTreeNode[] = [
  {
    '@type': 'ResourceCatalogNode',
    id: 'grp-1',
    href: '/v1/resource-catalogs/cat-1/nodes/grp-1',
    catalogId: 'cat-1',
    code: 'grp-access',
    name: 'Acesso',
    kind: 'GROUP',
    status: 'active',
    sortOrder: 1,
    tenantId: 'vtal',
    children: [
      {
        '@type': 'ResourceCatalogNode',
        id: 'leaf-1',
        href: '/v1/resource-catalogs/cat-1/nodes/leaf-1',
        catalogId: 'cat-1',
        code: 'leaf-olt',
        name: 'OLT',
        kind: 'RESOURCE_TYPE',
        resourceTypeId: 'rt-1',
        status: 'active',
        parentNodeId: 'grp-1',
        sortOrder: 1,
        tenantId: 'vtal',
        children: [],
      },
    ],
  },
];

describe('ResourceModelStudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resourceCatalogApi.listResourceCatalogs).mockResolvedValue([mockCatalog]);
    vi.mocked(resourceCatalogApi.getResourceCatalogTree).mockResolvedValue(mockTree);
    vi.mocked(resourceCatalogApi.listResourceCatalogNodes).mockResolvedValue([
      mockTree[0]!,
      mockTree[0]!.children[0]!,
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders hierarchy header and tree nodes in consultation mode', async () => {
    render(<ResourceModelStudio canEdit={false} canAdmin={false} isEditing={false} />);

    await waitFor(() => {
      expect(screen.getByText('Hierarquia')).toBeInTheDocument();
      expect(screen.getByText('Acesso')).toBeInTheDocument();
    });
  });

  it('selects and deselects a node on second click', async () => {
    const user = userEvent.setup();
    render(<ResourceModelStudio canEdit={true} canAdmin={true} isEditing={false} />);

    await waitFor(() => {
      expect(screen.getByText('Acesso')).toBeInTheDocument();
    });

    // Clica no nó para selecionar (seleciona o grupo Acesso)
    await user.click(screen.getByText('Acesso'));

    await waitFor(() => {
      expect(screen.getByText('Descendentes')).toBeInTheDocument();
    });

    // Segundo clique no nó da árvore desseleciona
    const treeNode = screen.getAllByText('Acesso')[0]!;
    await user.click(treeNode);

    await waitFor(() => {
      expect(screen.getByText('Nenhum nó selecionado')).toBeInTheDocument();
    });
  });

  it('creates the first catalog and group in an empty environment', async () => {
    const user = userEvent.setup();
    const catalog = { ...mockCatalog, id: 'empty-cat', tenantId: 'tenant-empty' };
    const createdNode = {
      '@type': 'ResourceCatalogNode' as const,
      id: 'grp-first',
      href: '/v1/resource-catalogs/empty-cat/nodes/grp-first',
      catalogId: 'empty-cat',
      code: 'group-first',
      name: 'Novo Grupo',
      kind: 'GROUP' as const,
      status: 'active' as const,
      sortOrder: 0,
      tenantId: 'tenant-empty',
    };
    vi.mocked(resourceCatalogApi.listResourceCatalogs).mockResolvedValue([]);
    vi.mocked(resourceCatalogApi.createResourceCatalog).mockResolvedValue(catalog);
    vi.mocked(resourceCatalogApi.createResourceCatalogNode).mockResolvedValue(createdNode);
    vi.mocked(resourceCatalogApi.getResourceCatalogTree).mockResolvedValue([]);

    render(<ResourceModelStudio canEdit={true} canAdmin={true} isEditing={true} />);

    await user.click(screen.getByTitle('Incluir nó'));
    await user.click(screen.getByRole('menuitem', { name: /Grupo/ }));

    await waitFor(() => {
      expect(resourceCatalogApi.createResourceCatalog).toHaveBeenCalledWith({
        code: 'default-catalog',
        name: 'Catálogo de Recursos',
        isDefault: true,
        sortOrder: 0,
      });
      expect(resourceCatalogApi.createResourceCatalogNode).toHaveBeenCalledWith(
        'empty-cat',
        expect.objectContaining({ kind: 'GROUP' }),
      );
    });
  });

  it('creates a new group immediately when clicking + in edit mode', async () => {
    const user = userEvent.setup();
    const createdNode = {
      '@type': 'ResourceCatalogNode' as const,
      id: 'grp-new',
      href: '/v1/resource-catalogs/cat-1/nodes/grp-new',
      catalogId: 'cat-1',
      code: 'novo-grupo-1',
      name: 'Novo Grupo',
      kind: 'GROUP' as const,
      status: 'active' as const,
      sortOrder: 2,
      tenantId: 'vtal',
    };
    vi.mocked(resourceCatalogApi.createResourceCatalogNode).mockResolvedValue(createdNode);

    render(<ResourceModelStudio canEdit={true} canAdmin={true} isEditing={true} />);

    await waitFor(() => {
      expect(screen.getByText('Acesso')).toBeInTheDocument();
    });

    // Abre o menu de criação "+"
    const addBtn = screen.getByTitle('Incluir nó');
    await user.click(addBtn);

    const groupOption = screen.getByRole('menuitem', { name: /Grupo/ });
    await user.click(groupOption);

    expect(resourceCatalogApi.createResourceCatalogNode).toHaveBeenCalledWith(
      'cat-1',
      expect.objectContaining({
        kind: 'GROUP',
      }),
    );
  });

  it('hides nodes inactivated in past publications even when entering in edit mode', async () => {
    // Nó inativado em publicação anterior (não faz parte da baseline da sessão atual)
    const treeWithInactive: ResourceCatalogTreeNode[] = [
      mockTree[0]!,
      {
        '@type': 'ResourceCatalogNode',
        id: 'grp-old-inactive',
        href: '/v1/resource-catalogs/cat-1/nodes/grp-old-inactive',
        catalogId: 'cat-1',
        code: 'grp-old',
        name: 'Grupo Antigo Excluído',
        kind: 'GROUP',
        status: 'inactive',
        sortOrder: 2,
        tenantId: 'vtal',
        children: [],
      },
    ];
    vi.mocked(resourceCatalogApi.getResourceCatalogTree).mockResolvedValue(treeWithInactive);

    render(<ResourceModelStudio canEdit={true} canAdmin={true} isEditing={true} />);

    await waitFor(() => {
      expect(screen.getByText('Acesso')).toBeInTheDocument();
    });

    // O nó inativo de publicação anterior não deve ser renderizado na árvore
    expect(screen.queryByText('Grupo Antigo Excluído')).not.toBeInTheDocument();
  });

  it('creates a new child node when clicking + on a tree node in edit mode', async () => {
    const user = userEvent.setup();
    const createdNode = {
      '@type': 'ResourceCatalogNode' as const,
      id: 'leaf-new',
      href: '/v1/resource-catalogs/cat-1/nodes/leaf-new',
      catalogId: 'cat-1',
      code: 'novo-tipo-1',
      name: 'Novo Tipo de Recurso',
      kind: 'RESOURCE_TYPE' as const,
      status: 'active' as const,
      parentNodeId: 'grp-1',
      sortOrder: 1,
      tenantId: 'vtal',
    };
    vi.mocked(resourceCatalogApi.createResourceCatalogNode).mockResolvedValue(createdNode);

    render(<ResourceModelStudio canEdit={true} canAdmin={true} isEditing={true} />);

    await waitFor(() => {
      expect(screen.getByText('Acesso')).toBeInTheDocument();
    });

    const addChildBtn = screen.getByTitle('Adicionar filho');
    await user.click(addChildBtn);

    const resourceTypeOption = screen.getByRole('menuitem', { name: /Tipo de Recurso/ });
    await user.click(resourceTypeOption);

    expect(resourceCatalogApi.createResourceCatalogNode).toHaveBeenCalledWith(
      'cat-1',
      expect.objectContaining({
        kind: 'RESOURCE_TYPE',
        parentNodeId: 'grp-1',
      }),
    );
  });
});
