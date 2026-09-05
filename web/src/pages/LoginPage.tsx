import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail, ShieldCheck } from 'lucide-react';
import NexusMark from '../components/NexusMark';
import { login } from '../services/authApi';
import { setSession } from '../services/session';

/**
 * Tela de acesso à plataforma. Convertida do protótipo do UI kit
 * (docs/4-design-system/ui_kits/nexus/Login.jsx) para Tailwind + tokens do design system.
 * Sem SSO (o kit é mock) e sem "esqueci minha senha" (não há SMTP no projeto) — a
 * redefinição é feita por um admin na tela de Usuários.
 */
export default function LoginPage({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      setSession({ token: result.token, user: result.user });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid h-screen grid-cols-1 bg-app-panel md:grid-cols-2">
      {/* Painel de marca — some no mobile para a tela virar só o formulário. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-app-ink p-12 text-app-on-ink md:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffd200 1.2px, transparent 1.2px)',
            backgroundSize: '26px 26px',
          }}
        />
        <div className="relative flex items-center gap-3.5">
          {/* Cubo claro (ink branco) para contrastar com o painel escuro (app-ink). */}
          <NexusMark ink="#ffffff" className="h-[2.9rem] w-[2.9rem]" />
          <span className="font-display text-[2rem] font-semibold tracking-[-0.01em]">Nexus</span>
        </div>
        <div className="relative">
          <h1 className="font-display text-[2rem] font-extrabold leading-[1.15] tracking-[-0.02em] text-white">
            Inteligência de rede de <span className="text-app-accent">nova geração</span>.
          </h1>
          <p className="mt-4 max-w-md text-[0.9rem] leading-relaxed text-app-on-ink-muted">
            Inventário Convergente - Locais, Infraestrutura Cívil, Recursos Lógicos e Físicos,
            habilitando seu negócio a uma gestão inteligente agnóstica a indústria.
          </p>
          <div className="mt-6 flex gap-2.5">
            {['TM Forum', 'API-first', 'Escala nacional'].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[0.72rem] font-semibold text-app-on-ink-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="relative text-[0.72rem] text-white/35">
          Holding V.tal · Tecto · nio internet
        </div>
      </div>

      {/* Painel do formulário */}
      <div className="flex items-center justify-center bg-app-panel p-8 md:p-12">
        <div className="w-full max-w-[360px]">
          {/* No mobile a marca é o único cabeçalho do formulário — por isso vem maior. */}
          <div className="mb-8 flex items-center gap-3 md:hidden">
            {/* No painel branco (mobile), o cubo escuro (padrão) é que contrasta. */}
            <NexusMark className="h-[3.4rem] w-[3.4rem]" />
            <span className="font-display text-[2.1rem] font-semibold tracking-[-0.01em] text-app-text">
              Nexus
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.78rem] font-medium text-app-muted">E-mail funcional</span>
              <span className="flex items-center gap-2 rounded-xl border border-app-border bg-white px-3 focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/20">
                <Mail className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 min-w-0 flex-1 bg-transparent text-[0.92rem] text-app-text outline-none placeholder:text-app-muted"
                  placeholder="voce@vtal.com"
                  required
                />
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.78rem] font-medium text-app-muted">Senha</span>
              <span className="flex items-center gap-2 rounded-xl border border-app-border bg-white px-3 focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/20">
                <Lock className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 min-w-0 flex-1 bg-transparent text-[0.92rem] text-app-text outline-none placeholder:text-app-muted"
                  placeholder="••••••••••••"
                  required
                />
              </span>
            </label>

            {error ? (
              <p role="alert" className="text-[0.82rem] leading-snug text-red-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl border border-app-accent-border bg-app-accent text-[0.92rem] font-semibold text-app-text shadow-soft transition hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'Entrando...' : 'Entrar'}
              {loading ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 border-t border-app-border pt-5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            <span className="text-[0.74rem] text-app-muted">Conexão segura · V.tal Nexus</span>
          </div>
        </div>
      </div>
    </div>
  );
}
