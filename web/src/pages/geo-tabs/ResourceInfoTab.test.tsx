import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceInfoTab } from './ResourceInfoTab';
import type { PhysicalResourceDetail } from '../../services/resourceApi';

const mocks = vi.hoisted(() => ({
  getResourceTypeCatalogContext: vi.fn(),
  getGeoSite: vi.fn(),
  listGeoSiteSpecifications: vi.fn(),
}));

vi.mock('../../services/geoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geoApi')>();
  return {
    ...actual,
    getGeoSite: mocks.getGeoSite,
    listGeoSiteSpecifications: mocks.listGeoSiteSpecifications,
  };
});

vi.mock('../../services/resourceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/resourceApi')>();
  return {
    ...actual,
    getResourceTypeCatalogContext: mocks.getResourceTypeCatalogContext,
  };
});

const CATALOG_CONTEXT = {
  resourceType: {
    id: 'type-cto',
    code: 'CTO',
    name: 'CTO',
    resourceTypeCharacteristic: [
      { name: 'ports', valueType: 'integer', characteristicLevel: 'specification' },
      { name: 'mac_address', valueType: 'string', characteristicLevel: 'instance' },
    ],
  },
  catalogPaths: [
    {
      catalog: { id: 'catalog-1', code: 'default', name: 'Catálogo padrão' },
      nodes: [
        { id: 'node-1', code: 'telecom', name: 'Telecom', kind: 'GROUP' as const },
        { id: 'node-2', code: 'rede-acesso', name: 'Rede de Acesso', kind: 'GROUP' as const },
        { id: 'node-3', code: 'gpon', name: 'GPON', kind: 'GROUP' as const },
        { id: 'node-5', code: 'CDOE', name: 'CDOE', kind: 'RESOURCE_TYPE' as const },
      ],
    },
  ],
};

beforeEach(() => {
  mocks.getResourceTypeCatalogContext.mockResolvedValue(CATALOG_CONTEXT);
  mocks.getGeoSite.mockResolvedValue({ id: 'co-1', siteSpecificationId: 'spec-co' });
  mocks.listGeoSiteSpecifications.mockResolvedValue([
    {
      id: 'spec-co',
      code: 'CO',
      name: 'Central Office',
      category: 'Site',
      visualIdentity: { kind: 'system', iconCode: 'CO' },
    },
  ]);
});

afterEach(() => {
  cleanup();
  Object.values(mocks).forEach((mock) => mock.mockReset());
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
    label: 'ETQ-6746',
    assetReference: 'SAP-1001',
    serialNumber: 'SN-123',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
    characteristic: [
      { name: '_origin.system', value: 'Netwin', group: '_origin' },
      { name: 'notes', value: 'observação existente' },
      { name: 'mac_address', value: '00:11:22:33:44:55' },
    ],
  },
  specification: {
    '@type': 'ResourceSpecification',
    id: 'spec-cto',
    name: 'CTO 8 portas',
    category: 'Outside Plant',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceTypeName: 'CTO',
    manufacturer: { id: 'party-furukawa', name: 'Furukawa', '@referredType': 'Organization' },
    model: 'FDT 8',
    resourceSpecificationCharacteristic: [{ name: 'ports', value: 8 }],
    relatedParty: [],
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
  project: { id: 'project-1', name: 'Expansão Icaraí', '@referredType': 'Project' },
  childCount: 8,
  ...overrides,
});

const openSubTab = (name: 'Geral' | 'Modelo' | 'Equipamento') =>
  fireEvent.click(screen.getByRole('tab', { name }));

