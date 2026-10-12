import oracledb, { type Connection } from 'oracledb';
import { infranodeScopeBinds } from './scope.js';
import type { MunicipalityScopePrefilter } from './scope-resolution.js';
import { selectScopedInfranodeIds, structuredInfranodePredicates } from './source-batches.js';
import type { MigrationScope } from './types.js';

type PagerScope = Pick<MigrationScope, 'bairro' | 'municipio' | 'uf'>;

export type ScopedInfranodeStrategy =
  'municipio-id+nome' | 'bairro-keyset' | 'uf-materializado' | 'keyset-fallback';

export type ScopedInfranodePager = {
  strategy: ScopedInfranodeStrategy;
  next(lastId: number, limit: number): Promise<number[]>;
};

type MaterializeMode = 'off' | 'auto' | 'force'; // force == auto: só difere em diagnóstico futuro

const FETCH_CHUNK = 50_000;

function materializeMode(): MaterializeMode {
  const raw = (process.env.NETWIN_SCOPE_MATERIALIZE ?? 'auto').trim().toLowerCase();
  return raw === 'off' || raw === 'force' ? raw : 'auto';
}

/**
 * Lista todos os PI_ID do escopo numa única leitura. Sem DISTINCT/ROWNUM/JOIN: é o mesmo
 * predicado da paginação keyset, só que percorrido uma vez em vez de a cada página (em UF
 * esparsa cada página refazia uma longa varredura por PI_ID — ex.: PB, ~39s/página).
 */
export const scopedInfranodeMaterializeQuery = (predicates: string[]): string => `
  SELECT /*+ FULL(infranode) */ infranode.PI_ID AS PI_ID
  FROM NETWINOI.DL_INFRANODE infranode
  WHERE ${predicates.join(' AND ')}
  ORDER BY infranode.PI_ID
`;

/** Primeiros `limit` IDs estritamente maiores que `lastId` numa lista ordenada. */
export function pageFromSortedIds(ids: readonly number[], lastId: number, limit: number): number[] {
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ids[mid]! <= lastId) low = mid + 1;
    else high = mid;
  }
  return ids.slice(low, low + Math.max(0, limit));
}

export async function loadScopedInfranodeIds(
  source: Connection,
  scope: PagerScope,
): Promise<number[]> {
  const result = await source.execute<{ PI_ID: number }>(
    scopedInfranodeMaterializeQuery(structuredInfranodePredicates(scope, 'infranode')),
    infranodeScopeBinds(scope),
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      resultSet: true,
      fetchArraySize: 10_000,
      prefetchRows: 10_000,
    },
  );
  const resultSet = result.resultSet;
  if (!resultSet) throw new Error('Materialização de escopo sem resultSet.');
  const ids: number[] = [];
  try {
    for (;;) {
      const rows = await resultSet.getRows(FETCH_CHUNK);
      if (rows.length === 0) break;
      for (const row of rows) ids.push(Number((row as { PI_ID: number }).PI_ID));
    }
  } finally {
    await resultSet.close();
  }
  return ids.sort((left, right) => left - right);
}

const cache = new WeakMap<object, Map<string, Promise<number[]>>>();

function cacheKey(scope: PagerScope): string {
  return JSON.stringify([scope.uf ?? null, scope.municipio ?? null, scope.bairro ?? null]);
}

export type ScopedInfranodePagerOptions = {
  /** Objeto de vida da execução (ex.: o contexto) para compartilhar a lista entre fases. */
  cacheOwner?: object;
  log?: (message: string) => void;
};

export async function createScopedInfranodePager(
  source: Connection,
  scope: PagerScope,
  prefilter?: MunicipalityScopePrefilter,
  options: ScopedInfranodePagerOptions = {},
): Promise<ScopedInfranodePager> {
  const log = options.log ?? ((message: string) => console.log(message));
  const mode = materializeMode();
  const keyset = (strategy: ScopedInfranodeStrategy): ScopedInfranodePager => ({
    strategy,
    next: (lastId, limit) => selectScopedInfranodeIds(source, scope, lastId, limit, prefilter),
  });

  const keysetStrategy: ScopedInfranodeStrategy = prefilter
    ? 'municipio-id+nome'
    : scope.bairro
      ? 'bairro-keyset'
      : 'keyset-fallback';
  const eligible = !scope.bairro && !prefilter;
  if (mode === 'off' || !eligible) {
    return keyset(keysetStrategy);
  }

  const owner = options.cacheOwner ?? source;
  let perOwner = cache.get(owner);
  if (!perOwner) {
    perOwner = new Map();
    cache.set(owner, perOwner);
  }
  const key = cacheKey(scope);
  let loading = perOwner.get(key);
  const startedAt = Date.now();
  const fresh = !loading;
  if (!loading) {
    loading = loadScopedInfranodeIds(source, scope);
    perOwner.set(key, loading);
  }
  try {
    const ids = await loading;
    if (fresh) {
      const ms = Date.now() - startedAt;
      log(
        `[Escopo] UF materializada: ${ids.length} PI_ID(s) em ${ms}ms (${Math.round(ids.length / Math.max(ms / 1000, 0.001))} ids/s); paginação em memória.`,
      );
    }
    return {
      strategy: 'uf-materializado',
      next: async (lastId, limit) => pageFromSortedIds(ids, lastId, limit),
    };
  } catch (error) {
    perOwner.delete(key);
    console.warn(
      `[Escopo] Materialização da UF falhou (${error instanceof Error ? error.message : String(error)}); usando paginação keyset.`,
    );
    return keyset('keyset-fallback');
  }
}
