import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteAddressModal } from './SiteAddressModal';

const mocks = vi.hoisted(() => ({
  patchJson: vi.fn(),
  postJson: vi.fn(),
  fetchGeonetCandidates: vi.fn(),
  fetchGeonetDetail: vi.fn(),
  fetchAddressPredictions: vi.fn(),
  fetchPlaceDetails: vi.fn(),
}));

vi.mock('../../services/geoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geoApi')>();
  return { ...actual, patchJson: mocks.patchJson, postJson: mocks.postJson };
});

vi.mock('../../services/geonetAddressApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geonetAddressApi')>();
  return {
    ...actual,
    fetchGeonetCandidates: mocks.fetchGeonetCandidates,
    fetchGeonetDetail: mocks.fetchGeonetDetail,
  };
});

vi.mock('../../utils/googleMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/googleMaps')>();
  return {
    ...actual,
    fetchAddressPredictions: mocks.fetchAddressPredictions,
    fetchPlaceDetails: mocks.fetchPlaceDetails,
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

const renderModal = (overrides: Partial<Parameters<typeof SiteAddressModal>[0]> = {}) => {
  const props = {
    siteId: 'site-1',
    currentAddressId: 'addr-1',
    currentLocationId: 'loc-1',
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  };
  render(<SiteAddressModal {...props} />);
  return props;
};

describe('SiteAddressModal', () => {
  it('GEONET é a base padrão; Localização e Precisão só aparecem após escolher um candidato', async () => {
    mocks.fetchGeonetCandidates.mockResolvedValue({
      status: 'ready',
      candidates: [{ addressId: 'geo-1', formattedAddress: 'Rua Cinco de Julho, 237' }],
    });
    mocks.fetchGeonetDetail.mockResolvedValue({
      status: 'ready',
      address: {
        formattedAddress: 'Rua Cinco de Julho, 237',
        street: 'Rua Cinco de Julho',
        streetNr: '237',
        city: 'Niterói',
        state: 'RJ',
        postcode: '24220110',
        coordinates: [-43.1, -22.9],
        geolocationMethod: 'ENDEREÇO COMPLETO',
      },
    });
    renderModal();

    expect(screen.queryByText(/^\[/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Buscar endereço no Geonet…'), {
      target: { value: 'Cinco de Julho' },
    });
    fireEvent.click(await screen.findByText('Rua Cinco de Julho, 237'));

    await waitFor(() => expect(screen.getByText(/-43\.10000/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled();
  });

  it('trocar para Google Maps busca no autocomplete do Google, não no Geonet', async () => {
    mocks.fetchAddressPredictions.mockResolvedValue([
      { placeId: 'place-1', description: 'Rua Teste, 100 - Niterói' },
    ]);
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: /google maps/i }));
    fireEvent.change(screen.getByPlaceholderText('Buscar endereço no Google Maps…'), {
      target: { value: 'Rua Teste' },
    });

    await screen.findByText('Rua Teste, 100 - Niterói');
    expect(mocks.fetchGeonetCandidates).not.toHaveBeenCalled();
  });

  it('salvar com endereço já existente faz PATCH em location e address com a procedência', async () => {
    mocks.fetchGeonetCandidates.mockResolvedValue({
      status: 'ready',
      candidates: [{ addressId: 'geo-1', formattedAddress: 'Rua Cinco de Julho, 237' }],
    });
    mocks.fetchGeonetDetail.mockResolvedValue({
      status: 'ready',
      address: {
        formattedAddress: 'Rua Cinco de Julho, 237',
        street: 'Rua Cinco de Julho',
        streetNr: '237',
        coordinates: [-43.1, -22.9],
        geolocationMethod: 'ENDEREÇO COMPLETO',
      },
    });
    mocks.patchJson.mockResolvedValue({});
    const props = renderModal();

    fireEvent.change(screen.getByPlaceholderText('Buscar endereço no Geonet…'), {
      target: { value: 'Cinco de Julho' },
    });
    fireEvent.click(await screen.findByText('Rua Cinco de Julho, 237'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mocks.patchJson).toHaveBeenCalledWith(
        '/v1/geo/locations/loc-1',
        expect.objectContaining({ sourceSystem: 'GEONET', sourceRef: 'geo-1', accuracyLevel: 'high' }),
      ),
    );
    expect(mocks.patchJson).toHaveBeenCalledWith(
      '/v1/geo/addresses/addr-1',
      expect.objectContaining({ sourceSystem: 'GEONET', sourceRef: 'geo-1' }),
    );
    expect(mocks.postJson).not.toHaveBeenCalled();
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });
});
