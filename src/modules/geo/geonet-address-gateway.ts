import { AppError } from '../../shared/errors/app-error.js';

export type GeonetGatewayConfig = {
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  companyId?: string;
  scope: string;
  timeoutMs: number;
};

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

type FetchLike = typeof fetch;
type AccessToken = { value: string; expiresAt: number };

/**
 * Anti-corruption layer for GeographicAddressManagement. Its permissive parsing is intentional:
 * the published v1.3 OpenAPI has envelope and scalar inconsistencies between schemas and examples.
 */
export class GeonetAddressGateway {
  private accessToken: AccessToken | null = null;
  private tokenRequest: Promise<string> | null = null;
  private failures = 0;
  private circuitOpenUntil = 0;

  public constructor(
    private readonly config: GeonetGatewayConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async search(address: string, number?: string): Promise<GeonetAddressCandidate[]> {
    const query = new URLSearchParams({ address });
    if (number?.trim()) query.set('number', number.trim());
    const payload = await this.request(`/geographicAddress?${query.toString()}`);
    return addressListOf(payload).map(toCandidate);
  }

  async detail(addressId: string): Promise<GeonetAddressDetail | null> {
    const payload = await this.request(`/geographicAddress/${encodeURIComponent(addressId)}`);
    const address = addressOf(payload);
    return address ? toDetail(address) : null;
  }

  private async request(path: string): Promise<unknown> {
    if (this.now() < this.circuitOpenUntil) {
      throw new AppError('Geonet temporariamente indisponível. Tente novamente em instantes.', {
        code: 'GEONET_CIRCUIT_OPEN',
        statusCode: 503,
      });
    }

    try {
      const token = await this.getAccessToken();
      let response = await this.fetchJson(path, token);
      if (response.status === 401) {
        this.accessToken = null;
        response = await this.fetchJson(path, await this.getAccessToken());
      }
      if (!response.ok) throw externalError(response.status, response.body);
      this.failures = 0;
      return response.body;
    } catch (error) {
      if (error instanceof AppError && error.code === 'GEONET_CIRCUIT_OPEN') throw error;
      if (error instanceof AppError && error.code === 'GEONET_NOT_FOUND') throw error;
      this.failures += 1;
      if (this.failures >= 3) this.circuitOpenUntil = this.now() + 30_000;
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw externalError(504, null);
      }
      throw new AppError('Não foi possível consultar o Geonet.', {
        code: 'GEONET_UNAVAILABLE',
        statusCode: 503,
      });
    }
  }

