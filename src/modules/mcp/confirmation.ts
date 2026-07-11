import type { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import { createCanonicalId } from '../../shared/utils/canonical-id.js';

export type PendingMcpConfirmation = {
  token: string;
  domain: string;
  operation: string;
  payload: Record<string, unknown>;
  summary: string;
  warnings: string[];
  context: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
};

export class PostgresMcpConfirmationRepository {
  public constructor(private readonly db: PostgresDatabase) {}

  public create(input: Omit<PendingMcpConfirmation, 'token' | 'createdAt'> & { token?: string; createdAt?: string }): PendingMcpConfirmation {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const token = input.token ?? createCanonicalId();
    this.db.run(
      `INSERT INTO mcp_confirmation
       (token, domain, operation, payload, summary, warnings, context, created_at, expires_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET
       domain = excluded.domain,
       operation = excluded.operation,
       payload = excluded.payload,
       summary = excluded.summary,
       warnings = excluded.warnings,
       context = excluded.context,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at,
       consumed_at = excluded.consumed_at`,
      [
        token,
        input.domain,
        input.operation,
        JSON.stringify(input.payload),
        input.summary,
        JSON.stringify(input.warnings),
        JSON.stringify(input.context),
        createdAt,
        input.expiresAt,
        input.consumedAt ?? null,
      ],
    );

    return this.get(token)!;
  }

  public get(token: string): PendingMcpConfirmation | undefined {
    const row = this.db.get<{
      token: string;
      domain: string;
      operation: string;
      payload: string;
      summary: string;
      warnings: string;
      context: string;
      created_at: string;
      expires_at: string;
      consumed_at?: string | null;
    }>(
      `SELECT token, domain, operation, payload, summary, warnings, context, created_at, expires_at, consumed_at
       FROM mcp_confirmation
       WHERE token = ?`,
      [token],
    );

    if (!row) return undefined;
    return {
      token: row.token,
      domain: row.domain,
      operation: row.operation,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      summary: row.summary,
      warnings: JSON.parse(row.warnings || '[]') as string[],
      context: JSON.parse(row.context || '{}') as Record<string, unknown>,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
    };
  }

  public consume(token: string, consumedAt = new Date().toISOString()): PendingMcpConfirmation | undefined {
    const current = this.get(token);
    if (!current) return undefined;

    this.db.run(
      `UPDATE mcp_confirmation
       SET consumed_at = ?
       WHERE token = ?`,
      [consumedAt, token],
    );

    return this.get(token);
  }
}
