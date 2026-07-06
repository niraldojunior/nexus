import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import type { ResearchSession, ResearchMessage, CreateResearchSessionInput, AddMessageInput, LLMResponse } from './domain.js';
import { SqliteSearchRepository } from './sqlite-repository.js';

/**
 * Service for managing research sessions and chat interactions
 */
export class SearchService {
  constructor(private readonly repository: SqliteSearchRepository) {}

  /**
   * Create a new research session (like starting a ChatGPT conversation)
   */
  public createSession(
    userId: string,
    input: CreateResearchSessionInput,
  ): ResearchSession {
    const id = createCanonicalId();
    const now = new Date().toISOString();
    const sessionData: any = {
      '@type': 'ResearchSession',
      id,
      href: `/v1/search/sessions/${id}`,
      userId,
      title: input.title,
      status: 'active',
      model: input.model || 'gpt-4',
      temperature: input.temperature ?? 0.7,
      maxTokens: input.maxTokens ?? 2000,
      createdAt: now,
      updatedAt: now,
    };

    if (input.description !== undefined) {
      sessionData.description = input.description;
    }
    if (input.context !== undefined) {
      sessionData.context = input.context;
    }

    return this.repository.createSession(sessionData);
  }

  /**
   * Get a research session with all messages
   */
  public getSession(sessionId: string): ResearchSession | undefined {
    return this.repository.getSession(sessionId);
  }

  /**
   * List recent sessions for a user
   */
  public listUserSessions(userId: string, limit = 50): ResearchSession[] {
    return this.repository.listSessionsByUser(userId, limit);
  }

  /**
   * Add a user message to session and get LLM response
   * @param sessionId Session ID
   * @param userMessage User's message content
   * @param llmProvider Function to call LLM (ChatGPT, etc)
   */
  public async addMessageAndGetResponse(
    sessionId: string,
    userMessage: string,
    llmProvider: (context: string, messages: ResearchMessage[], userMsg: string) => Promise<LLMResponse>,
  ): Promise<{ userMessage: ResearchMessage; assistantMessage: ResearchMessage }> {
    const session = this.repository.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Add user message
    const userMsg = this.repository.addMessage(sessionId, {
      id: createCanonicalId(),
      role: 'user',
      content: userMessage,
    });

    // Get response from LLM
    const llmResponse = await llmProvider(session.context || '', session.messages || [], userMessage);

    // Add assistant message - build object conditionally
    const assistantMsgInput: any = {
      id: createCanonicalId(),
      role: 'assistant',
      content: llmResponse.content,
    };

    if (llmResponse.tokensUsed !== undefined) {
      assistantMsgInput.tokensUsed = llmResponse.tokensUsed;
    }
    if (llmResponse.metadata !== undefined) {
      assistantMsgInput.metadata = llmResponse.metadata;
    }

    const assistantMsg = this.repository.addMessage(sessionId, assistantMsgInput);

    return { userMessage: userMsg, assistantMessage: assistantMsg };
  }

  /**
   * Update session title (e.g., auto-generate from first message)
   */
  public updateSessionTitle(sessionId: string, title: string): ResearchSession | undefined {
    return this.repository.updateSessionTitle(sessionId, title);
  }

  /**
   * Archive a session
   */
  public archiveSession(sessionId: string): ResearchSession | undefined {
    return this.repository.archiveSession(sessionId);
  }
}
