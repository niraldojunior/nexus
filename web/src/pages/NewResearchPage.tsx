import { useState } from 'react';
import { Send, Loader } from 'lucide-react';

interface NewResearchPageProps {
  onSessionCreated?: (sessionId: string) => void;
}

export default function NewResearchPage({ onSessionCreated }: NewResearchPageProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          model: 'gpt-4',
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error(`Falha ao criar pesquisa: ${sessionResponse.status}`);
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
            O que deseja Pesquisar?
          </h1>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Input Box */}
        <div className="rounded-2xl border border-app-border bg-white p-2 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua pergunta..."
            rows={2}
            className="w-full resize-none bg-transparent text-app-text placeholder-app-muted outline-none text-base"
          />

          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-app-muted">
              {input.length > 0 && `${input.length} caracteres`}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || loading}
              className="inline-flex items-center justify-center rounded-full bg-app-accent w-10 h-10 text-white transition hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
