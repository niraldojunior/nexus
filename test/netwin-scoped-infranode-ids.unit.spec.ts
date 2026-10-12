import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createScopedInfranodePager,
  pageFromSortedIds,
  scopedInfranodeMaterializeQuery,
} from '../src/scripts/netwin-migration/scoped-infranode-ids.js';

function fakeSource(ids: number[]) {
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('ROWNUM')) return { rows: [{ PI_ID: 1 }] };
    let served = false;
    return {
      resultSet: {
        getRows: async () => {
          if (served) return [];
          served = true;
          return [...ids].reverse().map((PI_ID) => ({ PI_ID }));
        },
        close: async () => undefined,
      },
    };
  });
  return { source: { execute } as never, execute };
}

describe('pageFromSortedIds', () => {
  const ids = [2, 4, 6, 8, 10];
  it('cobre primeira, meio, última página, parcial e vazia', () => {
    expect(pageFromSortedIds(ids, 0, 2)).toEqual([2, 4]);
    expect(pageFromSortedIds(ids, 4, 2)).toEqual([6, 8]);
    expect(pageFromSortedIds(ids, 8, 2)).toEqual([10]);
    expect(pageFromSortedIds(ids, 10, 2)).toEqual([]);
    expect(pageFromSortedIds([], 0, 2)).toEqual([]);
    expect(pageFromSortedIds(ids, 5, 10)).toEqual([6, 8, 10]);
  });
});

describe('scopedInfranodeMaterializeQuery', () => {
  it('é leitura simples, sem DISTINCT/ROWNUM/JOIN', () => {
    const sql = scopedInfranodeMaterializeQuery(['(infranode.UF_ABRV = :uf)']);
    expect(sql).not.toMatch(/DISTINCT|ROWNUM|JOIN|GROUP BY/i);
    expect(sql).toMatch(/^\s*SELECT/);
  });
});

describe('createScopedInfranodePager', () => {
  afterEach(() => {
    delete process.env.NETWIN_SCOPE_MATERIALIZE;
  });
  const log = () => undefined;

  it('UF isolada materializa uma vez e pagina em memória, ordenado', async () => {
    const { source, execute } = fakeSource([5, 1, 9, 3, 7]);
    const pager = await createScopedInfranodePager(source, { uf: 'PB' }, undefined, { log });
    expect(pager.strategy).toBe('uf-materializado');
    expect(await pager.next(0, 2)).toEqual([1, 3]);
    expect(await pager.next(3, 2)).toEqual([5, 7]);
    expect(await pager.next(7, 2)).toEqual([9]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('compartilha a lista entre pagers do mesmo dono', async () => {
    const { source, execute } = fakeSource([1, 2]);
    const owner = {};
    await createScopedInfranodePager(source, { uf: 'PB' }, undefined, { cacheOwner: owner, log });
    await createScopedInfranodePager(source, { uf: 'PB' }, undefined, { cacheOwner: owner, log });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('município com IDs e bairro usam keyset', async () => {
    const { source } = fakeSource([1]);
    const withIds = await createScopedInfranodePager(
      source,
      { uf: 'ES', municipio: 'Viana' },
      { municipalityIds: [10], resolutionMs: 1 } as never,
      { log },
    );
    expect(withIds.strategy).toBe('municipio-id+nome');
    const bairro = await createScopedInfranodePager(
      source,
      { uf: 'ES', municipio: 'Viana', bairro: 'Centro' },
      undefined,
      { log },
    );
    expect(bairro.strategy).toBe('bairro-keyset');
  });

  it('kill switch off força keyset', async () => {
    process.env.NETWIN_SCOPE_MATERIALIZE = 'off';
    const { source, execute } = fakeSource([1]);
    const pager = await createScopedInfranodePager(source, { uf: 'PB' }, undefined, { log });
    expect(pager.strategy).toBe('keyset-fallback');
    expect(execute).not.toHaveBeenCalled();
  });

  it('falha na materialização cai para keyset', async () => {
    const execute = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pager = await createScopedInfranodePager({ execute } as never, { uf: 'PB' }, undefined, {
      log,
    });
    expect(pager.strategy).toBe('keyset-fallback');
  });
});
