import { SqliteDatabase } from './sqlite-database.js';
import { randomUUID } from 'node:crypto';

export type SearchRecord = {
  id: string;
  userId: string;
  query: string;
  filters?: Record<string, any>;
  results?: Record<string, any>;
  createdAt: string;
};

export type NewSearchInput = {
  userId: string;
  query: string;
  filters?: Record<string, any>;
  results?: Record<string, any>;
};

export class SqliteSearchRepository {
  constructor(private db: SqliteDatabase) {}

  create(input: NewSearchInput): SearchRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.run(
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

  getById(id: string): SearchRecord | undefined {
    const row = this.db.get<any>(
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

  listByUserId(userId: string): SearchRecord[] {
    const rows = this.db.all<any>(
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

  list(): SearchRecord[] {
    const rows = this.db.all<any>(
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

  update(id: string, input: Partial<NewSearchInput>): SearchRecord | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    this.db.run(
      `UPDATE searches SET query = ?, filters = ?, results = ? WHERE id = ?`,
      [
        input.query || existing.query,
        input.filters ? JSON.stringify(input.filters) : (existing.filters ? JSON.stringify(existing.filters) : null),
        input.results ? JSON.stringify(input.results) : (existing.results ? JSON.stringify(existing.results) : null),
        id,
      ],
    );

    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.run(`DELETE FROM searches WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  deleteByUserId(userId: string): number {
    const result = this.db.run(`DELETE FROM searches WHERE user_id = ?`, [userId]);
    return result.changes;
  }

  count(): number {
    const result = this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM searches`,
    );
    return result?.count || 0;
  }

  countByUserId(userId: string): number {
    const result = this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM searches WHERE user_id = ?`,
      [userId],
    );
    return result?.count || 0;
  }
}
