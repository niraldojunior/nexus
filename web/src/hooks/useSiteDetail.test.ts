import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSiteDetail } from './useSiteDetail';
import * as geoApi from '../services/geoApi';

const SITE_MOCK: geoApi.GeoSite = {
  id: 'site-123',
  href: '/v1/geo/sites/site-123',
  name: 'Icaraí (ICI)',
  '@type': 'GeographicSite',
  address: { id: 'addr-not-found', '@referredType': 'GeographicAddress' },
  place: { id: 'loc-not-found', '@referredType': 'GeographicLocation' },
  status: 'Active',
  siteSpecificationId: 'spec-co',
  siteSpecification: { id: 'spec-co', '@referredType': 'GeographicSiteSpecification' },
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
};

describe('useSiteDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('devolve estado nulo quando siteId for null', async () => {
    const { result } = renderHook(() => useSiteDetail(null));
    expect(result.current.site).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('carrega o site com sucesso mesmo quando address e place retornam 404 (undefined)', async () => {
    vi.spyOn(geoApi, 'getJson').mockImplementation((url: string) => {
      if (url === '/v1/geo/sites/site-123') {
        return Promise.resolve(SITE_MOCK);
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    vi.spyOn(geoApi, 'getGeoAddress').mockResolvedValue(undefined);
    vi.spyOn(geoApi, 'getGeoLocation').mockResolvedValue(undefined);
    vi.spyOn(geoApi, 'fetchSiteOrigin').mockRejectedValue(new Error('No origin'));

    const { result } = renderHook(() => useSiteDetail('site-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.site).toEqual(SITE_MOCK);
    expect(result.current.address).toBeNull();
    expect(result.current.location).toBeNull();
    expect(result.current.origin).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('carrega o site e popula address e location quando existem', async () => {
    const addressMock: geoApi.GeoAddress = {
      id: 'addr-1',
      href: '/v1/geo/addresses/addr-1',
      street: 'Rua Moreira César',
      streetNr: '100',
      city: 'Niterói',
      stateOrProvince: 'RJ',
      country: 'BR',
      '@type': 'GeographicAddress',
    };

    const locationMock: geoApi.GeoLocation = {
      id: 'loc-1',
      href: '/v1/geo/locations/loc-1',
      geometryType: 'Point',
      geometry: { type: 'Point', coordinates: [-43.1075, -22.9068] },
      spatialRef: 'EPSG:4326',
      '@type': 'GeographicLocation',
    };

    vi.spyOn(geoApi, 'getJson').mockImplementation((url: string) => {
      if (url === '/v1/geo/sites/site-123') {
        return Promise.resolve(SITE_MOCK);
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    vi.spyOn(geoApi, 'getGeoAddress').mockResolvedValue(addressMock);
    vi.spyOn(geoApi, 'getGeoLocation').mockResolvedValue(locationMock);
    vi.spyOn(geoApi, 'fetchSiteOrigin').mockResolvedValue({
      kind: 'import',
      system: 'netwin',
    });

    const { result } = renderHook(() => useSiteDetail('site-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.site).toEqual(SITE_MOCK);
    expect(result.current.address).toEqual(addressMock);
    expect(result.current.location).toEqual(locationMock);
    expect(result.current.origin?.kind).toBe('import');
    expect(result.current.error).toBeNull();
  });
});
