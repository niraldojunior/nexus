import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourcePanel } from './ResourcePanel';
import type { GeoTreeNode } from '../../services/geoTreeApi';

const mocks = vi.hoisted(() => ({
  useResourceDetail: vi.fn(),
  useResourceChildren: vi.fn(),
  useResourceCoverage: vi.fn(),
  usePortDetail: vi.fn(),
  usePortService: vi.fn(),
}));

vi.mock('../../hooks/useResourceDetail', () => ({ useResourceDetail: mocks.useResourceDetail }));
vi.mock('../../hooks/useResourceChildren', () => ({
  useResourceChildren: mocks.useResourceChildren,
}));
vi.mock('../../hooks/useResourceCoverage', () => ({
  useResourceCoverage: mocks.useResourceCoverage,
}));
vi.mock('../../hooks/usePortDetail', () => ({ usePortDetail: mocks.usePortDetail }));
vi.mock('../../hooks/usePortService', () => ({ usePortService: mocks.usePortService }));
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
vi.mock('./SchematicTab', () => ({
  SchematicTab: () => <div>Esquemático do recurso</div>,
}));
vi.mock('./ResourcePortsTab', () => ({
  ResourcePortsTab: ({
    ctoNode,
    onOpenPort,
  }: {
    ctoNode: GeoTreeNode;
    onOpenPort: (n: GeoTreeNode) => void;
  }) => (
    <button type="button" onClick={() => onOpenPort(ctoNode)}>
      Porta de {ctoNode.label}
    </button>
  ),
}));
vi.mock('./ResourceCoverageTab', () => ({
  ResourceCoverageTab: ({ resourceId }: { resourceId: string }) => (
    <div>Cobertura de {resourceId}</div>
  ),
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
  mocks.useResourceDetail.mockReturnValue({ detail: {}, loading: false, error: null });
  mocks.useResourceChildren.mockReturnValue({ children: [], loading: false });
  mocks.usePortDetail.mockReturnValue({ detail: null, loading: false, error: null });
  mocks.usePortService.mockReturnValue({
    service: null,
    hasActiveService: false,
    loading: false,
    error: null,
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
  it('mostra as quatro abas e delega o carregamento ao detalhe especializado', () => {
    renderPanel();

    expect(mocks.useResourceDetail).toHaveBeenCalledWith('cto-1');
    expect(screen.getByRole('button', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recursos internos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esquemático' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
    expect(screen.getByText('Detalhe da CTO')).toBeInTheDocument();
  });

  it('mostra Cobertura para Resource com geometria Point e a monta sob demanda', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Cobertura' })).toBeInTheDocument();
    expect(screen.queryByText('Cobertura de cto-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cobertura' }));
    expect(screen.getByText('Cobertura de cto-1')).toBeInTheDocument();
  });

  it('não mostra Cobertura para Resource sem geometria Point', () => {
    renderPanel({
      node: { ...node, id: 'resource:cabo-1', refId: 'cabo-1', geometry: undefined },
    });

    expect(screen.queryByRole('button', { name: 'Cobertura' })).not.toBeInTheDocument();
  });

  it('abre a aba Histórico', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));
    expect(screen.getByText('Histórico de cto-1')).toBeInTheDocument();
  });

  it('sem onOpenPort, CTO mantém Recursos internos', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Portas' })).not.toBeInTheDocument();
  });

  it('com onOpenPort, CTO troca Recursos internos por Portas e delega ao callback', () => {
    const onOpenPort = vi.fn();
    renderPanel({ onOpenPort });

    expect(screen.queryByRole('button', { name: 'Recursos internos' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Portas' }));
    fireEvent.click(screen.getByText('Porta de CDOE-6746'));
    expect(onOpenPort).toHaveBeenCalledWith(node);
  });

  it('com onOpenPort, recurso não-CTO mantém Recursos internos', () => {
    renderPanel({
      node: { ...node, id: 'resource:rack-1', refId: 'rack-1', resourceType: 'Rack' },
      onOpenPort: vi.fn(),
    });

    expect(screen.getByRole('button', { name: 'Recursos internos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Portas' })).not.toBeInTheDocument();
  });

  it('especializa a Porta sem chrome geográfico, renomeia a aba e mostra drops e a ONT', () => {
    mocks.usePortDetail.mockReturnValue({ detail: portDetail, loading: false, error: null });
    const { onOpenResource } = renderPanel({ node: portNode });

    expect(mocks.usePortDetail).toHaveBeenCalledWith('porta-1', true);
    expect(screen.getByText('Detalhe da porta')).toBeInTheDocument();
    expect(screen.queryByText('Street View')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cobertura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Esquemático' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Serviço' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recursos internos/ })).not.toBeInTheDocument();

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
