import ArtifactsIllustration from './ArtifactsIllustration'

interface EmptyStateProps {
  title: string
  description: string
  actionLabel: string
}

export default function EmptyState({ title, description, actionLabel }: EmptyStateProps) {
  return (
    <div className="flex min-h-[430px] flex-col items-center justify-center rounded-[24px] border border-app-border bg-white px-8 text-center shadow-soft">
      <ArtifactsIllustration className="mb-9 h-[140px] w-[160px] text-app-text" />

      <h2 className="mb-5 font-display text-[1.95rem] font-semibold tracking-[-0.02em] text-app-text">{title}</h2>
      <p className="mb-8 max-w-[620px] text-[1.06rem] leading-8 text-app-muted">{description}</p>

      <button
        type="button"
        className="rounded-[999px] border border-app-accent-border bg-app-accent px-7 py-4 text-[1.05rem] font-semibold text-app-text shadow-soft transition hover:brightness-95"
      >
        {actionLabel}
      </button>
    </div>
  )
}
