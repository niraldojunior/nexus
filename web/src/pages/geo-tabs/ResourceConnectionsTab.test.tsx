import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceConnectionsTab } from './ResourceConnectionsTab';

const mocks = vi.hoisted(() => ({ useResourceConnections: vi.fn() }));

vi.mock('../../hooks/useResourceConnections', () => ({
  useResourceConnections: mocks.useResourceConnections,
}));

const useResourceConnections = mocks.useResourceConnections;

afterEach(cleanup);

beforeEach(() => {
  useResourceConnections.mockReset();
});

describe('ResourceConnectionsTab', () => {
  it('mostra connectedTo simétrico apenas uma vez para o mesmo recurso', () => {
    useResourceConnections.mockReturnValue({
      connections: [
        {
          '@type': 'ResourceConnection',
          direction: 'incoming',
          relationshipType: 'connectedTo',
          resource: { id: 'cable-1', name: 'CABO-01', '@type': 'PhysicalResource' },
        },
        {
          '@type': 'ResourceConnection',
          direction: 'outgoing',
          relationshipType: 'connectedTo',
          resource: { id: 'cable-1', name: 'CABO-01', '@type': 'PhysicalResource' },
        },
      ],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    render(<ResourceConnectionsTab resourceId="cto-1" onOpenResource={vi.fn()} />);

    expect(screen.getByText('Conectado a')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /CABO-01/ })).toHaveLength(1);
  });

  it('mantém as direções de relações não simétricas', () => {
    useResourceConnections.mockReturnValue({
      connections: [
        {
          '@type': 'ResourceConnection',
          direction: 'outgoing',
          relationshipType: 'mountedOn',
          resource: { id: 'pole-1', name: 'POSTE-01', '@type': 'PhysicalResource' },
        },
        {
          '@type': 'ResourceConnection',
          direction: 'incoming',
          relationshipType: 'mountedOn',
          resource: { id: 'cto-2', name: 'CTO-02', '@type': 'PhysicalResource' },
        },
      ],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    render(<ResourceConnectionsTab resourceId="cto-1" onOpenResource={vi.fn()} />);

    expect(screen.getByText('Montado em')).toBeInTheDocument();
    expect(screen.getByText('Suporta')).toBeInTheDocument();
    expect(screen.getAllByText('(1)')).toHaveLength(2);
  });
});
