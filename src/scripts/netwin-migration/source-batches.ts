import oracledb, { type Connection } from 'oracledb';
import {
  infranodeScopeBinds,
  municipalityInfranodePredicate,
  neighborhoodInfranodePredicate,
  ufInfranodePredicate,
} from './scope.js';
import type { MigrationScope } from './types.js';

export const ORACLE_IN_BATCH_SIZE = 900;

export function chunksOf<T>(items: readonly T[], size = ORACLE_IN_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += Math.max(1, size)) {
    chunks.push(items.slice(offset, offset + Math.max(1, size)));
  }
  return chunks;
}

export function namedInBinds(
  ids: readonly number[],
  prefix = 'id',
): { clause: string; binds: Record<string, number> } {
  const binds: Record<string, number> = {};
  const clause = ids
    .map((id, index) => {
      const name = `${prefix}${index}`;
      binds[name] = id;
      return `:${name}`;
    })
    .join(', ');
  return { clause, binds };
}

export function structuredInfranodePredicates(
  scope: Pick<MigrationScope, 'bairro' | 'municipio' | 'uf'>,
  alias = 'infranode',
): string[] {
  const predicates: string[] = [];
  if (scope.bairro) predicates.push(neighborhoodInfranodePredicate(alias));
  if (scope.municipio) predicates.push(municipalityInfranodePredicate(alias));
  if (scope.uf) predicates.push(ufInfranodePredicate(alias));
  return predicates;
}

/**
 * Descobre apenas PI_ID do índice geográfico estruturado. Não use esta query para hidratar
 * LOCATION: o recorte é propositalmente separado para evitar JOIN/LIKE/GROUP BY por página.
 *
 * Sem DISTINCT: PI_ID já é único por linha em DL_INFRANODE dentro de um recorte geográfico
 * (medido no DR para `--uf RJ`: 2.102.724 linhas para 2.102.724 PI_IDs distintos). O DISTINCT
 * não eliminava nenhuma linha e custava caríssimo — SORT/HASH UNIQUE é bloqueante, então o
 * Oracle não conseguia empurrar o stop-key do ROWNUM através dele e materializava a UF inteira
 * a cada página. Medido: ~52s por página com DISTINCT contra ~0,7s sem, o que projeta 15h
 * contra 12min só na seleção de IDs do RJ.
 *
 * Sem o DISTINCT a paginação percorre DL_INFRANODE_IDX1 (PI_ID) em ordem e para nas primeiras
 * `batchSize` linhas que casam com o predicado, sem precisar de índice sobre a coluna de escopo.
 */
export const scopedInfranodeIdQuery = (predicates: string[]): string => `
  SELECT PI_ID
  FROM (
    SELECT infranode.PI_ID
    FROM NETWINOI.DL_INFRANODE infranode
    WHERE infranode.PI_ID > :lastId
      AND ${predicates.join(' AND ')}
    ORDER BY infranode.PI_ID
  )
  WHERE ROWNUM <= :batchSize
`;

export const fullTableIdQuery = (table: string, idColumn = 'ID'): string => `
  SELECT ${idColumn} AS ID
  FROM (
    SELECT ${idColumn}
    FROM ${table}
    WHERE ${idColumn} > :lastId
    ORDER BY ${idColumn}
  )
  WHERE ROWNUM <= :batchSize
`;

/**
 * Descobre IDs OSP vinculados a PI_IDs previamente escolhidos pelo escopo estruturado.
 * A geometria e os atributos são hidratados depois, exclusivamente para a página selecionada.
 */
export const resourceIdsByInfranodesQuery = (
  table: string,
  foreignKey: string,
  idColumn = 'ID',
): string => `
  SELECT ${idColumn} AS ID
  FROM (
    SELECT source_resource.${idColumn}
    FROM ${table} source_resource
    WHERE source_resource.${idColumn} > :lastId
      AND source_resource.${foreignKey} IN (__INFRANODE_IDS__)
    ORDER BY source_resource.${idColumn}
  )
  WHERE ROWNUM <= :batchSize
`;

