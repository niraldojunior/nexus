import type { Connection } from 'oracledb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertReadOnlySourceSql } from '../src/scripts/netwin-migration/context.js';
import {
  municipalityScopeResolutionQuery,
  resolveMunicipalityScopePrefilter,
} from '../src/scripts/netwin-migration/scope-resolution.js';

type LookupRow = {
  MUNICIPALITY_ID: number;
  MUNICIPALITY_NAME: string;
};

const sourceWith = (lookupRows: LookupRow[] | Error) => {
  const execute = vi.fn(async () => {
    if (lookupRows instanceof Error) throw lookupRows;
    return { rows: lookupRows };
  });
  return { execute } as unknown as Connection;
};

const niteroi = (municipalityId: number): LookupRow => ({
  MUNICIPALITY_ID: municipalityId,
  MUNICIPALITY_NAME: 'NITEROI',
});

afterEach(() => vi.restoreAllMocks());

describe('netwin-migration: resolução indexada de município', () => {
  it('resolve nome normalizado no catálogo de municípios', async () => {
    const source = sourceWith([niteroi(3303302)]);

    await expect(
      resolveMunicipalityScopePrefilter(source, { uf: 'RJ', municipio: 'Niteroí' }),
    ).resolves.toMatchObject({ municipalityIds: [3303302] });

    const calls = vi.mocked(source.execute).mock.calls;
    expect(calls[0]?.[0]).toContain('FROM NETWIN.LOCATION municipality');
    expect(calls[0]?.[1]).toEqual({ municipio: 'NITEROI' });
    expect(source.execute).toHaveBeenCalledTimes(1);
  });

  it('preserva todos os IDs catalogados para o mesmo nome normalizado', async () => {
    const source = sourceWith([niteroi(11), niteroi(22), niteroi(11)]);
    await expect(
      resolveMunicipalityScopePrefilter(source, { uf: 'RJ', municipio: 'niterói' }),
    ).resolves.toMatchObject({ municipalityIds: [11, 22] });
  });

  it('falha cedo quando o município não existe no catálogo', async () => {
    await expect(
      resolveMunicipalityScopePrefilter(sourceWith([]), {
        uf: 'RJ',
        municipio: 'Niterói',
      }),
    ).rejects.toThrow('não foi encontrado');
  });

  it('cai no filtro textual quando a resolução na origem falha', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      resolveMunicipalityScopePrefilter(sourceWith(new Error('timeout')), {
        uf: 'RJ',
        municipio: 'Niterói',
      }),
    ).resolves.toBeUndefined();
  });

  it('respeita kill switch e não consulta a origem', async () => {
    const source = sourceWith([niteroi(1)]);
    await expect(
      resolveMunicipalityScopePrefilter(
        source,
        { uf: 'RJ', municipio: 'Niterói' },
        { NETWIN_SCOPE_PREFILTER: 'off' },
      ),
    ).resolves.toBeUndefined();
    expect(source.execute).not.toHaveBeenCalled();
  });

  it('mantém a consulta de catálogo read-only e sem DISTINCT', () => {
    const lookupQuery = municipalityScopeResolutionQuery();
    assertReadOnlySourceSql(lookupQuery);
    expect(lookupQuery).not.toMatch(/DISTINCT/i);
    expect(lookupQuery).toContain('NETWIN.LIMPASTRING(municipality.NAME) = :municipio');
    expect(lookupQuery).toContain("category.NAME = 'LOC.LIMIT.LOCALIZATION.CITYAREA'");
  });
});
