import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceConnectionsView } from './ResourceConnectionsView';

vi.mock('./ResourceConnectionsTab', () => ({
  ResourceConnectionsTab: ({
    connections,
  }: {
    connections: Array<{ resource: { id: string } }>;
  }) => <div>Relações de {connections.map((c) => c.resource.id).join(',')}</div>,
}));

vi.mock('./SchematicTab', () => ({
  SchematicTab: ({ nodeId }: { nodeId: string }) => <div>Esquemático de {nodeId}</div>,
}));

afterEach(cleanup);

describe('ResourceConnectionsView', () => {
  it('usa o controle segmentado do nó selecionado do Studio e inicia em Relações', () => {
    render(
      <ResourceConnectionsView
        nodeId="resource:cdoe-1"
        onOpenResource={vi.fn()}
        onSimulate={vi.fn()}
        onPreview={vi.fn()}
        connections={[
          {
            '@type': 'ResourceConnection',
            direction: 'outgoing',
            relationshipType: 'connectedTo',
            resource: { id: 'cdoe-1', name: 'CDOE-1', '@type': 'PhysicalResource' },
          },
        ]}
        connectionsLoading={false}
        connectionsError={null}
        onReloadConnections={vi.fn()}
      />,
    );

    const tablist = screen.getByRole('tablist', { name: 'Conexões do recurso' });
    const relationshipsTab = screen.getByRole('tab', { name: 'Relações' });
    const schematicTab = screen.getByRole('tab', { name: 'Esquemático' });

    expect(tablist.className).toContain('rounded-xl');
    expect(tablist.className).toContain('bg-[var(--surface-muted)]');
    expect(relationshipsTab).toHaveAttribute('aria-selected', 'true');
    expect(relationshipsTab.className).toContain('bg-app-panel');
    expect(relationshipsTab.className).toContain('shadow-sm');
    expect(schematicTab).toHaveAttribute('aria-selected', 'false');
    expect(schematicTab.className).not.toContain('border-b-2');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      relationshipsTab.getAttribute('id'),
    );
    expect(screen.getByText('Relações de cdoe-1')).toBeInTheDocument();
  });

  it('troca para Esquemático mantendo a associação ARIA do painel', () => {
    render(
      <ResourceConnectionsView
        nodeId="resource:cdoe-1"
        onOpenResource={vi.fn()}
        onSimulate={vi.fn()}
        onPreview={vi.fn()}
        connections={[
          {
            '@type': 'ResourceConnection',
            direction: 'outgoing',
            relationshipType: 'connectedTo',
            resource: { id: 'cdoe-1', name: 'CDOE-1', '@type': 'PhysicalResource' },
          },
        ]}
        connectionsLoading={false}
        connectionsError={null}
        onReloadConnections={vi.fn()}
      />,
    );

    const schematicTab = screen.getByRole('tab', { name: 'Esquemático' });
    fireEvent.click(schematicTab);

    expect(schematicTab).toHaveAttribute('aria-selected', 'true');
    expect(schematicTab.className).toContain('bg-app-panel');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      schematicTab.getAttribute('id'),
    );
    expect(screen.getByText('Esquemático de resource:cdoe-1')).toBeInTheDocument();
  });
});
