import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleMapPanel } from './GeoPage';

const googleMocks = vi.hoisted(() => ({
  cancelFlight: vi.fn(),
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
  mapCtor: vi.fn(),
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
  return { ...actual, cancelFlight: googleMocks.cancelFlight, flyTo: googleMocks.flyTo };
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
        Map: vi.fn(function Map(element: HTMLElement, options: Record<string, unknown>) {
          googleMocks.mapCtor(element, options);
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

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('GoogleMapPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleMocks.loadGoogleMaps.mockResolvedValue();
    googleMocks.reverseGeocode.mockResolvedValue(null);
    installGoogleMapsMock();
  });

  const mapListener = (eventName: string) => {
    const registration = googleMocks.mapAddListener.mock.calls.find(
      ([registeredEvent]) => registeredEvent === eventName,
    );
    expect(registration, `listener ${eventName}`).toBeDefined();
    return registration?.[1] as ((...args: unknown[]) => void) | undefined;
  };

  it('permite pan com um dedo e mantém pinch zoom com dois dedos', async () => {
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

    await waitFor(() => expect(googleMocks.mapCtor).toHaveBeenCalledOnce());
    const options = googleMocks.mapCtor.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(options).toEqual(
      expect.objectContaining({
        gestureHandling: 'greedy',
      }),
    );
    expect(options).not.toHaveProperty('renderingType');
    expect(options).not.toHaveProperty('headingInteractionEnabled');
    expect(options).not.toHaveProperty('tiltInteractionEnabled');
  });

  it('cancela o voo e deseleciona endereço ativo quando o usuário arrasta o mapa', async () => {
    const onDeselect = vi.fn();
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        selectionActive
        draftAddress={null}
        focusRequest={{ point: [-43.1, -22.9], scaleMeters: 50 }}
        bottomSheetState={{ snap: 'mid', heightPx: 384 }}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onDeselect={onDeselect}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() => expect(mapListener('dragstart')).toBeTypeOf('function'));
    mapListener('dragstart')?.();

    expect(googleMocks.cancelFlight).toHaveBeenCalledOnce();
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it('cancela o voo e limpa estado transitório mesmo quando não há seleção', async () => {
    const onDeselect = vi.fn();
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        selectionActive={false}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onDeselect={onDeselect}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() => expect(mapListener('dragstart')).toBeTypeOf('function'));
    mapListener('dragstart')?.();

    expect(googleMocks.cancelFlight).toHaveBeenCalledOnce();
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it('invalida geocoding em voo quando o usuário dá duplo clique para ampliar o mapa', async () => {
    const onDraftAddress = vi.fn();
    const onDeselect = vi.fn();
    let resolveGeocode!: (value: null) => void;
    googleMocks.reverseGeocode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGeocode = resolve;
      }),
    );
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        selectionActive={false}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={onDraftAddress}
        onDeselect={onDeselect}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() => expect(mapListener('dblclick')).toBeTypeOf('function'));
    vi.useFakeTimers();
    const event = { latLng: { lat: () => -22.9, lng: () => -43.1 } };
    mapListener('click')?.(event);
    await vi.advanceTimersByTimeAsync(500);
    expect(googleMocks.reverseGeocode).toHaveBeenCalledOnce();
    mapListener('dblclick')?.();
    resolveGeocode(null);
    await Promise.resolve();

    expect(onDraftAddress).not.toHaveBeenCalled();
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it('mantém a criação de endereço após confirmar um clique simples no mapa', async () => {
    const onDraftAddress = vi.fn();
    googleMocks.reverseGeocode.mockRejectedValueOnce(new Error('geocoder indisponível'));
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        selectionActive={false}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={onDraftAddress}
        onDeselect={vi.fn()}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() => expect(mapListener('click')).toBeTypeOf('function'));
    vi.useFakeTimers();
    mapListener('click')?.({ latLng: { lat: () => -22.9, lng: () => -43.1 } });
    expect(onDraftAddress).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();

    expect(onDraftAddress).toHaveBeenCalledOnce();
  });

  it('cancela clique vazio pendente quando outra seleção é aberta', async () => {
    const onDraftAddress = vi.fn();
    const onDeselect = vi.fn();
    const baseProps = {
      nodes: [],
      draftAddress: null,
      focusRequest: null,
      balloon: null,
      onSelectNode: vi.fn(),
      onHoverNode: vi.fn(),
      onCloseBalloon: vi.fn(),
      onDraftAddress,
      onDeselect,
      onViewportChange: vi.fn(),
      clusterMarkers: false,
    };
    const { rerender } = render(
      <GoogleMapPanel {...baseProps} selectedNodeId={null} selectionActive={false} />,
    );

    await waitFor(() => expect(mapListener('click')).toBeTypeOf('function'));
    vi.useFakeTimers();
    mapListener('click')?.({ latLng: { lat: () => -22.9, lng: () => -43.1 } });
    rerender(<GoogleMapPanel {...baseProps} selectedNodeId="site:1" selectionActive />);
    await vi.runAllTimersAsync();

    expect(googleMocks.reverseGeocode).not.toHaveBeenCalled();
    expect(onDraftAddress).not.toHaveBeenCalled();
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('deseleciona somente após movimento real de dois toques e limpa ponteiros fora do canvas', () => {
    const onDeselect = vi.fn();
    const { container } = render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId="site:1"
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onDeselect={onDeselect}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    const canvas = container.querySelector('[data-testid="google-map-canvas"]')!;
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch' });
    expect(onDeselect).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(window, { pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerDown(canvas, { pointerId: 3, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    });
    expect(onDeselect).not.toHaveBeenCalled();

    fireEvent.pointerDown(canvas, { pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, {
      pointerId: 4,
      pointerType: 'touch',
      clientX: 140,
      clientY: 140,
    });
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it('deseleciona ao iniciar zoom por roda ou trackpad sobre o mapa', async () => {
    const onDeselect = vi.fn();
    const { container } = render(
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId="site:1"
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onDeselect={onDeselect}
        onViewportChange={vi.fn()}
        clusterMarkers={false}
      />,
    );

    await waitFor(() => expect(googleMocks.loadGoogleMaps).toHaveBeenCalled());
    fireEvent.wheel(container.querySelector('[data-testid="google-map-canvas"]')!, {
      deltaY: -100,
    });

    expect(googleMocks.cancelFlight).toHaveBeenCalledOnce();
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it('reenquadra em peek↔mid e resize nesses snaps, mas ignora transições envolvendo full', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const focusRequest = { point: [-43.1, -22.9] as [number, number], scaleMeters: 50 };
    const baseProps = {
      nodes: [],
      selectedNodeId: 'site:1',
      draftAddress: null,
      focusRequest,
      balloon: null,
      onSelectNode: vi.fn(),
      onHoverNode: vi.fn(),
      onCloseBalloon: vi.fn(),
      onDraftAddress: vi.fn(),
      onDeselect: vi.fn(),
      onViewportChange: vi.fn(),
      clusterMarkers: false,
    };
    const { rerender } = render(
      <GoogleMapPanel {...baseProps} bottomSheetState={{ snap: 'mid', heightPx: 384 }} />,
    );
    await waitFor(() => expect(googleMocks.flyTo).toHaveBeenCalledTimes(1));

    rerender(<GoogleMapPanel {...baseProps} bottomSheetState={{ snap: 'full', heightPx: 736 }} />);
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(1);

    rerender(<GoogleMapPanel {...baseProps} bottomSheetState={{ snap: 'mid', heightPx: 384 }} />);
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(1);

    rerender(<GoogleMapPanel {...baseProps} bottomSheetState={{ snap: 'peek', heightPx: 96 }} />);
    await waitFor(() => expect(googleMocks.flyTo).toHaveBeenCalledTimes(2));

    rerender(<GoogleMapPanel {...baseProps} bottomSheetState={{ snap: 'peek', heightPx: 120 }} />);
    await waitFor(() => expect(googleMocks.flyTo).toHaveBeenCalledTimes(3));

    rerender(<GoogleMapPanel {...baseProps} bottomSheetState={undefined} />);
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(3);
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

    const renderPanel = (bottomSheetState?: {
      snap: 'peek' | 'mid' | 'full';
      heightPx: number;
    }) => (
      <GoogleMapPanel
        nodes={[]}
        selectedNodeId={null}
        draftAddress={null}
        focusRequest={focusRequest}
        bottomSheetState={bottomSheetState}
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
    const { rerender } = render(renderPanel({ snap: 'mid', heightPx: 384 }));

    await waitFor(() =>
      expect(googleMocks.flyTo).toHaveBeenCalledWith(
        expect.anything(),
        focusRequest,
        expect.objectContaining({ bottomInsetPx: 284 }),
      ),
    );

    rerender(renderPanel({ snap: 'mid', heightPx: 480 }));
    await waitFor(() =>
      expect(googleMocks.flyTo).toHaveBeenLastCalledWith(
        expect.anything(),
        focusRequest,
        expect.objectContaining({ bottomInsetPx: 380 }),
      ),
    );
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(2);

    rerender(renderPanel({ snap: 'peek', heightPx: 96 }));
    await waitFor(() =>
      expect(googleMocks.flyTo).toHaveBeenLastCalledWith(
        expect.anything(),
        focusRequest,
        expect.objectContaining({ bottomInsetPx: 0 }),
      ),
    );
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(3);

    rerender(renderPanel(undefined));
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(3);
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
