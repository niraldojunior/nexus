import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { resolveAdministrativeCityIds } from '../netwin-migration-kit.js';
import {
  normalizeAdministrativeCity,
  type AdministrativeCityTuple,
} from '../../modules/geo/administrative-city.js';
import type { PhaseStats } from './types.js';

export type CityAreaRow = { ID: number; NAME: string | null };
export type CityAreaUfRow = { MUNICIPIO_ID: number; UF_MIN: string | null; UF_MAX: string | null };

export type AdministrativeCityPlan = {
  tuples: AdministrativeCityTuple[];
  withoutUf: Array<{ id: number; name: string }>;
  conflicts: Array<{ id: number; name: string; ufs: string[] }>;
  invalid: Array<{ id: number; name: string }>;
};

/** Município CITYAREA do catálogo `NETWIN.LOCATION` (categoria `LOC.LIMIT.LOCALIZATION.CITYAREA`). */
export const cityAreaCatalogQuery = (): string => `
  SELECT municipality.ID AS ID, municipality.NAME AS NAME
    FROM NETWIN.LOCATION municipality
    JOIN NETWIN.CAT_ENTITY category ON category.ID = municipality.ID_CAT_ENTITY
   WHERE category.NAME = 'LOC.LIMIT.LOCALIZATION.CITYAREA'
   ORDER BY municipality.ID
`;

/**
 * UF por município, a partir de `DL_INFRANODE` (fonte comprovada de UF no código). MIN/MAX por
 * município detectam UFs conflitantes sem `DISTINCT` pesado.
 */
export const cityAreaUfQuery = (): string => `
  SELECT COALESCE(BADDR_MUNICIPIO_ID, MUNICIPIO_ID) AS MUNICIPIO_ID,
         MIN(COALESCE(BADDR_UF_ABRV, UF_ABRV)) AS UF_MIN,
         MAX(COALESCE(BADDR_UF_ABRV, UF_ABRV)) AS UF_MAX
    FROM NETWINOI.DL_INFRANODE
   WHERE COALESCE(BADDR_MUNICIPIO_ID, MUNICIPIO_ID) IS NOT NULL
     AND COALESCE(BADDR_UF_ABRV, UF_ABRV) IS NOT NULL
   GROUP BY COALESCE(BADDR_MUNICIPIO_ID, MUNICIPIO_ID)
`;

/** Nunca adivinha a UF: sem UF, UF conflitante ou nome inválido ficam fora e são reportados. */
export function planAdministrativeCities(
  cities: readonly CityAreaRow[],
  ufs: readonly CityAreaUfRow[],
): AdministrativeCityPlan {
  const ufById = new Map(ufs.map((row) => [Number(row.MUNICIPIO_ID), row]));
  const plan: AdministrativeCityPlan = { tuples: [], withoutUf: [], conflicts: [], invalid: [] };
  const seen = new Set<string>();
  for (const city of cities) {
    const id = Number(city.ID);
    const name = (city.NAME ?? '').trim();
    const uf = ufById.get(id);
    if (!uf?.UF_MIN) {
      plan.withoutUf.push({ id, name });
      continue;
    }
    if (uf.UF_MIN !== uf.UF_MAX) {
      plan.conflicts.push({ id, name, ufs: [uf.UF_MIN, uf.UF_MAX ?? ''] });
      continue;
    }
    const tuple = normalizeAdministrativeCity({
      country: 'BR',
      stateOrProvince: uf.UF_MIN,
      city: name,
    });
    if (!tuple) {
      plan.invalid.push({ id, name });
      continue;
    }
    const key = `${tuple.countryCode}|${tuple.stateCode}|${tuple.cityKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plan.tuples.push(tuple);
  }
  return plan;
}

/**
 * Fase 1 — diretório mestre `geographic_administrative_city` com todos os municípios do Netwin.
 * Idempotente (chave natural país+UF+município); DRY-RUN não grava.
 */
export async function runPhase1AdministrativeCities(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 1: Diretório de municípios (CITYAREA) ===');
  const source = await ctx.getSourceConnection();
  let cities: CityAreaRow[];
  let ufs: CityAreaUfRow[];
  try {
    cities =
      (
        await source.execute<CityAreaRow>(
          cityAreaCatalogQuery(),
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        )
      ).rows ?? [];
    ufs =
      (
        await source.execute<CityAreaUfRow>(
          cityAreaUfQuery(),
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        )
      ).rows ?? [];
  } finally {
    await source.close();
  }

  const plan = planAdministrativeCities(cities, ufs);
  stats.rejected = plan.withoutUf.length + plan.conflicts.length + plan.invalid.length;
  console.log(
    `[Municípios] CITYAREA=${cities.length}; elegíveis=${plan.tuples.length}; sem UF=${plan.withoutUf.length}; UF conflitante=${plan.conflicts.length}; nome inválido=${plan.invalid.length}.`,
  );
  for (const item of plan.withoutUf.slice(0, 10)) {
    console.warn(`[Municípios] sem UF comprovada: ${item.id} "${item.name}".`);
  }
  if (plan.conflicts.length > 0) {
    const sample = plan.conflicts
      .slice(0, 10)
      .map((item) => `${item.id} "${item.name}" (${item.ufs.join('/')})`)
      .join('; ');
    throw new Error(
      `Municípios com UFs conflitantes no Netwin (${plan.conflicts.length}): ${sample}. Nada foi gravado.`,
    );
  }

  const target = ctx.options.apply ? await ctx.getTargetConnection() : null;
  if (!target) {
    console.log('[Municípios] DRY-RUN: nada gravado.');
    return stats;
  }
  try {
    const directory = ctx.t('geographic_administrative_city');
    const count = async () =>
      Number(
        (
          await target.execute<{ N: number }>(
            `SELECT COUNT(*) AS "N" FROM ${directory}`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          )
        ).rows?.[0]?.N ?? 0,
      );
    const before = await count();
    await resolveAdministrativeCityIds(target, ctx.t, plan.tuples);
    await target.execute('COMMIT');
    stats.loaded = (await count()) - before;
    stats.skipped = plan.tuples.length - stats.loaded;
    console.log(
      `[Municípios] novos=${stats.loaded}; já existentes reaproveitados=${stats.skipped}.`,
    );
  } finally {
    await target.close();
  }
  return stats;
}
