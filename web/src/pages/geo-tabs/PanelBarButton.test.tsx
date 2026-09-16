import { render, screen } from '@testing-library/react';
import { Layers3 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { PanelBarButton } from './PanelBarButton';

describe('PanelBarButton', () => {
  it('mantém uma célula fixa e reserva a mesma área para rótulos longos', () => {
    render(<PanelBarButton icon={Layers3} label="Recursos atendidos" onClick={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button.className).toContain('w-[72px]');
    expect(button.className).not.toContain('min-w-[64px]');
    expect(screen.getByText('Recursos atendidos').className).not.toContain('min-h-[2.25rem]');
  });
});
