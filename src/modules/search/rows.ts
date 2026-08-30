import type { MessageRole, ResearchSession } from './domain.js';

// Formato cru das linhas do Postgres para o modulo Search.
// Mesmas convencoes dos demais modulos: colunas snake_case, JSON serializado em
// texto e null (nao undefined) nas colunas opcionais.

export type ResearchSessionRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  context: string | null;
  status: ResearchSession['status'];
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  created_at: string;
  updated_at: string;
};

export type ResearchMessageRow = {
  id: string;
  research_session_id: string;
  role: MessageRole;
  content: string;
  tokens_used: number | null;
  metadata: string | null;
  created_at: string;
};
