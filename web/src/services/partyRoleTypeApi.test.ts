import { afterEach, expect, test, vi } from 'vitest';
import {
  createPartyRoleType,
  deactivatePartyRoleType,
  listPartyRoleTypes,
  updatePartyRoleType,
} from './partyRoleTypeApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const okJson = () =>
  new Response(JSON.stringify({ id: 'type-1' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

test('party role type service uses the catalog endpoints and payloads', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => okJson());
  vi.stubGlobal('fetch', fetchMock);
  const input = {
    key: 'supplier',
    roleName: 'manufacturer',
    label: 'Fornecedores',
    description: 'Equipamentos',
  };

  await listPartyRoleTypes();
  await createPartyRoleType(input);
  await updatePartyRoleType('type 1', input);
  await deactivatePartyRoleType('type 1');

  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/v1/party-role-types',
    '/v1/party-role-types',
    '/v1/party-role-types/type%201',
    '/v1/party-role-types/type%201',
  ]);
  expect(fetchMock.mock.calls[1]?.[1]).toEqual(
    expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
  );
  expect(fetchMock.mock.calls[2]?.[1]).toEqual(
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify(input) }),
  );
  expect(fetchMock.mock.calls[3]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
});
