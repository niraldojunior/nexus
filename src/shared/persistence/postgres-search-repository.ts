import type { DatabaseClient } from './database-client.js';
import { randomUUID } from 'node:crypto';

// Linha crua de `searches`. As consultas usam alias, entao os nomes ja chegam em
// camelCase; `filters` e `results` sao JSON serializado em texto.
type SearchRow = {
  id: string;
  userId: string;
  query: string;
  filters: string | null;
  results: string | null;
  createdAt: string;
};

export type SearchRecord = {
  id: string;
  userId: string;
  query: string;
  filters?: Record<string, unknown>;
  results?: Record<string, unknown>;
  createdAt: string;
};

export type NewSearchInput = {
  userId: string;
  query: string;
  filters?: Record<string, unknown>;
  results?: Record<string, unknown>;
};

export class PostgresSearchRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: NewSearchInput): Promise<SearchRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO searches (id, user_id, query, filters, results, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.userId,
        input.query,
        input.filters ? JSON.stringify(input.filters) : null,
        input.results ? JSON.stringify(input.results) : null,
        now,
      ],
    );

    const record: SearchRecord = {
      id,
      userId: input.userId,
      query: input.query,
      createdAt: now,
    };

    if (input.filters) record.filters = input.filters;
    if (input.results) record.results = input.results;

    return record;
  }

  async getById(id: string): Promise<SearchRecord | undefined> {
    const row = await this.db.get<SearchRow>(
      `SELECT id, user_id AS userId, query, filters, results, created_at AS createdAt
       FROM searches WHERE id = ?`,
      [id],
    );
    if (!row) return undefined;

    const record: SearchRecord = {
      id: row.id,
      userId: row.userId,
      query: row.query,
      createdAt: row.createdAt,
    };

    if (row.filters) record.filters = JSON.parse(row.filters);
    if (row.results) record.results = JSON.parse(row.results);

    return record;
  }

  async listByUserId(userId: string): Promise<SearchRecord[]> {
    const rows = await this.db.all<SearchRow>(
      `SELECT id, user_id AS userId, query, filters, results, created_at AS createdAt
       FROM searches WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
    );

    return rows.map((row) => {
      const record: SearchRecord = {
        id: row.id,
        userId: row.userId,
        query: row.query,
        createdAt: row.createdAt,
      };
      if (row.filters) record.filters = JSON.parse(row.filters);
      if (row.results) record.results = JSON.parse(row.results);
      return record;
    });
  }

  async list(): Promise<SearchRecord[]> {
    const rows = await this.db.all<SearchRow>(
      `SELECT id, user_id AS userId, query, filters, results, created_at AS createdAt
       FROM searches ORDER BY created_at DESC`,
    );

    return rows.map((row) => {
      const record: SearchRecord = {
        id: row.id,
        userId: row.userId,
        query: row.query,
        createdAt: row.createdAt,
      };
      if (row.filters) record.filters = JSON.parse(row.filters);
      if (row.results) record.results = JSON.parse(row.results);
      return record;
    });
  }

  async update(id: string, input: Partial<NewSearchInput>): Promise<SearchRecord | undefined> {
    const existing = await this.getById(id);
    if (!existing) return undefined;

    await this.db.run(`UPDATE searches SET query = ?, filters = ?, results = ? WHERE id = ?`, [
      input.query || existing.query,
      input.filters
        ? JSON.stringify(input.filters)
        : existing.filters
          ? JSON.stringify(existing.filters)
          : null,
      input.results
        ? JSON.stringify(input.results)
        : existing.results
          ? JSON.stringify(existing.results)
          : null,
      id,
    ]);

    return await this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run(`DELETE FROM searches WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.db.run(`DELETE FROM searches WHERE user_id = ?`, [userId]);
    return result.changes;
  }

  async count(): Promise<number> {
    const result = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM searches`);
    return result?.count || 0;
  }

  async countByUserId(userId: string): Promise<number> {
    const result = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM searches WHERE user_id = ?`,
      [userId],
    );
    return result?.count || 0;
  }
}
