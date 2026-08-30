import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { buildHref } from '../../shared/tmf/index.js';
import type { ResearchSession, ResearchMessage, AddMessageInput } from './domain.js';

/**
 * SQLite Repository for Research/Chat Sessions
 */
import type { ResearchMessageRow, ResearchSessionRow } from './rows.js';
export class PostgresSearchRepository {
  constructor(private readonly db: DatabaseClient) {}

  // ============ RESEARCH SESSIONS ============

  public async createSession(
    session: Omit<ResearchSession, 'createdAt' | 'updatedAt'>,
  ): Promise<ResearchSession> {
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO research_session
       (id, href, user_id, title, description, context, status, model, temperature, max_tokens, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.href,
        session.userId,
        session.title,
        session.description || null,
        session.context || null,
        session.status,
        session.model || null,
        session.temperature ?? 0.7,
        session.maxTokens ?? 2000,
        now,
        now,
      ],
    );

    return (await this.getSession(session.id))!;
  }

  public async getSession(id: string): Promise<ResearchSession | undefined> {
    const row = await this.db.get<ResearchSessionRow>(
      `SELECT id, href, user_id, title, description, context, status, model, temperature, max_tokens, created_at, updated_at
       FROM research_session WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;

    const messages = await this.getSessionMessages(id);

    return {
      '@type': 'ResearchSession',
      id: row.id,
      href: buildHref('researchSession', row.id),
      userId: row.user_id,
      title: row.title,
      ...(row.description !== null ? { description: row.description } : {}),
      ...(row.context !== null ? { context: row.context } : {}),
      status: row.status,
      ...(row.model !== null ? { model: row.model } : {}),
      ...(row.temperature !== null ? { temperature: row.temperature } : {}),
      ...(row.max_tokens !== null ? { maxTokens: row.max_tokens } : {}),
      messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async listSessionsByUser(userId: string, limit = 50): Promise<ResearchSession[]> {
    const rows = await this.db.all<ResearchSessionRow>(
      `SELECT id, href, user_id, title, description, context, status, model, temperature, max_tokens, created_at, updated_at
       FROM research_session WHERE user_id = ? AND status != 'deleted'
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit],
    );

    return Promise.all(
      rows.map(async (row) => {
        const messages = await this.getSessionMessages(row.id);
        return {
          '@type': 'ResearchSession',
          id: row.id,
          href: buildHref('researchSession', row.id),
          userId: row.user_id,
          title: row.title,
          ...(row.description !== null ? { description: row.description } : {}),
          ...(row.context !== null ? { context: row.context } : {}),
          status: row.status,
          ...(row.model !== null ? { model: row.model } : {}),
          ...(row.temperature !== null ? { temperature: row.temperature } : {}),
          ...(row.max_tokens !== null ? { maxTokens: row.max_tokens } : {}),
          messages,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    );
  }

  public async updateSessionTitle(
    sessionId: string,
    title: string,
  ): Promise<ResearchSession | undefined> {
    const now = new Date().toISOString();
    await this.db.run(`UPDATE research_session SET title = ?, updated_at = ? WHERE id = ?`, [
      title,
      now,
      sessionId,
    ]);
    return await this.getSession(sessionId);
  }

  public async archiveSession(sessionId: string): Promise<ResearchSession | undefined> {
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE research_session SET status = 'archived', updated_at = ? WHERE id = ?`,
      [now, sessionId],
    );
    return await this.getSession(sessionId);
  }

  // ============ RESEARCH MESSAGES ============

  public async addMessage(
    sessionId: string,
    message: AddMessageInput & { id: string },
  ): Promise<ResearchMessage> {
    await this.db.run(
      `INSERT INTO research_message (id, research_session_id, role, content, tokens_used, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        sessionId,
        message.role,
        message.content,
        message.tokensUsed || null,
        message.metadata ? JSON.stringify(message.metadata) : null,
        new Date().toISOString(),
      ],
    );

    return (await this.getMessage(message.id))!;
  }

  public async getMessage(id: string): Promise<ResearchMessage | undefined> {
    const row = await this.db.get<ResearchMessageRow>(
      `SELECT id, research_session_id, role, content, tokens_used, metadata, created_at
       FROM research_message WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;

    return {
      '@type': 'ResearchMessage',
      id: row.id,
      researchSessionId: row.research_session_id,
      role: row.role,
      content: row.content,
      ...(row.tokens_used !== null ? { tokensUsed: row.tokens_used } : {}),
      ...(row.metadata !== null
        ? { metadata: JSON.parse(row.metadata) as Record<string, unknown> }
        : {}),
      createdAt: row.created_at,
    };
  }

  private async getSessionMessages(sessionId: string): Promise<ResearchMessage[]> {
    const rows = await this.db.all<ResearchMessageRow>(
      `SELECT id, research_session_id, role, content, tokens_used, metadata, created_at
       FROM research_message WHERE research_session_id = ?
       ORDER BY created_at ASC`,
      [sessionId],
    );

    return rows.map((row) => ({
      '@type': 'ResearchMessage',
      id: row.id,
      researchSessionId: row.research_session_id,
      role: row.role,
      content: row.content,
      ...(row.tokens_used !== null ? { tokensUsed: row.tokens_used } : {}),
      ...(row.metadata !== null
        ? { metadata: JSON.parse(row.metadata) as Record<string, unknown> }
        : {}),
      createdAt: row.created_at,
    }));
  }
}
