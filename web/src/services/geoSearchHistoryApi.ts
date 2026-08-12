// Cliente do histórico de pesquisa da página Geo (`/v1/geo/search-history`). O histórico é
// um atalho, não um dado crítico: falhas de rede degradam em silêncio (lista vazia / no-op),
// para nunca quebrarem a barra de pesquisa.
import { getToken } from './session';
import type { GeoTreeNode } from './geoTreeApi';
import type { DraftAddress } from '../utils/googleMaps';

const API_BASE_URL = '/v1/geo/search-history';

export type GeoSearchHistoryEntry = {
  entryKey: string;
  kind: 'node' | 'address';
  label: string;
  // Um dos dois, conforme `kind` — o snapshot salvo, para re-selecionar sem nova consulta.
  node?: GeoTreeNode;
  address?: DraftAddress;
  visitCount: number;
  lastVisitedAt: string;
};

type RawEntry = {
  entryKey: string;
  kind: 'node' | 'address';
  label: string;
  payload: unknown;
  visitCount: number;
  lastVisitedAt: string;
};

const authHeaders = (): HeadersInit => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const toEntry = (raw: RawEntry): GeoSearchHistoryEntry => ({
  entryKey: raw.entryKey,
  kind: raw.kind,
  label: raw.label,
  visitCount: raw.visitCount,
  lastVisitedAt: raw.lastVisitedAt,
  ...(raw.kind === 'node'
    ? { node: raw.payload as GeoTreeNode }
    : { address: raw.payload as DraftAddress }),
});

// Chaves de deduplicação — o mesmo item selecionado de novo incrementa a contagem em vez de
// virar uma segunda linha. Nó pela id canônica; endereço pelo placeId (ou o rótulo, quando o
// endereço veio de texto livre sem placeId).
export const historyKeyForNode = (node: GeoTreeNode): string => `node:${node.id}`;
export const historyKeyForAddress = (address: DraftAddress): string =>
  `address:${address.placeId ?? address.label}`;

export async function fetchSearchHistory(limit = 8): Promise<GeoSearchHistoryEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}?limit=${limit}`, { headers: authHeaders() });
    if (!response.ok) return [];
    const raw = (await response.json()) as RawEntry[];
    return Array.isArray(raw) ? raw.map(toEntry) : [];
  } catch {
    return [];
  }
}

export async function recordNodeVisit(node: GeoTreeNode): Promise<void> {
  await postRecord({
    entryKey: historyKeyForNode(node),
    kind: 'node',
    label: node.label,
    payload: node,
  });
}

export async function recordAddressVisit(address: DraftAddress): Promise<void> {
  await postRecord({
    entryKey: historyKeyForAddress(address),
    kind: 'address',
    label: address.label,
    payload: address,
  });
}

async function postRecord(body: {
  entryKey: string;
  kind: 'node' | 'address';
  label: string;
  payload: unknown;
}): Promise<void> {
  try {
    await fetch(API_BASE_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  } catch {
    // silencioso — o histórico não deve interromper a navegação
  }
}

export async function removeSearchHistoryEntry(entryKey: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/${encodeURIComponent(entryKey)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  } catch {
    // silencioso
  }
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await fetch(API_BASE_URL, { method: 'DELETE', headers: authHeaders() });
  } catch {
    // silencioso
  }
}
