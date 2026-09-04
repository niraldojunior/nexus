import { FormEvent, KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';
import NexusLoadingMark from './NexusLoadingMark';

interface ComposerModelOption {
  value: string;
  label: string;
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  placeholder: string;
  size: 'hero' | 'compact';
  modelLabel: string;
  qualityLabel: string;
  autoFocus?: boolean;
  /** When provided together with `onModelChange`, the model badge becomes a real dropdown. */
  models?: ComposerModelOption[];
  onModelChange?: (value: string) => void;
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  size,
  modelLabel,
  qualityLabel,
  autoFocus = false,
  models,
  onModelChange,
}: ComposerProps) {
  const isHero = size === 'hero';
  const textareaRef = useAutoResizeTextarea(value, isHero ? 320 : 240);
  const isModelSelectable = Boolean(models && models.length > 0 && onModelChange);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (loading || !value.trim()) return;
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    event.preventDefault();
    if (loading || !value.trim()) return;
    onSubmit();
  };

  return (
    <div className="w-full" style={{ maxWidth: 'var(--thread-max)' }}>
      <form
        onSubmit={handleSubmit}
        className={`vt-composer ${isHero ? 'vt-composer-hero' : ''}`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          autoFocus={autoFocus}
          className={
            isHero
              ? 'min-h-[28px] max-h-[320px] overflow-y-auto'
              : 'min-h-[26px] max-h-[240px] overflow-y-auto'
          }
        />

        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="vt-send"
          aria-label="Enviar"
        >
          {loading ? (
            <NexusLoadingMark size={18} className="h-[18px] w-[18px]" />
          ) : (
            <SendHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} />
          )}
        </button>
      </form>

      <div
        className={`flex items-center gap-2 pt-4 text-[0.78rem] text-app-muted ${
          isHero ? 'justify-center' : 'justify-start'
        }`}
      >
        {isModelSelectable ? (
          <select
            value={modelLabel}
            onChange={(event) => onModelChange?.(event.target.value)}
            disabled={loading}
            aria-label="Modelo"
            style={{
              height: 30,
              padding: '0 8px',
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              font: 'var(--text-label)',
              color: 'var(--text-primary)',
            }}
            className="outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {models!.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        ) : (
          <span
            style={{
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 10px',
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              font: 'var(--text-label)',
              color: 'var(--text-secondary)',
            }}
          >
            {modelLabel}
          </span>
        )}
        <span
          style={{
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 10px',
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            font: 'var(--text-label)',
            color: 'var(--text-secondary)',
          }}
        >
          {qualityLabel}
        </span>
      </div>
    </div>
  );
}
