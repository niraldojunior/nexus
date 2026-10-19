import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceEditorModal } from './ResourceEditorModal';
import { fetchResourceEditor, saveResourceAggregate } from '../../services/internalPlantApi';
import { listResourceTypeRelationshipRules } from '../../services/resourceApi';
import type { ResourceType } from '../../services/resourceApi';

const mockTypes: ResourceType[] = [
  {
    '@type': 'ResourceType',
    id: 'rt-olt',
    href: '/v1/resource-types/rt-olt',
    code: 'OLT',
    name: 'OLT',
    categoryCode: 'active',
    status: 'active',
    nature: 'PhysicalResource',
    visualIdentity: { kind: 'system', iconCode: 'OLT' },
    resourceTypeCharacteristic: [
      { name: 'portas', valueType: 'integer', characteristicLevel: 'specification', value: 16 },
      { name: 'firmware', valueType: 'string', characteristicLevel: 'instance', value: '' },
    ],
  },
  {
    '@type': 'ResourceType',
    id: 'rt-cto',
    href: '/v1/resource-types/rt-cto',
    code: 'CTO',
    name: 'Caixa de Terminação Óptica',
    categoryCode: 'passive',
    status: 'active',
    nature: 'PhysicalResource',
    visualIdentity: { kind: 'system', iconCode: 'CTO' },
    resourceTypeCharacteristic: [
      {
        name: 'quantidadeDeFibras',
        valueType: 'integer',
        characteristicLevel: 'specification',
        value: 16,
      },
      {
        name: 'etiquetaOperacional',
        valueType: 'string',
        characteristicLevel: 'instance',
        value: '',
      },
    ],
  },
];

vi.mock('../../services/internalPlantApi', () => ({
  fetchResourceEditor: vi.fn(async (id: string) => ({
    resource: {
      id,
      name: 'OLT-ICARAI-01',
      '@type': 'PhysicalResource',
      resourceSpecificationId: 'spec-1',
      characteristic: [],
    },
    resourceType: {
      id: 'rt-olt',
      code: 'OLT',
      name: 'OLT',
      resourceTypeCharacteristic: [],
    },
    specification: {
      id: 'spec-1',
      name: 'Huawei MA5800-X17',
      relatedParty: [
        {
          id: 'manufacturer-1',
          '@referredType': 'Organization',
          role: 'manufacturer',
          name: 'Huawei',
        },
      ],
    },
    components: [],
    relationships: [],
    siteRelationships: [],
  })),
  fetchResourceHistory: vi.fn(async () => []),
  saveResourceAggregate: vi.fn(),
}));

vi.mock('../../services/internalPlantCatalogCache', () => ({
  loadResourceTypesCached: vi.fn(async () => mockTypes),
  loadRelationshipTypesCached: vi.fn(async () => []),
  loadSpecificationsCached: vi.fn(async () => [
    {
      id: 'spec-1',
      name: 'Huawei MA5800-X17',
      resourceTypeId: 'rt-olt',
      resourceSpecificationCharacteristic: [
        { name: 'portas', valueType: 'integer', characteristicLevel: 'specification', value: 16 },
      ],
      relatedParty: [
        {
          id: 'manufacturer-1',
          '@referredType': 'Organization',
          role: 'manufacturer',
          name: 'Huawei',
        },
      ],
    },
    {
      id: 'spec-2',
      name: 'OLT sem fabricante',
      resourceTypeId: 'rt-olt',
      relatedParty: [],
    },
    {
      id: 'spec-cto-1',
      name: 'CTO 16 FO',
      resourceTypeId: 'rt-cto',
      relatedParty: [],
    },
  ]),
  loadSiteSpecificationsCached: vi.fn(async () => []),
  loadDefaultCatalogTree: vi.fn(async () => []),
}));

vi.mock('../../services/resourceApi', () => ({
  listResourceStatusCatalog: vi.fn(async () => []),
  listResourceTypeRelationshipRules: vi.fn(async () => []),
  listResources: vi.fn(async () => []),
}));

vi.mock('../../services/partyApi', () => ({
  listPartyRoles: vi.fn(async () => [
    {
      partyId: 'vendor-1',
      name: 'vendor',
      status: 'active',
      party: { id: 'vendor-1', '@referredType': 'Organization', name: 'Fornecedor Óptico' },
    },
  ]),
}));

