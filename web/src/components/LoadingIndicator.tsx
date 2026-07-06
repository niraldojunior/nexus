export default function LoadingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-app-accent text-app-text shadow-soft">
        <span className="text-xs font-bold">N</span>
      </div>
      <div className="rounded-[18px] border border-app-accent-border bg-app-accent-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-bounce rounded-full bg-app-accent" style={{ animationDelay: '0s' }}></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-app-accent" style={{ animationDelay: '0.2s' }}></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-app-accent" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  )
}
