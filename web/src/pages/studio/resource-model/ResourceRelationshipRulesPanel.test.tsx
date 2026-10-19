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

vi.mock('../../../services/internalPlantCatalogCache', () => ({
  loadRelationshipTypesCached: mocks.listResourceRelationshipTypes,
  loadResourceTypesCached: mocks.listCatalogResourceTypes,
  loadSiteSpecificationsCached: mocks.listGeoSiteSpecifications,
  invalidateRelationshipTypesCache: vi.fn(),
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
  {
    '@type': 'ResourceRelationshipType',
    id: 'rel-3',
    href: '',
    code: 'feeds',
    name: 'Alimenta',
    inverseCode: 'fedBy',
    symmetric: false,
    allowedTargetKinds: ['RESOURCE_TYPE', 'GEOGRAPHIC_SITE_SPECIFICATION'],
    lifecycleStatus: 'Active',
  },
];

const mockResourceTypes = [
  { '@type': 'ResourceType' as const, id: 'rt-cto', code: 'CTO', name: 'CTO', status: 'active' },
  {
    '@type': 'ResourceType' as const,
    id: 'rt-splitter',
    code: 'Splitter',
    name: 'Splitter',
    status: 'active',
  },
  {
    '@type': 'ResourceType' as const,
    id: 'rt-port',
    code: 'Port',
    name: 'Porta',
    status: 'active',
  },
];

const mockGeoSpecs = [{ id: 'spec-pole', name: 'Poste', code: 'POLE' }];

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
    mocks.ensureBootstrapResourceRelationshipTypes.mockResolvedValue({
      created: 0,
      relationshipTypes: mockRelTypes,
    });
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
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );

    expect(await screen.findByText('Relações permitidas (2)')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Recurso relacionado' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cardinalidade' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Configuração' })).toBeInTheDocument();
    expect(screen.getAllByText('Contém')).toHaveLength(2);
    expect(screen.getByText('Porta')).toBeInTheDocument();
    expect(screen.getByText('máx 8')).toBeInTheDocument();
    expect(screen.getByText('Splitter')).toBeInTheDocument();
    expect(screen.getByText('exatamente 1')).toBeInTheDocument();
    expect(screen.getAllByText('Padrão')).toHaveLength(2);
    expect(screen.getAllByText('Lista simples')).toHaveLength(2);
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
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );

    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getByRole('button', { name: 'Adicionar relação' }));

    expect(screen.getByRole('heading', { name: 'Adicionar relação' })).toBeInTheDocument();
    expect(screen.getByText('Definição para:')).toBeInTheDocument();

    // Seleciona alvo Splitter
    const targetSelect = screen.getByLabelText('Tipo de Recurso');
    await user.selectOptions(targetSelect, 'rt-splitter');
    expect(screen.getByText('CTO → Contém como filho → Splitter')).toBeInTheDocument();

    // Seleciona modo "No máximo N" e digita 4
    expect(screen.queryByLabelText('Quantidade máxima')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Cardinalidade'), 'max');
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
        configuration: { version: 1, placementPolicy: 'NONE' },
      });
    });
  });

  it('adds a LINEAR containment definition', async () => {
    const user = userEvent.setup();
    mocks.createResourceTypeRelationshipRule.mockResolvedValue({
      ...mockRules[0],
      id: 'rule-linear',
      configuration: {
        version: 1,
        placementPolicy: 'LINEAR',
        axis: 'vertical',
        unitLabel: 'U',
        capacity: 42,
        numberingDirection: 'ascending',
      },
    });
    render(
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );
    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getByRole('button', { name: 'Adicionar relação' }));
    await user.selectOptions(screen.getByLabelText('Tipo de Recurso'), 'rt-splitter');
    await user.click(screen.getByRole('button', { name: /Linear/ }));
    await user.clear(screen.getByLabelText('Capacidade'));
    await user.type(screen.getByLabelText('Capacidade'), '42');
    await user.selectOptions(screen.getByLabelText('Orientação'), 'horizontal');
    await user.selectOptions(screen.getByLabelText('Direção da numeração'), 'descending');
    expect(
      screen.getByRole('img', {
        name: 'Prévia ilustrativa de layout linear horizontal com 42 unidades e numeração superior para inferior',
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(mocks.createResourceTypeRelationshipRule).toHaveBeenCalledWith('rt-cto', {
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-splitter',
        cardinality: undefined,
        configuration: {
          version: 1,
          placementPolicy: 'LINEAR',
          axis: 'horizontal',
          unitLabel: 'U',
          capacity: 42,
          numberingDirection: 'descending',
        },
      });
    });
  });

  it('libera tipo de alvo somente para Montado em e Alimenta', async () => {
    const user = userEvent.setup();
    render(
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );

    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getByRole('button', { name: 'Adicionar relação' }));

    expect(screen.queryByLabelText('Tipo de alvo')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipo de relação'), 'mountedOn');
    expect(screen.getByLabelText('Tipo de alvo')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipo de alvo'), 'GEOGRAPHIC_SITE_SPECIFICATION');
    expect(screen.getByLabelText('Tipo de Local')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo de relação'), 'feeds');
    expect(screen.getByLabelText('Tipo de alvo')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipo de alvo'), 'GEOGRAPHIC_SITE_SPECIFICATION');
    expect(screen.getByLabelText('Tipo de Local')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo de relação'), 'containsAsChild');
    expect(screen.queryByLabelText('Tipo de alvo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de Recurso')).toBeInTheDocument();
  });

  it('exibe as opções de organização apenas para containment', async () => {
    const user = userEvent.setup();
    render(
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );

    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getByRole('button', { name: 'Adicionar relação' }));

    expect(screen.getByRole('group', { name: 'Organização dos componentes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Padrão/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Linear/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Grade/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Regiões/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Livre/ })).toBeDisabled();
    expect(screen.getAllByText('Em breve')).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText('Tipo de relação'), 'mountedOn');

    expect(screen.queryByRole('group', { name: 'Organização dos componentes' })).not.toBeInTheDocument();
  });

  it('persists the required validation rule without changing cardinality', async () => {
    const user = userEvent.setup();
    mocks.createResourceTypeRelationshipRule.mockResolvedValue({
      ...mockRules[0],
      id: 'rule-required',
      validationRules: { required: true },
    });
    render(
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );

    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getByRole('button', { name: 'Adicionar relação' }));
    await user.selectOptions(screen.getByLabelText('Tipo de Recurso'), 'rt-splitter');
    await user.click(screen.getByRole('switch', { name: 'Relação obrigatória' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(mocks.createResourceTypeRelationshipRule).toHaveBeenCalledWith('rt-cto', {
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-splitter',
        cardinality: undefined,
        configuration: { version: 1, placementPolicy: 'NONE' },
        validationRules: { required: true },
      });
    });
  });

  it('abre uma relação em consulta fora do modo de edição', async () => {
    const user = userEvent.setup();
    render(
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={false} />,
    );

    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getByText('Porta'));

    expect(screen.getByRole('heading', { name: 'Detalhes da relação' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de Recurso')).toBeDisabled();
    expect(screen.queryByLabelText('Capacidade')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Inativar relação')).not.toBeInTheDocument();
  });

  it('inativa uma relação pela lixeira sem abrir a modal', async () => {
    const user = userEvent.setup();
    mocks.updateResourceTypeRelationshipRule.mockResolvedValue({
      ...mockRules[0],
      lifecycleStatus: 'Retired',
    });
    render(
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );

    await screen.findByText('Relações permitidas (2)');
    await user.click(screen.getAllByTitle('Inativar relação')[0]!);

    expect(screen.getByRole('heading', { name: 'Inativar relação' })).toBeInTheDocument();
    expect(mocks.updateResourceTypeRelationshipRule).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar inativação' }));

    await waitFor(() => {
      expect(mocks.updateResourceTypeRelationshipRule).toHaveBeenCalledWith('rt-cto', 'rule-1', {
        lifecycleStatus: 'Retired',
      });
    });
    expect(screen.queryByRole('heading', { name: 'Editar relação' })).not.toBeInTheDocument();
  });

  it('edits an existing rule to change cardinality to "Exatamente 1"', async () => {
    const user = userEvent.setup();
    const updatedRule: ResourceTypeRelationshipRule = {
      ...mockRules[0]!,
      cardinality: { maxTargetPerSource: 1 },
    };
    mocks.updateResourceTypeRelationshipRule.mockResolvedValue(updatedRule);

    render(
      <ResourceRelationshipRulesPanel resourceTypeId="rt-cto" canEdit={true} isEditing={true} />,
    );

    await screen.findByText('Relações permitidas (2)');

    // Clica na primeira linha (Porta, hoje máx 8) para editar.
    await user.click(screen.getByText('Porta'));

    expect(screen.getByRole('heading', { name: 'Editar relação' })).toBeInTheDocument();

    // Seleciona modo "Exatamente 1"
    await user.selectOptions(screen.getByLabelText('Cardinalidade'), 'one');

    // Salva
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(mocks.updateResourceTypeRelationshipRule).toHaveBeenCalledWith('rt-cto', 'rule-1', {
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-port',
        cardinality: { maxTargetPerSource: 1 },
        configuration: { version: 1, placementPolicy: 'NONE' },
      });
    });
  });
});
