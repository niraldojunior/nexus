import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleMapPanel } from './GeoPage';
import type { GeoTreeNode } from '../services/geoTreeApi';

const googleMocks = vi.hoisted(() => ({
  clustererAddMarkers: vi.fn(),
  clustererClearMarkers: vi.fn(),
  infoWindowClose: vi.fn(),
  infoWindowOpen: vi.fn(),
  infoWindowSetContent: vi.fn(),
  infoWindowSetOptions: vi.fn(),
  infoWindowSetPosition: vi.fn(),
  loadGoogleMaps: vi.fn<() => Promise<void>>(),
  mapAddListener: vi.fn(),
  mapAddListenerOnce: vi.fn(),
  mapGetBounds: vi.fn(),
  mapGetCenter: vi.fn(),
  mapGetDiv: vi.fn(() => document.createElement('div')),
  mapGetZoom: vi.fn(),
  mapPanTo: vi.fn(),
  mapSetZoom: vi.fn(),
  mapSetMapTypeId: vi.fn(),
  markerCtor: vi.fn(),
  reverseGeocode: vi.fn(),
}));

vi.mock('../utils/googleMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/googleMaps')>();
  return {
    ...actual,
    GOOGLE_MAPS_KEY: 'test-key',
    loadGoogleMaps: googleMocks.loadGoogleMaps,
    reverseGeocode: googleMocks.reverseGeocode,
  };
});

vi.mock('@googlemaps/markerclusterer', () => ({
  MarkerClusterer: vi.fn(function MarkerClusterer() {
    return {
      addMarkers: googleMocks.clustererAddMarkers,
      clearMarkers: googleMocks.clustererClearMarkers,
    };
  }),
}));

function installGoogleMapsMock() {
  const mapInstance = {
    addListener: googleMocks.mapAddListener,
    getBounds: googleMocks.mapGetBounds,
    getCenter: googleMocks.mapGetCenter,
    getDiv: googleMocks.mapGetDiv,
    getZoom: googleMocks.mapGetZoom,
    panTo: googleMocks.mapPanTo,
    setZoom: googleMocks.mapSetZoom,
    setMapTypeId: googleMocks.mapSetMapTypeId,
  };

  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      maps: {
        InfoWindow: vi.fn(function InfoWindow() {
          return {
            close: googleMocks.infoWindowClose,
            open: googleMocks.infoWindowOpen,
            setContent: googleMocks.infoWindowSetContent,
            setOptions: googleMocks.infoWindowSetOptions,
            setPosition: googleMocks.infoWindowSetPosition,
          };
        }),
        Map: vi.fn(function Map() {
          return mapInstance;
        }),
        Marker: vi.fn(function Marker(options: Record<string, unknown>) {
          googleMocks.markerCtor(options);
          return {
            addListener: vi.fn(),
            setIcon: vi.fn(),
            setMap: vi.fn(),
            setPosition: vi.fn(),
            setZIndex: vi.fn(),
          };
        }),
        Point: vi.fn(function Point(x: number, y: number) {
          return { x, y };
        }),
        Polyline: vi.fn(function Polyline() {
          return {
            addListener: vi.fn(),
            setMap: vi.fn(),
            setOptions: vi.fn(),
            setPath: vi.fn(),
          };
        }),
        Size: vi.fn(function Size(width: number, height: number) {
          return { width, height };
        }),
        SymbolPath: { CIRCLE: 'CIRCLE' },
        event: {
          clearInstanceListeners: vi.fn(),
          addListenerOnce: googleMocks.mapAddListenerOnce,
        },
      },
    },
  });
}

