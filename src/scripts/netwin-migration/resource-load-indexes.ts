import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { MigrationContext } from './context.js';

// Tabelas que a Fase 2.C grava em massa (MERGE linha a linha). Cada índice não único é mantido a cada
// linha gravada; marcá-los UNUSABLE durante a carga e reconstruí-los uma vez no fim troca N atualizações
// de B-tree por uma varredura ordenada. Índices de PK/UNIQUE e de LOB ficam de fora: o MERGE depende do
// índice único de `id` / da PK para localizar a linha, e índices de LOB não aceitam ALTER INDEX.
export const RESOURCE_LOAD_TABLES = ['resource_physical', 'resource_relationship'] as const;

type IndexStatus = { indexName: string; status: string };

const dictionaryName = (identifier: string): string => identifier.replaceAll('"', '').toUpperCase();
const quote = (identifier: string): string => `"${identifier.replaceAll('"', '')}"`;

export function keepResourceIndexesEnabled(): boolean {
  return process.env.NETWIN_KEEP_RESOURCE_INDEXES === '1';
}

async function nonUniqueIndexes(conn: Connection, tableName: string): Promise<IndexStatus[]> {
  const result = await conn.execute<{ INDEX_NAME: string; STATUS: string }>(
    `SELECT ui.index_name AS "INDEX_NAME", ui.status AS "STATUS"
       FROM user_indexes ui
      WHERE ui.table_name = :tableName
        AND ui.uniqueness = 'NONUNIQUE'
        AND ui.index_type IN ('NORMAL', 'FUNCTION-BASED NORMAL')
        AND NOT EXISTS (
          SELECT 1 FROM user_constraints uc
           WHERE uc.table_name = ui.table_name AND uc.constraint_type IN ('P', 'U')
             AND uc.index_name = ui.index_name
        )
      ORDER BY ui.index_name`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows ?? []).map((row) => ({ indexName: row.INDEX_NAME, status: row.STATUS }));
}

/** Marca como UNUSABLE os índices não únicos das tabelas da 2.C. Idempotente (retomada após crash). */
export async function disableResourceLoadIndexes(
  conn: Connection,
  ctx: MigrationContext,
): Promise<void> {
  if (keepResourceIndexesEnabled()) {
    console.log('[Índices] NETWIN_KEEP_RESOURCE_INDEXES=1: índices mantidos durante a 2.C.');
    return;
  }
  await conn.execute('ALTER SESSION SET SKIP_UNUSABLE_INDEXES = TRUE');
  for (const table of RESOURCE_LOAD_TABLES) {
    for (const { indexName, status } of await nonUniqueIndexes(
      conn,
      dictionaryName(ctx.t(table)),
    )) {
      if (status === 'UNUSABLE') continue;
      console.log(`[Índices] ${indexName} (${table}) -> UNUSABLE para a carga em massa da 2.C.`);
      await conn.execute(`ALTER INDEX ${quote(indexName)} UNUSABLE`);
    }
  }
}

/**
 * Reconstrói os índices que não estão VALID (inclusive os deixados por uma execução interrompida).
 * Só deve rodar ao fim bem-sucedido da 2.C: reconstruir a cada retry de uma carga que falha custaria
 * minutos por tentativa.
 */
export async function rebuildResourceLoadIndexes(
  conn: Connection,
  ctx: MigrationContext,
): Promise<void> {
  for (const table of RESOURCE_LOAD_TABLES) {
    for (const { indexName, status } of await nonUniqueIndexes(
      conn,
      dictionaryName(ctx.t(table)),
    )) {
      if (status === 'VALID') continue;
      const startedAt = Date.now();
      try {
        await conn.execute(`ALTER INDEX ${quote(indexName)} REBUILD PARALLEL 4 NOLOGGING`);
        await conn.execute(`ALTER INDEX ${quote(indexName)} NOPARALLEL`);
      } catch (error) {
        throw new Error(
          `Rebuild de índice abortado: falha ao reconstruir ${indexName} (${table}). ` +
            `Reconstrua manualmente com ALTER INDEX ${quote(indexName)} REBUILD. Detalhe: ${String(error)}`,
        );
      }
      console.log(`[Índices] ${indexName} (${table}) reconstruído em ${Date.now() - startedAt}ms.`);
    }
  }
}
