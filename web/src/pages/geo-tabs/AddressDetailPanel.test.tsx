import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressDetailPanel } from './AddressDetailPanel';
import type { DraftAddress } from '../../utils/googleMaps';

vi.mock('../../utils/streetViewStatic', () => ({
  fetchStreetViewAvailability: vi.fn().mockResolvedValue({ status: 'unavailable' }),
  streetViewStaticUrl: vi.fn(() => 'data:image/mock'),
}));

vi.mock('../../components/GoogleStreetViewModal', () => ({
  GoogleStreetViewModal: () => null,
}));

// A aba de Viabilidade tem teste próprio (ViabilityTab.test.tsx); aqui interessa só a
// troca de aba, então o hook que busca as CDOs fica fora do caminho.
vi.mock('../../hooks/useAddressViability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useAddressViability')>();
  return {
    ...actual,
    useAddressViability: () => ({ status: 'ready' as const, candidates: [], error: null }),
  };
});

afterEach(cleanup);

describe('AddressDetailPanel', () => {
  it('mostra os campos do endereço resolvido pelo Google', () => {
    const address: DraftAddress = {
      street: 'R. Dr. Paulo César',
      streetNr: '155',
      city: 'Niterói',
      stateOrProvince: 'RJ',
      postcode: '24220-400',
      country: 'BR',
      coordinates: [-43.1079841, -22.8985597],
      label: 'R. Dr. Paulo César, 155 - Santa Rosa, Niterói - RJ, 24220-400, Brasil',
      placeId: 'ChIJkUT-yu-DmQAREfIQzEVzYOU',
      precision: 'ROOFTOP',
    };

    render(<AddressDetailPanel isMobile={false} address={address} onClose={vi.fn()} />);

    expect(screen.getByText('R. Dr. Paulo César, 155')).toBeInTheDocument();
    expect(
      screen.getByText('R. Dr. Paulo César, 155 - Santa Rosa, Niterói - RJ, 24220-400, Brasil'),
    ).toBeInTheDocument();
    // Localização unificada: [lng, lat] com 5 casas, igual aos painéis de Site/Recurso.
    expect(screen.getByText('[-43.10798, -22.89856]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir Streetview/ })).toBeInTheDocument();
    // Precisão vira badge com a qualidade e o código cru do Google juntos.
    expect(screen.getByText('Alta - ROOFTOP')).toBeInTheDocument();
    expect(screen.getByText('ChIJkUT-yu-DmQAREfIQzEVzYOU')).toBeInTheDocument();
    expect(screen.getByText('Google Maps')).toBeInTheDocument();
  });

  it('mostra "-" quando precisão e Place ID não vieram do Google', () => {
    const address: DraftAddress = {
      street: 'Ponto selecionado no mapa',
      country: 'BR',
      coordinates: [-43.1, -22.9],
      label: 'Ponto selecionado [-43.10000, -22.90000]',
    };

    render(<AddressDetailPanel isMobile={false} address={address} onClose={vi.fn()} />);

    expect(screen.getByText('Desconhecida')).toBeInTheDocument();
    // Place ID e Address ID (Geonet) caem em "-" quando ausentes.
    expect(screen.getAllByText('-').length).toBe(2);
  });

  it('alterna entre Visão geral e Viabilidade', async () => {
    const address: DraftAddress = {
      street: 'R. Dr. Paulo César',
      streetNr: '155',
      country: 'BR',
      coordinates: [-43.1079841, -22.8985597],
      label: 'R. Dr. Paulo César, 155, Niterói - RJ',
    };

    render(<AddressDetailPanel isMobile={false} address={address} onClose={vi.fn()} />);

    // Nasce na Visão geral.
    expect(screen.getByText('Google Maps')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Viabilidade' }));
    expect(screen.getByText(/Nenhuma CDO num raio de 300 m/)).toBeInTheDocument();
    expect(screen.queryByText('Google Maps')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByText('Google Maps')).toBeInTheDocument();
  });
});
