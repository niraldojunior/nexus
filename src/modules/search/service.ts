import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import type {
  ResearchSession,
  ResearchMessage,
  CreateResearchSessionInput,
  AddMessageInput,
  LLMConversationMessage,
  LLMRequest,
  LLMResponse,
  LLMToolDefinition,
  ToolExecutionRecord,
} from './domain.js';
import { getNexusCopilotContext } from './nexus-copilot-context.js';
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
      model: input.model || 'gpt-4o-mini',
      temperature: input.temperature ?? 0.7,
      maxTokens: input.maxTokens ?? 2000,
      createdAt: now,
      updatedAt: now,
    };

    if (input.description !== undefined) {
      sessionData.description = input.description;
    }
    const resolvedContext = input.context?.trim().length ? input.context : getNexusCopilotContext();
    if (resolvedContext !== undefined) {
      sessionData.context = resolvedContext;
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
    llmProvider: (request: LLMRequest) => Promise<LLMResponse>,
    options?: {
      tools?: LLMToolDefinition[];
      executeTool?: (toolName: string, input: Record<string, unknown>) => Promise<unknown> | unknown;
      maxToolCalls?: number;
    },
  ): Promise<{ userMessage: ResearchMessage; assistantMessage: ResearchMessage }> {
    const session = this.repository.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Add user message
    const userMsg = this.repository.addMessage(sessionId, {
      id: createCanonicalId(),
      role: 'user',
      content: userMessage,
    });

    // Get response from LLM, but keep the conversation usable even when the provider fails.
    let llmResponse: LLMResponse;
    const toolExecutions: ToolExecutionRecord[] = [];
    const context = session.context?.trim().length ? session.context : getNexusCopilotContext();
    const transcript = buildTranscript(context, session.messages || [], userMessage);
    try {
      const llmRequest: LLMRequest = {
        context,
        transcript,
        latestUserMessage: userMessage,
        model: session.model || 'gpt-4o-mini',
        temperature: session.temperature ?? 0.7,
        maxTokens: session.maxTokens ?? 2000,
        ...(options?.tools ? { tools: options.tools } : {}),
      };
      llmResponse = await this.runToolLoop(
        llmRequest,
        llmProvider,
        toolExecutions,
        options,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      llmResponse = {
        content:
          'Nao consegui gerar uma resposta automatica agora. Sua mensagem foi salva e a conversa foi criada, mas o provedor de IA nao respondeu.',
        metadata: {
          fallback: true,
          error: errorMsg,
        },
      };
    }

    // Add assistant message - build object conditionally
    const assistantMsgInput: any = {
      id: createCanonicalId(),
      role: 'assistant',
      content: llmResponse.content,
    };

    if (llmResponse.tokensUsed !== undefined) {
      assistantMsgInput.tokensUsed = llmResponse.tokensUsed;
    }
    const metadata = {
      ...(llmResponse.metadata ?? {}),
      ...(llmResponse.finishReason ? { finishReason: llmResponse.finishReason } : {}),
      ...(toolExecutions.length > 0 ? { toolExecutions } : {}),
    };
    if (Object.keys(metadata).length > 0) {
      assistantMsgInput.metadata = metadata;
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

  private async runToolLoop(
    request: LLMRequest,
    llmProvider: (request: LLMRequest) => Promise<LLMResponse>,
    toolExecutions: ToolExecutionRecord[],
    options?: {
      tools?: LLMToolDefinition[];
      executeTool?: (toolName: string, input: Record<string, unknown>) => Promise<unknown> | unknown;
      maxToolCalls?: number;
    },
  ): Promise<LLMResponse> {
    const maxToolCalls = options?.maxToolCalls ?? 4;
    let currentRequest = request;

    for (let iteration = 0; iteration <= maxToolCalls; iteration += 1) {
      const response = await llmProvider(currentRequest);
      const toolCalls = response.toolCalls ?? [];
      const canExecuteTools =
        toolCalls.length > 0 &&
        (options?.tools?.length ?? 0) > 0 &&
        typeof options?.executeTool === 'function' &&
        iteration < maxToolCalls;

      if (!canExecuteTools) {
        if (toolCalls.length > 0 && iteration >= maxToolCalls) {
          return {
            ...response,
            metadata: {
              ...(response.metadata ?? {}),
              warning: 'tool call loop limit reached',
            },
          };
        }
        return response;
      }

      currentRequest = {
        ...currentRequest,
        transcript: [
          ...currentRequest.transcript,
          {
            role: 'assistant',
            content: response.content,
            toolCalls,
          },
        ],
      };

      for (const toolCall of toolCalls) {
        const executeTool = options.executeTool!;
        const result = await executeTool(toolCall.name, toolCall.arguments);
        toolExecutions.push({
          id: toolCall.id,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          result,
          executedAt: new Date().toISOString(),
        });
        currentRequest.transcript.push({
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify(result),
        });
      }
    }

    return {
      content: 'Nao consegui concluir o loop de ferramentas do Copilot.',
      metadata: {
        fallback: true,
        warning: 'tool loop exhausted',
      },
      finishReason: 'tool_loop_exhausted',
    };
  }
}

const buildTranscript = (
  context: string,
  messages: ResearchMessage[],
  latestUserMessage: string,
): LLMConversationMessage[] => [
  ...(context ? [{ role: 'system' as const, content: context }] : []),
  ...messages.map((message) => ({
    role: message.role as 'system' | 'user' | 'assistant',
    content: message.content,
  })),
  {
    role: 'user' as const,
    content: latestUserMessage,
  },
];
