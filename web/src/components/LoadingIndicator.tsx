import NexusLoadingMark from './NexusLoadingMark';

export default function LoadingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-app-accent shadow-soft">
        <NexusLoadingMark size={20} className="h-5 w-5" />
      </div>
      <div className="rounded-[18px] border border-app-accent-border bg-app-accent-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <NexusLoadingMark size={24} />
          <span className="text-sm text-app-muted">Pensando...</span>
        </div>
      </div>
    </div>
  )
}
