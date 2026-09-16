import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceRelationshipRulesPanel } from './ResourceRelationshipRulesPanel';
import type {
  ResourceRelationshipType,
  ResourceTypeRelationshipRule,
} from '../../../services/resourceApi';

const mocks = vi.hoisted(() => ({
  ensureBootstrapResourceRelationshipTypes: vi.fn(),
  listResourceRelationshipTypes: vi.fn(),
  listCatalogResourceTypes: vi.fn(),
  listGeoSiteSpecifications: vi.fn(),
  listResourceTypeRelationshipRules: vi.fn(),
  createResourceTypeRelationshipRule: vi.fn(),
  updateResourceTypeRelationshipRule: vi.fn(),
}));

vi.mock('../../../services/resourceApi', () => ({
  ensureBootstrapResourceRelationshipTypes: mocks.ensureBootstrapResourceRelationshipTypes,
  listResourceRelationshipTypes: mocks.listResourceRelationshipTypes,
  listResourceTypeRelationshipRules: mocks.listResourceTypeRelationshipRules,
  createResourceTypeRelationshipRule: mocks.createResourceTypeRelationshipRule,
  updateResourceTypeRelationshipRule: mocks.updateResourceTypeRelationshipRule,
}));

vi.mock('../../../services/resourceCatalogApi', () => ({
  listResourceTypes: mocks.listCatalogResourceTypes,
}));

vi.mock('../../../services/geoApi', () => ({
  listGeoSiteSpecifications: mocks.listGeoSiteSpecifications,
}));

const mockRelTypes: ResourceRelationshipType[] = [
  {
    '@type': 'ResourceRelationshipType',
    id: 'rel-1',
    href: '',
    code: 'containsAsChild',
    name: 'Contém como filho',
    inverseCode: 'containedBy',
    symmetric: false,
    allowedTargetKinds: ['RESOURCE_TYPE'],
    lifecycleStatus: 'Active',
  },
  {
    '@type': 'ResourceRelationshipType',
    id: 'rel-2',
    href: '',
    code: 'mountedOn',
    name: 'Montado em',
    inverseCode: 'supports',
    symmetric: false,
    allowedTargetKinds: ['RESOURCE_TYPE', 'GEOGRAPHIC_SITE_SPECIFICATION'],
    lifecycleStatus: 'Active',
  },
];

const mockResourceTypes = [
  { '@type': 'ResourceType' as const, id: 'rt-cto', code: 'CTO', name: 'CTO', status: 'active' },
  { '@type': 'ResourceType' as const, id: 'rt-splitter', code: 'Splitter', name: 'Splitter', status: 'active' },
  { '@type': 'ResourceType' as const, id: 'rt-port', code: 'Port', name: 'Porta', status: 'active' },
];

const mockGeoSpecs = [
  { id: 'spec-pole', name: 'Poste', code: 'POLE' },
];

const mockRules: ResourceTypeRelationshipRule[] = [
  {
    '@type': 'ResourceTypeRelationshipRule',
    id: 'rule-1',
    href: '',
    sourceResourceTypeId: 'rt-cto',
    relationshipTypeCode: 'containsAsChild',
    targetKind: 'RESOURCE_TYPE',
    targetId: 'rt-port',
    cardinality: { maxTargetPerSource: 8 },
    lifecycleStatus: 'Active',
  },
  {
    '@type': 'ResourceTypeRelationshipRule',
    id: 'rule-2',
    href: '',
    sourceResourceTypeId: 'rt-cto',
    relationshipTypeCode: 'containsAsChild',
    targetKind: 'RESOURCE_TYPE',
    targetId: 'rt-splitter',
    cardinality: { maxTargetPerSource: 1 },
    lifecycleStatus: 'Active',
  },
];

