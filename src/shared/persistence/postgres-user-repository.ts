import type { DatabaseClient } from './database-client.js';
import { randomUUID } from 'node:crypto';

// Linha crua de `users`. As consultas usam alias (`external_id AS externalId`),
// entao os nomes ja chegam em camelCase; `email` e a unica coluna anulavel.
type UserRow = {
  id: string;
  externalId: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

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
  constructor(private db: DatabaseClient) {}

  async create(input: NewUserInput): Promise<UserRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db.run(
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

  async getById(id: string): Promise<UserRecord | undefined> {
    const row = await this.db.get<UserRow>(
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

  async getByExternalId(externalId: string): Promise<UserRecord | undefined> {
    const row = await this.db.get<UserRow>(
      `SELECT id, external_id AS externalId, name, email, created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE external_id = ?`,
      [externalId],
    );
    if (!row) return undefined;

    // `email` e anulavel no banco, mas opcional no dominio: devolver a linha crua
    // vazaria `email: null` para um campo tipado `email?: string`.
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

  async list(): Promise<UserRecord[]> {
    const rows = await this.db.all<UserRow>(
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

  async update(id: string, input: Partial<NewUserInput>): Promise<UserRecord | undefined> {
    const existing = await this.getById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    await this.db.run(`UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?`, [
      input.name || existing.name,
      input.email || existing.email || null,
      now,
      id,
    ]);

    return await this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run(`DELETE FROM users WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  async count(): Promise<number> {
    const result = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM users`);
    return result?.count || 0;
  }
}
