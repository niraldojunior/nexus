import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyKeyForAddress, recordAddressVisit } from './geoSearchHistoryApi';

afterEach(() => vi.restoreAllMocks());

describe('geo search history address entries', () => {
  it('persiste o texto literal de uma pesquisa livre', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const address = {
      street: 'Rua Doutor Paulo César',
      country: 'BR',
      coordinates: [-43.1, -22.9] as [number, number],
      label: 'Rua Doutor Paulo César, Niterói - RJ',
      placeId: 'google-place',
      sourceQuery: 'Rua Doutor Paulo Cesar, número 155, Niteroi',
    };

    await recordAddressVisit(address);

    expect(historyKeyForAddress(address)).toBe(`address:${address.sourceQuery}`);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      label: address.sourceQuery,
      payload: { sourceQuery: address.sourceQuery },
    });
  });
});