describe('ResourceRelationshipRulesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureBootstrapResourceRelationshipTypes.mockResolvedValue({ created: 0, relationshipTypes: mockRelTypes });
    mocks.listResourceRelationshipTypes.mockResolvedValue(mockRelTypes);
    mocks.listCatalogResourceTypes.mockResolvedValue(mockResourceTypes);
    mocks.listGeoSiteSpecifications.mockResolvedValue(mockGeoSpecs);
    mocks.listResourceTypeRelationshipRules.mockResolvedValue(mockRules);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders active rules with cardinality labels (máx. 8 e exatamente 1)', async () => {
    render(
      <ResourceRelationshipRulesPanel
        resourceTypeId="rt-cto"
        canEdit={true}
        isEditing={true}
      />,
    );

    expect(await screen.findByText('Relações permitidas (2)')).toBeInTheDocument();
    expect(screen.getByText('Contém Porta')).toBeInTheDocument();
    expect(screen.getByText('(máx 8)')).toBeInTheDocument();
    expect(screen.getByText('Contém Splitter')).toBeInTheDocument();
    expect(screen.getByText('(exatamente 1)')).toBeInTheDocument();
  });

  it('adds a new rule with "No máximo N" cardinality', async () => {
    const user = userEvent.setup();
    const createdRule: ResourceTypeRelationshipRule = {
      '@type': 'ResourceTypeRelationshipRule',
      id: 'rule-3',
      href: '',
      sourceResourceTypeId: 'rt-cto',
      relationshipTypeCode: 'containsAsChild',
      targetKind: 'RESOURCE_TYPE',
      targetId: 'rt-splitter',
      cardinality: { maxTargetPerSource: 4 },
      lifecycleStatus: 'Active',
    };
    mocks.createResourceTypeRelationshipRule.mockResolvedValue(createdRule);

    render(
      <ResourceRelationshipRulesPanel
        resourceTypeId="rt-cto"
        canEdit={true}
        isEditing={true}
      />,
    );

    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getByRole('button', { name: 'Adicionar relação' }));

    expect(screen.getByRole('heading', { name: 'Adicionar relação' })).toBeInTheDocument();

    // Seleciona alvo Splitter
    const targetSelect = screen.getByLabelText('Tipo de Recurso');
    await user.selectOptions(targetSelect, 'rt-splitter');

    // Seleciona modo "No máximo N" e digita 4
    await user.click(screen.getByRole('button', { name: 'No máximo N' }));
    const maxInput = screen.getByLabelText('Quantidade máxima');
    await user.clear(maxInput);
    await user.type(maxInput, '4');

    // Submete
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(mocks.createResourceTypeRelationshipRule).toHaveBeenCalledWith('rt-cto', {
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-splitter',
        cardinality: { maxTargetPerSource: 4 },
      });
    });
  });

  it('edits an existing rule to change cardinality to "Exatamente 1"', async () => {
    const user = userEvent.setup();
    const updatedRule: ResourceTypeRelationshipRule = {
      ...mockRules[0]!,
      cardinality: { maxTargetPerSource: 1 },
    };
    mocks.updateResourceTypeRelationshipRule.mockResolvedValue(updatedRule);

    render(
      <ResourceRelationshipRulesPanel
        resourceTypeId="rt-cto"
        canEdit={true}
        isEditing={true}
      />,
    );

    await screen.findByText('Relações permitidas (2)');

    // Clica no botão de editar da primeira regra (Porta, hoje máx 8)
    const editButtons = screen.getAllByTitle('Editar relação');
    await user.click(editButtons[0]!);

    expect(screen.getByRole('heading', { name: 'Editar relação' })).toBeInTheDocument();

    // Seleciona modo "Exatamente 1"
    await user.click(screen.getByRole('button', { name: 'Exatamente 1' }));

    // Salva
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(mocks.updateResourceTypeRelationshipRule).toHaveBeenCalledWith(
        'rt-cto',
        'rule-1',
        {
          relationshipTypeCode: 'containsAsChild',
          targetKind: 'RESOURCE_TYPE',
          targetId: 'rt-port',
          cardinality: { maxTargetPerSource: 1 },
        },
      );
    });
  });
});
