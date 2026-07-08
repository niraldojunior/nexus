/**
 * Domain Types for Search/Research/Chat Module
 * Represents conversations with LLM and context management
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export type Characteristic = {
  name: string;
  value: string | number | boolean;
  valueType?: string;
};

/**
 * Research Message (single turn in conversation)
 */
export type ResearchMessage = {
  '@type': 'ResearchMessage';
  id: string;
  researchSessionId: string;
  role: MessageRole;
  content: string;
  tokensUsed?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

/**
 * Research Session (conversation container, like ChatGPT conversation)
 */
export type ResearchSession = {
  '@type': 'ResearchSession';
  id: string;
  href: string;
  userId: string;
  title: string;
  description?: string;
  context?: string; // Initial system context/prompt
  status: 'active' | 'archived' | 'deleted';
  model?: string; // e.g., 'gpt-4', 'gpt-3.5-turbo'
  temperature?: number;
  maxTokens?: number;
  messages?: ResearchMessage[]; // Populated on retrieve, not persisted separately
  createdAt: string;
  updatedAt: string;
};

/**
 * Input for creating a new research session
 */
export type CreateResearchSessionInput = {
  title: string;
  description?: string;
  context?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

/**
 * Input for adding a message to session
 */
export type AddMessageInput = {
  role: MessageRole;
  content: string;
  tokensUsed?: number;
  metadata?: Record<string, unknown>;
};

export type LLMToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type LLMToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LLMConversationMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: LLMToolCall[];
    }
  | {
      role: 'tool';
      content: string;
      toolCallId: string;
      name: string;
    };

export type LLMRequest = {
  context: string;
  transcript: LLMConversationMessage[];
  latestUserMessage: string;
  model: string;
  temperature: number;
  maxTokens: number;
  tools?: LLMToolDefinition[];
};

export type ToolExecutionRecord = {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  executedAt: string;
};

/**
 * Response from LLM provider (ChatGPT, etc)
 */
export type LLMResponse = {
  content: string;
  tokensUsed?: number;
  metadata?: Record<string, unknown>;
  toolCalls?: LLMToolCall[];
  finishReason?: string;
};
