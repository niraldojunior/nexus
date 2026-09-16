import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceOverviewTab } from './ResourceOverviewTab';
import type {
  PhysicalResourceDetail,
  ResourceSpecification,
  ResourceType,
} from '../../services/resourceApi';

const mocks = vi.hoisted(() => ({
  listResourceTypes: vi.fn(),
  listResourceSpecifications: vi.fn(),
  getResourceTypeCatalogContext: vi.fn(),
  listResourceCatalogs: vi.fn(),
  getResourceCatalogTree: vi.fn(),
  getResourceModelSnapshotSource: vi.fn(),
}));

vi.mock('../../services/resourceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/resourceApi')>();
  return {
    ...actual,
    listResourceTypes: mocks.listResourceTypes,
    listResourceSpecifications: mocks.listResourceSpecifications,
    getResourceTypeCatalogContext: mocks.getResourceTypeCatalogContext,
  };
});

vi.mock('../../services/resourceCatalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/resourceCatalogApi')>();
  return {
    ...actual,
    listResourceCatalogs: mocks.listResourceCatalogs,
    getResourceCatalogTree: mocks.getResourceCatalogTree,
    getResourceModelSnapshotSource: mocks.getResourceModelSnapshotSource,
    listResourceSpecifications: mocks.listResourceSpecifications,
  };
});

const CASCADE_TYPES: ResourceType[] = [
  { '@type': 'ResourceType', id: 'type-cto', href: '', code: 'CTO', name: 'CTO', categoryCode: 'Infrastructure.Passive', status: 'active' },
  { '@type': 'ResourceType', id: 'type-splitter', href: '', code: 'Splitter', name: 'Splitter', categoryCode: 'Infrastructure.Passive', status: 'active' },
];
const CASCADE_SPECIFICATIONS: ResourceSpecification[] = [
  {
    id: 'spec-cto',
    name: 'CTO 8 portas',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'FDT 8' }],
    relatedParty: [{ id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-cto-16',
    name: 'CTO 16 portas',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'FDT 16' }],
    relatedParty: [{ id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-cto-nokia',
    name: 'CTO Nokia',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'FlexBox' }],
    relatedParty: [{ id: 'party-nokia', name: 'Nokia', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-splitter',
    name: 'Splitter 1x8',
    category: 'Infrastructure.Passive',
    resourceType: 'Splitter',
    resourceTypeId: 'type-splitter',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'SP1x8' }],
    relatedParty: [{ id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
];

const CATALOG_CONTEXT = {
  resourceType: { id: 'type-cto', code: 'CTO', name: 'CTO' },
  catalogPaths: [
    {
      catalog: { id: 'catalog-1', code: 'default', name: 'Catálogo padrão' },
      nodes: [
        { id: 'node-1', code: 'telecom', name: 'Telecom', kind: 'GROUP' as const },
        { id: 'node-2', code: 'rede-acesso', name: 'Rede de Acesso', kind: 'GROUP' as const },
        { id: 'node-3', code: 'gpon', name: 'GPON', kind: 'GROUP' as const },
        { id: 'node-4', code: 'distribuicao', name: 'Distribuição', kind: 'GROUP' as const },
        { id: 'node-5', code: 'CDOE', name: 'CDOE', kind: 'RESOURCE_TYPE' as const },
      ],
    },
  ],
};

const CATALOG_SNAPSHOT = {
  catalog: { id: 'catalog-1', name: 'Padrão', code: 'DEFAULT', status: 'active', isDefault: true },
  nodes: [
    {
      id: 'node-1',
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
          resourceType: CASCADE_TYPES[0],
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
          resourceType: CASCADE_TYPES[1],
          status: 'active' as const,
          sortOrder: 2,
        },
      ],
    },
  ],
  resourceTypes: CASCADE_TYPES,
  relationshipRules: [],
};

beforeEach(() => {
  mocks.listResourceTypes.mockResolvedValue(CASCADE_TYPES);
  mocks.listResourceSpecifications.mockResolvedValue(CASCADE_SPECIFICATIONS);
  mocks.getResourceTypeCatalogContext.mockResolvedValue(CATALOG_CONTEXT);
  mocks.listResourceCatalogs.mockResolvedValue([CATALOG_SNAPSHOT.catalog]);
  mocks.getResourceCatalogTree.mockResolvedValue(CATALOG_SNAPSHOT.nodes);
  mocks.getResourceModelSnapshotSource.mockResolvedValue(CATALOG_SNAPSHOT);
});

