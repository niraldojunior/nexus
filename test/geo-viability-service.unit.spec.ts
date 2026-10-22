import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';
import { GeoViabilityService } from '../src/modules/geo/viability-service.js';

const origin = { lng: -43.1079, lat: -22.8985 };

const row = (
  id: string,
  name: string,
  coordinates: [number, number],
  extra: Partial<Record<'resource_type' | 'status' | 'substatus', string | null>> = {},
) => ({
  id,
  name,
  resource_type: 'CTO',
  status: 'active',
  substatus: null,
  geometry: JSON.stringify({ type: 'Point', coordinates }),
  ...extra,
});

type PortRow = {
  cdo_id: string;
  usage_state: string;
  administrative_state: string;
  operational_state: string;
  status: string;
  n: number;
};

// Porta em serviço (ativa, desbloqueada, habilitada) com o uso informado.
const ports = (cdoId: string, usage: 'idle' | 'busy', n: number): PortRow => ({
  cdo_id: cdoId,
  usage_state: usage,
  administrative_state: 'unlocked',
  operational_state: 'enabled',
  status: 'active',
  n,
});

// A primeira consulta devolve as CDOs; a de portas (containsAsChild) devolve as contagens.
const dbWith = (cdos: ReturnType<typeof row>[], portRows: PortRow[]) => {
  const all = vi.fn(async (sql: string) =>
    sql.includes('resource_relationship') ? portRows : cdos,
  );
  return { all, service: new GeoViabilityService({ all } as unknown as DatabaseClient) };
};

const query = { tenantId: 'vtal', radiusMeters: 200, limit: 25 };

describe('GeoViabilityService', () => {
  it('recorta o círculo, ordena a CDO e preserva status/substatus', async () => {
    const { all, service } = dbWith(
      [
        row('far', 'CDOE-2', [-43.1062, -22.8985], { substatus: 'EM OPERAÇÃO' }),
        row('near', 'CDOI-1', [-43.1085, -22.8985]),
        row('outside', 'CDOE-3', [-43.102, -22.8985]),
        row('other', 'CEO-4', [-43.108, -22.8985]),
      ],
      [
        ports('far', 'idle', 1),
        ports('near', 'idle', 1),
        ports('outside', 'idle', 1),
        ports('other', 'idle', 1),
      ],
    );

    const result = await service.nearbyCdos(origin, query);

    expect(result.map((candidate) => candidate.id)).toEqual(['near', 'far']);
    expect(result[1]).toMatchObject({ status: 'active', substatus: 'EM OPERAÇÃO' });
    expect(all).toHaveBeenCalledWith(
      expect.stringContaining('FROM geographic_location l'),
      expect.arrayContaining(['vtal']),
    );
  });

  it('só viabiliza CDO ativa: suspensa, inativa, bloqueada ou sem status são descartadas', async () => {
    const { all, service } = dbWith(
      [
        row('ok', 'CDOI-1', [-43.1085, -22.8985]),
        row('suspended', 'CDOE-2', [-43.1081, -22.8985], { status: 'suspended' }),
        row('inactive', 'CDOE-3', [-43.1082, -22.8985], { status: 'inactive' }),
        row('locked', 'CDOE-4', [-43.1083, -22.8985], { status: 'locked' }),
        row('none', 'CDOE-5', [-43.1084, -22.8985], { status: null }),
      ],
      [ports('ok', 'idle', 2)],
    );

    const result = await service.nearbyCdos(origin, query);

    expect(result.map((candidate) => candidate.id)).toEqual(['ok']);
    expect(all.mock.calls[0]?.[0]).toContain("r.status = 'active'");
  });

  it('informa portas livres/total e descarta CDO sem porta livre ou sem portas', async () => {
    const { service } = dbWith(
      [
        row('partial', 'CDOE-1111', [-43.1081, -22.8985]),
        row('full', 'CDOE-2222', [-43.1082, -22.8985]),
        row('empty', 'CDOE-3333', [-43.1083, -22.8985]),
      ],
      [
        ports('partial', 'idle', 5),
        ports('partial', 'busy', 3),
        ports('full', 'busy', 8),
        // Porta livre em uso, mas bloqueada, não conta como disponível.
        { ...ports('full', 'idle', 2), administrative_state: 'locked' },
      ],
    );

    const result = await service.nearbyCdos(origin, query);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'partial', portsFree: 5, portsTotal: 8 });
  });

  it('aplica o limite somente depois de recortar, ordenar e filtrar por porta livre', async () => {
    const { service } = dbWith(
      [
        row('lotada', 'CDOE-0', [-43.10795, -22.8985]),
        row('second', 'CDOE-2', [-43.109, -22.8985]),
        row('first', 'CDOE-1', [-43.1081, -22.8985]),
      ],
      [ports('lotada', 'busy', 8), ports('second', 'idle', 1), ports('first', 'idle', 1)],
    );

    await expect(
      service.nearbyCdos(origin, { tenantId: 'vtal', radiusMeters: 200, limit: 1 }),
    ).resolves.toMatchObject([{ id: 'first' }]);
  });
});
