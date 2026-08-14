import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressDetailPanel, selectPinLocation } from './AddressDetailPanel';
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
const viability =
  vi.fn<(origin: [number, number], enabled: boolean) => UseAddressViabilityResult>();
vi.mock('../../hooks/useAddressViability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useAddressViability')>();
  return {
    ...actual,
    useAddressViability: (origin: [number, number], enabled: boolean) => viability(origin, enabled),
  };
});

const geonet = vi.fn();
vi.mock('../../hooks/useGeonetAddress', () => ({ useGeonetAddress: () => geonet() }));

// O card DNE (ViaCEP) faria uma chamada de rede real ao montar; aqui o hook é mockado para os
// testes ficarem determinísticos. O default (idle) só mostra o cabeçalho do card.
const viaCep = vi.fn();
vi.mock('../../hooks/useViaCepAddress', () => ({ useViaCepAddress: () => viaCep() }));

beforeEach(() => {
  viability.mockReturnValue({ status: 'ready', candidates: [], error: null });
  geonet.mockReturnValue({
    status: 'not_configured',
    candidates: [],
    selectedId: null,
    detail: null,
    error: null,
    select: vi.fn(),
    retry: vi.fn(),
  });
  viaCep.mockReturnValue({ status: 'idle', address: null, error: null, retry: vi.fn() });
});
afterEach(cleanup);

