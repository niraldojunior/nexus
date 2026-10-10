import { describe, expect, it, vi } from 'vitest';
import type { MigrationContext } from '../src/scripts/netwin-migration/context.js';
import { runPhase2AdministrativeCity } from '../src/scripts/netwin-migration/phase2-administrative-city.js';

const makeCtx = (apply: boolean, existingCity: boolean) => {
  const inserts: string[] = [];
  const updates: string[] = [];
  let addressPages = 0;
  const execute = vi.fn(async (sql: string, binds: Record<string, unknown> = {}) => {
    if (/GROUP BY country/i.test(sql)) {
      return {
        rows: [
          { COUNTRY: 'BR', STATE_OR_PROVINCE: 'RJ', CITY: 'Niterói', N: 2 },
          { COUNTRY: 'BR', STATE_OR_PROVINCE: 'rj', CITY: 'NITEROI', N: 1 },
          { COUNTRY: 'BR', STATE_OR_PROVINCE: 'XX', CITY: 'Lugar', N: 4 },
        ],
      };
    }
    if (/SELECT COUNT\(\*\)/i.test(sql))
      return { rows: [{ N: existingCity ? 1 : inserts.length }] };
    if (/FROM .*GEO_ADMINISTRATIVE_CITY/i.test(sql) && /WHERE country_code/i.test(sql)) {
      return { rows: existingCity ? [{ ID: 'city-1' }] : [] };
    }
    if (/INSERT INTO/i.test(sql)) {
      inserts.push(String(binds.cityKey));
      return {};
    }
    if (/ORDER BY id/i.test(sql)) {
      addressPages += 1;
      return addressPages === 1
        ? {
            rows: [
              { ID: 'a1', COUNTRY: 'BR', STATE_OR_PROVINCE: 'RJ', CITY: 'Niterói' },
              { ID: 'a2', COUNTRY: 'BR', STATE_OR_PROVINCE: 'rj', CITY: 'NITEROI' },
            ],
          }
        : { rows: [] };
    }
    if (/^UPDATE/i.test(sql)) {
      updates.push(String(binds.cityId));
      return { rowsAffected: 2 };
    }
    return {};
  });
  const conn = { execute, close: vi.fn(async () => undefined) };
  const ctx = {
    options: { apply, tenantId: 'vtal', batchSize: 100 },
    t: (name: string) => name.toUpperCase(),
    getTargetConnection: async () => (apply ? conn : null),
    getTargetReadConnection: async () => conn,
  } as unknown as MigrationContext;
  return { ctx, inserts, updates };
};

describe('Fase 2.E — diretório país/UF/município', () => {
  it('dry-run não grava nada e ignora tuplas inválidas', async () => {
    const { ctx, inserts, updates } = makeCtx(false, false);
    const stats = await runPhase2AdministrativeCity(ctx);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(stats.skipped).toBe(4);
  });

  it('cria um único município para grafias equivalentes e liga os endereços', async () => {
    const { ctx, inserts, updates } = makeCtx(true, false);
    const stats = await runPhase2AdministrativeCity(ctx);
    expect(inserts).toEqual(['NITEROI']);
    expect(updates).toHaveLength(1);
    expect(stats.updated).toBe(2);
  });

  it('não duplica município que já existe no diretório', async () => {
    const { ctx, inserts, updates } = makeCtx(true, true);
    await runPhase2AdministrativeCity(ctx);
    expect(inserts).toHaveLength(0);
    expect(updates).toEqual(['city-1']);
  });
});
