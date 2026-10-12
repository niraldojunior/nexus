import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createScopedResourcePager,
  scopedResourceMaterializeQuery,
} from '../src/scripts/netwin-migration/scoped-resource-ids.js';

function fakeSource(idsByCall: number[][], opts: { failGetRows?: boolean } = {}) {
  let call = 0;
  const close = vi.fn(async () => undefined);
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('ROWNUM')) {
      return { rows: [{ ID: 99 }] };
    }
    const ids = idsByCall[call++] ?? [];
    let served = false;
    return {
      resultSet: {
        getRows: async () => {
          if (opts.failGetRows) throw new Error('boom');
          if (served) return [];
          served = true;
          return ids.map((ID) => ({ ID }));
        },
        close,
      },
    };
  });
  return { source: { execute } as never, execute, close };
}

describe('scopedResourceMaterializeQuery', () => {
  it('lê só ID ordenado, sem DISTINCT/ROWNUM/JOIN', () => {
    const sql = scopedResourceMaterializeQuery('NETWIN.OSP_ROUTE', 'EXCHANGE_ID', ':a0');
    expect(sql).toMatch(/ORDER BY source_resource\.ID/);
    expect(sql).not.toMatch(/DISTINCT|ROWNUM|JOIN|WKT/i);
  });
  it('rejeita identificadores inválidos', () => {
    expect(() => scopedResourceMaterializeQuery('X; DROP', 'EXCHANGE_ID', ':a0')).toThrow();
  });
});

describe('createScopedResourcePager', () => {
  afterEach(() => {
    delete process.env.NETWIN_RESOURCE_SCOPE_MATERIALIZE;
    delete process.env.NETWIN_SCOPE_MATERIALIZE;
    delete process.env.NETWIN_RESOURCE_SCOPE_MAX_IDS;
    vi.restoreAllMocks();
  });
  const log = () => undefined;

  it('materializa uma vez, pagina em memória e fecha o resultSet', async () => {
    const { source, execute, close } = fakeSource([[5, 1, 9, 3, 7]]);
    const pager = createScopedResourcePager(source, 'NETWIN.OSP_ROUTE', 'EXCHANGE_ID', [1], {
      eligible: true,
      log,
    });
    expect(await pager.next(0, 2)).toEqual([1, 3]);
    expect(await pager.next(3, 2)).toEqual([5, 7]);
    expect(await pager.next(7, 2)).toEqual([9]);
    expect(await pager.next(9, 2)).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(pager.strategy()).toBe('uf-materializado');
  });

  it('mais de 900 âncoras: múltiplos result sets, merge e dedupe', async () => {
    const { source, execute } = fakeSource([
      [4, 2],
      [3, 2, 1],
    ]);
    const anchors = Array.from({ length: 901 }, (_, i) => i + 1);
    const pager = createScopedResourcePager(source, 'NETWIN.OSP_CABLE', 'EXCHANGE_ID', anchors, {
      eligible: true,
      log,
    });
    expect(await pager.next(0, 10)).toEqual([1, 2, 3, 4]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('não elegível ou sem âncoras usa keyset', async () => {
    const { source, execute } = fakeSource([[1]]);
    const pager = createScopedResourcePager(source, 'NETWIN.OSP_ROUTE', 'EXCHANGE_ID', [1], {
      eligible: false,
      log,
    });
    expect(await pager.next(0, 5)).toEqual([99]);
    expect(execute.mock.calls[0]![0]).toContain('ROWNUM');
    expect(pager.strategy()).toBe('keyset');
  });

  it.each(['NETWIN_SCOPE_MATERIALIZE', 'NETWIN_RESOURCE_SCOPE_MATERIALIZE'])(
    'kill switch %s força keyset',
    async (name) => {
      process.env[name] = 'off';
      const { source } = fakeSource([[1]]);
      const pager = createScopedResourcePager(source, 'NETWIN.OSP_ROUTE', 'EXCHANGE_ID', [1], {
        eligible: true,
        log,
      });
      expect(await pager.next(0, 5)).toEqual([99]);
    },
  );

  it('falha de leitura cai no keyset e fecha o resultSet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { source, close } = fakeSource([[1]], { failGetRows: true });
    const pager = createScopedResourcePager(source, 'NETWIN.OSP_ROUTE', 'EXCHANGE_ID', [1], {
      eligible: true,
      log,
    });
    expect(await pager.next(0, 5)).toEqual([99]);
    expect(close).toHaveBeenCalled();
    expect(pager.strategy()).toBe('keyset');
  });

  it('teto de IDs excedido cai no keyset', async () => {
    process.env.NETWIN_RESOURCE_SCOPE_MAX_IDS = '2';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { source } = fakeSource([[1, 2, 3]]);
    const pager = createScopedResourcePager(source, 'NETWIN.OSP_ROUTE', 'EXCHANGE_ID', [1], {
      eligible: true,
      log,
    });
    expect(await pager.next(0, 5)).toEqual([99]);
  });
});
