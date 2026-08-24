import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleMapPanel } from './GeoPage';
import type { GeoTreeNode } from '../services/geoTreeApi';
import type { MapTileFeature } from '../services/geoMapTileApi';

// InfraOverlay (canvas, Fase 3 da issue #69) precisa de projeção real (getProjection não-null)
// pra `draw`/`hitTest` funcionarem de verdade — o mock de OverlayView abaixo devolve null de
// propósito (comentário original). Mockado à parte para exercitar o fio de seleção via canvas
// (clique → hitTest → onSelectInfraFeature) sem depender de projeção geométrica real.
const infraOverlayMocks = vi.hoisted(() => ({
  setData: vi.fn(),
  hitTest: vi.fn((_lng: number, _lat: number): MapTileFeature | null => null),
  destroy: vi.fn(),
}));

vi.mock('./geo-tabs/InfraOverlay', () => ({
  createInfraOverlay: vi.fn(() => ({
    setData: infraOverlayMocks.setData,
    hitTest: infraOverlayMocks.hitTest,
    destroy: infraOverlayMocks.destroy,
  })),
}));

const googleMocks = vi.hoisted(() => ({
  cancelFlight: vi.fn(),
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
  mapSetOptions: vi.fn(),
  markerCtor: vi.fn(),
  circleCtor: vi.fn(),
  circleSetCenter: vi.fn(),
  circleSetRadius: vi.fn(),
  circleSetMap: vi.fn(),
  circleSetOptions: vi.fn(),
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
    setOptions: googleMocks.mapSetOptions,
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
        Circle: vi.fn(function Circle(options: Record<string, unknown>) {
          googleMocks.circleCtor(options);
          return {
            setCenter: googleMocks.circleSetCenter,
            setRadius: googleMocks.circleSetRadius,
            setMap: googleMocks.circleSetMap,
            setOptions: googleMocks.circleSetOptions,
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
        LatLng: vi.fn(function LatLng(lat: number, lng: number) {
          return { lat: () => lat, lng: () => lng };
        }),
        // OverlayView é subclassada pela camada de cobertura (CoverageOverlay). Sem projeção
        // (getProjection → null) o draw sai cedo, então o canvas não desenha no teste.
        OverlayView: class MockOverlayView {
          setMap(): void {}
          getPanes() {
            return {
              overlayLayer: document.createElement('div'),
              overlayMouseTarget: document.createElement('div'),
            };
          }
          getProjection() {
            return null;
          }
        },
        SymbolPath: { CIRCLE: 'CIRCLE' },
        event: {
          clearInstanceListeners: vi.fn(),
          addListenerOnce: googleMocks.mapAddListenerOnce,
        },
      },
    },
  });
}

// Nó de seleção mínimo, com geometria — o suficiente para o painel considerar que há algo
// aberto (selectionActive) e para o alfinete ter um ponto. `sublabel` identifica CO/Estação
// para siteKindFromSpec (Fase 3, REQ-MOD01-016) — todo tipo de Site (CO ou não) usa o mesmo
// `siteMarkerSize` no mapa; os demais Sites seguem a régua de Resource.
const selectionNode = (id = 'site:1'): GeoTreeNode => ({
  id,
  kind: 'site',
  label: 'Estação',
  sublabel: 'Central Office',
  siteCategory: 'Site',
  hasChildren: false,
  geometry: { type: 'Point', coordinates: [-43.1, -22.9] },
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  Reflect.deleteProperty(navigator, 'geolocation');
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
        selectedNode={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
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

  it('mostra a legenda de cobertura GPON quando a camada está visível', async () => {
    const coverage = {
      level: 'neighborhood' as const,
      grid: { sizeMeters: 50, projection: 'EPSG:3857' as const },
      cells: [],
      areas: [],
      neighborhoods: [],
      truncated: false,
    };
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
        coverage={coverage}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    const legend = await screen.findByRole('group', { name: 'Legenda da cobertura GPON' });
    expect(legend).toHaveClass('bottom-8', 'left-1/2', '-translate-x-1/2');
    expect(screen.getByText('Suspenso')).toBeInTheDocument();
    expect(screen.getByText('Disponível')).toBeInTheDocument();
    expect(screen.queryByText('Cobertura GPON')).not.toBeInTheDocument();
  });

  it('desenha a Central/Estação no tamanho vindo de `siteMarkerSize` (10 km para cima)', async () => {
    render(
      <GoogleMapPanel
        nodes={[selectionNode()]}
        selectedNode={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={20}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(googleMocks.markerCtor).toHaveBeenCalled());
    const siteOptions = googleMocks.markerCtor.mock.calls
      .map(([options]) => options as { icon?: { scaledSize?: { width?: number } } })
      .find((options) => options.icon?.scaledSize?.width !== undefined);
    expect(siteOptions?.icon?.scaledSize?.width).toBe(20);
  });

  it('site não-CO (ex.: Ponto de Instalação) segue `resourceMarkerSize`', async () => {
    const installationPoint: GeoTreeNode = {
      ...selectionNode('site:2'),
      label: 'PI Rua Miguel de Frias',
      sublabel: 'Installation Point',
    };
    render(
      <GoogleMapPanel
        nodes={[installationPoint]}
        selectedNode={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        coverage={null}
        // Site não-CO é visualmente equivalente a Resource no mapa.
        siteMarkerSize={20}
        resourceMarkerSize={7}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(googleMocks.markerCtor).toHaveBeenCalled());
    const siteOptions = googleMocks.markerCtor.mock.calls
      .map(([options]) => options as { icon?: { scaledSize?: { width?: number } } })
      .find((options) => options.icon?.scaledSize?.width !== undefined);
    expect(siteOptions?.icon?.scaledSize?.width).toBe(7);
  });

  it('mantém a seleção ao arrastar o mapa: cancela o voo e avisa navegação manual, sem desselecionar', async () => {
    const onManualNavigation = vi.fn();
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={selectionNode()}
        selectionActive
        draftAddress={null}
        focusRequest={{ point: [-43.1, -22.9], scaleMeters: 50 }}
        bottomSheetState={{ snap: 'mid', heightPx: 384 }}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onManualNavigation={onManualNavigation}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapListener('dragstart')).toBeTypeOf('function'));
    mapListener('dragstart')?.();

    expect(googleMocks.cancelFlight).toHaveBeenCalledOnce();
    expect(onManualNavigation).toHaveBeenCalledOnce();
  });

  it('cancela o voo ao arrastar sem seleção, mas não aciona navegação manual', async () => {
    const onManualNavigation = vi.fn();
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={null}
        selectionActive={false}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onManualNavigation={onManualNavigation}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapListener('dragstart')).toBeTypeOf('function'));
    mapListener('dragstart')?.();

    expect(googleMocks.cancelFlight).toHaveBeenCalledOnce();
    expect(onManualNavigation).not.toHaveBeenCalled();
  });

  it('invalida geocoding em voo quando o usuário dá duplo clique para ampliar o mapa', async () => {
    const onDraftAddress = vi.fn();
    let resolveGeocode!: (value: null) => void;
    googleMocks.reverseGeocode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGeocode = resolve;
      }),
    );
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={null}
        selectionActive={false}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={onDraftAddress}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
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

    // O duplo clique invalidou a geração da consulta adiada: o endereço não é criado.
    expect(onDraftAddress).not.toHaveBeenCalled();
  });

  it('mantém a criação de endereço após confirmar um clique simples no mapa', async () => {
    const onDraftAddress = vi.fn();
    googleMocks.reverseGeocode.mockRejectedValueOnce(new Error('geocoder indisponível'));
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={null}
        selectionActive={false}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={onDraftAddress}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapListener('click')).toBeTypeOf('function'));
    vi.useFakeTimers();
    mapListener('click')?.({ latLng: { lat: () => -22.9, lng: () => -43.1 } });
    expect(onDraftAddress).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();

    expect(onDraftAddress).toHaveBeenCalledOnce();
  });

  it('substitui a seleção anterior: clique no vazio abre o endereço mesmo com algo selecionado', async () => {
    const onDraftAddress = vi.fn();
    render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={selectionNode()}
        selectionActive
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={onDraftAddress}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapListener('click')).toBeTypeOf('function'));
    vi.useFakeTimers();
    mapListener('click')?.({ latLng: { lat: () => -22.95, lng: () => -43.2 } });
    await vi.runAllTimersAsync();

    // Issue #19: o clique consulta o ponto (não desseleciona) para substituir a seleção.
    expect(googleMocks.reverseGeocode).toHaveBeenCalledWith(-22.95, -43.2);
    expect(onDraftAddress).toHaveBeenCalledOnce();
  });

  it('cancela clique vazio pendente quando outra seleção é aberta', async () => {
    const onDraftAddress = vi.fn();
    const baseProps = {
      nodes: [],
      draftAddress: null,
      focusRequest: null,
      balloon: null,
      onSelectNode: vi.fn(),
      onHoverNode: vi.fn(),
      onCloseBalloon: vi.fn(),
      onDraftAddress,
      onViewportChange: vi.fn(),
      coverage: null,
      siteMarkerSize: 25,
      resourceMarkerSize: 30,
      onCoverageHover: vi.fn(),
    };
    const { rerender } = render(
      <GoogleMapPanel {...baseProps} selectedNode={null} selectionActive={false} />,
    );

    await waitFor(() => expect(mapListener('click')).toBeTypeOf('function'));
    vi.useFakeTimers();
    mapListener('click')?.({ latLng: { lat: () => -22.9, lng: () => -43.1 } });
    rerender(<GoogleMapPanel {...baseProps} selectedNode={selectionNode()} selectionActive />);
    await vi.runAllTimersAsync();

    expect(googleMocks.reverseGeocode).not.toHaveBeenCalled();
    expect(onDraftAddress).not.toHaveBeenCalled();
  });

  it('clique sobre uma feature do InfraOverlay seleciona a feature, sem cair no clique-no-vazio', async () => {
    const onDraftAddress = vi.fn();
    const onSelectInfraFeature = vi.fn();
    const feature: MapTileFeature = {
      entityId: 'r9',
      kind: 'resource',
      entityType: 'PhysicalResource',
      shape: 'point',
      typeCode: 'CTO',
      label: 'CDOE-1108',
      lng: -43.108,
      lat: -22.907,
    };
    infraOverlayMocks.hitTest.mockReturnValueOnce(feature);
    render(
      <GoogleMapPanel
        nodes={[]}
        infraFeatures={[feature]}
        onSelectInfraFeature={onSelectInfraFeature}
        selectedNode={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={onDraftAddress}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapListener('click')).toBeTypeOf('function'));
    vi.useFakeTimers();
    mapListener('click')?.({ latLng: { lat: () => -22.907, lng: () => -43.108 } });
    await vi.runAllTimersAsync();

    expect(onSelectInfraFeature).toHaveBeenCalledWith(feature);
    // Achou a feature no hit-test: não é clique no vazio — o fluxo de reverse geocode
    // (endereço/draftAddress) nem chega a rodar.
    expect(googleMocks.reverseGeocode).not.toHaveBeenCalled();
    expect(onDraftAddress).not.toHaveBeenCalled();
  });

  it('repassa infraFeatures/resourceMarkerSize/seleção pro InfraOverlay a cada mudança', async () => {
    const feature: MapTileFeature = {
      entityId: 'r9',
      kind: 'resource',
      entityType: 'PhysicalResource',
      shape: 'point',
      label: 'CDOE-1108',
      lng: -43.108,
      lat: -22.907,
    };
    const { rerender } = render(
      <GoogleMapPanel
        nodes={[]}
        infraFeatures={[feature]}
        onSelectInfraFeature={vi.fn()}
        selectedNode={null}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(infraOverlayMocks.setData).toHaveBeenCalledWith([feature], {
        resourceMarkerSize: 30,
        siteMarkerSize: 25,
        excludeNodeId: null,
      }),
    );

    // O nó selecionado nunca é desenhado pelo overlay (fica só como Marker real) — trocar a
    // seleção precisa reenviar `setData` com o excludeNodeId novo, mesmo sem `infraFeatures`
    // ter mudado.
    rerender(
      <GoogleMapPanel
        nodes={[]}
        infraFeatures={[feature]}
        onSelectInfraFeature={vi.fn()}
        selectedNode={selectionNode('resource:r9')}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(infraOverlayMocks.setData).toHaveBeenLastCalledWith([feature], {
        resourceMarkerSize: 30,
        siteMarkerSize: 25,
        excludeNodeId: 'resource:r9',
      }),
    );
  });

  it('mostra cursor de mão apenas ao passar sobre infraestrutura clicável do canvas', async () => {
    const feature: MapTileFeature = {
      entityId: 'r9',
      kind: 'resource',
      entityType: 'PhysicalResource',
      shape: 'point',
      label: 'CDOE-1108',
      lng: -43.108,
      lat: -22.907,
    };
    infraOverlayMocks.hitTest
      .mockReturnValueOnce(feature)
      .mockReturnValueOnce(feature)
      .mockReturnValueOnce(null);
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
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapListener('mousemove')).toBeTypeOf('function'));
    googleMocks.mapSetOptions.mockClear();
    const mousemoveListeners = googleMocks.mapAddListener.mock.calls.filter(
      ([eventName]) => eventName === 'mousemove',
    );
    const mousemove = mousemoveListeners[mousemoveListeners.length - 1]?.[1] as (event: {
      latLng: { lat: () => number; lng: () => number };
    }) => void;
    const event = { latLng: { lat: () => -22.907, lng: () => -43.108 } };
    // O listener único (issue #72) coalesce vários `mousemove` num só hit-test por frame — só
    // o último evento pendente é processado quando o rAF dispara.
    const flushFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    mousemove(event);
    await flushFrame();
    mousemove(event);
    await flushFrame();
    mousemove(event);
    await flushFrame();

    expect(googleMocks.mapSetOptions).toHaveBeenCalledTimes(2);
    expect(googleMocks.mapSetOptions).toHaveBeenNthCalledWith(1, { draggableCursor: 'pointer' });
    expect(googleMocks.mapSetOptions).toHaveBeenNthCalledWith(2, { draggableCursor: null });
  });

  it('avisa navegação manual só após movimento real de dois toques e limpa ponteiros fora do canvas', () => {
    const onManualNavigation = vi.fn();
    const { container } = render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={selectionNode()}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onManualNavigation={onManualNavigation}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    const canvas = container.querySelector('[data-testid="google-map-canvas"]')!;
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch' });
    expect(onManualNavigation).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(window, { pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerDown(canvas, { pointerId: 3, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    });
    expect(onManualNavigation).not.toHaveBeenCalled();

    fireEvent.pointerDown(canvas, { pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, {
      pointerId: 4,
      pointerType: 'touch',
      clientX: 140,
      clientY: 140,
    });
    expect(onManualNavigation).toHaveBeenCalledOnce();
  });

  it('avisa navegação manual ao iniciar zoom por roda ou trackpad sobre o mapa', async () => {
    const onManualNavigation = vi.fn();
    const { container } = render(
      <GoogleMapPanel
        nodes={[]}
        selectedNode={selectionNode()}
        draftAddress={null}
        focusRequest={null}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onManualNavigation={onManualNavigation}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(googleMocks.mapCtor).toHaveBeenCalledOnce());
    fireEvent.wheel(container.querySelector('[data-testid="google-map-canvas"]')!, {
      deltaY: -100,
    });

    expect(googleMocks.cancelFlight).toHaveBeenCalledOnce();
    expect(onManualNavigation).toHaveBeenCalledOnce();
  });

  it('reenquadra em peek↔mid e resize nesses snaps, mas ignora transições envolvendo full', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const focusRequest = { point: [-43.1, -22.9] as [number, number], scaleMeters: 50 };
    const baseProps = {
      nodes: [],
      selectedNode: selectionNode(),
      draftAddress: null,
      focusRequest,
      balloon: null,
      onSelectNode: vi.fn(),
      onHoverNode: vi.fn(),
      onCloseBalloon: vi.fn(),
      onDraftAddress: vi.fn(),
      onViewportChange: vi.fn(),
      coverage: null,
      siteMarkerSize: 25,
      resourceMarkerSize: 30,
      onCoverageHover: vi.fn(),
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
        selectedNode={null}
        draftAddress={null}
        focusRequest={focusRequest}
        bottomSheetState={bottomSheetState}
        balloon={null}
        onSelectNode={vi.fn()}
        onHoverNode={vi.fn()}
        onCloseBalloon={vi.fn()}
        onDraftAddress={vi.fn()}
        onViewportChange={vi.fn()}
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
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

  it('crava o ponto com halo de precisão e só move a câmera na primeira leitura', async () => {
    const user = userEvent.setup();
    const state: {
      success?: (position: {
        coords: { latitude: number; longitude: number; accuracy: number };
      }) => void;
    } = {};
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((success) => {
          state.success = success;
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });

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
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );
    // Mesmo sinal de prontidão do mapa usado no teste de MUB.
    await waitFor(() => expect(googleMocks.mapSetMapTypeId).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Ir para a minha localização' }));

    // Primeira leitura: fix grosseiro (±40 m). A câmera AFASTA (fitSpanMeters = 2×accuracy)
    // para o halo caber, e o círculo de incerteza nasce com raio = accuracy.
    act(() =>
      state.success?.({ coords: { latitude: -22.9068, longitude: -43.1075, accuracy: 40 } }),
    );

    expect(googleMocks.flyTo).toHaveBeenCalledTimes(1);
    expect(googleMocks.flyTo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fitSpanMeters: 80, scaleMeters: null }),
      expect.objectContaining({ bottomInsetPx: 0 }),
    );
    expect(googleMocks.circleCtor).toHaveBeenCalledTimes(1);
    expect(googleMocks.circleCtor).toHaveBeenCalledWith(expect.objectContaining({ radius: 40 }));

    // Segunda leitura, fix apertado (±8 m): atualiza o halo existente (sem novo círculo) e
    // NÃO reenquadra — a câmera é uma só por acionamento.
    act(() =>
      state.success?.({ coords: { latitude: -22.9068, longitude: -43.1075, accuracy: 8 } }),
    );

    expect(googleMocks.circleCtor).toHaveBeenCalledTimes(1);
    expect(googleMocks.circleSetRadius).toHaveBeenCalledWith(8);
    expect(googleMocks.flyTo).toHaveBeenCalledTimes(1);
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
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
      />,
    );

    await waitFor(() => expect(googleMocks.mapSetMapTypeId).toHaveBeenCalledWith('roadmap'));

    await user.click(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
    await user.click(screen.getByRole('option', { name: 'Satélite' }));
    await waitFor(() => expect(googleMocks.mapSetMapTypeId).toHaveBeenLastCalledWith('hybrid'));

    await user.click(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
    await user.click(screen.getByRole('option', { name: 'Branco' }));
    await waitFor(() => expect(googleMocks.mapSetMapTypeId).toHaveBeenLastCalledWith('roadmap'));
    expect(googleMocks.mapSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        styles: expect.arrayContaining([expect.objectContaining({ elementType: 'geometry' })]),
      }),
    );
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
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
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
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
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
        coverage={null}
        siteMarkerSize={25}
        resourceMarkerSize={30}
        onCoverageHover={vi.fn()}
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
});
