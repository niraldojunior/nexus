const API_BASE_URL = '/tmf-api';

type FetchJsonOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export type PartyType = 'Organization' | 'Individual';
export type PartyStatus = 'active' | 'inactive' | 'terminated';
export type PartyRoleStatus = 'active' | 'inactive' | 'terminated';

export type PartyQuery = {
  name?: string;
  document?: string;
  partyType?: PartyType;
  status?: PartyStatus;
  limit: number;
  offset: number;
};

export type Party = {
  '@type': PartyType;
  id: string;
  href: string;
  name: string;
  status: PartyStatus;
  partyType: PartyType;
};

export type PartyRoleQuery = {
  name?: string;
  partyId?: string;
  status?: PartyRoleStatus;
  limit: number;
  offset: number;
};

export type PartyRole = {
  '@type': 'PartyRole';
  id: string;
  href: string;
  name: string;
  status: PartyRoleStatus;
  partyId: string;
  party: {
    id: string;
    '@referredType': PartyType;
    href?: string;
    name?: string;
  };
};

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || 'change-me'}`,
});

async function requestJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: authHeaders(),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : (undefined as T);

  if (!response.ok) {
    const message = extractErrorMessage(payload, response.status);
    throw new Error(message);
  }

  return payload;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return `Request failed (${status})`;
}

function buildListUrl(path: string, params: PartyQuery): string {
  const searchParams = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.name) searchParams.set('name', params.name);
  if (params.document) searchParams.set('document', params.document);
  if (params.partyType) searchParams.set('partyType', params.partyType);
  if (params.status) searchParams.set('status', params.status);
  return `${API_BASE_URL}${path}?${searchParams.toString()}`;
}

export async function listParties(query: PartyQuery): Promise<Party[]> {
  return await requestJson<Party[]>(buildListUrl('/partyManagement/v4/party', query));
}

function buildRoleListUrl(path: string, params: PartyRoleQuery): string {
  const searchParams = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.name) searchParams.set('name', params.name);
  if (params.partyId) searchParams.set('partyId', params.partyId);
  if (params.status) searchParams.set('status', params.status);
  return `${API_BASE_URL}${path}?${searchParams.toString()}`;
}

export async function listPartyRoles(query: PartyRoleQuery): Promise<PartyRole[]> {
  return await requestJson<PartyRole[]>(buildRoleListUrl('/partyRoleManagement/v4/partyRole', query));
}
