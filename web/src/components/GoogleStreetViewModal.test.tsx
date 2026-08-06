import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleStreetViewModal, type StreetViewMarker } from './GoogleStreetViewModal';

const googleMocks = vi.hoisted(() => ({
  clearInstanceListeners: vi.fn(),
  getPanorama: vi.fn(),
  loadGoogleMaps: vi.fn<() => Promise<void>>(),
  marker: vi.fn(),
  panorama: vi.fn(),
  markerSetMap: vi.fn(),
  panoramaSetVisible: vi.fn(),
}));

vi.mock('../utils/googleMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/googleMaps')>();
  return {
    ...actual,
    GOOGLE_MAPS_KEY: 'test-key',
    loadGoogleMaps: googleMocks.loadGoogleMaps,
  };
});

const marker: StreetViewMarker = {
  point: [1, 0],
  title: 'CTO 101',
  iconUrl: 'data:image/svg+xml,cto',
};

function installGoogleMapsMock() {
  googleMocks.marker.mockImplementation(function Marker() {
    return { setMap: googleMocks.markerSetMap };
  });
  googleMocks.panorama.mockImplementation(function StreetViewPanorama() {
    return { setVisible: googleMocks.panoramaSetVisible };
  });
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      maps: {
        StreetViewService: function StreetViewService() {
          return { getPanorama: googleMocks.getPanorama };
        },
        StreetViewPanorama: googleMocks.panorama,
        Marker: googleMocks.marker,
        Size: function Size(width: number, height: number) {
          return { width, height };
        },
        Point: function Point(x: number, y: number) {
          return { x, y };
        },
        event: { clearInstanceListeners: googleMocks.clearInstanceListeners },
      },
    },
  });
}

afterEach(cleanup);

describe('GoogleStreetViewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleMocks.loadGoogleMaps.mockResolvedValue();
    installGoogleMapsMock();
  });

  it('abre um diálogo acessível e consulta panorama em até 100 metros', async () => {
    render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Streetview · CTO 101' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Carregando Streetview…');

    await waitFor(() =>
      expect(googleMocks.getPanorama).toHaveBeenCalledWith(
        { location: { lat: 0, lng: 1 }, radius: 100 },
        expect.any(Function),
      ),
    );
  });

  it('renderiza panorama mínimo orientado ao ativo e exatamente um marcador Nexus', async () => {
    googleMocks.getPanorama.mockImplementation((_request, callback) => {
      callback(
        {
          location: {
            latLng: { lat: () => 0, lng: () => 0 },
            pano: 'pano-123',
          },
        },
        'OK',
      );
    });

    render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);

    await waitFor(() => expect(googleMocks.panorama).toHaveBeenCalledTimes(1));
    expect(googleMocks.panorama).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        pano: 'pano-123',
        disableDefaultUI: true,
        addressControl: false,
        fullscreenControl: false,
        linksControl: false,
        motionTracking: false,
        motionTrackingControl: false,
        panControl: false,
        showRoadLabels: false,
        zoomControl: false,
        clickToGo: true,
        enableCloseButton: false,
        pov: expect.objectContaining({ heading: 90, pitch: 0 }),
      }),
    );
    expect(googleMocks.marker).toHaveBeenCalledTimes(1);
    expect(googleMocks.marker).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { lat: 0, lng: 1 },
        title: 'CTO 101',
        icon: expect.objectContaining({ url: marker.iconUrl }),
      }),
    );
  });

  it('não recria o panorama ao receber nova tupla com as mesmas coordenadas', async () => {
    googleMocks.getPanorama.mockImplementation((_request, callback) => {
      callback(
        {
          location: {
            latLng: { lat: () => 0, lng: () => 0 },
            pano: 'pano-123',
          },
        },
        'OK',
      );
    });
    const { rerender } = render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);
    await waitFor(() => expect(googleMocks.panorama).toHaveBeenCalledTimes(1));

    await act(async () => {
      rerender(<GoogleStreetViewModal marker={{ ...marker, point: [1, 0] }} onClose={vi.fn()} />);
      await Promise.resolve();
    });

    expect(googleMocks.getPanorama).toHaveBeenCalledTimes(1);
    expect(googleMocks.panorama).toHaveBeenCalledTimes(1);
    expect(googleMocks.markerSetMap).not.toHaveBeenCalled();
  });

  it('informa quando não existe panorama próximo', async () => {
    googleMocks.getPanorama.mockImplementation((_request, callback) =>
      callback(null, 'ZERO_RESULTS'),
    );

    render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);

    expect(
      await screen.findByText('Streetview indisponível próximo a esta coordenada.'),
    ).toBeInTheDocument();
    expect(googleMocks.panorama).not.toHaveBeenCalled();
    expect(googleMocks.marker).not.toHaveBeenCalled();
  });

  it('trata falha do serviço como erro, não como indisponibilidade', async () => {
    googleMocks.getPanorama.mockImplementation((_request, callback) =>
      callback(null, 'UNKNOWN_ERROR'),
    );

    render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);

    expect(await screen.findByText('Não foi possível carregar o Streetview.')).toBeInTheDocument();
    expect(
      screen.queryByText('Streetview indisponível próximo a esta coordenada.'),
    ).not.toBeInTheDocument();
  });

  it('informa falha da API sem expor detalhes', async () => {
    googleMocks.loadGoogleMaps.mockRejectedValue(new Error('network details'));

    render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);

    expect(await screen.findByText('Não foi possível carregar o Streetview.')).toBeInTheDocument();
  });

  it('fecha pelo botão e por Escape', () => {
    const onClose = vi.fn();
    render(<GoogleStreetViewModal marker={marker} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Streetview' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('impede que Escape feche também o painel subjacente', () => {
    const underlyingEscapeHandler = vi.fn();
    document.addEventListener('keydown', underlyingEscapeHandler);
    try {
      render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);

      fireEvent.keyDown(screen.getByRole('button', { name: 'Fechar Streetview' }), {
        key: 'Escape',
      });

      expect(underlyingEscapeHandler).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', underlyingEscapeHandler);
    }
  });

  it('mantém a navegação por Tab dentro do diálogo', () => {
    render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);
    const closeButton = screen.getByRole('button', { name: 'Fechar Streetview' });
    expect(closeButton).toHaveFocus();

    const tabEvent = createEvent.keyDown(document, { key: 'Tab' });
    fireEvent(document, tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(closeButton).toHaveFocus();
  });

  it('remove marcador e listeners ao desmontar', async () => {
    googleMocks.getPanorama.mockImplementation((_request, callback) => {
      callback({ location: { latLng: { lat: () => 0, lng: () => 0 }, pano: 'pano-123' } }, 'OK');
    });
    const { unmount } = render(<GoogleStreetViewModal marker={marker} onClose={vi.fn()} />);
    await waitFor(() => expect(googleMocks.marker).toHaveBeenCalledTimes(1));

    unmount();

    expect(googleMocks.markerSetMap).toHaveBeenCalledWith(null);
    expect(googleMocks.panoramaSetVisible).toHaveBeenCalledWith(false);
    expect(googleMocks.clearInstanceListeners).toHaveBeenCalledTimes(1);
  });
});
