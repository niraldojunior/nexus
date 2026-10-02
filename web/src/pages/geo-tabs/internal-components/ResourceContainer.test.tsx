import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceContainer } from './ResourceContainer';

vi.mock('../../../components/ResourceIcon', () => ({
  ResourceIcon: () => <span data-testid="resource-icon" />,
}));

afterEach(cleanup);

const splitter = {
  '@type': 'ResourceComponentNode' as const,
  id: 'splitter-01',
  name: 'SPLITTER-01',
  resourceType: 'Splitter',
  specification: {
    id: 'splitter-spec-01',
    name: 'Splitter 1:8 SC/APC',
    '@referredType': 'ResourceSpecification',
  },
  status: 'active',
  kind: 'PhysicalResource' as const,
  parentId: 'cdoe-01',
  depth: 1,
  children: [
    {
      '@type': 'ResourceComponentNode' as const,
      id: 'port-01',
      name: 'FO.O.1',
      resourceType: 'Port',
      status: 'active',
      kind: 'PhysicalResource' as const,
      parentId: 'splitter-01',
      depth: 2,
      children: [],
    },
  ],
};

describe('ResourceContainer', () => {
  it('uses a muted perimeter with a subtle header and white content area', () => {
    render(
      <ResourceContainer
        node={splitter}
        interaction={{ selectedId: null, onSelect: vi.fn() }}
      />,
    );

    const container = screen.getByLabelText('SPLITTER-01, Disponível');
    expect(container).toHaveClass('bg-[var(--surface-muted-hover)]', 'border-[var(--border-strong)]');
    expect(container.querySelector('[class*="bg-[var(--surface-subtle)]"]')).not.toBeNull();
    expect(container.querySelector('.bg-white')).not.toBeNull();
    expect(container.className).not.toContain('bg-app-muted');
    expect(screen.getByText('Splitter 1:8 SC/APC')).toBeInTheDocument();
    expect(screen.queryByText('Splitter')).not.toBeInTheDocument();
  });

  it('falls back to resource type when the component has no specification', () => {
    render(
      <ResourceContainer
        node={{ ...splitter, specification: undefined }}
        interaction={{ selectedId: null, onSelect: vi.fn() }}
      />,
    );

    expect(screen.getByText('Splitter')).toBeInTheDocument();
  });

  it('collapses the header to one line and shrinks children in simplified mode', () => {
    render(
      <ResourceContainer
        node={splitter}
        interaction={{ selectedId: null, onSelect: vi.fn() }}
        viewMode="simplified"
      />,
    );

    const header = screen.getByTestId('resource-graph-header');
    expect(header).toHaveAttribute('data-view-mode', 'simplified');
    expect(header.textContent?.replace(/\s+/g, ' ').trim()).toBe('SPLITTER-01 (Splitter 1:8 SC/APC)');
    const port = screen.getByRole('button', { name: 'FO.O.1, Disponível' });
    expect(port).toHaveClass('border-app-ink', 'h-[18px]', 'w-[18px]');
    expect(screen.queryByText('FO.O.1')).not.toBeInTheDocument();
  });
});
