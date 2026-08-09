import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleMapPanel } from './GeoPage';

const googleMocks = vi.hoisted(() => ({
  clustererAddMarkers: vi.fn(),
  clustererClearMarkers: vi.fn(),
  infoWindowClose: vi.fn(),
  infoWindowOpen: vi.fn(),
  infoWindowSetContent: vi.fn(),
  infoWindowSetOptions: vi.fn(),
  infoWindowSetPosition: vi.fn(),
  flyTo: vi.fn(),
  loadGoogleMaps: vi.fn<() => Promise<void>>(),
  mapAddListener: vi.fn(),
  mapAddListenerOnce: vi.fn(),
  mapGetBounds: vi.fn(),
  mapGetCenter: vi.fn(),
  mapGetDiv: vi.fn(() => document.createElement('div')),
  mapGetZoom: vi.fn(),
  mapPanBy: vi.fn(),
  mapPanTo: vi.fn(),
  mapSetZoom: vi.fn(),
  mapSetMapTypeId: vi.fn(),
  markerCtor: vi.fn(),
  reverseGeocode: vi.fn(),
}));

vi.mock('../utils/mapCamera', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/mapCamera')>();
  return { ...actual, flyTo: googleMocks.flyTo };
});

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
    panBy: googleMocks.mapPanBy,
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

afterEach(cleanup);

describe('GoogleMapPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleMocks.loadGoogleMaps.mockResolvedValue();
    googleMocks.reverseGeocode.mockResolvedValue(null);
    installGoogleMapsMock();
  });

  it('repassa ao voo somente a parte do mapa coberta pelo painel mobile', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const mapDiv = document.createElement('div');
    vi.spyOn(mapDiv, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 700,
      height: 600,
      left: 0,
      right: 400,
      width: 400,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    googleMocks.mapGetDiv.mockReturnValue(mapDiv);
    const focusRequest = { point: [-43.1, -22.9] as [number, number], scaleMeters: 50 };

    const renderPanel = (bottomSheetHeightPx?: number) => (
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        draftAddress={null}
        focusRequest={focusRequest}
        bottomSheetHeightPx={bottomSheetHeightPx}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onDeselect={vi.fn()}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />
    );
    const { rerender } = render(renderPanel(384));

    await waitFor(() =>
      expect(googleMocks.flyTo).toHaveBeenCalledWith(
        expect.anything(),
        focusRequest,
        expect.objectContaining({ bottomInsetPx: 284 }),
      ),
    );

    rerender(renderPanel(736));
    await waitFor(() =>
      expect(googleMocks.flyTo).toHaveBeenLastCalledWith(
        expect.anything(),
        focusRequest,
        expect.objectContaining({ bottomInsetPx: 600 }),
      ),
    );
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(2);

    rerender(renderPanel(96));
    await waitFor(() =>
      expect(googleMocks.flyTo).toHaveBeenLastCalledWith(
        expect.anything(),
        focusRequest,
        expect.objectContaining({ bottomInsetPx: 0 }),
      ),
    );
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(3);

    rerender(renderPanel(undefined));
    await waitFor(() =>
      expect(googleMocks.flyTo).toHaveBeenLastCalledWith(
        expect.anything(),
        focusRequest,
        expect.objectContaining({ bottomInsetPx: 0 }),
      ),
    );
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(4);
  });

  it('troca o MUB do mapa chamando setMapTypeId com o tipo esperado', async () => {
    const user = userEvent.setup();

    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onDeselect={vi.fn()}
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
        selectedNodeId={null}
        draftAddress={null}
        addressPoint={[-43.1079841, -22.8985597]}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onDeselect={vi.fn()}
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
        selectedNodeId={null}
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
        onDeselect={vi.fn()}
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
});
