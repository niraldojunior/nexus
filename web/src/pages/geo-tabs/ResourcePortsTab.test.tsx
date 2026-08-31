import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourcePortsTab } from './ResourcePortsTab';
import type { GeoTreeNode } from '../../services/geoTreeApi';

const mocks = vi.hoisted(() => ({ useResourcePorts: vi.fn() }));
vi.mock('../../hooks/useResourcePorts', () => ({ useResourcePorts: mocks.useResourcePorts }));

const ctoNode: GeoTreeNode = {
  id: 'resource:cto-1', refId: 'cto-1', kind: 'resource', label: 'CDOE-6746', sublabel: 'CTO', resourceType: 'CTO', status: 'active', hasChildren: true,
};
const port = (id: string, role: string, index?: number) => ({
  '@type': 'ResourcePortDetail' as const,
  resource: {
    '@type': 'PhysicalResource' as const, id, href: `/resource/${id}`, name: role === 'FO.O' ? `Splitter · FO.O.${index}` : `Splitter · ${role}`,
    resourceSpecificationId: 'spec', resourceSpecification: { id: 'spec', '@referredType': 'ResourceSpecification' as const }, resourceType: 'Port',
    status: 'active' as const, administrativeState: 'unlocked' as const, operationalState: 'enabled' as const, usageState: 'idle' as const,
    characteristic: [],
  }, role, ...(index !== undefined ? { index } : {}), derivedUsageState: 'idle' as const, drops: [],
});
const splitter = { id: 'splitter-1', name: 'CDOE-6746 · Splitter', '@referredType': 'PhysicalResource' as const, resourceType: 'Splitter' };

afterEach(() => { cleanup(); mocks.useResourcePorts.mockReset(); });

describe('ResourcePortsTab', () => {
  it('mostra o estado de carregamento', () => {
    mocks.useResourcePorts.mockReturnValue({ groups: [], loading: true, error: null, reload: vi.fn() });
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={vi.fn()} />);
    expect(screen.getByText('Carregando portas…')).toBeInTheDocument();
  });

  it('mostra o erro separado do estado vazio', () => {
    mocks.useResourcePorts.mockReturnValue({ groups: [], loading: false, error: 'Falhou', reload: vi.fn() });
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={vi.fn()} />);
    expect(screen.getByText('Falhou')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('renderiza faróis SID e abre a porta com um nó de Resource', () => {
    mocks.useResourcePorts.mockReturnValue({
      groups: [{ splitter, ports: [port('p1', 'FO.I'), port('p2', 'FO.O', 1)] }], loading: false, error: null, reload: vi.fn(),
    });
    const onOpenPort = vi.fn();
    render(<ResourcePortsTab ctoNode={ctoNode} onOpenPort={onOpenPort} />);

    expect(screen.getByText('CDOE-6746 · Splitter')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Estados SID/X.731')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /FO\.O\.1/ }));
    expect(onOpenPort).toHaveBeenCalledWith(expect.objectContaining({ refId: 'p2', resourceType: 'Port', kind: 'resource' }));
  });
});
