import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGeoViewParams,
  geoViewSearchParams,
  parseGeoViewParams,
  readStoredViewState,
  resolveInitialViewState,
  writeGeoViewParams,
  writeStoredViewState,
  type GeoViewState,
} from './geoViewState';

const CAMERA = { lat: -22.9068, lng: -43.1075, zoom: 17 };

describe('readStoredViewState / writeStoredViewState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('devolve null quando não há nada salvo', () => {
    expect(readStoredViewState()).toBeNull();
  });

  it('round-trip: contexto "none"', () => {
    const state: GeoViewState = { v: 1, camera: CAMERA, context: { kind: 'none' } };
    writeStoredViewState(state);
    expect(readStoredViewState()).toEqual(state);
  });

  it('round-trip: contexto "site"', () => {
    const state: GeoViewState = {
      v: 1,
      camera: CAMERA,
      context: { kind: 'site', siteId: 'abc-123' },
    };
    writeStoredViewState(state);
    expect(readStoredViewState()).toEqual(state);
  });

  it('round-trip: contexto "resource"', () => {
    const state: GeoViewState = {
      v: 1,
      camera: CAMERA,
      context: { kind: 'resource', resourceId: 'cto-1' },
    };
    writeStoredViewState(state);
    expect(readStoredViewState()).toEqual(state);
  });

  it('round-trip: contexto "address" com DraftAddress completo', () => {
    const state: GeoViewState = {
      v: 1,
      camera: CAMERA,
      context: {
        kind: 'address',
        source: 'search',
        lat: -22.9,
        lng: -43.1,
        placeId: 'place-1',
        query: 'Rua X, 100',
        address: {
          street: 'Rua X',
          streetNr: '100',
          country: 'BR',
          coordinates: [-43.1, -22.9],
          label: 'Rua X, 100',
        },
      },
    };
    writeStoredViewState(state);
    expect(readStoredViewState()).toEqual(state);
  });

  it('JSON inválido cai em null', () => {
    window.localStorage.setItem('nexus.geo.viewState', '{not json');
    expect(readStoredViewState()).toBeNull();
  });

  it('versão desconhecida cai em null', () => {
    window.localStorage.setItem(
      'nexus.geo.viewState',
      JSON.stringify({ v: 2, camera: CAMERA, context: { kind: 'none' } }),
    );
    expect(readStoredViewState()).toBeNull();
  });

  it('lat/lng/zoom fora de faixa cai em null', () => {
    window.localStorage.setItem(
      'nexus.geo.viewState',
      JSON.stringify({ v: 1, camera: { lat: 999, lng: -43, zoom: 15 }, context: { kind: 'none' } }),
    );
    expect(readStoredViewState()).toBeNull();

    window.localStorage.setItem(
      'nexus.geo.viewState',
      JSON.stringify({ v: 1, camera: { lat: -22, lng: -43, zoom: 99 }, context: { kind: 'none' } }),
    );
    expect(readStoredViewState()).toBeNull();
  });

  it('kind de contexto desconhecido cai em "none"', () => {
    window.localStorage.setItem(
      'nexus.geo.viewState',
      JSON.stringify({ v: 1, camera: CAMERA, context: { kind: 'project' } }),
    );
    expect(readStoredViewState()).toEqual({ v: 1, camera: CAMERA, context: { kind: 'none' } });
  });

  it('site sem siteId cai em null', () => {
    window.localStorage.setItem(
      'nexus.geo.viewState',
      JSON.stringify({ v: 1, camera: CAMERA, context: { kind: 'site' } }),
    );
    expect(readStoredViewState()).toBeNull();
  });
});

describe('parseGeoViewParams', () => {
  it('sem params, devolve camera null e contexto "none"', () => {
    expect(parseGeoViewParams('')).toEqual({ camera: null, context: { kind: 'none' } });
  });

  it('parseia ll/z + site', () => {
    const result = parseGeoViewParams('?ll=-22.90680,-43.10750&z=17&site=abc');
    expect(result.camera).toEqual({ lat: -22.9068, lng: -43.1075, zoom: 17 });
    expect(result.context).toEqual({ kind: 'site', siteId: 'abc' });
  });

  it('parseia res', () => {
    const result = parseGeoViewParams('?ll=-22.9,-43.1&z=15&res=cto-1');
    expect(result.context).toEqual({ kind: 'resource', resourceId: 'cto-1' });
  });

  it('parseia addr + q + place', () => {
    const result = parseGeoViewParams(
      '?ll=-22.9,-43.1&z=17&addr=-22.91,-43.12&q=Rua+X&place=place-1',
    );
    expect(result.context).toEqual({
      kind: 'address',
      source: 'search',
      lat: -22.91,
      lng: -43.12,
      query: 'Rua X',
      placeId: 'place-1',
    });
  });

  it('ll malformado (sem vírgula) devolve camera null', () => {
    expect(parseGeoViewParams('?ll=nope&z=17').camera).toBeNull();
  });

  it('z ausente devolve camera null mesmo com ll presente', () => {
    expect(parseGeoViewParams('?ll=-22.9,-43.1').camera).toBeNull();
  });

  it('site presente prevalece sobre res/addr', () => {
    const result = parseGeoViewParams('?ll=-22.9,-43.1&z=15&site=abc&res=def&addr=-22.9,-43.1');
    expect(result.context).toEqual({ kind: 'site', siteId: 'abc' });
  });
});

