import { Map, List, GitBranch, Layers2 } from 'lucide-react';

export type TabId = 'map' | 'list' | 'hierarchy' | 'catalog';

export type TabSelectorProps = {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
};

const TABS: Array<{ id: TabId; label: string; icon: typeof Map }> = [
  { id: 'map', label: 'Mapa', icon: Map },
  { id: 'list', label: 'Lista', icon: List },
  { id: 'hierarchy', label: 'Hierarquia', icon: GitBranch },
  { id: 'catalog', label: 'Catálogo', icon: Layers2 },
];

/**
 * Seletor de abas para GeoPage.
 * Mostra: Mapa, Lista, Hierarquia, Catálogo
 */
export function TabSelector({ currentTab, onTabChange }: TabSelectorProps) {
  return (
    <div className="flex items-center gap-1 border-b border-app-border bg-white px-6 py-2">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className={`flex items-center gap-2 rounded-[12px] px-3 py-2 text-[0.88rem] font-semibold transition ${
            currentTab === id
              ? 'bg-app-accent text-app-text'
              : 'bg-transparent text-app-muted hover:bg-app-accent-soft hover:text-app-text'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
