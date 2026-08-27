import { bearerToken } from './session';

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

export type Characteristic = { name: string; value: unknown };

export type Party = {
  '@type': PartyType;
  id: string;
  href: string;
  name: string;
  status: PartyStatus;
  partyType: PartyType;
  partyCharacteristic?: Characteristic[];
};

export type CreatePartyInput = {
  name: string;
  partyType?: PartyType;
  partyCharacteristic?: Characteristic[];
};

export type UpdatePartyInput = {
  name?: string;
  status?: PartyStatus;
  partyCharacteristic?: Characteristic[];
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
  partyRoleCharacteristic?: Characteristic[];
};

export type CreatePartyRoleInput = {
  partyId: string;
  name: string;
  partyRoleCharacteristic?: Characteristic[];
};

export type UpdatePartyRoleInput = {
  status?: PartyRoleStatus;
  partyRoleCharacteristic?: Characteristic[];
};

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${bearerToken()}`,
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

export async function createParty(input: CreatePartyInput): Promise<Party> {
  return await requestJson<Party>(`${API_BASE_URL}/partyManagement/v4/party`, {
    method: 'POST',
    body: input,
  });
}

export async function updateParty(id: string, input: UpdatePartyInput): Promise<Party> {
  return await requestJson<Party>(`${API_BASE_URL}/partyManagement/v4/party/${id}`, {
    method: 'PATCH',
    body: input,
  });
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
  return await requestJson<PartyRole[]>(
    buildRoleListUrl('/partyRoleManagement/v4/partyRole', query),
  );
}

export async function createPartyRole(input: CreatePartyRoleInput): Promise<PartyRole> {
  return await requestJson<PartyRole>(`${API_BASE_URL}/partyRoleManagement/v4/partyRole`, {
    method: 'POST',
    body: input,
  });
}

export async function updatePartyRole(id: string, input: UpdatePartyRoleInput): Promise<PartyRole> {
  return await requestJson<PartyRole>(`${API_BASE_URL}/partyRoleManagement/v4/partyRole/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function deletePartyRole(id: string): Promise<PartyRole> {
  return await requestJson<PartyRole>(`${API_BASE_URL}/partyRoleManagement/v4/partyRole/${id}`, {
    method: 'DELETE',
  });
}
