import { useState } from 'react';
import { Send, Loader } from 'lucide-react';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';

interface NewResearchPageProps {
  onSessionCreated?: (sessionId: string) => void;
}

export default function NewResearchPage({ onSessionCreated }: NewResearchPageProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useAutoResizeTextarea(input, 260);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const sessionResponse = await fetch('/v1/research/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({
          title: input.substring(0, 50),
          model: 'gpt-4o-mini',
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error(`Falha ao criar conversa: ${sessionResponse.status}`);
      }

      const session = await sessionResponse.json();

      await fetch(`/v1/research/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ message: input }),
      });

      setInput('');
      onSessionCreated?.(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-7 py-9">
      <div className="w-full max-w-[640px]">
        {/* Greeting / Title */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-app-text">
            Por onde Começamos?
          </h1>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Input Box */}
        <div className="group relative isolate">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 -z-10 rounded-[42px] bg-[radial-gradient(circle_at_center,rgba(255,210,0,0.26),rgba(255,248,218,0.16)_38%,transparent_78%)] opacity-75 blur-[72px] transition-opacity duration-300 group-focus-within:opacity-100"
          />
          <div className="relative z-10 rounded-2xl border border-app-border bg-white px-4 pb-4 pl-4 pr-16 pt-4 shadow-[0_14px_32px_rgba(15,23,42,0.08),0_0_0_1px_rgba(242,211,90,0.18),0_0_36px_rgba(255,210,0,0.12)] transition-shadow duration-300 focus-within:border-app-accent-border focus-within:shadow-[0_20px_52px_rgba(15,23,42,0.10),0_0_0_1px_rgba(242,211,90,0.32),0_0_64px_rgba(255,210,0,0.18),0_0_180px_rgba(255,248,218,0.40)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua pergunta..."
              rows={1}
              className="w-full min-h-[44px] max-h-[260px] resize-none overflow-y-auto bg-transparent text-[1.05rem] leading-7 text-app-text placeholder-app-muted outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || loading}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-app-accent text-white transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