describe('geoViewSearchParams', () => {
  it('contexto "none" só grava ll/z', () => {
    const params = geoViewSearchParams({ v: 1, camera: CAMERA, context: { kind: 'none' } });
    expect(params.get('ll')).toBe('-22.9068,-43.1075');
    expect(params.get('z')).toBe('17');
    expect(params.has('site')).toBe(false);
    expect(params.has('res')).toBe(false);
    expect(params.has('addr')).toBe(false);
  });

  it('arredonda zoom fracionário', () => {
    const params = geoViewSearchParams({
      v: 1,
      camera: { lat: -22.9, lng: -43.1, zoom: 16.7 },
      context: { kind: 'none' },
    });
    expect(params.get('z')).toBe('17');
  });

  it('contexto "address" grava addr/q/place', () => {
    const params = geoViewSearchParams({
      v: 1,
      camera: CAMERA,
      context: { kind: 'address', source: 'search', lat: -22.91, lng: -43.12, query: 'Rua X', placeId: 'p1' },
    });
    expect(params.get('addr')).toBe('-22.91,-43.12');
    expect(params.get('q')).toBe('Rua X');
    expect(params.get('place')).toBe('p1');
  });
});

describe('writeGeoViewParams / clearGeoViewParams', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/geo');
  });

  it('grava via replaceState preservando outros params', () => {
    window.history.replaceState({}, '', '/geo?page=geo&siteId=xyz');
    writeGeoViewParams({ v: 1, camera: CAMERA, context: { kind: 'site', siteId: 'abc' } });
    const url = new URL(window.location.href);
    expect(url.searchParams.get('page')).toBe('geo');
    expect(url.searchParams.get('siteId')).toBe('xyz');
    expect(url.searchParams.get('site')).toBe('abc');
    expect(url.searchParams.get('ll')).toBe('-22.9068,-43.1075');
  });

  it('reescrever remove params antigos que não fazem mais parte do estado', () => {
    writeGeoViewParams({ v: 1, camera: CAMERA, context: { kind: 'site', siteId: 'abc' } });
    writeGeoViewParams({ v: 1, camera: CAMERA, context: { kind: 'none' } });
    const url = new URL(window.location.href);
    expect(url.searchParams.has('site')).toBe(false);
  });

  it('clearGeoViewParams remove só os params do viewport', () => {
    window.history.replaceState({}, '', '/geo?page=geo&siteId=xyz');
    writeGeoViewParams({ v: 1, camera: CAMERA, context: { kind: 'site', siteId: 'abc' } });
    clearGeoViewParams();
    const url = new URL(window.location.href);
    expect(url.searchParams.has('ll')).toBe(false);
    expect(url.searchParams.has('site')).toBe(false);
    expect(url.searchParams.get('page')).toBe('geo');
    expect(url.searchParams.get('siteId')).toBe('xyz');
  });
});

describe('resolveInitialViewState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sem URL nem storage, devolve null', () => {
    expect(resolveInitialViewState('')).toBeNull();
  });

  it('URL vence storage quando ambos têm câmera', () => {
    writeStoredViewState({
      v: 1,
      camera: { lat: 0, lng: 0, zoom: 5 },
      context: { kind: 'none' },
    });
    const result = resolveInitialViewState('?ll=-22.9,-43.1&z=17');
    expect(result?.camera).toEqual({ lat: -22.9, lng: -43.1, zoom: 17 });
  });

  it('sem câmera na URL, cai no storage', () => {
    const stored: GeoViewState = {
      v: 1,
      camera: { lat: -22.9, lng: -43.1, zoom: 15 },
      context: { kind: 'site', siteId: 'abc' },
    };
    writeStoredViewState(stored);
    expect(resolveInitialViewState('')).toEqual(stored);
  });

  it('storage completa o DraftAddress quando a identidade do placeId bate', () => {
    const address = {
      street: 'Rua X',
      country: 'BR',
      coordinates: [-43.1, -22.9] as [number, number],
      label: 'Rua X',
    };
    writeStoredViewState({
      v: 1,
      camera: { lat: -22.9, lng: -43.1, zoom: 15 },
      context: { kind: 'address', source: 'search', lat: -22.9, lng: -43.1, placeId: 'p1', address },
    });
    const result = resolveInitialViewState('?ll=-22.9,-43.1&z=17&addr=-22.9,-43.1&place=p1');
    expect(result?.context).toMatchObject({ kind: 'address', placeId: 'p1', address });
  });

  it('storage é ignorado quando a identidade não bate', () => {
    const address = {
      street: 'Rua X',
      country: 'BR',
      coordinates: [-43.1, -22.9] as [number, number],
      label: 'Rua X',
    };
    writeStoredViewState({
      v: 1,
      camera: { lat: -22.9, lng: -43.1, zoom: 15 },
      context: { kind: 'address', source: 'search', lat: -22.9, lng: -43.1, placeId: 'p1', address },
    });
    const result = resolveInitialViewState('?ll=-22.9,-43.1&z=17&addr=-22.9,-43.1&place=different');
    expect((result?.context as { address?: unknown }).address).toBeUndefined();
  });
});
