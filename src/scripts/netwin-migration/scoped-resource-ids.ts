import oracledb, { type Connection } from 'oracledb';
import { pageFromSortedIds } from './scoped-infranode-ids.js';
import { chunksOf, namedInBinds, selectResourceIdsByInfranodes } from './source-batches.js';

export type ScopedResourceStrategy = 'uf-materializado' | 'keyset';

export type ScopedResourcePager = {
  readonly strategy: () => ScopedResourceStrategy;
  next(lastId: number, limit: number): Promise<number[]>;
  /** Libera a lista materializada ao fim do estágio. */
  release(): void;
};

const FETCH_CHUNK = 50_000;
const DEFAULT_MAX_IDS = 30_000_000;

const TABLE_PATTERN = /^NETWIN\.OSP_[A-Z_]+$/;
const COLUMN_PATTERN = /^[A-Z_]+$/;

function disabled(): boolean {
  const off = (value: string | undefined) => (value ?? '').trim().toLowerCase() === 'off';
  return (
    off(process.env.NETWIN_SCOPE_MATERIALIZE) || off(process.env.NETWIN_RESOURCE_SCOPE_MATERIALIZE)
  );
}

function maxIds(): number {
  const parsed = Number(process.env.NETWIN_RESOURCE_SCOPE_MAX_IDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IDS;
}

/** Leitura simples só do ID, ordenada — sem DISTINCT/ROWNUM/JOIN/geometria. */
export const scopedResourceMaterializeQuery = (
  table: string,
  foreignKey: string,
  inClause: string,
  idColumn = 'ID',
): string => {
  if (
    !TABLE_PATTERN.test(table) ||
    !COLUMN_PATTERN.test(foreignKey) ||
    !COLUMN_PATTERN.test(idColumn)
  ) {
    throw new Error(`Identificador SQL inválido para materialização: ${table}.${foreignKey}`);
  }
  return `
  SELECT source_resource.${idColumn} AS ID
  FROM ${table} source_resource
  WHERE source_resource.${foreignKey} IN (${inClause})
  ORDER BY source_resource.${idColumn}
`;
};

export type MaterializedResourceIds = { ids: number[]; chunks: number };

export async function loadScopedResourceIds(
  source: Connection,
  table: string,
  foreignKey: string,
  anchorIds: readonly number[],
  limitIds = maxIds(),
): Promise<MaterializedResourceIds> {
  const collected: number[] = [];
  const chunks = chunksOf(anchorIds);
  for (const chunk of chunks) {
    const { clause, binds } = namedInBinds(chunk, 'anchor');
    const result = await source.execute<{ ID: number }>(
      scopedResourceMaterializeQuery(table, foreignKey, clause),
      binds,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        resultSet: true,
        fetchArraySize: 10_000,
        prefetchRows: 10_000,
      },
    );
    const resultSet = result.resultSet;
    if (!resultSet) throw new Error('Materialização de recursos sem resultSet.');
    try {
      for (;;) {
        const rows = await resultSet.getRows(FETCH_CHUNK);
        if (rows.length === 0) break;
        for (const row of rows) collected.push(Number((row as { ID: number }).ID));
        if (collected.length > limitIds) {
          throw new Error(`teto de ${limitIds} IDs excedido`);
        }
      }
    } finally {
      await resultSet.close();
    }
  }
  collected.sort((left, right) => left - right);
  const ids: number[] = [];
  for (const id of collected) if (ids[ids.length - 1] !== id) ids.push(id);
  return { ids, chunks: chunks.length };
}

export type ScopedResourcePagerOptions = {
  /** Só UF isolada materializa; município/bairro/full seguem o keyset. */
  eligible: boolean;
  log?: (message: string) => void;
};

/**
 * Pager de IDs OSP por EXCHANGE_ID. Em UF materializa a lista ordenada uma única vez
 * (lazy, na primeira página) e pagina em memória; qualquer falha cai no keyset.
 */
export function createScopedResourcePager(
  source: Connection,
  table: string,
  foreignKey: string,
  anchorIds: readonly number[],
  options: ScopedResourcePagerOptions,
): ScopedResourcePager {
  const log = options.log ?? ((message: string) => console.log(message));
  const useMaterialized = options.eligible && anchorIds.length > 0 && !disabled();
  let strategy: ScopedResourceStrategy = 'keyset';
  let loading: Promise<number[] | null> | undefined;

  const materialize = async (): Promise<number[] | null> => {
    const startedAt = Date.now();
    try {
      const { ids, chunks } = await loadScopedResourceIds(source, table, foreignKey, anchorIds);
      const ms = Date.now() - startedAt;
      log(
        `[Escopo] ${table} materializado: ${ids.length} ID(s), ${chunks} chunk(s), ${ms}ms (${Math.round(ids.length / Math.max(ms / 1000, 0.001))} ids/s); paginação em memória.`,
      );
      strategy = 'uf-materializado';
      return ids;
    } catch (error) {
      console.warn(
        `[Escopo] Materialização de ${table} falhou (${error instanceof Error ? error.message : String(error)}); usando paginação keyset.`,
      );
      return null;
    }
  };

  return {
    strategy: () => strategy,
    async next(lastId, limit) {
      if (useMaterialized) {
        loading ??= materialize();
        const ids = await loading;
        if (ids) return pageFromSortedIds(ids, lastId, limit);
      }
      return selectResourceIdsByInfranodes(source, table, foreignKey, anchorIds, lastId, limit);
    },
    release() {
      loading = undefined;
    },
  };
}
