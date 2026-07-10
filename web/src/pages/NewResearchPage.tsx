import { useMemo, useState } from 'react';
import { FileText, Layers3, MapPinned, Workflow, Zap } from 'lucide-react';
import Composer from '../components/Composer';

interface NewResearchPageProps {
  onSessionCreated?: (sessionId: string) => void;
}

const promptStarters = [
  {
    icon: MapPinned,
    label: 'Locais',
    prompt:
      'Quero explorar um Local. Mostre os atributos de GeographicSite, Address e Location e como eles se relacionam no modelo TMF.',
  },
  {
    icon: Layers3,
    label: 'Recursos',
    prompt:
      'Ajude-me a analisar o inventário de Recursos: quais PhysicalResource e LogicalResource existem e como estão associados?',
  },
  {
    icon: Workflow,
    label: 'Serviços',
    prompt:
      'Quero modelar um Serviço. Explique como estruturar CFS e RFS e o vínculo com SubscriberID neste caso.',
  },
  {
    icon: Zap,
    label: 'Ordens',
    prompt:
      'Preciso checar a viabilidade de uma Ordem. Descreva os passos de qualificação e fulfillment para este pedido.',
  },
  {
    icon: FileText,
    label: 'Especificação TMF',
    prompt:
      'Gere uma especificação TMF-first para o seguinte cenário, preservando interoperabilidade ODA:',
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

  return (
    <div className="relative flex min-h-screen items-center justify-center px-7 py-9">
      <div className="w-full max-w-[680px]">
        {/* Greeting */}
        <h1 className="mb-7 animate-vt-rise text-center font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-app-text [animation-delay:40ms]">
          {greeting}
        </h1>

        {/* Error */}
        {error && (
          <div className="mb-4 animate-vt-rise rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Composer */}
        <div className="animate-vt-rise [animation-delay:120ms]">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            loading={loading}
            placeholder="Pergunte sobre Locais, Recursos, Serviços, Ordens ou gere uma especificação..."
            size="hero"
            modelLabel="Nexus"
            qualityLabel="TMF-first"
            autoFocus
          />
        </div>

        {/* Prompt starters */}
        <div className="mt-4 flex animate-vt-rise flex-wrap items-center justify-center gap-2 [animation-delay:200ms]">
          {promptStarters.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => setInput(prompt)}
              className="flex items-center gap-2 rounded-full border border-app-border bg-transparent px-3.5 py-1.5 text-[0.9rem] text-app-muted transition hover:border-app-accent-border hover:text-app-text"
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
