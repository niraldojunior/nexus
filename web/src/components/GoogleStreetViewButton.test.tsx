import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleStreetViewButton } from './GoogleStreetViewButton';

vi.mock('./GoogleStreetViewModal', () => ({
  GoogleStreetViewModal: ({
    marker,
    onClose,
  }: {
    marker: { title: string; iconUrl: string };
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={`Streetview · ${marker.title}`}>
      <span data-testid="modal-icon">{marker.iconUrl}</span>
      <button type="button" onClick={onClose}>
        Fechar modal
      </button>
    </div>
  ),
}));

afterEach(cleanup);

describe('GoogleStreetViewButton', () => {
  it('renderiza botão com hint e abre o modal sem nova aba', () => {
    render(
      <GoogleStreetViewButton
        marker={{ point: [-43.1108, -22.9108], title: 'CTO 101', iconUrl: 'data:cto' }}
      />,
    );

    const button = screen.getByRole('button', { name: 'Abrir Streetview de CTO 101' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Streetview');

    fireEvent.click(button);

    expect(screen.getByRole('dialog', { name: 'Streetview · CTO 101' })).toBeInTheDocument();
    expect(screen.getByTestId('modal-icon')).toHaveTextContent('data:cto');
  });

  it('devolve o foco ao botão que abriu o modal', () => {
    render(
      <GoogleStreetViewButton
        marker={{ point: [-43.1108, -22.9108], title: 'Site Centro', iconUrl: 'data:site' }}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Abrir Streetview de Site Centro' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar modal' }));

    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não renderiza ação sem coordenada válida', () => {
    const { container } = render(
      <GoogleStreetViewButton
        marker={{ point: [181, -22.9108], title: 'Inválido', iconUrl: 'data:invalid' }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
