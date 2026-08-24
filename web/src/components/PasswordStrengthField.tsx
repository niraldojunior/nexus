import { useId, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Lock, Minus, Sparkles } from 'lucide-react';
import {
  checkPassword,
  generatePassword,
  passwordStrength,
  type PasswordStrength,
} from '../utils/passwordPolicy';

// Campo de senha com checklist ao vivo dos critérios de qualidade, barra de força e gerador de
// senha segura. Componente controlado, reusado no modal de redefinição e no formulário de novo
// usuário (aba Usuários de Configurações) para não haver dois padrões de senha na mesma tela.

const STRENGTH_META: Record<
  PasswordStrength,
  { label: string; bar: string; text: string; filled: number }
> = {
  fraca: { label: 'Fraca', bar: 'bg-status-red', text: 'text-status-red', filled: 1 },
  media: { label: 'Média', bar: 'bg-status-amber', text: 'text-status-amber', filled: 2 },
  forte: { label: 'Forte', bar: 'bg-status-green', text: 'text-status-green', filled: 3 },
};

export function PasswordStrengthField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'new-password',
  autoFocus = false,
  showGenerator = false,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  showGenerator?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const checks = checkPassword(value);
  const strength = passwordStrength(value);
  const meta = STRENGTH_META[strength];
  const hasValue = value.length > 0;

  const handleGenerate = () => {
    onChange(generatePassword());
    setRevealed(true);
    setCopied(false);
    inputRef.current?.focus();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível (contexto não seguro); silenciamos — a senha continua visível.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[0.78rem] font-medium text-app-muted">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-app-border bg-white px-3 focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/20">
        <Lock className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-0 flex-1 bg-transparent text-[0.92rem] text-app-text outline-none placeholder:text-app-muted"
          placeholder="••••••••••••"
        />
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-app-muted transition hover:bg-black/5"
          aria-label={revealed ? 'Ocultar senha' : 'Mostrar senha'}
          title={revealed ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {showGenerator ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-[0.8rem] font-medium text-app-text transition hover:border-app-accent-border hover:bg-app-accent-soft"
          >
            <Sparkles className="h-3.5 w-3.5" /> Gerar senha segura
          </button>
          {hasValue ? (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-[0.8rem] font-medium text-app-muted transition hover:border-app-accent-border hover:bg-app-accent-soft"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-status-green" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </>
              )}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Barra de força — três segmentos, neutros enquanto o campo está vazio. */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2].map((segment) => (
            <span
              key={segment}
              className={`h-1.5 flex-1 rounded-full ${
                hasValue && segment < meta.filled ? meta.bar : 'bg-app-border'
              }`}
            />
          ))}
        </div>
        {hasValue ? (
          <span className={`text-[0.72rem] font-semibold ${meta.text}`}>{meta.label}</span>
        ) : null}
      </div>

      {/* Checklist ao vivo dos critérios. */}
      <ul aria-live="polite" className="flex flex-col gap-1">
        {checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 text-[0.78rem]">
            {check.met ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-status-green" aria-hidden="true" />
            ) : (
              <Minus className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden="true" />
            )}
            <span className={check.met ? 'text-app-text' : 'text-app-muted'}>{check.label}</span>
            <span className="sr-only">{check.met ? 'atendido' : 'não atendido'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