afterEach(() => {
  cleanup();
  mocks.listResourceTypes.mockReset();
  mocks.listResourceSpecifications.mockReset();
  mocks.getResourceTypeCatalogContext.mockReset();
  mocks.listResourceCatalogs.mockReset();
  mocks.getResourceCatalogTree.mockReset();
  mocks.getResourceModelSnapshotSource.mockReset();
});

const detail = (overrides: Partial<PhysicalResourceDetail> = {}): PhysicalResourceDetail => ({
  '@type': 'PhysicalResourceDetail',
  resource: {
    '@type': 'PhysicalResource',
    id: 'cto-1',
    name: 'CDOE-6746',
    resourceSpecificationId: 'spec-cto',
    resourceType: 'CTO',
    status: 'active',
    administrativeState: 'unlocked',
    operationalState: 'enabled',
    usageState: 'active',
    label: 'CDOE-6746',
    assetReference: 'SAP-1001',
    serialNumber: 'SN-123',
    partNumber: 'PN-8P',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
    characteristic: [{ name: '_origin.system', value: 'Netwin', group: '_origin' }],
  },
  specification: {
    '@type': 'ResourceSpecification',
    id: 'spec-cto',
    name: 'CTO 8 portas',
    category: 'Outside Plant',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceTypeName: 'CTO',
    manufacturer: {
      id: 'party-furukawa',
      name: 'Furukawa',
      '@referredType': 'Organization',
    },
    model: 'FDT 8',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'FDT 8' }],
    relatedParty: [
      { id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' },
    ],
  },
  statusCatalogEntry: {
    '@type': 'ResourceStatusCatalogEntry',
    code: 'available',
    name: 'Disponível para ativação',
    sortOrder: 10,
    active: true,
    behavior: 'active',
  },
  place: {
    id: 'site-1',
    name: 'Icaraí',
    '@referredType': 'GeographicSite',
    streetType: 'Rua',
    streetName: 'Ator Paulo Gustavo',
    streetNr: '45',
    city: 'Niterói',
    stateOrProvince: 'RJ',
  },
  location: {
    id: 'loc-1',
    '@referredType': 'GeographicLocation',
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.10944, -22.90278] },
  },
  servingSite: { id: 'co-1', name: 'Estação Icaraí', '@referredType': 'GeographicSite' },
  project: { id: 'project-1', name: 'Expansão Icaraí', '@referredType': 'GeoProject' },
  childCount: 8,
  ...overrides,
});

