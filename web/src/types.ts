export type PageId = 'assistant' | 'geo' | 'resource' | 'service' | 'order' | 'conversation' | 'research' | 'pesquisas';

export type RecentGroup = 'none' | 'date' | 'project';

export type SettingsSection =
  | 'general'
  | 'account'
  | 'privacy'
  | 'billing'
  | 'usage'
  | 'capabilities'
  | 'claude-code'
  | 'claude-chrome'
  | 'skills'
  | 'connectors'
  | 'plugins';

export interface AttachmentItem {
  id: string;
  title: string;
  meta: string;
}

export interface ConversationEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachmentItem[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  projectLabel: string;
  updatedAt: string;
  entries: ConversationEntry[];
}

export interface ProjectCardData {
  id: string;
  title: string;
  updatedAt: string;
  description?: string;
  badge?: string;
}

export interface DomainMetric {
  label: string;
  value: string;
  sub: string;
}

export interface DomainCardData {
  title: string;
  description: string;
  tag: string;
}

export interface RecentItem {
  id: string;
  title: string;
  conversationId: string;
  projectLabel: string;
  updatedAt: string;
}

export interface SettingsNavigationItem {
  id: SettingsSection;
  label: string;
}

export interface SettingsSectionGroup {
  title: string;
  items: SettingsNavigationItem[];
}
