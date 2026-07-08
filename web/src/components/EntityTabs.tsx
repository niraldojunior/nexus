import type { LucideIcon } from 'lucide-react';

type EntityTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
};

type EntityTabsProps = {
  activeId: string;
  tabs: EntityTab[];
  onChange: (tabId: string) => void;
};

export default function EntityTabs({ activeId, tabs, onChange }: EntityTabsProps) {
  return (
    <div role="tablist" aria-label="Entidades de Resource" className="flex flex-wrap gap-2">
      {tabs.map(({ id, label, icon: Icon, count }) => {
        const active = activeId === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-2 rounded-[18px] border px-4 py-3 text-[0.92rem] font-semibold transition ${
              active
                ? 'border-app-accent-border bg-app-accent-soft text-app-text shadow-soft'
                : 'border-app-border bg-white text-app-muted hover:border-app-accent-border hover:bg-app-accent-soft'
            }`}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
            <span>{label}</span>
            {typeof count === 'number' ? (
              <span className="rounded-full border border-current/15 bg-white/80 px-2 py-0.5 text-[0.75rem] font-bold">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