describe('ResourceInfoTab', () => {
  it('abre em Geral, com sub-abas Geral | Modelo | Equipamento', () => {
    render(<ResourceInfoTab detail={detail()} />);

    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Modelo' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Equipamento' })).toBeInTheDocument();
  });

  it('Geral: estados, endereço, coordenada, projeto, datas e observações — sem origem', () => {
    render(<ResourceInfoTab detail={detail()} />);

    expect(screen.getByText('Disponível para ativação')).toBeInTheDocument();
    expect(screen.getByText('Desbloqueado')).toBeInTheDocument();
    expect(screen.getByText('Habilitado')).toBeInTheDocument();
    expect(screen.getByText('Em Uso')).toBeInTheDocument();
    expect(screen.getByText('ETQ-6746')).toBeInTheDocument();
    expect(screen.getByText('Rua, Ator Paulo Gustavo, nº 45, Niterói, RJ')).toBeInTheDocument();
    // Coordenada aparece junto do endereço (não mais só quando não há endereço).
    expect(screen.getByText('[-43.10944, -22.90278]')).toBeInTheDocument();
    expect(screen.getByText('Expansão Icaraí')).toBeInTheDocument();
    expect(screen.getByText('01/08/2026')).toBeInTheDocument();
    expect(screen.getByText('02/08/2026')).toBeInTheDocument();
    expect(screen.queryByTitle('Sistema de origem')).not.toBeInTheDocument();
    expect(screen.queryByText('Netwin')).not.toBeInTheDocument();
    expect(screen.getByText('observação existente')).toBeInTheDocument();
    expect(screen.getByText('Estação Icaraí')).toBeInTheDocument();

    // Modelo e Equipamento não vazam para Geral.
    expect(screen.queryByText('Furukawa')).not.toBeInTheDocument();
    expect(screen.queryByText('SN-123')).not.toBeInTheDocument();
  });

  it('Geral: Local Atendido com o ícone da spec do local referenciado', async () => {
    const { container } = render(<ResourceInfoTab detail={detail()} />);

    const row = screen.getByTitle('Local Atendido');
    expect(row).toHaveTextContent('Estação Icaraí');
    // <img> só aparece quando a identidade da spec resolveu; o fallback é um glifo SVG.
    // (Não conferimos a chamada a getGeoSite: a spec do site fica em cache de módulo.)
    await waitFor(() => expect(row.querySelector('img')).not.toBeNull());
    expect(container.querySelector('[title="Estação abastecedora"]')).toBeNull();
  });

  it('Geral: separadores entre estados, Local Atendido, endereço, projeto e observações', () => {
    render(<ResourceInfoTab detail={detail()} />);

    const group = (hint: string) => screen.getByTitle(hint).parentElement!;
    const groups = [
      group('Estado de uso'),
      group('Local Atendido'),
      group('Endereço'),
      group('Projeto de implantação'),
      group('Observações'),
    ];

    // Cada um dos cinco campos cai num grupo próprio; só o primeiro não tem traço.
    expect(new Set(groups).size).toBe(5);
    expect(groups[0].className).not.toContain('border-t');
    for (const later of groups.slice(1)) expect(later.className).toContain('border-t');
  });

  it('Geral: mostra a fonte do endereço e nunca cai no id do place', () => {
    const { rerender } = render(
      <ResourceInfoTab
        detail={detail({
          place: {
            ...(detail().place as NonNullable<PhysicalResourceDetail['place']>),
            sourceSystem: 'NETWIN',
          },
        })}
      />,
    );
    expect(
      screen.getByText('Rua, Ator Paulo Gustavo, nº 45, Niterói, RJ (netwin)'),
    ).toBeInTheDocument();

    rerender(
      <ResourceInfoTab
        detail={detail({
          place: { id: 'site-1', name: 'Icaraí', '@referredType': 'GeographicSite' },
        })}
      />,
    );
    expect(screen.queryByText('site-1')).not.toBeInTheDocument();
  });

  it('Geral: destaca o estado administrativo bloqueado com o tom vermelho', () => {
    render(
      <ResourceInfoTab
        detail={detail({ resource: { ...detail().resource, administrativeState: 'locked' } })}
      />,
    );

    expect(screen.getByText('Bloqueado').className).toContain('text-status-red');
  });

  it('Modelo: path, tipo, especificação, fabricante, imobilizado e características de especificação', async () => {
    render(<ResourceInfoTab detail={detail()} />);
    openSubTab('Modelo');

    expect(await screen.findByText('Telecom \\ Rede de Acesso \\ GPON')).toBeInTheDocument();
    expect(screen.getByText('CTO')).toBeInTheDocument();
    expect(screen.getByText('FDT 8')).toBeInTheDocument();
    expect(screen.getByText('Furukawa')).toBeInTheDocument();
    expect(screen.getByText('SAP-1001')).toBeInTheDocument();
    // Característica em linha de ícone: o nome vai no hint (title), não em rótulo de texto.
    const ports = screen.getByTitle('ports');
    expect(ports).toHaveTextContent('8');
    expect(screen.queryByText('Características')).not.toBeInTheDocument();
    // Separador entre os campos fixos e as características da especificação.
    expect(ports.parentElement?.className).toContain('border-t');
    expect(screen.queryByLabelText('Editar ports')).not.toBeInTheDocument();
  });

  it('Equipamento: nº de série e características de instância, sem edição', async () => {
    render(<ResourceInfoTab detail={detail()} />);
    openSubTab('Equipamento');

    expect(screen.queryByText('Estação Icaraí')).not.toBeInTheDocument();
    expect(screen.getByText('SN-123')).toBeInTheDocument();
    expect(await screen.findByTitle('mac_address')).toHaveTextContent('00:11:22:33:44:55');
    expect(screen.queryByText('Características')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar mac_address')).not.toBeInTheDocument();
  });

  it('Equipamento: estado vazio quando não há nada de instância', async () => {
    mocks.getResourceTypeCatalogContext.mockResolvedValue({
      ...CATALOG_CONTEXT,
      resourceType: { ...CATALOG_CONTEXT.resourceType, resourceTypeCharacteristic: [] },
    });
    render(
      <ResourceInfoTab
        detail={detail({ resource: { ...detail().resource, serialNumber: undefined } })}
      />,
    );
    openSubTab('Equipamento');

    expect(
      await screen.findByText('Sem informações de equipamento para este recurso.'),
    ).toBeInTheDocument();
  });

  it('busca o contexto de catálogo uma única vez, servindo Modelo e Equipamento', async () => {
    render(<ResourceInfoTab detail={detail()} />);
    openSubTab('Modelo');
    await screen.findByText('Telecom \\ Rede de Acesso \\ GPON');
    openSubTab('Equipamento');
    await screen.findByTitle('mac_address');

    await waitFor(() => expect(mocks.getResourceTypeCatalogContext).toHaveBeenCalledTimes(1));
  });

  it('Porta: Geral usa a visão própria e Modelo sem detalhe cai no estado vazio', () => {
    render(<ResourceInfoTab detail={null} generalOverride={<div>Visão da porta</div>} />);

    expect(screen.getByText('Visão da porta')).toBeInTheDocument();
    openSubTab('Modelo');
    expect(screen.getByText('Sem informações de modelo para este recurso.')).toBeInTheDocument();
  });
});
