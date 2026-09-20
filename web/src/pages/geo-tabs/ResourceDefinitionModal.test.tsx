import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceDefinitionModal } from './ResourceDefinitionModal';
import type { ResourceSpecification, ResourceType } from '../../services/resourceApi';

const mocks = vi.hoisted(() => ({
  listResourceCatalogs: vi.fn(),
  getResourceCatalogTree: vi.fn(),
  getResourceModelSnapshotSource: vi.fn(),
  listResourceSpecifications: vi.fn(),
}));

vi.mock('../../services/resourceCatalogApi', () => ({
  listResourceCatalogs: mocks.listResourceCatalogs,
  getResourceCatalogTree: mocks.getResourceCatalogTree,
  getResourceModelSnapshotSource: mocks.getResourceModelSnapshotSource,
  listResourceSpecifications: mocks.listResourceSpecifications,
}));

const TYPES: ResourceType[] = [
  { '@type': 'ResourceType', id: 'type-cto', href: '', code: 'CTO', name: 'CTO', categoryCode: 'Infrastructure.Passive', status: 'active' },
  { '@type': 'ResourceType', id: 'type-splitter', href: '', code: 'Splitter', name: 'Splitter', categoryCode: 'Infrastructure.Passive', status: 'active' },
  { '@type': 'ResourceType', id: 'type-empty', href: '', code: 'Vazio', name: 'Vazio', categoryCode: 'Infrastructure.Passive', status: 'active' },
];

const SPECS: ResourceSpecification[] = [
  {
    id: 'spec-a',
    name: 'CTO A',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'Modelo A' }],
    relatedParty: [{ id: 'party-1', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-b',
    name: 'CTO B',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'Modelo B' }],
    relatedParty: [{ id: 'party-2', name: 'Nokia', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-splitter',
    name: 'Splitter A',
    category: 'Infrastructure.Passive',
    resourceType: 'Splitter',
    resourceTypeId: 'type-splitter',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'SP1x8' }],
    relatedParty: [{ id: 'party-1', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
];

const CATALOG_SNAPSHOT = {
  catalog: { id: 'catalog-1', name: 'Padrão', code: 'DEFAULT', status: 'active', isDefault: true },
  nodes: [
    {
      id: 'node-group-1',
      catalogId: 'catalog-1',
      code: 'telecom',
      name: 'Telecom',
      kind: 'GROUP' as const,
      status: 'active' as const,
      sortOrder: 1,
      children: [
        {
          id: 'node-cto',
          catalogId: 'catalog-1',
          code: 'CTO',
          name: 'CTO',
          kind: 'RESOURCE_TYPE' as const,
          resourceTypeId: 'type-cto',
          resourceType: TYPES[0],
          status: 'active' as const,
          sortOrder: 1,
        },
        {
          id: 'node-splitter',
          catalogId: 'catalog-1',
          code: 'Splitter',
          name: 'Splitter',
          kind: 'RESOURCE_TYPE' as const,
          resourceTypeId: 'type-splitter',
          resourceType: TYPES[1],
          status: 'active' as const,
          sortOrder: 2,
        },
        {
          id: 'node-empty',
          catalogId: 'catalog-1',
          code: 'Vazio',
          name: 'Vazio',
          kind: 'RESOURCE_TYPE' as const,
          resourceTypeId: 'type-empty',
          resourceType: TYPES[2],
          status: 'active' as const,
          sortOrder: 3,
        },
      ],
    },
  ],
  resourceTypes: TYPES,
  relationshipRules: [],
};

describe('ResourceDefinitionModal', () => {
  beforeEach(() => {
    mocks.listResourceCatalogs.mockResolvedValue([CATALOG_SNAPSHOT.catalog]);
    mocks.getResourceCatalogTree.mockResolvedValue(CATALOG_SNAPSHOT.nodes);
    mocks.getResourceModelSnapshotSource.mockResolvedValue(CATALOG_SNAPSHOT);
    mocks.listResourceSpecifications.mockImplementation(({ resourceTypeId }: { resourceTypeId?: string }) => {
      if (resourceTypeId === 'type-splitter') return Promise.resolve([SPECS[2]]);
      if (resourceTypeId === 'type-empty') return Promise.resolve([]);
      return Promise.resolve([SPECS[0], SPECS[1]]);
    });
  });

  afterEach(() => {
    cleanup();
    mocks.listResourceCatalogs.mockReset();
    mocks.getResourceCatalogTree.mockReset();
    mocks.getResourceModelSnapshotSource.mockReset();
    mocks.listResourceSpecifications.mockReset();
  });

  it('pré-seleciona a spec atual e lista os dados da árvore', async () => {
    render(
      <ResourceDefinitionModal
        currentSpecification={SPECS[0]!}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('Definição do recurso')).toBeInTheDocument();
    expect(screen.getByText('Telecom')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'CTO A' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('trocar o tipo de recurso na árvore atualiza a lista de especificações à direita', async () => {
    render(
      <ResourceDefinitionModal
        currentSpecification={SPECS[0]!}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByRole('option', { name: 'CTO A' });
    fireEvent.click(screen.getByText('Splitter'));

    expect(await screen.findByRole('option', { name: 'Splitter A' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'CTO A' })).not.toBeInTheDocument();
  });

  it('salvar chama onCommit com o id da nova especificação e fecha o modal', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ResourceDefinitionModal
        currentSpecification={SPECS[0]!}
        onCommit={onCommit}
        onClose={onClose}
      />,
    );

    fireEvent.click(await screen.findByRole('option', { name: 'CTO B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }));

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('spec-b');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('clicar em Cancelar chama onClose', async () => {
    const onClose = vi.fn();
    render(
      <ResourceDefinitionModal
        currentSpecification={SPECS[0]!}
        onCommit={vi.fn()}
        onClose={onClose}
      />,
    );

    await screen.findByText('Definição do recurso');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('sem especificação selecionada, desabilita Salvar e não chama onCommit', async () => {
    const onCommit = vi.fn();
    render(
      <ResourceDefinitionModal
        currentSpecification={SPECS[0]!}
        onCommit={onCommit}
        onClose={vi.fn()}
      />,
    );

    await screen.findByRole('option', { name: 'CTO A' });
    fireEvent.click(screen.getByText('Vazio'));

    expect(
      await screen.findByText('Nenhuma especificação encontrada para este tipo.'),
    ).toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Salvar alteração' });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
