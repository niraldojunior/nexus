import { bearerToken } from './session';
import { invalidateMapTiles } from '../utils/mapTileCache';
import type { GeoAddress, GeoSite, GeoSiteStatus } from './geoApi';

export type AdministrativeCity = {
  id: string;
  countryCode: string;
  countryName: string;
  stateCode: string;
  cityName: string;
};

export type SiteEditorSnapshot = {
  site: GeoSite;
  address?: GeoAddress;
  administrativeCity?: AdministrativeCity;
};

export type SiteEditorPayload = {
  site: {
    name: string;
    siteSpecificationId: string;
    status?: GeoSiteStatus;
    statusDate?: string;
    statusReason?: string;
    note?: string | null;
    relatedParty?: Array<{ id: string; role?: string }>;
    characteristic?: Array<{ group?: string; name: string; value: unknown; valueType?: string }>;
  };
  /** Opcionais apenas para sub-local (herda o endereço do local pai). */
  administrativeCityId?: string;
  street?: string;
  streetNr?: string;
  postcode?: string;
};

export type SiteReferences = {
  siteId: string;
  activeChildSiteCount: number;
  activeRelationshipCount: number;
  activeResourceCount: number;
  activeServiceCount: number;
  activeOrderCount: number;
  blocking: boolean;
};

export class SiteEditorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SiteEditorApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${bearerToken()}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const record = payload as Record<string, unknown> | undefined;
    const message =
      (typeof record?.message === 'string' ? record.message : undefined) ??
      (typeof record?.error === 'string' ? record.error : undefined) ??
      `Falha na requisição (${response.status})`;
    throw new SiteEditorApiError(
      message,
      response.status,
      typeof record?.code === 'string' ? record.code : undefined,
    );
  }
  return payload as T;
}

// Diretório master compartilhado: uma requisição para StrictMode/remontagens (backend em série).
let citiesRequest: Promise<AdministrativeCity[]> | null = null;
export const loadAdministrativeCities = (): Promise<AdministrativeCity[]> => {
  citiesRequest ??= request<AdministrativeCity[]>('GET', '/v1/geo/administrative-cities').catch(
    (error: unknown) => {
      citiesRequest = null;
      throw error;
    },
  );
  return citiesRequest;
};

export const fetchSiteEditor = (id: string) =>
  request<SiteEditorSnapshot>('GET', `/v1/geo/site-editor/${encodeURIComponent(id)}`);

export const saveSiteEditor = async (payload: SiteEditorPayload, siteId?: string) => {
  const saved = siteId
    ? await request<SiteEditorSnapshot>(
        'PUT',
        `/v1/geo/site-editor/${encodeURIComponent(siteId)}`,
        payload,
      )
    : await request<SiteEditorSnapshot>('POST', '/v1/geo/site-editor', payload);
  invalidateMapTiles();
  return saved;
};

export const fetchSiteReferences = (id: string) =>
  request<SiteReferences>('GET', `/v1/geo/sites/${encodeURIComponent(id)}/deactivation-impact`);

export const retireSite = async (id: string, statusReason: string) => {
  const site = await request<GeoSite>('PATCH', `/v1/geo/sites/${encodeURIComponent(id)}`, {
    status: 'Retired',
    statusReason,
  });
  invalidateMapTiles();
  return site;
};
