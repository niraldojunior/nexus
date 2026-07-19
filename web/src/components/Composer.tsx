import { FormEvent, KeyboardEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea'
import NexusLoadingMark from './NexusLoadingMark'

interface ComposerModelOption {
  value: string
  label: string
}

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  placeholder: string
  size: 'hero' | 'compact'
  modelLabel: string
  qualityLabel: string
  autoFocus?: boolean
  /** When provided together with `onModelChange`, the model badge becomes a real dropdown. */
  models?: ComposerModelOption[]
  onModelChange?: (value: string) => void
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
  onModelChange
}: ComposerProps) {
  const isHero = size === 'hero'
  const textareaRef = useAutoResizeTextarea(value, isHero ? 320 : 240)
  const isModelSelectable = Boolean(models && models.length > 0 && onModelChange)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (loading || !value.trim()) return
    onSubmit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return

    event.preventDefault()
    if (loading || !value.trim()) return
    onSubmit()
  }

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className={`flex items-end gap-2 rounded-[24px] border border-app-border bg-white shadow-soft transition focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/15 ${
          isHero ? 'px-4 py-2.5' : 'px-4 py-2'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          autoFocus={autoFocus}
          className={`flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-app-text placeholder:text-app-muted focus:outline-none focus:ring-0 ${
            isHero
              ? 'min-h-[28px] max-h-[320px] overflow-y-auto text-[1.05rem] leading-[1.5]'
              : 'min-h-[26px] max-h-[240px] overflow-y-auto text-[0.98rem] leading-[1.5]'
          }`}
        />

        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="mb-0.5 shrink-0 rounded-xl bg-app-accent p-2 text-app-text shadow-soft transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Enviar"
        >
          {loading ? (
            <NexusLoadingMark size={18} className="h-[18px] w-[18px]" />
          ) : (
            <SendHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} />
          )}
        </button>
      </form>

      <div className={`flex items-center gap-2 px-2 pt-2 text-[0.78rem] text-app-muted ${isHero ? 'justify-center' : ''}`}>
        {isModelSelectable ? (
          <select
            value={modelLabel}
            onChange={(event) => onModelChange?.(event.target.value)}
            disabled={loading}
            aria-label="Modelo"
            className="rounded-full border border-app-border bg-transparent px-2.5 py-1 text-app-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {models!.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-full border border-app-border px-2.5 py-1">{modelLabel}</span>
        )}
        <span className="rounded-full border border-app-border px-2.5 py-1">{qualityLabel}</span>
      </div>
    </div>
  )
}
