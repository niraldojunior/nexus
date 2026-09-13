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
const LEGACY_ENVIRONMENT_ID = 'legacy';
const EMPTY_ENVIRONMENT_ID = 'empty-environment';

const namespacedKey = (environmentId: string) => `nexus.geo.viewState::${environmentId}`;

describe('readStoredViewState / writeStoredViewState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('devolve null quando não há nada salvo', () => {
    expect(readStoredViewState(EMPTY_ENVIRONMENT_ID)).toBeNull();
  });

  it('round-trip: contexto "none"', () => {
    const state: GeoViewState = { v: 1, camera: CAMERA, context: { kind: 'none' } };
    writeStoredViewState(state, EMPTY_ENVIRONMENT_ID);
    expect(readStoredViewState(EMPTY_ENVIRONMENT_ID)).toEqual(state);
  });

  it('isola estados entre ambientes', () => {
    const stateA: GeoViewState = { v: 1, camera: CAMERA, context: { kind: 'site', siteId: 'a' } };
    const stateB: GeoViewState = {
      v: 1,
      camera: { lat: -23, lng: -43.2, zoom: 15 },
      context: { kind: 'resource', resourceId: 'b' },
    };
    writeStoredViewState(stateA, 'environment-a');
    writeStoredViewState(stateB, 'environment-b');

    expect(readStoredViewState('environment-a')).toEqual(stateA);
    expect(readStoredViewState('environment-b')).toEqual(stateB);
  });

  it('migra a chave sem namespace apenas para legacy', () => {
    const state: GeoViewState = { v: 1, camera: CAMERA, context: { kind: 'site', siteId: 'legacy' } };
    window.localStorage.setItem('nexus.geo.viewState', JSON.stringify(state));

    expect(readStoredViewState(LEGACY_ENVIRONMENT_ID)).toEqual(state);
    expect(window.localStorage.getItem(namespacedKey(LEGACY_ENVIRONMENT_ID))).toBe(JSON.stringify(state));
  });

  it('ambiente empty não lê, move nem apaga a chave legada', () => {
    const legacy: GeoViewState = { v: 1, camera: CAMERA, context: { kind: 'site', siteId: 'legacy' } };
    window.localStorage.setItem('nexus.geo.viewState', JSON.stringify(legacy));

    expect(readStoredViewState(EMPTY_ENVIRONMENT_ID)).toBeNull();
    expect(window.localStorage.getItem('nexus.geo.viewState')).toBe(JSON.stringify(legacy));
    expect(window.localStorage.getItem(namespacedKey(EMPTY_ENVIRONMENT_ID))).toBeNull();
  });

  it('round-trip: contexto "address" com DraftAddress completo', () => {
    const state: GeoViewState = {
      v: 1,
      camera: CAMERA,
      context: {
        kind: 'address', source: 'search', lat: -22.9, lng: -43.1, placeId: 'place-1', query: 'Rua X, 100',
        address: { street: 'Rua X', streetNr: '100', country: 'BR', coordinates: [-43.1, -22.9], label: 'Rua X, 100' },
      },
    };
    writeStoredViewState(state, EMPTY_ENVIRONMENT_ID);
    expect(readStoredViewState(EMPTY_ENVIRONMENT_ID)).toEqual(state);
  });

  it('JSON inválido cai em null', () => {
    window.localStorage.setItem(namespacedKey(EMPTY_ENVIRONMENT_ID), '{not json');
    expect(readStoredViewState(EMPTY_ENVIRONMENT_ID)).toBeNull();
  });

  it('versão ou câmera inválida cai em null', () => {
    window.localStorage.setItem(namespacedKey(EMPTY_ENVIRONMENT_ID), JSON.stringify({ v: 2, camera: CAMERA, context: { kind: 'none' } }));
    expect(readStoredViewState(EMPTY_ENVIRONMENT_ID)).toBeNull();
    window.localStorage.setItem(namespacedKey(EMPTY_ENVIRONMENT_ID), JSON.stringify({ v: 1, camera: { lat: 999, lng: -43, zoom: 15 }, context: { kind: 'none' } }));
    expect(readStoredViewState(EMPTY_ENVIRONMENT_ID)).toBeNull();
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

  it('site presente prevalece sobre res/addr', () => {
    const result = parseGeoViewParams('?ll=-22.9,-43.1&z=15&site=abc&res=def&addr=-22.9,-43.1');
    expect(result.context).toEqual({ kind: 'site', siteId: 'abc' });
  });
});

describe('geoViewSearchParams / URL', () => {
  beforeEach(() => window.history.replaceState({}, '', '/geo'));

  it('contexto "none" só grava ll/z', () => {
    const params = geoViewSearchParams({ v: 1, camera: CAMERA, context: { kind: 'none' } });
    expect(params.get('ll')).toBe('-22.9068,-43.1075');
    expect(params.get('z')).toBe('17');
    expect(params.has('site')).toBe(false);
  });

  it('grava via replaceState preservando outros params e limpa apenas viewport', () => {
    window.history.replaceState({}, '', '/geo?page=geo&siteId=xyz');
    writeGeoViewParams({ v: 1, camera: CAMERA, context: { kind: 'site', siteId: 'abc' } });
    expect(new URL(window.location.href).searchParams.get('page')).toBe('geo');
    clearGeoViewParams();
    expect(new URL(window.location.href).searchParams.get('siteId')).toBe('xyz');
    expect(new URL(window.location.href).searchParams.has('ll')).toBe(false);
  });
});

describe('resolveInitialViewState', () => {
  beforeEach(() => window.localStorage.clear());

  it('URL vence storage do mesmo ambiente', () => {
    writeStoredViewState({ v: 1, camera: { lat: 0, lng: 0, zoom: 5 }, context: { kind: 'none' } }, EMPTY_ENVIRONMENT_ID);
    expect(resolveInitialViewState(EMPTY_ENVIRONMENT_ID, '?ll=-22.9,-43.1&z=17')?.camera).toEqual({ lat: -22.9, lng: -43.1, zoom: 17 });
  });

  it('sem câmera na URL, cai no storage do ambiente', () => {
    const stored: GeoViewState = { v: 1, camera: { lat: -22.9, lng: -43.1, zoom: 15 }, context: { kind: 'site', siteId: 'abc' } };
    writeStoredViewState(stored, EMPTY_ENVIRONMENT_ID);
    expect(resolveInitialViewState(EMPTY_ENVIRONMENT_ID, '')).toEqual(stored);
  });
});
