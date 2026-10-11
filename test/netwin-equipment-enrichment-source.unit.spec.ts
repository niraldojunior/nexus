import { describe, expect, it } from 'vitest';
import type { Connection } from 'oracledb';
import { assertReadOnlySourceSql } from '../src/scripts/netwin-migration/context.js';
import { hydrateEquipmentExtras } from '../src/scripts/netwin-migration/equipment-enrichment-source.js';

const fakeSource = (log: Array<{ sql: string; binds: Record<string, unknown> }>) =>
  ({
    execute: async (sql: string, binds: Record<string, unknown>) => {
      log.push({ sql, binds });
      return { rows: [] };
    },
  }) as unknown as Connection;

describe('equipment-enrichment-source: hidratação read-only', () => {
  it('só emite SELECT aceito pelo guard e divide os ids em chunks 900/900/1', async () => {
    const log: Array<{ sql: string; binds: Record<string, unknown> }> = [];
    const ids = Array.from({ length: 1801 }, (_, index) => index + 1);
    await hydrateEquipmentExtras(fakeSource(log), ids, new Map(), new Map(), new Map());

    expect(log.length).toBeGreaterThan(0);
    for (const { sql } of log) expect(() => assertReadOnlySourceSql(sql)).not.toThrow();

    const ospQueries = log.filter(({ sql }) => sql.includes('FROM NETWIN.OSP_EQUIPMENT'));
    expect(ospQueries.map(({ binds }) => Object.keys(binds).length)).toEqual([900, 900, 1]);
    const ispQueries = log.filter(({ sql }) => sql.includes('NS_RES_INS_NODE_MIRROR'));
    expect(ispQueries.map(({ binds }) => Object.keys(binds).length)).toEqual([900, 900, 1]);
  });

  it('não consulta atributos dinâmicos nem lookups quando não há equipamento ISP', async () => {
    const log: Array<{ sql: string; binds: Record<string, unknown> }> = [];
    await hydrateEquipmentExtras(fakeSource(log), [1, 2], new Map(), new Map(), new Map());
    expect(log.some(({ sql }) => sql.includes('ISP_INS_DIN_ATRIBUTO'))).toBe(false);
    expect(log.some(({ sql }) => sql.includes('OSP_CELL'))).toBe(false);
  });
});
