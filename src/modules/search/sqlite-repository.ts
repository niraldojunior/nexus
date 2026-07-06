import { SqliteDatabase } from '../../shared/persistence/sqlite-database.js';
import type { ResearchSession, ResearchMessage, AddMessageInput } from './domain.js';

/**
 * SQLite Repository for Research/Chat Sessions
 */
export class SqliteSearchRepository {
  constructor(private readonly db: SqliteDatabase) {}

  // ============ RESEARCH SESSIONS ============

  public createSession(session: Omit<ResearchSession, 'createdAt' | 'updatedAt'>): ResearchSession {
    const now = new Date().toISOString();

    this.db.run(
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

    return this.getSession(session.id)!;
  }

  public getSession(id: string): ResearchSession | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, user_id, title, description, context, status, model, temperature, max_tokens, created_at, updated_at
       FROM research_session WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;

    const messages = this.getSessionMessages(id);

    return {
      '@type': 'ResearchSession',
      id: row.id,
      href: row.href,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      context: row.context,
      status: row.status,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public listSessionsByUser(userId: string, limit = 50): ResearchSession[] {
    const rows = this.db.all<any>(
      `SELECT id, href, user_id, title, description, context, status, model, temperature, max_tokens, created_at, updated_at
       FROM research_session WHERE user_id = ? AND status != 'deleted'
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit],
    );

    return rows.map((row) => {
      const messages = this.getSessionMessages(row.id);
      return {
        '@type': 'ResearchSession',
        id: row.id,
        href: row.href,
        userId: row.user_id,
        title: row.title,
        description: row.description,
        context: row.context,
        status: row.status,
        model: row.model,
        temperature: row.temperature,
        maxTokens: row.max_tokens,
        messages,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  public updateSessionTitle(sessionId: string, title: string): ResearchSession | undefined {
    const now = new Date().toISOString();
    this.db.run(`UPDATE research_session SET title = ?, updated_at = ? WHERE id = ?`, [title, now, sessionId]);
    return this.getSession(sessionId);
  }

  public archiveSession(sessionId: string): ResearchSession | undefined {
    const now = new Date().toISOString();
    this.db.run(`UPDATE research_session SET status = 'archived', updated_at = ? WHERE id = ?`, [now, sessionId]);
    return this.getSession(sessionId);
  }

  // ============ RESEARCH MESSAGES ============

  public addMessage(sessionId: string, message: AddMessageInput & { id: string }): ResearchMessage {
    this.db.run(
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

    return this.getMessage(message.id)!;
  }

  public getMessage(id: string): ResearchMessage | undefined {
    const row = this.db.get<any>(
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
      tokensUsed: row.tokens_used,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
    };
  }

  private getSessionMessages(sessionId: string): ResearchMessage[] {
    const rows = this.db.all<any>(
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
      tokensUsed: row.tokens_used,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
    }));
  }
}
