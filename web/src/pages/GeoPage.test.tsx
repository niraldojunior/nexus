import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_SELECTION_SCALE_METERS, zoomForScaleMeters } from '../utils/mapScale';
import { GoogleMapPanel } from './GeoPage';

const googleMocks = vi.hoisted(() => ({
  clustererAddMarkers: vi.fn(),
  clustererClearMarkers: vi.fn(),
  infoWindowClose: vi.fn(),
  infoWindowOpen: vi.fn(),
  infoWindowSetContent: vi.fn(),
  infoWindowSetOptions: vi.fn(),
  infoWindowSetPosition: vi.fn(),
  cameraCancel: vi.fn(),
  animateMapCamera: vi.fn(),
  loadGoogleMaps: vi.fn<() => Promise<void>>(),
  mapAddListener: vi.fn(),
  mapGetBounds: vi.fn(),
  mapGetCenter: vi.fn(),
  mapGetZoom: vi.fn(),
  mapMoveCamera: vi.fn(),
  mapPanTo: vi.fn(),
  mapSetMapTypeId: vi.fn(),
  mapSetZoom: vi.fn(),
  markerCtor: vi.fn(),
  reverseGeocode: vi.fn(),
}));

vi.mock('../utils/mapCamera', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/mapCamera')>();
  return { ...actual, animateMapCamera: googleMocks.animateMapCamera };
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
    getZoom: googleMocks.mapGetZoom,
    moveCamera: googleMocks.mapMoveCamera,
    panTo: googleMocks.mapPanTo,
    setMapTypeId: googleMocks.mapSetMapTypeId,
    setZoom: googleMocks.mapSetZoom,
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
        event: { clearInstanceListeners: vi.fn() },
      },
    },
  });
}

describe('GoogleMapPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleMocks.animateMapCamera.mockReturnValue(googleMocks.cameraCancel);
    googleMocks.loadGoogleMaps.mockResolvedValue();
    googleMocks.reverseGeocode.mockResolvedValue(null);
    googleMocks.mapGetCenter.mockReturnValue({ lat: () => -22.9, lng: () => -43.1 });
    googleMocks.mapGetZoom.mockReturnValue(14);
    installGoogleMapsMock();
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

  it('anima seleção até a escala de 50 m calculada na latitude do destino', async () => {
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        draftAddress={null}
        focusRequest={{ id: 1, point: [-43.1079841, -22.8985597], scaleMeters: 50 }}
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
      expect(googleMocks.animateMapCamera).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { lat: -22.8985597, lng: -43.1079841 },
          targetZoom: zoomForScaleMeters(50, -22.8985597),
        }),
      ),
    );
  });

  it('cancela a animação quando o usuário começa a arrastar o mapa', async () => {
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        draftAddress={null}
        focusRequest={{ id: 1, point: [-43.1079841, -22.8985597], scaleMeters: 50 }}
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

    await waitFor(() => expect(googleMocks.animateMapCamera).toHaveBeenCalledOnce());
    const dragListener = googleMocks.mapAddListener.mock.calls.find(
      ([eventName]) => eventName === 'dragstart',
    )?.[1] as (() => void) | undefined;

    expect(dragListener).toBeTypeOf('function');
    dragListener?.();
    expect(googleMocks.cameraCancel).toHaveBeenCalledOnce();
  });

  it('reanima a mesma coordenada quando uma nova seleção recebe outro identificador', async () => {
    const props = {
      nodes: [],
      selectedNodeId: null,
      draftAddress: null,
      balloon: null,
      onSelectNode: vi.fn(),
      onHoverNode: vi.fn(),
      onCloseBalloon: vi.fn(),
      onDraftAddress: vi.fn(),
      onDeselect: vi.fn(),
      onViewportChange: vi.fn(),
      clusterMarkers: false,
    };
    const point: [number, number] = [-43.1079841, -22.8985597];
    const { rerender } = render(
      <GoogleMapPanel
        {...props}
        focusRequest={{ id: 1, point, scaleMeters: MAP_SELECTION_SCALE_METERS }}
      />,
    );
    await waitFor(() => expect(googleMocks.animateMapCamera).toHaveBeenCalledOnce());

    rerender(
      <GoogleMapPanel
        {...props}
        focusRequest={{ id: 2, point, scaleMeters: MAP_SELECTION_SCALE_METERS }}
      />,
    );

    await waitFor(() => expect(googleMocks.animateMapCamera).toHaveBeenCalledTimes(2));
    expect(googleMocks.cameraCancel).toHaveBeenCalledOnce();
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
