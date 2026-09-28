import { describe, expect, it } from 'vitest';
import { parsePartyViewParams, writePartyViewParams, clearPartyViewParams } from './partyViewState';

describe('partyViewState', () => {
  it('parses empty query params', () => {
    expect(parsePartyViewParams('')).toEqual({});
    expect(parsePartyViewParams('?foo=bar')).toEqual({});
  });

  it('parses org and role query params', () => {
    expect(parsePartyViewParams('?org=nokia-123')).toEqual({ orgId: 'nokia-123' });
    expect(parsePartyViewParams('?role=manufacturer')).toEqual({ roleId: 'manufacturer' });
    expect(parsePartyViewParams('?org=nokia-123&role=supplier')).toEqual({
      orgId: 'nokia-123',
      roleId: 'supplier',
    });
  });

  it('writes and clears params in search string', () => {
    let search = '';
    const mockReplace = (url: string) => {
      const idx = url.indexOf('?');
      search = idx >= 0 ? url.slice(idx) : '';
    };
    window.history.replaceState = (_data, _title, url) => {
      if (typeof url === 'string') mockReplace(url);
    };

    writePartyViewParams('organizations', 'org-abc');
    expect(parsePartyViewParams(search).orgId).toBe('org-abc');

    clearPartyViewParams();
    expect(parsePartyViewParams(search).orgId).toBeUndefined();
  });
});
