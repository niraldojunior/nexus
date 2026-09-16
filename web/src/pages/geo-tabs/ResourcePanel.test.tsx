import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourcePanel } from './ResourcePanel';
import type { GeoTreeNode } from '../../services/geoTreeApi';

const mocks = vi.hoisted(() => ({
  useResourceDetail: vi.fn(),
  usePortDetail: vi.fn(),
  usePortService: vi.fn(),
  useResourceComponents: vi.fn(),
  useResourceConnections: vi.fn(),
}));

vi.mock('../../hooks/useResourceDetail', () => ({ useResourceDetail: mocks.useResourceDetail }));
vi.mock('../../hooks/usePortDetail', () => ({ usePortDetail: mocks.usePortDetail }));
vi.mock('../../hooks/usePortService', () => ({ usePortService: mocks.usePortService }));
vi.mock('../../hooks/useResourceComponents', () => ({
  useResourceComponents: mocks.useResourceComponents,
}));
vi.mock('../../hooks/useResourceConnections', () => ({
  useResourceConnections: mocks.useResourceConnections,
}));
vi.mock('../../components/StreetViewHero', () => ({
  StreetViewHero: () => <div>Street View</div>,
}));
vi.mock('./ResourceOverviewTab', () => ({
  ResourceOverviewTab: () => <div>Detalhe da CTO</div>,
}));
vi.mock('./PortOverviewTab', () => ({
  PortOverviewTab: () => <div>Detalhe da porta</div>,
}));
vi.mock('./PortServiceTab', () => ({
  PortServiceTab: () => <div>Serviço da porta</div>,
}));
vi.mock('./ResourceHistoryTab', () => ({
  ResourceHistoryTab: ({ resourceId }: { resourceId: string }) => (
    <div>Histórico de {resourceId}</div>
  ),
}));
vi.mock('./ResourceComponentsTab', () => ({
  ResourceComponentsTab: ({
    resourceId,
  }: {
    resourceId: string;
  }) => <div>Componentes de {resourceId}</div>,
}));
vi.mock('./ResourceConnectionsView', () => ({
  ResourceConnectionsView: ({
    resourceId,
  }: {
    resourceId: string;
  }) => <div>Conexões de {resourceId}</div>,
}));

const node: GeoTreeNode = {
  id: 'resource:cto-1',
  refId: 'cto-1',
  kind: 'resource',
  label: 'CDOE-6746',
  sublabel: 'CTO',
  resourceType: 'CTO',
  status: 'active',
  hasChildren: true,
  geometry: { type: 'Point', coordinates: [-43.1, -22.9] },
};

const portNode: GeoTreeNode = {
  id: 'resource:porta-1',
  refId: 'porta-1',
  kind: 'resource',
  label: 'FO.O.1',
  sublabel: 'FO.O',
  resourceType: 'Port',
  status: 'active',
  hasChildren: false,
};

const portDetail = {
  '@type': 'ResourcePortDetail' as const,
  resource: {
    id: 'porta-1',
    name: 'FO.O.1',
    resourceType: 'Port',
    status: 'active',
    administrativeState: 'unlocked',
    operationalState: 'enabled',
    usageState: 'active',
  },
  role: 'FO.O',
  index: 1,
  derivedUsageState: 'active',
  hasActiveService: true,
  drops: [
    {
      resource: {
        id: 'drop-atual',
        name: 'Cabo Drop atual',
        '@referredType': 'PhysicalResource',
        resourceType: 'DropCable',
      },
      active: true,
      ont: {
        id: 'ont-1',
        name: 'ONT-CLIENTE-1',
        '@referredType': 'PhysicalResource',
        resourceType: 'ONT',
      },
    },
    {
      resource: {
        id: 'drop-historico',
        name: 'Cabo Drop histórico',
        '@referredType': 'PhysicalResource',
        resourceType: 'DropCable',
      },
      active: false,
    },
  ],
};

function defaultMocks() {
  mocks.useResourceDetail.mockReturnValue({
    detail: { childCount: 2 },
    loading: false,
    error: null,
    reload: vi.fn().mockResolvedValue(undefined),
  });
  mocks.usePortDetail.mockReturnValue({ detail: null, loading: false, error: null });
  mocks.usePortService.mockReturnValue({
    service: null,
    hasActiveService: false,
    loading: false,
    error: null,
  });
  mocks.useResourceComponents.mockReturnValue({
    components: [],
    truncated: false,
    loading: false,
    error: null,
    reload: vi.fn(),
  });
  mocks.useResourceConnections.mockReturnValue({
    connections: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  });
}

beforeEach(() => {
  defaultMocks();
});

afterEach(() => {
  cleanup();
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

function renderPanel(overrides: Partial<ComponentProps<typeof ResourcePanel>> = {}) {
  const props = {
    isMobile: false,
    canEdit: true,
    node,
    onOpenResource: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    onDropSimulation: vi.fn(),
    onPreview: vi.fn(),
    onPortDropPreview: vi.fn(),
    ...overrides,
  };
  render(<ResourcePanel {...props} />);
  return props;
}

describe('ResourcePanel', () => {
  it('mostra as abas e delega o carregamento ao detalhe especializado', () => {
    renderPanel();

    expect(mocks.useResourceDetail).toHaveBeenCalledWith('cto-1');
    expect(screen.getByRole('button', { name: 'Geral' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2Componentes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conexões' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Esquemático' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
    expect(screen.getByText('Detalhe da CTO')).toBeInTheDocument();
  });

  it('abre a aba Histórico', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));
    expect(screen.getByText('Histórico de cto-1')).toBeInTheDocument();
  });

  it('abre a aba Componentes e Conexões', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '2Componentes' }));
    expect(screen.getByText('Componentes de cto-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Conexões' }));
    expect(screen.getByText('Conexões de cto-1')).toBeInTheDocument();
  });

  it('especializa a Porta sem chrome geográfico, renomeia a aba e mostra drops e a ONT', () => {
    mocks.usePortDetail.mockReturnValue({ detail: portDetail, loading: false, error: null });
    const { onOpenResource } = renderPanel({ node: portNode });

    expect(mocks.usePortDetail).toHaveBeenCalledWith('porta-1', true);
    expect(screen.getByText('Detalhe da porta')).toBeInTheDocument();
    expect(screen.queryByText('Street View')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Esquemático' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Serviço' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Componentes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '3Recursos atendidos' }));
    expect(screen.getByText('Cabo Drop atual')).toBeInTheDocument();
    expect(screen.getByText('Conexão atual')).toBeInTheDocument();
    expect(screen.getByText('Cabo Drop histórico')).toBeInTheDocument();
    expect(screen.getByText('Conexão histórica')).toBeInTheDocument();
    expect(screen.getByText('ONT-CLIENTE-1')).toBeInTheDocument();
    expect(screen.getByText('ONT alimentada')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ONT-CLIENTE-1'));
    expect(onOpenResource).toHaveBeenCalledWith('ont-1');
  });

  it('mostra Serviço somente quando a cadeia ativa RFS para CFS existe', () => {
    mocks.usePortDetail.mockReturnValue({ detail: portDetail, loading: false, error: null });
    mocks.usePortService.mockReturnValue({
      service: { rfs: {}, cfs: {} },
      hasActiveService: true,
      loading: false,
      error: null,
    });
    renderPanel({ node: portNode });

    fireEvent.click(screen.getByRole('button', { name: 'Serviço' }));
    expect(screen.getByText('Serviço da porta')).toBeInTheDocument();
  });
});
