import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressDetailPanel } from './AddressDetailPanel';
import type { DraftAddress } from '../../utils/googleMaps';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type {
  UseAddressViabilityResult,
  ViabilityCandidate,
} from '../../hooks/useAddressViability';

vi.mock('../../utils/streetViewStatic', () => ({
  fetchStreetViewAvailability: vi.fn().mockResolvedValue({ status: 'unavailable' }),
  streetViewStaticUrl: vi.fn(() => 'data:image/mock'),
}));

vi.mock('../../components/GoogleStreetViewModal', () => ({
  GoogleStreetViewModal: () => null,
}));

// A aba de Viabilidade tem teste próprio (ViabilityTab.test.tsx); aqui o hook que busca as
// CDOs é mockado para o painel poder exercitar a troca de aba e o encaixe da folha. Mutável
// para os casos que precisam de uma CDO na lista (ver beforeEach para o default vazio).
const viability = vi.fn<() => UseAddressViabilityResult>();
vi.mock('../../hooks/useAddressViability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useAddressViability')>();
  return { ...actual, useAddressViability: () => viability() };
});

beforeEach(() => {
  viability.mockReturnValue({ status: 'ready', candidates: [], error: null });
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
    // A porta para o Street View é a foto do topo (StreetViewHero); aqui ela está
    // mockada como indisponível, então não há botão de Street View no painel — o
    // antigo bonequinho no campo Localização saiu (ver CoordinateStreetView).
    expect(screen.queryByRole('button', { name: /Streetview/ })).not.toBeInTheDocument();
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

  it('mantém o BottomSheet mobile como único contêiner de scroll vertical', () => {
    const address: DraftAddress = {
      street: 'Ponto selecionado no mapa',
      country: 'BR',
      coordinates: [-43.1, -22.9],
      label: 'Ponto selecionado [-43.10000, -22.90000]',
    };

    render(<AddressDetailPanel isMobile address={address} onClose={vi.fn()} />);

    const bodyWrapper = screen.getByText('Google Maps').closest('.px-4');
    expect(bodyWrapper).toHaveClass('overflow-hidden');
    expect(bodyWrapper).not.toHaveClass('overflow-x-hidden');
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

  it('no mobile, a aba Viabilidade oculta o Street View e a Visão geral o traz de volta', async () => {
    const address: DraftAddress = {
      street: 'R. Dr. Paulo César',
      streetNr: '155',
      country: 'BR',
      coordinates: [-43.1079841, -22.8985597],
      label: 'R. Dr. Paulo César, 155, Niterói - RJ',
    };

    render(<AddressDetailPanel isMobile address={address} onClose={vi.fn()} />);

    // Na Visão geral a foto (mockada como indisponível) mostra o placeholder do hero.
    expect(screen.getByText('Sem imagem de Street View')).toBeInTheDocument();

    // Na Viabilidade a foto some para o mapa ganhar a tela.
    await userEvent.click(screen.getByRole('button', { name: 'Viabilidade' }));
    expect(screen.queryByText('Sem imagem de Street View')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByText('Sem imagem de Street View')).toBeInTheDocument();
  });

  it('no mobile, escolher uma CDO recoloca a folha em mid para o drop caber na tela', async () => {
    const address: DraftAddress = {
      street: 'R. Dr. Paulo César',
      streetNr: '155',
      country: 'BR',
      coordinates: [-43.1079841, -22.8985597],
      label: 'R. Dr. Paulo César, 155, Niterói - RJ',
    };
    const node: GeoTreeNode = {
      id: 'resource:CDOE-1',
      kind: 'resource',
      label: 'CDOE-1 (FSA)',
      resourceType: 'CTO',
      status: 'active',
      hasChildren: false,
      geometry: { type: 'Point', coordinates: [-43.108, -22.899] },
    };
    // `straight` para a seleção resolver sem bater na Routes API.
    const candidate: ViabilityCandidate = {
      node,
      point: [-43.108, -22.899],
      distanceMeters: 120,
      straightMeters: 120,
      mode: 'straight',
    };
    viability.mockReturnValue({ status: 'ready', candidates: [candidate], error: null });

    render(<AddressDetailPanel isMobile address={address} onClose={vi.fn()} onDropSimulation={vi.fn()} />);
    const sheet = screen.getByTestId('bottom-sheet');
    const content = screen.getByTestId('bottom-sheet-content');

    await userEvent.click(screen.getByRole('button', { name: 'Viabilidade' }));
    // A aba nasce em mid (folha a 48vh); a auto-seleção já projeta o drop.
    await waitFor(() => expect(sheet.style.height).toContain('48vh'));

    // Usuário arrasta a folha para full para ler a lista.
    fireEvent.pointerDown(content, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 460, pointerId: 1 });
    fireEvent.pointerUp(content, { clientY: 460, pointerId: 1 });
    expect(sheet.style.height).toContain('92vh');

    // Escolher a CDO recoloca a folha em mid, para o drop projetado voltar à vista.
    await userEvent.click(screen.getByRole('button', { name: /CDOE-1/ }));
    await waitFor(() => expect(sheet.style.height).toContain('48vh'));
  });
});
