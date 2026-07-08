import { afterEach, expect, test, vi } from 'vitest';
import { listParties } from './partyApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

test('listParties sends query params for organization search', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const result = await listParties({
    limit: 20,
    offset: 40,
    partyType: 'Organization',
    status: 'active',
    name: 'Hua',
  });

  expect(result).toEqual([]);
  expect(fetchMock).toHaveBeenCalledWith(
    '/tmf-api/partyManagement/v4/party?limit=20&offset=40&name=Hua&partyType=Organization&status=active',
    expect.objectContaining({ method: 'GET' }),
  );
});
