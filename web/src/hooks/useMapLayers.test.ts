import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMapLayers } from './useMapLayers';
import { MAP_LAYER_CATALOG_FALLBACK } from '../utils/mapLayers';
import type { StudioGeoCatalog } from '../services/studioGeoApi';

const PENDING_CATALOG: StudioGeoCatalog = {
  schemaVersion: 2,
  nodes: [],
  configured: false,
  environmentId: 'pending',
  fallback: false,
};

const CATALOG: StudioGeoCatalog = {
  ...MAP_LAYER_CATALOG_FALLBACK,
  environmentId: 'environment-a',
};

const CATALOG_WITH_BUILDING: StudioGeoCatalog = {
  ...CATALOG,
  nodes: [
    ...CATALOG.nodes,
    {
      id: 'building',
      kind: 'ENTITY',
      parentNodeId: 'locations',
      label: 'Prédio',
      sortOrder: 50,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'RESOURCE',
        sourceDomain: 'resource-model',
        sourceType: 'RESOURCE_TYPE',
        sourceId: 'building',
      },
    },
  ],
};

const strictModeWrapper = ({ children }: { children: ReactNode }) =>
  createElement(StrictMode, null, children);

describe('useMapLayers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(cleanup);

  it('restaura a visibilidade salva quando o catálogo publicado chega após o sentinela pending', async () => {
    window.localStorage.setItem(
      'nexus.geo.mapLayers::environment-a',
      JSON.stringify({ stations: false }),
    );
    const { result, rerender } = renderHook(
      ({ catalog }: { catalog: StudioGeoCatalog }) => useMapLayers(catalog),
      { initialProps: { catalog: PENDING_CATALOG }, wrapper: strictModeWrapper },
    );

    rerender({ catalog: CATALOG });

    await waitFor(() => expect(result.current.layers.stations).toBe(false));
    expect(JSON.parse(window.localStorage.getItem('nexus.geo.mapLayers::environment-a') ?? '{}')).toMatchObject({
      stations: false,
    });
  });

  it('persiste uma escolha feita após a hidratação do catálogo', async () => {
    const { result } = renderHook(() => useMapLayers(CATALOG), { wrapper: strictModeWrapper });

    await waitFor(() => expect(result.current.layers.stations).toBe(true));
    act(() => result.current.toggleLayer('stations'));

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('nexus.geo.mapLayers::environment-a') ?? '{}')).toMatchObject({
        stations: false,
      }),
    );
  });

  it('mantém Estação e Prédio ocultos depois de um refresh completo', async () => {
    const firstMount = renderHook(
      ({ catalog }: { catalog: StudioGeoCatalog }) => useMapLayers(catalog),
      { initialProps: { catalog: PENDING_CATALOG }, wrapper: strictModeWrapper },
    );
    firstMount.rerender({ catalog: CATALOG_WITH_BUILDING });
    await waitFor(() => expect(firstMount.result.current.layers.stations).toBe(true));

    act(() => {
      firstMount.result.current.toggleLayer('stations');
      firstMount.result.current.toggleLayer('building');
    });
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('nexus.geo.mapLayers::environment-a') ?? '{}')).toMatchObject({
        stations: false,
        building: false,
      }),
    );
    firstMount.unmount();

    const secondMount = renderHook(
      ({ catalog }: { catalog: StudioGeoCatalog }) => useMapLayers(catalog),
      { initialProps: { catalog: PENDING_CATALOG }, wrapper: strictModeWrapper },
    );
    secondMount.rerender({ catalog: CATALOG_WITH_BUILDING });

    await waitFor(() => {
      expect(secondMount.result.current.layers.stations).toBe(false);
      expect(secondMount.result.current.layers.building).toBe(false);
    });
  });
});
