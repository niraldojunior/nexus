import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceNodeDetail } from './ResourceNodeDetail';
import type { ResourceCatalogNode } from '../../../services/resourceCatalogApi';

vi.mock('../../../services/resourceCatalogApi', () => ({
  getResourceCatalogNodeImpact: vi.fn().mockResolvedValue({
    nodeId: 'leaf-1',
    descendantCount: 0,
    activeDescendantCount: 0,
    descendantNodeIds: [],
    resourceTypeIds: ['rt-1'],
    specificationCount: 2,
    activePhysicalResourceCount: 15,
    activeLogicalResourceCount: 0,
  }),
  getResourceCatalogNodePath: vi.fn().mockResolvedValue({
    nodes: [{ id: 'grp-1', name: 'Acesso', code: 'grp-access', kind: 'GROUP' }],
  }),
  listResourceSpecifications: vi.fn().mockResolvedValue([]),
  getResourceTypeCatalogContext: vi.fn().mockResolvedValue({
    resourceType: {
      id: 'rt-1',
      code: 'OLT',
      name: 'OLT',
      status: 'active',
      nature: 'PhysicalResource',
      mapPresence: false,
      resourceTypeCharacteristic: [],
    },
    catalogPaths: [],
    specifications: [],
  }),
}));

vi.mock('../../../services/resourceApi', () => ({
  listResourceTypeRelationshipRules: vi.fn().mockResolvedValue([]),
  listResourceRelationshipTypes: vi.fn().mockResolvedValue([]),
}));

const mockLeafNode: ResourceCatalogNode = {
  '@type': 'ResourceCatalogNode',
  id: 'leaf-1',
  href: '/v1/resource-catalogs/cat-1/nodes/leaf-1',
  catalogId: 'cat-1',
  code: 'leaf-olt',
  name: 'Optical Line Terminal',
  description: 'Terminal de Linha Óptica GPON',
  kind: 'RESOURCE_TYPE',
  resourceTypeId: 'rt-1',
  status: 'active',
  sortOrder: 1,
  tenantId: 'vtal',
  metadata: {
    nature: 'PhysicalResource',
    mapPresence: true,
  },
};

const mockLeafNodeEmptyDescription: ResourceCatalogNode = {
  '@type': 'ResourceCatalogNode',
  id: 'leaf-2',
  href: '/v1/resource-catalogs/cat-1/nodes/leaf-2',
  catalogId: 'cat-1',
  code: 'leaf-dio',
  name: 'DIO',
  description: '',
  kind: 'RESOURCE_TYPE',
  resourceTypeId: 'rt-2',
  status: 'active',
  sortOrder: 2,
  tenantId: 'vtal',
};

describe('ResourceNodeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders description when present in consultation mode', async () => {
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNode}
        canEdit={true}
        isEditing={false}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Terminal de Linha Óptica GPON')).toBeInTheDocument();
    });
  });

  it('hides description field completely when empty in consultation mode', async () => {
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNodeEmptyDescription}
        canEdit={true}
        isEditing={false}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('DIO')).toBeInTheDocument();
    });

    // Campo de descrição não deve ser exibido nem com placeholder
    expect(screen.queryByText('Descrição')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma descrição fornecida.')).not.toBeInTheDocument();
  });

  it('shows description textarea in editing mode even when empty', async () => {
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNodeEmptyDescription}
        canEdit={true}
        isEditing={true}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
        onUpdateNode={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Descrição')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(
      'Descrição funcional do nó no catálogo de recursos...',
    );
    expect(textarea).toBeInTheDocument();
  });

  it('hides the generated code for resource types and preserves it when the name changes', async () => {
    const user = userEvent.setup();
    const onUpdateNode = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNode}
        canEdit={true}
        isEditing={true}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
        onUpdateNode={onUpdateNode}
      />,
    );

    expect(screen.queryByText('Código *')).not.toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Optical Line Terminal');
    await user.clear(nameInput);
    await user.type(nameInput, 'OLT Atualizada');
    await user.tab();

    await waitFor(() => {
      expect(onUpdateNode).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'OLT Atualizada', code: 'leaf-olt' }),
      );
    });
  });

  it('keeps the code field editable for groups', () => {
    const groupNode: ResourceCatalogNode = {
      ...mockLeafNode,
      id: 'grp-1',
      code: 'grupo-acesso',
      name: 'Acesso',
      kind: 'GROUP',
      resourceTypeId: undefined,
    };
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={groupNode}
        canEdit={true}
        isEditing={true}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
        onUpdateNode={vi.fn()}
      />,
    );

    expect(screen.getByText('Código *')).toBeInTheDocument();
    expect(screen.getByDisplayValue('grupo-acesso')).toBeInTheDocument();
  });

  it('keeps map visibility local until a geometry is chosen, then persists both together', async () => {
    // Ligar "Exibir no mapa" sem geometria não pode chegar ao backend como PATCH inválido — a
    // invariante do service exige o par mapPresence+geometryKind na mesma revisão (issue #240).
    const user = userEvent.setup();
    const onUpdateNode = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNode}
        canEdit={true}
        isEditing={true}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
        onUpdateNode={onUpdateNode}
      />,
    );

    const checkbox = await screen.findByRole('checkbox');
    await waitFor(() => expect(checkbox).not.toBeChecked());
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(onUpdateNode).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: /Ponto/ }));

    await waitFor(() => {
      expect(onUpdateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          nature: 'PhysicalResource',
          mapPresence: true,
          geometryKind: 'POINT',
          metadata: expect.not.objectContaining({
            nature: expect.anything(),
            mapPresence: expect.anything(),
          }),
        }),
      );
    });
  });

  it('clears geometry when nature switches to logical, in the same save', async () => {
    const user = userEvent.setup();
    const onUpdateNode = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNode}
        canEdit={true}
        isEditing={true}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
        onUpdateNode={onUpdateNode}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Recurso Lógico' }));

    await waitFor(() => {
      expect(onUpdateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          nature: 'LogicalResource',
          mapPresence: false,
          geometryKind: null,
        }),
      );
    });
  });

  it('shows canonical map visibility instead of stale node metadata in consultation mode', async () => {
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNode}
        canEdit={true}
        isEditing={false}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Visível no Mapa').parentElement).toHaveTextContent('Não');
    });
  });

  it('switches between tabs: Geral, Características, Especificações, Relações', async () => {
    const user = userEvent.setup();
    render(
      <ResourceNodeDetail
        catalogId="cat-1"
        node={mockLeafNode}
        canEdit={true}
        isEditing={false}
        wasActiveAtBaseline={true}
        onImpact={vi.fn()}
        onReactivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Características/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Especificações/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Relações/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Relações/ })).toHaveTextContent('0');
    });

    // Clica na aba Características
    await user.click(screen.getByRole('button', { name: /^Características/ }));
    expect(screen.getByText('Características do tipo (0)')).toBeInTheDocument();

    // Clica na aba Relações
    await user.click(screen.getByRole('button', { name: /^Relações/ }));
    await waitFor(() => {
      expect(screen.getByText('Relações permitidas (0)')).toBeInTheDocument();
      expect(screen.getByText('Nenhuma relação configurada.')).toBeInTheDocument();
    });
  });
});
