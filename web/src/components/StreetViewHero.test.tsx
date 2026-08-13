import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreetViewHero } from './StreetViewHero';

const streetViewMocks = vi.hoisted(() => ({
  fetchStreetViewAvailability: vi.fn(),
  streetViewStaticUrl: vi.fn(),
}));

vi.mock('../utils/streetViewStatic', () => ({
  fetchStreetViewAvailability: streetViewMocks.fetchStreetViewAvailability,
  streetViewStaticUrl: streetViewMocks.streetViewStaticUrl,
}));

vi.mock('./GoogleStreetViewModal', () => ({
  GoogleStreetViewModal: ({
    marker,
    onClose,
  }: {
    marker: { title: string };
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={`Streetview · ${marker.title}`}>
      <button type="button" onClick={onClose}>
        Fechar modal
      </button>
    </div>
  ),
}));

afterEach(cleanup);

const marker = {
  point: [-43.1079841, -22.8985597] as [number, number],
  title: 'CTO 101',
  iconUrl: 'data:cto',
};

describe('StreetViewHero', () => {
  it('mostra o placeholder sem marker', () => {
    render(<StreetViewHero marker={null} />);
    expect(screen.getByText('Sem imagem de Street View')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('mostra o placeholder quando não há cobertura de Street View perto do ponto', async () => {
    streetViewMocks.fetchStreetViewAvailability.mockResolvedValue({ status: 'unavailable' });
    render(<StreetViewHero marker={marker} />);
    await waitFor(() => expect(streetViewMocks.fetchStreetViewAvailability).toHaveBeenCalled());
    expect(screen.getByText('Sem imagem de Street View')).toBeInTheDocument();
  });

  it('mostra o placeholder quando a API retorna erro (ex.: desabilitada na chave)', async () => {
    streetViewMocks.fetchStreetViewAvailability.mockResolvedValue({
      status: 'error',
      code: 'REQUEST_DENIED',
    });
    render(<StreetViewHero marker={marker} />);
    await waitFor(() => expect(streetViewMocks.fetchStreetViewAvailability).toHaveBeenCalled());
    expect(screen.getByText('Sem imagem de Street View')).toBeInTheDocument();
  });

  it('mostra a foto e abre o modal ao clicar, quando há cobertura', async () => {
    streetViewMocks.fetchStreetViewAvailability.mockResolvedValue({
      status: 'ok',
      panoramaPoint: [-43.108, -22.8986],
    });
    streetViewMocks.streetViewStaticUrl.mockReturnValue(
      'https://maps.googleapis.com/maps/api/streetview?mock',
    );
    render(<StreetViewHero marker={marker} />);

    const trigger = await screen.findByRole('button', { name: 'Abrir Streetview de CTO 101' });
    expect(screen.queryByText('Sem imagem de Street View')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Streetview · CTO 101' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar modal' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
