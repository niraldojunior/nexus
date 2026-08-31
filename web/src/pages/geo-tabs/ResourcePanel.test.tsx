import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourcePanel } from './ResourcePanel';
import type { GeoTreeNode } from '../../services/geoTreeApi';

const mocks = vi.hoisted(() => ({
  useResourceDetail: vi.fn(),
  useResourceChildren: vi.fn(),
}));

vi.mock('../../hooks/useResourceDetail', () => ({ useResourceDetail: mocks.useResourceDetail }));
vi.mock('../../hooks/useResourceChildren', () => ({ useResourceChildren: mocks.useResourceChildren }));
vi.mock('./ResourceOverviewTab', () => ({
  ResourceOverviewTab: () => <div>Detalhe da CTO</div>,
}));
vi.mock('./ResourceHistoryTab', () => ({
  ResourceHistoryTab: ({ resourceId }: { resourceId: string }) => <div>Histórico de {resourceId}</div>,
}));
vi.mock('./SchematicTab', () => ({
  SchematicTab: () => <div>Esquemático do recurso</div>,
}));
vi.mock('./ResourcePortsTab', () => ({
  ResourcePortsTab: ({ ctoNode, onOpenPort }: { ctoNode: GeoTreeNode; onOpenPort: (n: GeoTreeNode) => void }) => (
    <button type="button" onClick={() => onOpenPort(ctoNode)}>
      Porta de {ctoNode.label}
    </button>
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

afterEach(() => {
  cleanup();
  mocks.useResourceDetail.mockReset();
  mocks.useResourceChildren.mockReset();
});

function renderPanel() {
  mocks.useResourceDetail.mockReturnValue({ detail: {}, loading: false, error: null });
  mocks.useResourceChildren.mockReturnValue({ children: [], loading: false });
  const props = {
    isMobile: false,
    node,
    onOpenResource: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    onDropSimulation: vi.fn(),
    onPreview: vi.fn(),
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

  it('abre a aba Histórico', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));
    expect(screen.getByText('Histórico de cto-1')).toBeInTheDocument();
  });

  it('sem onOpenPort, CTO mantém "Recursos internos" (comportamento de sempre)', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Portas' })).not.toBeInTheDocument();
  });

  it('com onOpenPort, CTO troca "Recursos internos" por "Portas" e delega ao callback', () => {
    mocks.useResourceDetail.mockReturnValue({ detail: {}, loading: false, error: null });
    mocks.useResourceChildren.mockReturnValue({ children: [], loading: false });
    const onOpenPort = vi.fn();
    render(
      <ResourcePanel
        isMobile={false}
        node={node}
        onOpenResource={vi.fn()}
        onOpenPort={onOpenPort}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onDropSimulation={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Recursos internos' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Portas' }));
    fireEvent.click(screen.getByText('Porta de CDOE-6746'));
    expect(onOpenPort).toHaveBeenCalledWith(node);
  });

  it('com onOpenPort, recurso não-CTO mantém "Recursos internos"', () => {
    mocks.useResourceDetail.mockReturnValue({ detail: {}, loading: false, error: null });
    mocks.useResourceChildren.mockReturnValue({ children: [], loading: false });
    const naoCto: GeoTreeNode = { ...node, id: 'resource:rack-1', refId: 'rack-1', resourceType: 'Rack' };
    render(
      <ResourcePanel
        isMobile={false}
        node={naoCto}
        onOpenResource={vi.fn()}
        onOpenPort={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onDropSimulation={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Recursos internos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Portas' })).not.toBeInTheDocument();
  });
});
