import { PostgresDatabase } from './postgres-database.js';
import { randomUUID } from 'node:crypto';

export type UserRecord = {
  id: string;
  externalId: string;
  name: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewUserInput = {
  externalId: string;
  name: string;
  email?: string;
};

export class PostgresUserRepository {
  constructor(private db: PostgresDatabase) {}

  create(input: NewUserInput): UserRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO users (id, external_id, name, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.externalId, input.name, input.email || null, now, now],
    );

    const record: UserRecord = {
      id,
      externalId: input.externalId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };

    if (input.email) record.email = input.email;

    return record;
  }

  getById(id: string): UserRecord | undefined {
    const row = this.db.get<any>(
      `SELECT id, external_id AS externalId, name, email, created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE id = ?`,
      [id],
    );
    if (!row) return undefined;

    const record: UserRecord = {
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    if (row.email) record.email = row.email;

    return record;
  }

  getByExternalId(externalId: string): UserRecord | undefined {
    const row = this.db.get<any>(
      `SELECT id, external_id AS externalId, name, email, created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE external_id = ?`,
      [externalId],
    );
    return row as UserRecord | undefined;
  }

  list(): UserRecord[] {
    const rows = this.db.all<any>(
      `SELECT id, external_id AS externalId, name, email, created_at AS createdAt, updated_at AS updatedAt
       FROM users ORDER BY created_at DESC`,
    );
    return rows.map((row) => {
      const record: UserRecord = {
        id: row.id,
        externalId: row.externalId,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      if (row.email) record.email = row.email;
      return record;
    });
  }

  update(id: string, input: Partial<NewUserInput>): UserRecord | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?`,
      [input.name || existing.name, input.email || existing.email || null, now, id],
    );

    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.run(`DELETE FROM users WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  count(): number {
    const result = this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM users`,
    );
    return result?.count || 0;
  }
}
