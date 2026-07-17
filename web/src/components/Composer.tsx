import { FormEvent, KeyboardEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
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
  autoFocus?: boolean
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  size,
  autoFocus = false
}: ComposerProps) {
  const isHero = size === 'hero'
  const textareaRef = useAutoResizeTextarea(value, isHero ? 320 : 240)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (loading || !value.trim()) return
    onSubmit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    if (loading || !value.trim()) return
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-end gap-2 rounded-[24px] border border-app-border bg-white shadow-soft transition focus-within:border-app-accent-border ${
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
  )
}
