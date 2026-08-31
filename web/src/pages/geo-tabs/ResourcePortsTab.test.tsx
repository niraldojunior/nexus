import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourcePortsTab } from './ResourcePortsTab';
import type { GeoTreeNode } from '../../services/geoTreeApi';

const mocks = vi.hoisted(() => ({ useResourcePorts: vi.fn() }));

vi.mock('../../hooks/useResourcePorts', () => ({ useResourcePorts: mocks.useResourcePorts }));

const ctoNode: GeoTreeNode = {
  id: 'resource:cto-1',
  refId: 'cto-1',
  kind: 'resource',
  label: 'CDOE-6746',
  sublabel: 'CTO',
  resourceType: 'CTO',
  status: 'active',
  hasChildren: true,
};

function portNode(label: string, extra: Partial<GeoTreeNode> = {}): GeoTreeNode {
  return {
    id: `resource:${label}`,
    refId: label,
    kind: 'resource',
    label,
    resourceType: 'Port',
    status: 'active',
    hasChildren: false,
    ...extra,
  };
}

afterEach(() => {
  cleanup();
  mocks.useResourcePorts.mockReset();
});

describe('ResourcePortsTab', () => {
  it('mostra o estado de carregamento', () => {
    mocks.useResourcePorts.mockReturnValue({ groups: [], loading: true });
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={vi.fn()} />);
    expect(screen.getByText('Carregando portas…')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando a CTO não tem splitter materializado', () => {
    mocks.useResourcePorts.mockReturnValue({ groups: [], loading: false });
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={vi.fn()} />);
    expect(
      screen.getByText('Esta CTO ainda não tem splitter/portas materializados.'),
    ).toBeInTheDocument();
  });

  it('renderiza as portas do splitter na ordem devolvida pelo hook (FO.I, depois FO.O.1..N)', () => {
    // A ordenação em si é responsabilidade de `useResourcePorts` (mockado aqui) — este
    // teste cobre que o componente não embaralha a ordem recebida.
    const splitter = { ...ctoNode, id: 'resource:splitter-1', label: 'CDOE-6746 · Splitter', resourceType: 'Splitter' };
    mocks.useResourcePorts.mockReturnValue({
      groups: [
        {
          splitter,
          ports: [
            portNode('CDOE-6746 · Splitter · FO.I'),
            portNode('CDOE-6746 · Splitter · FO.O.1'),
            portNode('CDOE-6746 · Splitter · FO.O.2'),
          ],
        },
      ],
      loading: false,
    });
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={vi.fn()} />);

    expect(screen.getByText('CDOE-6746 · Splitter')).toBeInTheDocument();
    const rows = screen.getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('FO.I'),
      expect.stringContaining('FO.O.1'),
      expect.stringContaining('FO.O.2'),
    ]);
  });

  it('mostra o selo de status e delega o clique da porta a onOpenPort', () => {
    const splitter = { ...ctoNode, id: 'resource:splitter-1', label: 'Splitter', resourceType: 'Splitter' };
    const p = portNode('Splitter · FO.I');
    mocks.useResourcePorts.mockReturnValue({ groups: [{ splitter, ports: [p] }], loading: false });
    const onOpenPort = vi.fn();
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={onOpenPort} />);

    fireEvent.click(screen.getByRole('button', { name: /FO\.I/ }));
    expect(onOpenPort).toHaveBeenCalledWith(p);
  });

  it('mostra o estado vazio de um splitter específico sem portas', () => {
    const splitter = { ...ctoNode, id: 'resource:splitter-1', label: 'Splitter sem porta', resourceType: 'Splitter' };
    mocks.useResourcePorts.mockReturnValue({ groups: [{ splitter, ports: [] }], loading: false });
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={vi.fn()} />);
    expect(screen.getByText('Splitter sem portas materializadas.')).toBeInTheDocument();
  });
});
