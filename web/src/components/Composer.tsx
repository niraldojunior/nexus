import { FormEvent } from 'react'
import { ChevronDown, Mic, Plus, SendHorizontal, Trash2, Waves } from 'lucide-react'
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea'
import NexusLoadingMark from './NexusLoadingMark'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  placeholder: string
  size: 'hero' | 'compact'
  modelLabel: string
  qualityLabel: string
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  size,
  modelLabel,
  qualityLabel
}: ComposerProps) {
  const isHero = size === 'hero'
  const textareaRef = useAutoResizeTextarea(value, isHero ? 320 : 240)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-[28px] border border-app-border bg-white shadow-soft ${
        isHero ? 'px-8 pb-6 pt-7' : 'px-7 pb-4 pt-5'
      }`}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={1}
        className={`w-full resize-none border-0 bg-transparent p-0 text-app-text placeholder:text-app-muted focus:outline-none focus:ring-0 ${
          isHero
            ? 'min-h-[130px] max-h-[320px] overflow-y-auto text-[1.15rem] leading-[1.6]'
            : 'min-h-[72px] max-h-[240px] overflow-y-auto text-[0.98rem] leading-[1.55]'
        }`}
      />

      <div className="mt-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-2xl border border-transparent p-2 text-app-text transition hover:border-app-border hover:bg-app-accent-soft"
            aria-label="Adicionar"
          >
            <Plus className="h-6 w-6" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="rounded-[18px] border border-app-accent-border bg-app-accent-soft p-3 text-app-text transition hover:bg-app-card"
            aria-label="Anexos"
          >
            <Trash2 className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex items-center gap-4 text-app-text">
          <div className="rounded-[999px] border border-app-border bg-app-panel px-3 py-1.5">
            <div className="flex items-center gap-2 text-[0.92rem]">
              <span className="font-semibold">{modelLabel}</span>
              <span className="text-app-muted">{qualityLabel}</span>
              <ChevronDown className="h-4 w-4 text-app-muted" strokeWidth={1.8} />
            </div>
          </div>
          <button type="button" className="transition hover:text-app-muted" aria-label="Microfone">
            <Mic className="h-6 w-6" strokeWidth={1.8} />
          </button>
          <button type="button" className="transition hover:text-app-muted" aria-label="Audio">
            <Waves className="h-6 w-6" strokeWidth={1.8} />
          </button>
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="rounded-[18px] border border-app-accent-border bg-app-accent p-2.5 text-app-text shadow-soft transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Enviar"
          >
            {loading ? (
              <NexusLoadingMark size={20} className="h-5 w-5" />
            ) : (
              <SendHorizontal className="h-5 w-5" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
