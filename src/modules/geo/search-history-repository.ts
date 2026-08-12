// Histórico da barra de pesquisa da página Geo, por usuário (estilo Google Maps). Como o
// GeoTreeService, é uma projeção de leitura/escrita que fala com o DatabaseClient direto —
// não é uma entidade TMF, então não passa pelo IGeoRepository nem pela camada de serviço do
// domínio Geo.
//
// Ranking (o que o usuário pediu): mais visitados primeiro, empate pelo mais recente. O
// upsert por (user_id, entry_key) incrementa a contagem; a poda mantém só os melhores.

import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';

export type GeoSearchHistoryKind = 'node' | 'address';

export type GeoSearchHistoryEntry = {
  entryKey: string;
  kind: GeoSearchHistoryKind;
  label: string;
  // Snapshot do GeoTreeNode (kind 'node') ou do DraftAddress (kind 'address'), para
  // re-selecionar o item sem nova consulta ao Google/inventário.
  payload: unknown;
  visitCount: number;
  lastVisitedAt: string;
};

export type RecordGeoSearchInput = {
  entryKey: string;
  kind: GeoSearchHistoryKind;
  label: string;
  payload: unknown;
};

// Teto por usuário: o histórico é um atalho, não um log. A poda roda a cada gravação.
const MAX_ENTRIES = 50;

type HistoryRow = {
  entryKey: string;
  kind: GeoSearchHistoryKind;
  label: string;
  payload: string;
  visitCount: number;
  lastVisitedAt: string;
};

const parsePayload = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const toEntry = (row: HistoryRow): GeoSearchHistoryEntry => ({
  entryKey: row.entryKey,
  kind: row.kind === 'node' ? 'node' : 'address',
  label: row.label,
  payload: parsePayload(row.payload),
  visitCount: row.visitCount,
  lastVisitedAt: row.lastVisitedAt,
});

export class GeoSearchHistoryRepository {
  constructor(private db: DatabaseClient) {}

  async record(userId: string, input: RecordGeoSearchInput): Promise<void> {
    const now = new Date().toISOString();
    const payload = JSON.stringify(input.payload ?? null);
    const existing = await this.db.get<{ id: string }>(
      `SELECT id FROM geo_search_history WHERE user_id = ? AND entry_key = ?`,
      [userId, input.entryKey],
    );
    if (existing) {
      // O rótulo/snapshot mais recente vence — um endereço pode ter sido re-resolvido.
      await this.db.run(
        `UPDATE geo_search_history
            SET visit_count = visit_count + 1,
                last_visited_at = ?,
                label = ?,
                payload = ?
          WHERE user_id = ? AND entry_key = ?`,
        [now, input.label, payload, userId, input.entryKey],
      );
    } else {
      await this.db.run(
        `INSERT INTO geo_search_history
            (id, user_id, entry_key, kind, label, payload, visit_count, last_visited_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [randomUUID(), userId, input.entryKey, input.kind, input.label, payload, now, now],
      );
    }
    await this.prune(userId);
  }

  async list(userId: string, limit = 8): Promise<GeoSearchHistoryEntry[]> {
    const rows = await this.db.all<HistoryRow>(
      `SELECT entry_key AS entryKey, kind, label, payload,
              visit_count AS visitCount, last_visited_at AS lastVisitedAt
         FROM geo_search_history
        WHERE user_id = ?
        ORDER BY visit_count DESC, last_visited_at DESC
        LIMIT ?`,
      [userId, limit],
    );
    return rows.map(toEntry);
  }

  async remove(userId: string, entryKey: string): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM geo_search_history WHERE user_id = ? AND entry_key = ?`,
      [userId, entryKey],
    );
    return result.changes > 0;
  }

  async clear(userId: string): Promise<void> {
    await this.db.run(`DELETE FROM geo_search_history WHERE user_id = ?`, [userId]);
  }

  // Mantém apenas os MAX_ENTRIES melhores do usuário — mesmo ORDER do list, para a poda ser
  // consistente com o que o usuário vê.
  private async prune(userId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM geo_search_history
        WHERE user_id = ?
          AND entry_key NOT IN (
            SELECT entry_key FROM geo_search_history
             WHERE user_id = ?
             ORDER BY visit_count DESC, last_visited_at DESC
             LIMIT ?
          )`,
      [userId, userId, MAX_ENTRIES],
    );
  }
}
