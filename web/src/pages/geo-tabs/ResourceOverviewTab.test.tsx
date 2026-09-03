import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceOverviewTab } from './ResourceOverviewTab';
import type {
  PhysicalResourceDetail,
  ResourceLayer,
  ResourceSpecification,
  ResourceType,
} from '../../services/resourceApi';

const mocks = vi.hoisted(() => ({
  useResourceSearch: vi.fn(),
  listResourceLayers: vi.fn(),
  listResourceTypes: vi.fn(),
  listResourceSpecifications: vi.fn(),
}));

vi.mock('../../hooks/useResourceSearch', () => ({ useResourceSearch: mocks.useResourceSearch }));

// A cascata de Modelo (Topologia→Tipo→Fornecedor→Modelo) busca o catálogo sob demanda — só as
// 3 funções que ela chama são mockadas, o resto do módulo real (tipos, helpers) permanece intacto.
vi.mock('../../services/resourceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/resourceApi')>();
  return {
    ...actual,
    listResourceLayers: mocks.listResourceLayers,
    listResourceTypes: mocks.listResourceTypes,
    listResourceSpecifications: mocks.listResourceSpecifications,
  };
});

// Catálogo de apoio para a cascata: 2 topologias, "CTO" e "Splitter" na GPON, 2 fabricantes na
// GPON/CTO (Furukawa com 2 modelos, Nokia com 1) — cobre filtragem em todos os 4 níveis.
const CASCADE_LAYERS: ResourceLayer[] = [
  { '@type': 'ResourceLayer', id: 'resource-layer-gpon-network', href: '', code: 'gpon_network', name: 'Rede GPON', status: 'active' },
  { '@type': 'ResourceLayer', id: 'resource-layer-p2p', href: '', code: 'p2p', name: 'Rede P2P', status: 'active' },
];
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
    resourceLayerId: 'resource-layer-gpon-network',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'FDT 8' }],
    relatedParty: [{ id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-cto-16',
    name: 'CTO 16 portas',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceLayerId: 'resource-layer-gpon-network',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'FDT 16' }],
    relatedParty: [{ id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-cto-nokia',
    name: 'CTO Nokia',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceLayerId: 'resource-layer-gpon-network',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'FlexBox' }],
    relatedParty: [{ id: 'party-nokia', name: 'Nokia', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-splitter',
    name: 'Splitter 1x8',
    category: 'Infrastructure.Passive',
    resourceType: 'Splitter',
    resourceLayerId: 'resource-layer-gpon-network',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'SP1x8' }],
    relatedParty: [{ id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-cto-p2p',
    name: 'CTO P2P',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceLayerId: 'resource-layer-p2p',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'P2P Box' }],
    relatedParty: [{ id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
];

// PlacePicker tem cobertura própria (busca de local via usePlaceSearch/usePlaceLabel) — aqui só
// interessa confirmar que ResourceOverviewTab liga onChange -> onPatch({placeId, placeType}).
vi.mock('../../components/PlacePicker', () => ({
  PlacePicker: ({
    onChange,
  }: {
    onChange: (place: { id: string; '@referredType': string } | null) => void;
  }) => (
    <button type="button" onClick={() => onChange({ id: 'site-2', '@referredType': 'GeographicSite' })}>
      Selecionar Estação Icaraí
    </button>
  ),
}));

beforeEach(() => {
  mocks.useResourceSearch.mockReturnValue({ options: [], searching: false });
  mocks.listResourceLayers.mockResolvedValue(CASCADE_LAYERS);
  mocks.listResourceTypes.mockResolvedValue(CASCADE_TYPES);
  mocks.listResourceSpecifications.mockResolvedValue(CASCADE_SPECIFICATIONS);
});

afterEach(() => {
  cleanup();
  mocks.listResourceLayers.mockReset();
  mocks.listResourceTypes.mockReset();
  mocks.listResourceSpecifications.mockReset();
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
    resourceTypeName: 'CTO',
    resourceLayerId: 'resource-layer-gpon-network',
    manufacturer: {
      id: 'party-furukawa',
      name: 'Furukawa',
      '@referredType': 'Organization',
    },
    model: 'FDT 8',
    resourceLayer: {
      id: 'resource-layer-gpon-network',
      code: 'gpon_network',
      name: 'Rede GPON',
      '@referredType': 'ResourceLayer',
    },
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
  it('prioriza os atributos de catálogo e mostra os estados SID localizados', () => {
    render(
      <ResourceOverviewTab
        detail={detail()}
        canEdit={false}
        onPatch={vi.fn()}
        onChangeParent={vi.fn()}
      />,
    );

    expect(screen.getByText('Furukawa')).toBeInTheDocument();
    expect(screen.getByText('FDT 8')).toBeInTheDocument();
    expect(screen.getByText('Rede GPON')).toBeInTheDocument();
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
        onChangeParent={vi.fn()}
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
        onChangeParent={vi.fn()}
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
        onChangeParent={vi.fn()}
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
        onChangeParent={vi.fn()}
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
        onChangeParent={vi.fn()}
      />,
    );

    const badge = screen.getByText('Bloqueado');
    expect(badge.className).toContain('text-status-red');
  });

  it('mostra "—" para campos ausentes em vez de ocultar a linha', () => {
    render(
      <ResourceOverviewTab
        detail={detail({
          place: undefined,
          location: undefined,
          servingSite: undefined,
          project: undefined,
          statusCatalogEntry: undefined,
        })}
        canEdit={false}
        onPatch={vi.fn()}
        onChangeParent={vi.fn()}
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('abre o recurso pai quando o usuário clica na referência', () => {
    const onOpenResource = vi.fn();
    render(
      <ResourceOverviewTab
        detail={detail({
          parent: {
            id: 'parent-1',
            name: 'Splitter S8',
            '@referredType': 'PhysicalResource',
            relationshipType: 'containsAsChild',
          },
        })}
        canEdit={false}
        onPatch={vi.fn()}
        onChangeParent={vi.fn()}
        onOpenResource={onOpenResource}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Splitter S8' }));
    expect(onOpenResource).toHaveBeenCalledWith('parent-1');
  });

  it('com canEdit, editar o estado administrativo chama onPatch com o novo valor', () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceOverviewTab detail={detail()} canEdit onPatch={onPatch} onChangeParent={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Editar Estado administrativo'));
    fireEvent.change(screen.getByLabelText('Estado administrativo'), {
      target: { value: 'locked' },
    });

    expect(onPatch).toHaveBeenCalledWith({ administrativeState: 'locked' });
  });

  it('sem canEdit, não mostra nenhum alvo de edição', () => {
    render(
      <ResourceOverviewTab
        detail={detail()}
        canEdit={false}
        onPatch={vi.fn()}
        onChangeParent={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/^Editar /)).not.toBeInTheDocument();
  });

  it('Observações: editar preserva o grupo _origin (C5) — reenvia o array inteiro', () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceOverviewTab detail={detail()} canEdit onPatch={onPatch} onChangeParent={vi.fn()} />,
    );

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

  it('Recurso Pai: escolher um candidato chama onChangeParent com o novo id', async () => {
    mocks.useResourceSearch.mockReturnValue({
      options: [{ id: 'splitter-2', name: 'Splitter S9', resourceType: 'Splitter' }],
      searching: false,
    });
    const onChangeParent = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceOverviewTab
        detail={detail()}
        canEdit
        onPatch={vi.fn()}
        onChangeParent={onChangeParent}
      />,
    );

    fireEvent.click(screen.getByLabelText('Editar Recurso Pai'));
    fireEvent.change(screen.getByLabelText('Buscar recurso pai'), { target: { value: 'Splitter' } });
    fireEvent.click(await screen.findByText('Splitter S9'));

    expect(onChangeParent).toHaveBeenCalledWith('splitter-2');
  });

  it('Recurso Pai: com pai atual, "Remover recurso pai" chama onChangeParent(null)', () => {
    const onChangeParent = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceOverviewTab
        detail={detail({
          parent: {
            id: 'parent-1',
            name: 'Splitter S8',
            '@referredType': 'PhysicalResource',
            relationshipType: 'containsAsChild',
          },
        })}
        canEdit
        onPatch={vi.fn()}
        onChangeParent={onChangeParent}
      />,
    );

    fireEvent.click(screen.getByLabelText('Editar Recurso Pai'));
    fireEvent.click(screen.getByText('Remover recurso pai'));

    expect(onChangeParent).toHaveBeenCalledWith(null);
  });

  it('Endereço: selecionar um local no PlacePicker chama onPatch com placeId/placeType', () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceOverviewTab detail={detail()} canEdit onPatch={onPatch} onChangeParent={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Editar Endereço'));
    fireEvent.click(screen.getByText('Selecionar Estação Icaraí'));

    expect(onPatch).toHaveBeenCalledWith({ placeId: 'site-2', placeType: 'GeographicSite' });
  });

  it('Modelo: abre a busca sob demanda e pré-carrega os 4 níveis com os valores atuais', async () => {
    render(
      <ResourceOverviewTab detail={detail()} canEdit onPatch={vi.fn()} onChangeParent={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Editar Modelo'));

    expect(await screen.findByLabelText('Modelo')).toHaveValue('spec-cto');
    expect(screen.getByLabelText('Topologia')).toHaveValue('resource-layer-gpon-network');
    expect(screen.getByLabelText('Tipo de equipamento')).toHaveValue('CTO');
    expect(screen.getByLabelText('Fornecedor')).toHaveValue('party-furukawa');
    expect(mocks.listResourceLayers).toHaveBeenCalledTimes(1);
    expect(mocks.listResourceSpecifications).toHaveBeenCalledTimes(1);
  });

  it('Modelo: trocar Fornecedor só filtra o nível de Modelo — nenhum onPatch até o nível 4 confirmar', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <ResourceOverviewTab detail={detail()} canEdit onPatch={onPatch} onChangeParent={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Editar Modelo'));
    await screen.findByLabelText('Modelo');

    fireEvent.change(screen.getByLabelText('Fornecedor'), { target: { value: 'party-nokia' } });
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Modelo')).toHaveValue('spec-cto-nokia');

    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'spec-cto-nokia' } });
    expect(onPatch).toHaveBeenCalledWith({ resourceSpecificationId: 'spec-cto-nokia' });
  });

  it('Modelo: trocar Topologia reseta Tipo/Fornecedor/Modelo para a primeira opção compatível', async () => {
    render(
      <ResourceOverviewTab detail={detail()} canEdit onPatch={vi.fn()} onChangeParent={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Editar Modelo'));
    await screen.findByLabelText('Modelo');

    fireEvent.change(screen.getByLabelText('Topologia'), { target: { value: 'resource-layer-p2p' } });

    expect(screen.getByLabelText('Tipo de equipamento')).toHaveValue('CTO');
    expect(screen.getByLabelText('Fornecedor')).toHaveValue('party-furukawa');
    expect(screen.getByLabelText('Modelo')).toHaveValue('spec-cto-p2p');
  });
});