vi.mock('../../services/geoApi', () => ({
  listGeoSites: vi.fn(async () => []),
  getGeoSite: vi.fn(async () => undefined),
  getGeoLocation: vi.fn(async () => undefined),
  getGeoAddress: vi.fn(async () => undefined),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResourceEditorModal', () => {
  it('exibe apenas o tipo do recurso no canto superior esquerdo com estilo de título destacado e ícone aumentado', async () => {
    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Recurso' });
    expect(nav).toBeInTheDocument();

    // Box do ícone com destaque visual aumentado (size-11 / 44px)
    const iconContainer = nav.querySelector('span.size-11');
    expect(iconContainer).not.toBeNull();

    // No nav (canto superior esquerdo), aguarda carregar e deve exibir apenas o tipo "OLT"
    await waitFor(() => {
      const typeLabel = nav.querySelector('span.font-semibold.text-app-text');
      expect(typeLabel?.textContent).toBe('OLT');
      expect(typeLabel).toHaveClass('truncate', 'text-[1.15rem]', 'font-semibold', 'text-app-text');
    });

    // O nome do recurso ("OLT-ICARAI-01") NÃO deve aparecer dentro do nav lateral
    expect(nav.textContent).not.toContain('OLT-ICARAI-01');
    expect(nav.textContent).not.toContain('Recurso');
    expect(nav.textContent).not.toContain('Novo recurso');

    // O nome do recurso deve aparecer no cabeçalho principal do modal
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('OLT-ICARAI-01');
  });

  it('organiza a aba Geral sem Part number, preservando a aba Locais', async () => {
    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByLabelText('Número de série')).toBeInTheDocument();
    expect(screen.getByText('Fabricante')).toBeInTheDocument();
    expect(screen.getByText('Huawei')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fornecedor')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Código ERP')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Part number/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Localização e observações')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Locais' })).not.toHaveLength(0);
  });

  it('atualiza o Fabricante conforme a especificação selecionada', async () => {
    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText('Huawei')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Especificação'), { target: { value: 'spec-2' } });

    expect(screen.getByText('Não informado')).toBeInTheDocument();
    expect(screen.queryByText('Huawei')).not.toBeInTheDocument();
  });

  it('exibe "Sem tipo" no canto superior esquerdo quando nenhum tipo foi selecionado', async () => {
    render(<ResourceEditorModal onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Recurso' });
    expect(nav).toBeInTheDocument();

    const typeLabel = nav.querySelector('span.font-semibold.text-app-text');
    expect(typeLabel?.textContent).toBe('Sem tipo');
    expect(typeLabel).toHaveClass('truncate', 'text-[1.15rem]', 'font-semibold', 'text-app-text');
    expect(nav.textContent).not.toContain('Novo recurso');
  });

  it('apresenta características de especificação em consulta e de instância para edição', async () => {
    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByRole('dialog');
    fireEvent.click(screen.getAllByRole('button', { name: 'Características' })[0]!);

    const specificationSection = screen.getByRole('region', { name: 'Nível de especificação' });
    expect(specificationSection).toHaveTextContent('portas');
    expect(specificationSection).toHaveTextContent('16');
    expect(specificationSection.querySelector('output')).toHaveTextContent('16');
    expect(specificationSection.querySelector('input, select')).toBeNull();

    expect(screen.getByLabelText('firmware')).toBeEnabled();
  });

  it('permite visualizar e editar a posição estrutural linear de um componente', async () => {
    vi.mocked(listResourceTypeRelationshipRules).mockResolvedValue([
      {
        '@type': 'ResourceTypeRelationshipRule',
        id: 'rule-linear-1',
        href: '',
        sourceResourceTypeId: 'rt-olt',
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-cto',
        configuration: {
          version: 1,
          placementPolicy: 'LINEAR',
          axis: 'vertical',
          unitLabel: 'U',
          capacity: 42,
          numberingDirection: 'ascending',
        },
        lifecycleStatus: 'Active',
      },
    ]);
    vi.mocked(fetchResourceEditor).mockResolvedValueOnce({
      resource: {
        id: 'res-1',
        name: 'RACK-01',
        '@type': 'PhysicalResource',
        resourceSpecificationId: 'spec-1',
        characteristic: [],
      },
      resourceType: {
        id: 'rt-olt',
        code: 'OLT',
        name: 'OLT',
        resourceTypeCharacteristic: [],
      },
      specification: {
        id: 'spec-1',
        name: 'Huawei MA5800-X17',
        relatedParty: [],
      },
      components: [
        {
          id: 'child-1',
          name: 'CTO-INTERNA',
          kind: 'PhysicalResource',
          depth: 1,
          parentId: 'res-1',
          specification: { id: 'spec-cto-1', name: 'CTO 16 FO' },
          relationshipId: 'rel-edge-1',
          relationshipDefinitionId: 'rule-linear-1',
          placement: { placementPolicy: 'LINEAR', position: 10, span: 1 },
        },
      ],
      relationships: [],
      siteRelationships: [],
    });

    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Componentes' })[0]!);

    const occupied = await screen.findByRole('option', { name: 'U10, ocupada por CTO-INTERNA' });
    fireEvent.click(occupied);
    const posInput = screen.getByLabelText('Posição');
    expect(posInput).toHaveValue(10);
    expect(screen.getAllByText('U10')).not.toHaveLength(0);

    fireEvent.change(posInput, { target: { value: '14' } });
    expect(posInput).toHaveValue(14);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(saveResourceAggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          components: [
            expect.objectContaining({
              id: 'child-1',
              relationshipId: 'rel-edge-1',
              relationshipDefinitionId: 'rule-linear-1',
              placement: { placementPolicy: 'LINEAR', position: 14 },
            }),
          ],
        }),
      );
    });
  });

  it('edita estados e characteristics de instância do componente no payload agregado', async () => {
    vi.mocked(listResourceTypeRelationshipRules).mockResolvedValue([
      {
        '@type': 'ResourceTypeRelationshipRule',
        id: 'rule-linear-state',
        href: '',
        sourceResourceTypeId: 'rt-olt',
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-cto',
        lifecycleStatus: 'Active',
        configuration: {
          version: 1,
          placementPolicy: 'LINEAR',
          axis: 'vertical',
          unitLabel: 'U',
          capacity: 20,
          numberingDirection: 'ascending',
        },
      },
    ]);
    vi.mocked(fetchResourceEditor).mockResolvedValueOnce({
      resource: {
        id: 'res-states',
        name: 'RACK-ESTADOS',
        '@type': 'PhysicalResource',
        resourceSpecificationId: 'spec-1',
        characteristic: [],
      },
      resourceType: { id: 'rt-olt', code: 'OLT', name: 'OLT', resourceTypeCharacteristic: [] },
      specification: { id: 'spec-1', name: 'Huawei MA5800-X17', relatedParty: [] },
      components: [
        {
          id: 'child-state',
          name: 'CTO-ESTADO',
          kind: 'PhysicalResource',
          depth: 1,
          parentId: 'res-states',
          specification: { id: 'spec-cto-1', name: 'CTO 16 FO' },
          relationshipId: 'rel-state',
          relationshipDefinitionId: 'rule-linear-state',
          placement: { placementPolicy: 'LINEAR', position: 3 },
          status: 'active',
          administrativeState: 'unlocked',
          operationalState: 'enabled',
          usageState: 'idle',
          characteristics: [],
        },
      ],
      relationships: [],
      siteRelationships: [],
    });

    render(<ResourceEditorModal resourceId="res-states" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getAllByRole('button', { name: 'Componentes' })[0]!);
    fireEvent.click(await screen.findByRole('option', { name: 'U03, ocupada por CTO-ESTADO' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Estados' }));
    fireEvent.change(screen.getByLabelText('Status do componente'), {
      target: { value: 'suspended' },
    });
    fireEvent.change(screen.getByLabelText('Estado administrativo do componente'), {
      target: { value: 'locked' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /Características/ }));
    fireEvent.change(screen.getByLabelText('etiquetaOperacional'), {
      target: { value: 'ACESSO-RESTRITO' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(saveResourceAggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          components: [
            expect.objectContaining({
              id: 'child-state',
              status: 'suspended',
              administrativeState: 'locked',
              characteristic: [
                expect.objectContaining({ name: 'etiquetaOperacional', value: 'ACESSO-RESTRITO' }),
              ],
            }),
          ],
        }),
      ),
    );
  });

  it('cria filho e neto na organização padrão (NONE) sem enviar placement', async () => {
    vi.mocked(listResourceTypeRelationshipRules).mockResolvedValue([
      {
        '@type': 'ResourceTypeRelationshipRule',
        id: 'rule-none',
        href: '',
        sourceResourceTypeId: 'rt-olt',
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-cto',
        lifecycleStatus: 'Active',
        configuration: { version: 1, placementPolicy: 'NONE' },
      },
    ]);
    render(<ResourceEditorModal resourceId="res-none" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getAllByRole('button', { name: 'Componentes' })[0]!);

    await screen.findByRole('region', { name: 'Composição visual' });
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar componente interno' }));
    fireEvent.change(await screen.findByLabelText('Prefixo'), { target: { value: 'CX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar recursos' }));

    // filho criado e selecionado: permite criar neto dentro dele
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar componente interno' }));
    fireEvent.change(await screen.findByLabelText('Prefixo'), { target: { value: 'SUB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar recursos' }));

    expect(screen.getByRole('region', { name: /Container CX_1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SUB_1/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(saveResourceAggregate).toHaveBeenCalled());
    const payload = JSON.stringify(vi.mocked(saveResourceAggregate).mock.calls[0]![0]);
    expect(payload).toContain('CX_1');
    expect(payload).toContain('SUB_1');
    expect(payload).not.toContain('placement');
  });

  it('bloqueia criação acima da cardinalidade e remove do rascunho na organização padrão', async () => {
    vi.mocked(listResourceTypeRelationshipRules).mockResolvedValue([
      {
        '@type': 'ResourceTypeRelationshipRule',
        id: 'rule-none-max',
        href: '',
        sourceResourceTypeId: 'rt-olt',
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-cto',
        lifecycleStatus: 'Active',
        cardinality: { maxTargetPerSource: 1 },
        configuration: { version: 1, placementPolicy: 'NONE' },
      },
    ]);
    render(<ResourceEditorModal resourceId="res-max" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getAllByRole('button', { name: 'Componentes' })[0]!);
    await screen.findByRole('region', { name: 'Composição visual' });

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar componente interno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar recursos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recurso raiz: OLT-ICARAI-01' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar componente interno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar recursos' }));
    expect(
      await screen.findByText('A regra permite no máximo 1 componentes deste tipo.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^OLT-ICARAI-01_1, / }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover do rascunho' }));
    expect(screen.queryByRole('button', { name: /^OLT-ICARAI-01_1, / })).not.toBeInTheDocument();
  });

  it('permite visualizar e editar a posição estrutural em grade (GRID) de um componente', async () => {
    vi.mocked(listResourceTypeRelationshipRules).mockResolvedValue([
      {
        '@type': 'ResourceTypeRelationshipRule',
        id: 'rule-grid-1',
        href: '',
        sourceResourceTypeId: 'rt-olt',
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: 'rt-cto',
        configuration: {
          version: 1,
          placementPolicy: 'GRID',
          rows: 2,
          columns: 8,
          fillOrder: 'row-major',
        },
        lifecycleStatus: 'Active',
      },
    ]);
    vi.mocked(fetchResourceEditor).mockResolvedValueOnce({
      resource: {
        id: 'res-board-1',
        name: 'BOARD-01',
        '@type': 'PhysicalResource',
        resourceSpecificationId: 'spec-1',
        characteristic: [],
      },
      resourceType: {
        id: 'rt-olt',
        code: 'BOARD',
        name: 'Board',
        resourceTypeCharacteristic: [],
      },
      specification: {
        id: 'spec-1',
        name: 'Placa GPON 16 Portas',
        relatedParty: [],
      },
      components: [
        {
          id: 'port-1',
          name: 'PORT-01',
          kind: 'PhysicalResource',
          depth: 1,
          parentId: 'res-board-1',
          specification: { id: 'spec-cto-1', name: 'Porta Óptica' },
          relationshipId: 'rel-edge-grid-1',
          relationshipDefinitionId: 'rule-grid-1',
          placement: { placementPolicy: 'GRID', row: 1, column: 2 },
        },
      ],
      relationships: [],
      siteRelationships: [],
    });

    render(<ResourceEditorModal resourceId="res-board-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Componentes' })[0]!);

    const rowInput = await screen.findByLabelText('Linha estrutural');
    const colInput = await screen.findByLabelText('Coluna estrutural');
    expect(rowInput).toHaveValue(1);
    expect(colInput).toHaveValue(2);

    fireEvent.change(rowInput, { target: { value: '2' } });
    fireEvent.change(colInput, { target: { value: '5' } });
    expect(rowInput).toHaveValue(2);
    expect(colInput).toHaveValue(5);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(saveResourceAggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          components: [
            expect.objectContaining({
              id: 'port-1',
              relationshipId: 'rel-edge-grid-1',
              relationshipDefinitionId: 'rule-grid-1',
              placement: { placementPolicy: 'GRID', row: 2, column: 5 },
            }),
          ],
        }),
      );
    });
  });
});
