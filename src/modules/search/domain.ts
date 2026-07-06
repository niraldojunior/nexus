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

/**
 * Response from LLM provider (ChatGPT, etc)
 */
export type LLMResponse = {
  content: string;
  tokensUsed?: number;
  metadata?: Record<string, unknown>;
};