export const resourceIdsByStructuredInfranodeQuery = (
  table: string,
  foreignKey: string,
  predicates: string[],
  idColumn = 'ID',
): string => `
  SELECT ${idColumn} AS ID
  FROM (
    SELECT resource.${idColumn}
    FROM ${table} resource
    JOIN NETWINOI.DL_INFRANODE infranode ON infranode.PI_ID = resource.${foreignKey}
    WHERE resource.${idColumn} > :lastId
      AND ${predicates.join(' AND ')}
    ORDER BY resource.${idColumn}
  )
  WHERE ROWNUM <= :batchSize
`;

export async function selectResourceIdsByStructuredInfranode(
  source: Connection,
  table: string,
  foreignKey: string,
  scope: Pick<MigrationScope, 'bairro' | 'municipio' | 'uf'>,
  lastId: number,
  batchSize: number,
  idColumn = 'ID',
): Promise<number[]> {
  const result = await source.execute<{ ID: number }>(
    resourceIdsByStructuredInfranodeQuery(
      table,
      foreignKey,
      structuredInfranodePredicates(scope),
      idColumn,
    ),
    { ...infranodeScopeBinds(scope), lastId, batchSize },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: batchSize, prefetchRows: batchSize },
  );
  return (result.rows ?? []).map((row) => row.ID);
}

export async function selectResourceIdsByInfranodes(
  source: Connection,
  table: string,
  foreignKey: string,
  infranodeIds: readonly number[],
  lastId: number,
  batchSize: number,
  idColumn = 'ID',
): Promise<number[]> {
  if (infranodeIds.length === 0) return [];
  const ids: number[] = [];
  for (const chunk of chunksOf(infranodeIds)) {
    const { clause, binds } = namedInBinds(chunk, 'infranode');
    const result = await source.execute<{ ID: number }>(
      resourceIdsByInfranodesQuery(table, foreignKey, idColumn).replace(
        '__INFRANODE_IDS__',
        clause,
      ),
      { ...binds, lastId, batchSize },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: batchSize, prefetchRows: batchSize },
    );
    ids.push(...(result.rows ?? []).map((row) => row.ID));
  }
  return [...new Set(ids)].sort((left, right) => left - right).slice(0, batchSize);
}

export async function hydrateByIds<T extends Record<string, unknown>>(
  source: Connection,
  ids: readonly number[],
  query: (inClause: string) => string,
  idColumn = 'ID',
): Promise<T[]> {
  const rows = new Map<number, T>();
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'id');
    const result = await source.execute<T>(query(clause), binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: chunk.length,
    });
    for (const row of result.rows ?? []) {
      const id = row[idColumn];
      if (typeof id === 'number') rows.set(id, row);
    }
  }
  return ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : []));
}

export async function selectScopedInfranodeIds(
  source: Connection,
  scope: Pick<MigrationScope, 'bairro' | 'municipio' | 'uf'>,
  lastId: number,
  batchSize: number,
): Promise<number[]> {
  const result = await source.execute<{ PI_ID: number }>(
    scopedInfranodeIdQuery(structuredInfranodePredicates(scope)),
    { ...infranodeScopeBinds(scope), lastId, batchSize },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: batchSize, prefetchRows: batchSize },
  );
  return (result.rows ?? []).map((row) => row.PI_ID);
}

export async function selectFullTableIds(
  source: Connection,
  table: string,
  lastId: number,
  batchSize: number,
  idColumn = 'ID',
): Promise<number[]> {
  const result = await source.execute<{ ID: number }>(
    fullTableIdQuery(table, idColumn),
    { lastId, batchSize },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: batchSize, prefetchRows: batchSize },
  );
  return (result.rows ?? []).map((row) => row.ID);
}
