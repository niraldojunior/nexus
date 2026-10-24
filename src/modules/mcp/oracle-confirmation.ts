import type { DatabaseClient } from '../../shared/persistence/database-client.js';
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

export class OracleMcpConfirmationRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public async create(
    input: Omit<PendingMcpConfirmation, 'token' | 'createdAt'> & {
      token?: string;
      createdAt?: string;
    },
  ): Promise<PendingMcpConfirmation> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const token = input.token ?? createCanonicalId();
    await this.db.run(
      `INSERT INTO user_mcp_confirmation
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

    return (await this.get(token))!;
  }

  public async get(token: string): Promise<PendingMcpConfirmation | undefined> {
    const row = await this.db.get<{
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
       FROM user_mcp_confirmation
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

  public async consume(
    token: string,
    consumedAt = new Date().toISOString(),
  ): Promise<PendingMcpConfirmation | undefined> {
    // Atômico: só o primeiro commit concorrente altera a linha. Sem o filtro `consumed_at IS NULL`,
    // dois commits simultâneos passavam pela checagem de `get` e executavam a mutação duas vezes.
    const result = await this.db.run(
      `UPDATE user_mcp_confirmation
       SET consumed_at = ?
       WHERE token = ? AND consumed_at IS NULL`,
      [consumedAt, token],
    );
    if (result.changes === 0) return undefined;

    return await this.get(token);
  }

  // Mantém o token expirado até o commit devolver MCP_CONFIRMATION_EXPIRED. Depois disso ele
  // pode ser removido; tokens consumidos preservam a prova de que o commit ocorreu.
  public async purgeExpired(now = new Date().toISOString()): Promise<void> {
    await this.db.run(
      `DELETE FROM user_mcp_confirmation WHERE consumed_at IS NOT NULL AND expires_at < ?`,
      [now],
    );
  }
}