  private async fetchJson(
    path: string,
    token: string,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const response = await this.fetchImpl(joinUrl(this.config.apiBaseUrl, path), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    return { ok: response.ok, status: response.status, body: await responseJson(response) };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now()) return this.accessToken.value;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.refreshAccessToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async refreshAccessToken(): Promise<string> {
    // A superfície V.tal OAuth aceita estes parâmetros na query string (mesma forma do
    // cliente Python homologado); enviar no body retorna HTTP 200 sem access_token.
    const tokenUrl = new URL(this.config.tokenUrl);
    tokenUrl.searchParams.set('grant_type', 'client_credentials');
    tokenUrl.searchParams.set('scope', this.config.scope);
    const response = await this.fetchImpl(tokenUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(this.config.companyId ? { companyId: this.config.companyId } : {}),
      },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const payload = await responseJson(response);
    const token =
      isRecord(payload) && typeof payload.access_token === 'string'
        ? payload.access_token
        : undefined;
    if (!response.ok) throw externalError(response.status, payload);
    if (!token) {
      throw new AppError('OAuth Geonet respondeu sem access_token.', {
        code: 'GEONET_OAUTH_INVALID_RESPONSE',
        statusCode: 503,
      });
    }
    const expiresIn =
      isRecord(payload) && asNumber(payload.expires_in) ? asNumber(payload.expires_in)! : 300;
    this.accessToken = {
      value: token,
      expiresAt: this.now() + Math.max(30, expiresIn - 30) * 1_000,
    };
    return token;
  }
}

const joinUrl = (base: string, path: string): string => `${base.replace(/\/$/, '')}${path}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
const asNumber = (value: unknown): number | undefined => {
  const result =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(result) ? result : undefined;
};
const responseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};
const externalError = (status: number, body: unknown): AppError => {
  const messageByStatus: Record<number, string> = {
    400: 'Falha na requisição.',
    403: 'Aplicação não autorizada ou não informada.',
    404: 'Endereço não encontrado.',
    429: 'Cota excedida por muitas requisições.',
    500: 'Erro interno do servidor.',
    503: 'Serviço indisponível.',
    504: 'Gateway Timeout.',
  };
  const message =
    messageByStatus[status] ??
    (isRecord(body) && isRecord(body.control) && typeof body.control.message === 'string'
      ? body.control.message
      : `Geonet respondeu com status ${status}.`);
  const codeByStatus: Record<number, string> = {
    400: 'GEONET_BAD_REQUEST',
    403: 'GEONET_UNAUTHORIZED_APPLICATION',
    404: 'GEONET_NOT_FOUND',
    429: 'GEONET_RATE_LIMITED',
    500: 'GEONET_INTERNAL_SERVER_ERROR',
    503: 'GEONET_UNAVAILABLE',
    504: 'GEONET_TIMEOUT',
  };
  return new AppError(message, {
    code: codeByStatus[status] ?? 'GEONET_UNAVAILABLE',
    statusCode: messageByStatus[status] ? status : 503,
  });
};
const addressListOf = (payload: unknown): Record<string, unknown>[] => {
  if (!isRecord(payload)) return [];
  const addresses = isRecord(payload.addresses) ? payload.addresses : payload;
  return Array.isArray(addresses.address) ? addresses.address.filter(isRecord) : [];
};
const addressOf = (payload: unknown): Record<string, unknown> | null => {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.address)) return payload.address;
  if (isRecord(payload.addresses) && isRecord(payload.addresses.address))
    return payload.addresses.address;
  return null;
};
const toCandidate = (address: Record<string, unknown>): GeonetAddressCandidate => {
  const addressId = asString(address.id);
  const streetName = asString(address.streetName);
  const streetNr = asString(address.number);
  const neighborhood = asString(address.neighborhood);
  const city = asString(address.city) ?? asString(address.location);
  const state = asString(address.stateAbbreviation) ?? asString(address.state);
  const postcode = asString(address.zipCode);
  return {
    ...(addressId ? { addressId } : {}),
    formattedAddress: asString(address.description) ?? 'Endereço Geonet sem descrição',
    ...(streetName
      ? {
          street: [asString(address.streetType), asString(address.streetTitle), streetName]
            .filter(Boolean)
            .join(' '),
        }
      : {}),
    ...(streetNr ? { streetNr } : {}),
    ...(neighborhood ? { neighborhood } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(postcode ? { postcode } : {}),
  };
};
const toDetail = (address: Record<string, unknown>): GeonetAddressDetail => {
  const candidate = toCandidate(address);
  const geolocation = isRecord(address.geolocation)
    ? isRecord(address.geolocation.geolocation)
      ? address.geolocation.geolocation
      : address.geolocation
    : isRecord(address.geoLocation)
      ? address.geoLocation
      : null;
  const latitude = geolocation ? asNumber(geolocation.latitude) : undefined;
  const longitude = geolocation ? asNumber(geolocation.longitude) : undefined;
  const geolocationMethod = geolocation ? asString(geolocation.returnTypeDescription) : undefined;
  return {
    ...candidate,
    ...(latitude !== undefined && longitude !== undefined
      ? { coordinates: [longitude, latitude] as [number, number] }
      : {}),
    ...(geolocationMethod ? { geolocationMethod } : {}),
  };
};