describe('GoogleMapPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleMocks.loadGoogleMaps.mockResolvedValue();
    googleMocks.reverseGeocode.mockResolvedValue(null);
    installGoogleMapsMock();
  });

  it('troca o MUB do mapa chamando setMapTypeId com o tipo esperado', async () => {
    const user = userEvent.setup();

    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() => expect(googleMocks.mapSetMapTypeId).toHaveBeenCalledWith('roadmap'));

    await user.click(
      screen.getByRole('button', { name: 'Trocar base cartográfica para Satélite' }),
    );
    await waitFor(() => expect(googleMocks.mapSetMapTypeId).toHaveBeenLastCalledWith('hybrid'));

    await user.click(screen.getByRole('button', { name: 'Trocar base cartográfica para Mapa' }));
    await waitFor(() => expect(googleMocks.mapSetMapTypeId).toHaveBeenLastCalledWith('roadmap'));
  });

  it('crava o alfinete de seleção no endereço encontrado pela busca, sem nó selecionado', async () => {
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={null}
        draftAddress={null}
        addressPoint={[-43.1079841, -22.8985597]}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() =>
      expect(googleMocks.markerCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          position: { lng: -43.1079841, lat: -22.8985597 },
          clickable: false,
        }),
      ),
    );
  });

  it('endereço de clique no mapa (draftAddress) ganha só o círculo "+", sem duplicar o alfinete', async () => {
    const draftAddress = {
      street: 'Ponto selecionado no mapa',
      country: 'BR',
      coordinates: [-43.1079841, -22.8985597] as [number, number],
      label: 'Ponto selecionado [-43.10798, -22.89856]',
    };

    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={null}
        draftAddress={draftAddress}
        // GeoPage só passa addressPoint quando a origem é a busca (source: 'search') —
        // clique no mapa fica de fora, para não cravar os dois marcadores na mesma
        // coordenada (ver onMapAddressFound em GeoPage).
        addressPoint={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() =>
      expect(googleMocks.markerCtor).toHaveBeenCalledWith(
        expect.objectContaining({ position: { lng: -43.1079841, lat: -22.8985597 }, label: '+' }),
      ),
    );
    expect(googleMocks.markerCtor).not.toHaveBeenCalledWith(
      expect.objectContaining({ clickable: false }),
    );
  });

  it('mantém o alfinete do nó selecionado mesmo quando ele saiu da lista visível do mapa', async () => {
    // Recurso afastado além do viewport: some de `nodes`, mas a seleção continua aberta no
    // painel. O alfinete deve cravar na coordenada da própria seleção (fallback quando o
    // nó não está no registro do mapa) — ver o efeito do alfinete em GeoPage.
    const selectedNode: GeoTreeNode = {
      id: 'resource:abc',
      kind: 'resource',
      label: 'CTO 42',
      hasChildren: false,
      geometry: { type: 'Point', coordinates: [-43.2003, -22.9512] },
    };

    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={selectedNode}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() =>
      expect(googleMocks.markerCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          position: { lng: -43.2003, lat: -22.9512 },
          clickable: false,
        }),
      ),
    );
  });

  it('duplo clique no vazio só dá zoom: não consulta o endereço do ponto', async () => {
    const onDraftAddress = vi.fn();
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={onDraftAddress}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    // Espera o mapa montar e capturar os handlers de click/dblclick pelo nome do evento.
    await waitFor(() =>
      expect(
        googleMocks.mapAddListener.mock.calls.some(([name]) => name === 'dblclick'),
      ).toBe(true),
    );
    const clickHandler = googleMocks.mapAddListener.mock.calls.find(
      ([name]) => name === 'click',
    )?.[1] as (event: { latLng: { lat: () => number; lng: () => number } }) => void;
    const dblclickHandler = googleMocks.mapAddListener.mock.calls.find(
      ([name]) => name === 'dblclick',
    )?.[1] as () => void;
    const event = { latLng: { lat: () => -22.9, lng: () => -43.1 } };

    vi.useFakeTimers();
    try {
      // Duplo clique: o `click` chega antes do `dblclick`, que cancela a consulta adiada.
      clickHandler(event);
      dblclickHandler();
      await vi.advanceTimersByTimeAsync(400);
      expect(googleMocks.reverseGeocode).not.toHaveBeenCalled();
      expect(onDraftAddress).not.toHaveBeenCalled();

      // Clique simples: passada a janela de espera, a consulta do ponto acontece.
      clickHandler(event);
      await vi.advanceTimersByTimeAsync(400);
      expect(googleMocks.reverseGeocode).toHaveBeenCalledWith(-22.9, -43.1);
      expect(onDraftAddress).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