describe('ResourceOverviewTab', () => {
  it('prioriza os atributos de catálogo e mostra os estados SID localizados', async () => {
    render(
      <ResourceOverviewTab
        detail={detail()}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByText('Furukawa')).toBeInTheDocument();
    expect(screen.getByText('FDT 8')).toBeInTheDocument();
    expect(await screen.findByText('Telecom \\ Rede de Acesso \\ GPON \\ Distribuição')).toBeInTheDocument();
    expect(screen.getByText('Desbloqueado')).toBeInTheDocument();
    expect(screen.getByText('Habilitado')).toBeInTheDocument();
    expect(screen.getByText('Em Uso')).toBeInTheDocument();
    expect(screen.getByText('Disponível para ativação')).toBeInTheDocument();
    expect(screen.getByText('Rua, Ator Paulo Gustavo, nº 45, Niterói, RJ')).toBeInTheDocument();
    expect(screen.getByText('01/08/2026')).toBeInTheDocument();
    expect(screen.getByText('02/08/2026')).toBeInTheDocument();

    // Campos removidos do padrão (issue #184): "Especificação do catálogo" e "Status SID".
    expect(screen.queryByText('CTO 8 portas')).not.toBeInTheDocument();
  });

  it('mostra a fonte entre parênteses quando o endereço tem sourceSystem', () => {
    render(
      <ResourceOverviewTab
        detail={detail({
          place: {
            ...(detail().place as NonNullable<PhysicalResourceDetail['place']>),
            sourceSystem: 'NETWIN',
          },
        })}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Rua, Ator Paulo Gustavo, nº 45, Niterói, RJ (netwin)'),
    ).toBeInTheDocument();
  });

  it('quando há endereço, não mostra coordenadas em Localização (evita duplicidade com Endereço)', () => {
    render(
      <ResourceOverviewTab
        detail={detail()}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.queryByText('[-43.10944, -22.90278]')).not.toBeInTheDocument();
  });

  it('quando só há coordenadas (sem endereço), mostra-as em Localização', () => {
    render(
      <ResourceOverviewTab
        detail={detail({ place: undefined })}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByText('[-43.10944, -22.90278]')).toBeInTheDocument();
  });

  it('nunca cai no id/hash técnico do place — sem rua, Endereço fica "—"', () => {
    render(
      <ResourceOverviewTab
        detail={detail({
          place: { id: 'site-1', name: 'Icaraí', '@referredType': 'GeographicSite' },
        })}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.queryByText('site-1')).not.toBeInTheDocument();
  });

  it('destaca o estado administrativo bloqueado com o tom vermelho', () => {
    render(
      <ResourceOverviewTab
        detail={detail({
          resource: { ...detail().resource, administrativeState: 'locked' },
        })}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    const badge = screen.getByText('Bloqueado');
    expect(badge.className).toContain('text-status-red');
  });

  it('oculta campos vazios para quem não pode editar', () => {
    render(
      <ResourceOverviewTab
        detail={detail({
          resource: {
            ...detail().resource,
            label: undefined,
            assetReference: undefined,
            serialNumber: undefined,
            partNumber: undefined,
            characteristic: [],
          },
          place: undefined,
          location: undefined,
          servingSite: undefined,
          project: undefined,
          statusCatalogEntry: undefined,
        })}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.queryByText('Endereço')).not.toBeInTheDocument();
    expect(screen.queryByText('Projeto de implantação')).not.toBeInTheDocument();
  });

  it('mantém disponível para edição um campo vazio quando há permissão', () => {
    render(
      <ResourceOverviewTab
        detail={detail({ resource: { ...detail().resource, serialNumber: undefined } })}
        canEdit
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Editar Nº de série')).toBeInTheDocument();
  });

  it('com canEdit, editar o estado administrativo chama onPatch com o novo valor', () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<ResourceOverviewTab detail={detail()} canEdit onPatch={onPatch} />);

    fireEvent.click(screen.getByLabelText('Editar Estado administrativo'));
    fireEvent.change(screen.getByLabelText('Estado administrativo'), {
      target: { value: 'locked' },
    });

    expect(onPatch).toHaveBeenCalledWith({ administrativeState: 'locked' });
  });

  it('sem canEdit, não mostra nenhum alvo de edição no card e nas linhas', () => {
    render(
      <ResourceOverviewTab
        detail={detail()}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/^Editar /)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar definição do recurso')).not.toBeInTheDocument();
  });

  it('Observações: editar preserva o grupo _origin (C5) — reenvia o array inteiro', () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<ResourceOverviewTab detail={detail()} canEdit onPatch={onPatch} />);

    const note = screen.getByLabelText('Observações do recurso');
    fireEvent.change(note, { target: { value: 'porta trocada em campo' } });
    fireEvent.blur(note);

    expect(onPatch).toHaveBeenCalledWith({
      characteristic: [
        { name: '_origin.system', value: 'Netwin', group: '_origin' },
        { name: 'notes', value: 'porta trocada em campo' },
      ],
    });
  });

  it('Definição do recurso: clicar no card abre o modal com a árvore e permite trocar a especificação', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<ResourceOverviewTab detail={detail()} canEdit onPatch={onPatch} />);

    fireEvent.click(screen.getByLabelText('Editar definição do recurso'));

    // Espera o modal carregar os dados
    expect(await screen.findByText('1. Caminho e Tipo de Recurso no Catálogo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Definição do recurso' })).toBeInTheDocument();

    // Seleciona outra especificação e salva
    const specSelect = await screen.findByLabelText('Especificação');
    fireEvent.change(specSelect, { target: { value: 'spec-cto-nokia' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }));

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ resourceSpecificationId: 'spec-cto-nokia' });
    });
  });
});
