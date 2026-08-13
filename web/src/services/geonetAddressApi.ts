import { getToken } from './session';

const API_BASE_URL = '/v1/geo/address-sources/geonet';

export type GeonetAddressCandidate = {
  addressId?: string;
  formattedAddress: string;
  street?: string;
  streetNr?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

export type GeonetAddressDetail = GeonetAddressCandidate & {
  coordinates?: [number, number];
  geolocationMethod?: string;
};

export type GeonetSearchResult =
  | { status: 'ready'; candidates: GeonetAddressCandidate[] }
  | { status: 'not_configured'; candidates: [] };
export type GeonetDetailResult =
  | { status: 'ready'; address: GeonetAddressDetail | null }
  | { status: 'not_configured'; address: null };

export class GeonetApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GeonetApiError';
  }
}

const authHeaders = (): HeadersInit => {
  const token = getToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: authHeaders() });
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  if (!response.ok) {
    throw new GeonetApiError(
      response.status,
      typeof body?.message === 'string'
        ? body.message
        : `Consulta Geonet indisponível (${response.status}).`,
    );
  }
  return body as T;
}

export function fetchGeonetCandidates(
  address: string,
  number?: string,
): Promise<GeonetSearchResult> {
  const query = new URLSearchParams({ address });
  if (number?.trim()) query.set('number', number.trim());
  return getJson<GeonetSearchResult>(`${API_BASE_URL}?${query.toString()}`);
}

export const fetchGeonetDetail = (addressId: string): Promise<GeonetDetailResult> =>
  getJson<GeonetDetailResult>(`${API_BASE_URL}/${encodeURIComponent(addressId)}`);
