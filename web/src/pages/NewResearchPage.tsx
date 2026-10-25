import { useMemo, useState } from 'react';
import { Briefcase, FolderTree, MapPinned, Sparkles } from 'lucide-react';
import Composer from '../components/Composer';

interface NewResearchPageProps {
  onSessionCreated?: (sessionId: string) => void;
}

const promptStarters = [
  {
    icon: Sparkles,
    label: 'Primeiros passos',
    prompt:
      'Se apresente: quem é você, o que é o V.tal Nexus e qual o seu contexto de suporte (módulos, dados e o que você pode me ajudar a fazer aqui).',
  },
  {
    icon: MapPinned,
    label: 'Locais',
    prompt:
      'Quero explorar um Local. Mostre os atributos de GeographicSite, Address e Location e como eles se relacionam no modelo TMF.',
  },
  {
    icon: MapPinned,
    label: 'Recursos',
    prompt:
      'Ajude-me a analisar o inventário de Recursos: quais PhysicalResource e LogicalResource existem e como estão associados?',
  },
  {
    icon: Briefcase,
    label: 'Serviços',
    prompt:
      'Quero modelar um Serviço. Explique como estruturar CFS e RFS e o vínculo com SubscriberID neste caso.',
  },
  {
    icon: FolderTree,
    label: 'Ordens',
    prompt:
      'Preciso checar a viabilidade de uma Ordem. Descreva os passos de qualificação e fulfillment para este pedido.',
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const name = localStorage.getItem('userName')?.trim().split(/\s+/)[0];
  return name ? `${period}, ${name}` : period;
}

export default function NewResearchPage({ onSessionCreated }: NewResearchPageProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const greeting = useMemo(getGreeting, []);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const sessionResponse = await fetch('/v1/research/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        // O modelo é sempre o COPILOT_MODEL do backend; o cliente não escolhe.
        body: JSON.stringify({ title: input.substring(0, 50) }),
      });

      if (!sessionResponse.ok) {
        throw new Error(`Falha ao criar conversa: ${sessionResponse.status}`);
      }

      const session = await sessionResponse.json();

      const messageResponse = await fetch(`/v1/research/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ message: input }),
      });

      if (!messageResponse.ok) {
        throw new Error(`Falha ao enviar a mensagem: ${messageResponse.status}`);
      }

      setInput('');
      onSessionCreated?.(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-app-bg px-7 py-9">
      <div className="flex w-full flex-col items-center" style={{ maxWidth: 'var(--thread-max)' }}>
        {/* Greeting */}
        <h1
          className="mb-10 animate-vt-rise text-center text-app-text [animation-delay:40ms]"
          style={{ font: 'var(--text-greeting)', letterSpacing: 'var(--tracking-snug)' }}
        >
          {greeting}
        </h1>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-4 w-full animate-vt-rise px-4 py-3 text-sm [animation-delay:80ms]"
            style={{
              background: 'var(--status-red-soft)',
              color: 'var(--status-red)',
              border: '1px solid var(--status-red-border)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            {error}
          </div>
        )}

        {/* Composer */}
        <div className="w-full animate-vt-rise [animation-delay:120ms]">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            loading={loading}
            placeholder="Pergunte sobre Locais, Recursos, Serviços, Ordens ou gere uma especificação..."
            size="hero"
            modelLabel="Nexus"
            autoFocus
          />
        </div>

        {/* Prompt starters */}
        <div className="vt-suggestions mt-10 animate-vt-rise [animation-delay:200ms]">
          {promptStarters.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => setInput(prompt)}
              className="vt-suggestion"
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
