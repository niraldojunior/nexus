import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceLeaf } from './ResourceLeaf';

afterEach(cleanup);

vi.mock('../../../components/ResourceIcon', () => ({
  ResourceIcon: ({ resource, size }: { resource: { resourceType?: string }; size?: number }) => (
    <span data-testid={`resource-icon-${resource.resourceType ?? 'unknown'}`} data-size={size} />
  ),
}));

const leaf = {
  '@type': 'ResourceComponentNode' as const,
  id: 'ont-01',
  name: 'ONT-01',
  resourceType: 'ONT',
  status: 'active',
  kind: 'PhysicalResource' as const,
  parentId: 'cdoe-01',
  depth: 1,
  children: [],
};

describe('ResourceLeaf', () => {
  it('shows a semantic resource tile with its name beside it in detailed mode', () => {
    render(<ResourceLeaf node={leaf} selected={false} onSelect={vi.fn()} />);

    const tile = screen.getByRole('button', { name: 'ONT-01, Disponível' });
    expect(tile).toHaveClass('bg-status-green-soft', 'border-status-green/60');
    expect(tile).toContainElement(screen.getByTestId('resource-icon-ONT'));
    expect(screen.getByTestId('resource-icon-ONT')).toHaveAttribute('data-size', '13');
    expect(screen.getByTestId('resource-icon-ONT').parentElement).toHaveClass('bg-status-green');
    expect(screen.getByText('ONT-01')).toHaveClass('break-words');
    expect(tile.parentElement).toHaveClass('items-center', 'gap-1.5');
  });

  it('shrinks to a bordered status tile with no visible label in simplified mode', () => {
    render(<ResourceLeaf node={leaf} selected={false} onSelect={vi.fn()} viewMode="simplified" />);

    const tile = screen.getByRole('button', { name: 'ONT-01, Disponível' });
    expect(tile).toHaveClass('border-app-ink', 'bg-status-green', 'h-[18px]', 'w-[18px]');
    expect(tile).toContainElement(screen.getByTestId('resource-icon-ONT'));
    expect(screen.queryByText('ONT-01')).not.toBeInTheDocument();
  });
});
