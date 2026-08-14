import { RefreshCw, Settings } from 'lucide-react';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { GeoProject } from '../../services/geoProjectApi';
import type { GeoTree } from '../../hooks/useGeoTree';
import { useIsMobile } from '../../hooks/useIsMobile';
import { DOCK_WIDTH_CLASS, DOCK_SEARCH_CLEARANCE_PT_CLASS, DOCK_ELEVATION_CLASS } from './dock';
import { HierarchyTreeView } from './HierarchyTreeView';
import { ProjectListView } from './ProjectListView';

export type HierarchySidebarTab = 'hierarchy' | 'projects';

export type HierarchySidebarProps = {
  tree: GeoTree;
  selectedNodeId: string | null;
  onSelect: (node: GeoTreeNode) => void;
  onOpenTypes: () => void;
  onHover?: (node: GeoTreeNode | null) => void;
  // Colapso controlado pelo pai: quando o painel de detalhe abre, GeoPage recolhe
  // a hierarquia para dar lugar a ele (uma doca, um painel por vez) sem perder o
  // estado anterior — fechar o detalhe restaura este valor tal como estava. Quem
  // abre e fecha a hierarquia é a barra de pesquisa (ver GeoSearchBar/GeoPage); no
  // mobile, o clique no scrim e a seleção também fecham.
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  // Aba ativa (Hierarquia | Projetos), hoisted para o GeoPage: reabrir a doca depois de
  // fechar um painel de projeto precisa lembrar que a aba Projetos estava selecionada.
  tab: HierarchySidebarTab;
  onTabChange: (tab: HierarchySidebarTab) => void;
  // Projetos de trabalho (REQ-MOD01-015) — a lista vive aqui, o CRUD é do GeoPage
  // (useGeoProjects), que também alimenta o painel de detalhe do projeto.
  projects: GeoProject[];
  projectsLoading: boolean;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
};

/**
 * Sidebar fixa à esquerda para a página Locais, no espírito do painel "Salvos" do Google
 * Maps: duas abas — Hierarquia (árvore de navegação do inventário) e Projetos (coleções de
 * trabalho, REQ-MOD01-015). Persistente e colapsável; dirige a seleção no mapa.
 */
export function HierarchySidebar({
  tree,
  selectedNodeId,
  onSelect,
  onOpenTypes,
  onHover,
  collapsed,
  onCollapsedChange,
  tab,
  onTabChange,
  projects,
  projectsLoading,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
}: HierarchySidebarProps) {
  const isMobile = useIsMobile();

  // No mobile o painel fecha assim que um nó é selecionado (mesmo padrão de
  // drawer sobreposto usado na barra lateral global do app).
  const handleSelect = (node: GeoTreeNode) => {
    onSelect(node);
    if (isMobile) onCollapsedChange(true);
  };

  // Colapsada, a hierarquia não deixa nenhum vestígio sobre o mapa: quem a reabre é o
  // ListTree da barra de pesquisa (ver GeoSearchBar/GeoPage). Antes havia um trilho
  // vertical no desktop e um botão flutuante no mobile — ambos removidos.
  if (collapsed) return null;

  return (
    <aside
      className={
        isMobile
          ? // No mobile o painel cobre a página inteira, com fundo branco: a barra de
            // pesquisa fica sobreposta em z-50, e o pt reserva o espaço dela para o
            // conteúdo (as abas) nascer logo abaixo — a faixa sob a barra é branca do
            // painel, não transparência sobre o mapa. Como cobre tudo, não há scrim nem
            // "fora" para clicar: fechar é o X da barra ou selecionar um nó.
            `hover-scroll-host absolute inset-0 z-40 flex w-full flex-col bg-white ${DOCK_SEARCH_CLEARANCE_PT_CLASS}`
          : // No desktop a barra flutua sobre o topo da doca; o pt reserva o espaço dela
            // para as abas nascerem logo abaixo, sem linha divisória entre os dois.
            `hover-scroll-host flex h-full ${DOCK_WIDTH_CLASS} max-w-[80vw] shrink-0 flex-col border-r border-app-border bg-white ${DOCK_SEARCH_CLEARANCE_PT_CLASS} ${DOCK_ELEVATION_CLASS} shadow-dock`
      }
    >
      {/* Abas de topo — Hierarquia é o inventário, Projetos são recortes de trabalho. */}
      <div className="flex border-b border-app-border" role="tablist">
        <SidebarTabButton
          active={tab === 'hierarchy'}
          label="Hierarquia"
          onClick={() => onTabChange('hierarchy')}
        />
        <SidebarTabButton
          active={tab === 'projects'}
          label="Projetos"
          onClick={() => onTabChange('projects')}
        />
      </div>

      {tab === 'hierarchy' ? (
        <div className="flex items-center justify-end gap-1.5 border-b border-app-border px-3 py-1.5">
          <SidebarIconButton
            icon={RefreshCw}
            label="Atualizar"
            onClick={tree.reload}
            spinning={tree.loading}
          />
          <SidebarIconButton icon={Settings} label="Tipos de local" onClick={onOpenTypes} />
        </div>
      ) : null}

      {/* Corpo */}
      <div className="hover-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'hierarchy' ? (
          <>
            {tree.error ? (
              <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[0.82rem] text-red-700">
                {tree.error}
              </div>
            ) : null}
            {tree.loading && !tree.rows.length ? (
              <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
                Carregando hierarquia…
              </div>
            ) : (
              <HierarchyTreeView
                rows={tree.rows}
                selectedNodeId={selectedNodeId}
                onSelect={handleSelect}
                onToggle={tree.toggle}
                onLoadMore={tree.loadMore}
                onHover={onHover}
              />
            )}
          </>
        ) : (
          <ProjectListView
            projects={projects}
            loading={projectsLoading}
            onCreate={onCreateProject}
            onOpen={onOpenProject}
            onDelete={onDeleteProject}
          />
        )}
      </div>
    </aside>
  );
}

function SidebarTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 border-b-2 px-3 py-2.5 text-[0.86rem] font-semibold transition ${
        active
          ? 'border-app-accent text-app-text'
          : 'border-transparent text-app-muted hover:text-app-text'
      }`}
    >
      {label}
    </button>
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
