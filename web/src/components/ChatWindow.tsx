import type { RefObject } from 'react';
import { ChatMessage as ChatMessageType } from '../types';
import ChatMessageComponent from './ChatMessage';
import LoadingIndicator from './LoadingIndicator';

interface ChatWindowProps {
  messages: ChatMessageType[];
  loading: boolean;
  messagesEndRef: RefObject<HTMLDivElement>;
}

export default function ChatWindow({ messages, loading, messagesEndRef }: ChatWindowProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-transparent px-6 py-8">
      {messages.length === 0 ? (
        <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center rounded-[28px] border border-app-border bg-white px-8 py-10 text-center shadow-soft">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-app-accent text-app-text shadow-soft">
            <span className="text-2xl font-bold">N</span>
          </div>
          <h2 className="mb-2 font-display text-3xl font-semibold text-app-text">
            Olá! Bem-vindo ao Nexus
          </h2>
          <p className="mb-8 text-app-muted">
            Sou um assistente de IA pronto para ajudar com perguntas, análises, criatividade e muito
            mais.
          </p>

          {/* Quick actions */}
          <div className="grid w-full grid-cols-2 gap-4">
            {[
              { icon: '✨', title: 'Criatividade', description: 'Gerar ideias e conteúdo' },
              { icon: '🔍', title: 'Análise', description: 'Analisar dados e textos' },
              { icon: '💡', title: 'Insights', description: 'Obter perspectivas únicas' },
              { icon: '⚡', title: 'Produtividade', description: 'Otimizar tarefas' },
            ].map((action, index) => (
              <button
                key={index}
                className="rounded-[18px] border border-app-border bg-app-panel p-4 text-left transition-all hover:-translate-y-[1px] hover:border-app-accent-border hover:bg-app-accent-soft"
              >
                <div className="text-2xl mb-2">{action.icon}</div>
                <div className="text-sm font-semibold text-app-text">{action.title}</div>
                <div className="text-xs text-app-muted">{action.description}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl">
          <div className="space-y-6">
            {messages.map((message) => (
              <ChatMessageComponent key={message.id} message={message} />
            ))}
            {loading && <LoadingIndicator />}
          </div>
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}