describe('AddressDetailPanel', () => {
  it('prioriza a coordenada Geonet no empate de precisão e cede ao Google quando pior', () => {
    const address: DraftAddress = {
      street: 'Rua Exemplo',
      country: 'BR',
      coordinates: [-43.1, -22.9],
      label: 'Rua Exemplo',
      precision: 'RANGE_INTERPOLATED',
    };
    // Empate (ambos rank 2): a base preferencial GEONET vence.
    expect(
      selectPinLocation(address, {
        formattedAddress: 'Rua Exemplo',
        coordinates: [-43.2, -22.8],
        geolocationMethod: 'Endereço Interpolação',
      }),
    ).toMatchObject({ source: 'geonet', coordinates: [-43.2, -22.8] });
    // GEONET pior (Bairro, rank 1) que o Google (rank 2): o Google vence.
    expect(
      selectPinLocation(address, {
        formattedAddress: 'Rua Exemplo',
        coordinates: [-43.2, -22.8],
        geolocationMethod: 'Bairro',
      }),
    ).toMatchObject({ source: 'google', coordinates: [-43.1, -22.9] });
  });

  it('usa a coordenada selecionada para a viabilidade', async () => {
    geonet.mockReturnValue({
      status: 'ready',
      candidates: [{ addressId: '1', formattedAddress: 'Rua Exemplo' }],
      selectedId: '1',
      detail: {
        addressId: '1',
        formattedAddress: 'Rua Exemplo',
        coordinates: [-43.2, -22.8],
        geolocationMethod: 'Endereço Completo',
      },
      error: null,
      select: vi.fn(),
      retry: vi.fn(),
    });
    const address: DraftAddress = {
      street: 'Rua Exemplo',
      country: 'BR',
      coordinates: [-43.1, -22.9],
      label: 'Rua Exemplo',
      precision: 'RANGE_INTERPOLATED',
    };
    render(<AddressDetailPanel isMobile={false} address={address} onClose={vi.fn()} />);
    // GEONET (Endereço Completo, rank 3) supera o Google (RANGE_INTERPOLATED, rank 2): já nasce
    // marcado na chave. Clicar nele é idempotente.
    await userEvent.click(screen.getByRole('radio', { name: /GEONET/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Viabilidade' }));
    expect(viability).toHaveBeenCalledWith([-43.2, -22.8], true);
  });

  it('usa literalmente o texto digitado como título da pesquisa livre', () => {
    const address: DraftAddress = {
      street: 'Rua Doutor Paulo César',
      country: 'BR',
      coordinates: [-43.1, -22.9],
      label: 'Rua Doutor Paulo César, Niterói - RJ',
      sourceQuery: 'Rua Doutor Paulo Cesar, número 155, Niteroi',
    };
    render(<AddressDetailPanel isMobile={false} address={address} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: address.sourceQuery })).toBeInTheDocument();
  });

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
    expect(screen.getByText('GEONET')).toBeInTheDocument();
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
    // Place ID cai em "-"; Geonet não configurado não finge ter Address ID.
    expect(screen.getAllByText('-').length).toBe(1);
  });

  it('mostra o Address ID do Geonet com a mesma iconografia do Place ID', () => {
    geonet.mockReturnValue({
      status: 'ready',
      candidates: [
        { addressId: '345959', formattedAddress: 'Rua Exemplo, 10 - Rio de Janeiro, RJ' },
      ],
      selectedId: '345959',
      detail: {
        addressId: '345959',
        formattedAddress: 'Rua Exemplo, 10 - Rio de Janeiro, RJ',
        coordinates: [-43.18, -22.91],
        geolocationMethod: 'Endereço Completo',
      },
      error: null,
      select: vi.fn(),
      retry: vi.fn(),
    });
    const address: DraftAddress = {
      street: 'Rua Exemplo',
      streetNr: '10',
      country: 'BR',
      coordinates: [-43.18, -22.91],
      label: 'Rua Exemplo, 10 - Rio de Janeiro, RJ',
      placeId: 'google-place-id',
    };

    render(<AddressDetailPanel isMobile={false} address={address} onClose={vi.fn()} />);

    expect(screen.getByText('345959')).toBeInTheDocument();
    expect(screen.getByText('Alta - Endereço Completo')).toBeInTheDocument();
    expect(screen.queryByText(/equivale ao Place ID/)).not.toBeInTheDocument();
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

    render(
      <AddressDetailPanel
        isMobile
        address={address}
        onClose={vi.fn()}
        onDropSimulation={vi.fn()}
      />,
    );
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

  // Google [-43.1, -22.9] × GEONET [-43.0995, -22.9] ficam ~51 m — passa do limite de 30 m e
  // entra em conflito. Empate de precisão (ambos "alta"): a chave nasce marcada no GEONET.
  const conflictGeonet = {
    status: 'ready',
    candidates: [{ addressId: '9', formattedAddress: 'Rua Exemplo (GEONET)' }],
    selectedId: '9',
    detail: {
      addressId: '9',
      formattedAddress: 'Rua Exemplo (GEONET)',
      coordinates: [-43.0995, -22.9] as [number, number],
      geolocationMethod: 'Endereço Completo',
    },
    error: null,
    select: vi.fn(),
    retry: vi.fn(),
  };
  const conflictAddress: DraftAddress = {
    street: 'Rua Exemplo',
    country: 'BR',
    coordinates: [-43.1, -22.9],
    label: 'Rua Exemplo (Google)',
    precision: 'ROOFTOP',
  };

  it('mostra a caixa vermelha de divergência com a chave de base marcada no GEONET', () => {
    geonet.mockReturnValue(conflictGeonet);
    render(<AddressDetailPanel isMobile={false} address={conflictAddress} onClose={vi.fn()} />);

    expect(screen.getByText(/divergem em/)).toHaveTextContent(/\d+ m/);
    const group = screen.getByRole('radiogroup', { name: 'Base de localização' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /GEONET/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Google Maps/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('troca de base pela chave e usa a coordenada escolhida na viabilidade', async () => {
    geonet.mockReturnValue(conflictGeonet);
    render(<AddressDetailPanel isMobile={false} address={conflictAddress} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('radio', { name: /Google Maps/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Viabilidade' }));
    expect(viability).toHaveBeenCalledWith([-43.1, -22.9], true);
  });

  it('traz o endereçamento dos Correios no card DNE', () => {
    viaCep.mockReturnValue({
      status: 'ready',
      address: {
        cep: '24220-401',
        logradouro: 'Rua Doutor Paulo César',
        complemento: '',
        bairro: 'Icaraí',
        localidade: 'Niterói',
        uf: 'RJ',
        ibge: '3303302',
        ddd: '21',
      },
      error: null,
      retry: vi.fn(),
    });
    const address: DraftAddress = {
      street: 'Rua Doutor Paulo César',
      streetNr: '155',
      postcode: '24220-401',
      country: 'BR',
      coordinates: [-43.1, -22.9],
      label: 'Rua Doutor Paulo César, 155',
    };

    render(<AddressDetailPanel isMobile={false} address={address} onClose={vi.fn()} />);

    expect(screen.getByText('DNE (Correios)')).toBeInTheDocument();
    expect(screen.getByText('Icaraí')).toBeInTheDocument();
    expect(screen.getByText('Niterói - RJ')).toBeInTheDocument();
    expect(screen.getByText('3303302')).toBeInTheDocument();
  });
});
