import { useMemo, useState } from 'react';
import { GitBranch, ListTree, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings } from 'lucide-react';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { GeoTree } from '../../hooks/useGeoTree';
import { HierarchyTreeView } from './HierarchyTreeView';
import { HierarchyComboView } from './HierarchyComboView';

export type HierarchySidebarProps = {
  tree: GeoTree;
  selectedNodeId: string | null;
  onSelect: (node: GeoTreeNode) => void;
  onOpenTypes: () => void;
};

type HierView = 'tree' | 'combos';

/**
 * Sidebar fixa à esquerda para navegar a hierarquia de Locais no estilo Netwin.
 * Duas abas internas: Árvore e Combos. Persistente e colapsável; dirige a
 * seleção no mapa.
 */
export function HierarchySidebar({ tree, selectedNodeId, onSelect, onOpenTypes }: HierarchySidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<HierView>('tree');

  // As raízes da cascata de combos são as mesmas UFs da árvore.
  const rootNodes = useMemo(
    () => tree.rows.filter((row) => row.depth === 0).map((row) => row.node),
    [tree.rows],
  );

  if (collapsed) {
    return (
      <div className="flex h-full w-11 shrink-0 flex-col items-center gap-2 border-r border-app-border bg-white py-3">
        <SidebarIconButton icon={PanelLeftOpen} label="Abrir hierarquia" onClick={() => setCollapsed(false)} />
        <span className="mt-1 [writing-mode:vertical-rl] text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-app-muted">
          Hierarquia
        </span>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[340px] max-w-[80vw] shrink-0 flex-col border-r border-app-border bg-white">
      {/* Header — título + toggle de visão + ações, tudo em uma linha */}
      <div className="flex items-center justify-between gap-2 border-b border-app-border px-3 py-2">
        <h2 className="font-display text-[0.98rem] font-semibold text-app-text">Hierarquia</h2>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-[8px] border border-app-border p-0.5">
            <ViewToggleButton active={view === 'tree'} icon={ListTree} label="Árvore" onClick={() => setView('tree')} />
            <ViewToggleButton active={view === 'combos'} icon={GitBranch} label="Combos" onClick={() => setView('combos')} />
          </div>
          <SidebarIconButton icon={RefreshCw} label="Atualizar" onClick={tree.reload} spinning={tree.loading} />
          <SidebarIconButton icon={Settings} label="Tipos de local" onClick={onOpenTypes} />
          <SidebarIconButton icon={PanelLeftClose} label="Recolher" onClick={() => setCollapsed(true)} />
        </div>
      </div>

      {/* Corpo */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tree.error ? (
          <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[0.82rem] text-red-700">
            {tree.error}
          </div>
        ) : null}
        {tree.loading && !tree.rows.length ? (
          <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
            Carregando hierarquia…
          </div>
        ) : view === 'tree' ? (
          <HierarchyTreeView
            rows={tree.rows}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            onToggle={tree.toggle}
            onLoadMore={tree.loadMore}
          />
        ) : (
          <HierarchyComboView
            rootNodes={rootNodes}
            childrenOf={tree.childrenOf}
            ensureChildren={tree.ensureChildren}
            onSelect={onSelect}
          />
        )}
      </div>
    </aside>
  );
}

function SidebarIconButton({
  icon: Icon,
  label,
  onClick,
  spinning = false,
}: {
  icon: typeof RefreshCw;
  label: string;
  onClick: () => void;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-app-border bg-white text-app-text transition hover:border-app-accent-border hover:bg-app-accent-soft"
    >
      <Icon className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} />
    </button>
  );
}

function ViewToggleButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof GitBranch;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-6 w-6 items-center justify-center rounded-[6px] transition ${
        active ? 'bg-app-accent text-app-text' : 'text-app-muted hover:bg-app-accent-soft hover:text-app-text'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
