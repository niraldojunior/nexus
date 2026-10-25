import { useEffect, useRef, useState } from 'react';
import { FolderKanban, MessageSquarePlus, Search } from 'lucide-react';
import type { Project, ProjectDeleteSummary } from '../../services/projectApi';
import type { CopilotMapAction } from '../../services/researchApi';
import type { InternalLink } from '../../components/MarkdownMessage';
import { CopilotChat, type CopilotConversation } from '../../components/copilot/CopilotChat';
import { ConversationList } from '../../components/copilot/ConversationList';
import { CopilotIcon } from '../../components/icons/CopilotIcon';
import { UnderlineTabs, type UnderlineTab } from '../../components/ui/UnderlineTabs';
import { useIsMobile } from '../../hooks/useIsMobile';
import { DOCK_WIDTH_CLASS, DOCK_SEARCH_CLEARANCE_PT_CLASS, DOCK_ELEVATION_CLASS } from './dock';
import { ProjectListView } from './ProjectListView';

export type GeoSidePanelTab = 'copilot' | 'projects';
export type CopilotPanelView = 'chat' | 'search';

const SIDE_TABS: ReadonlyArray<UnderlineTab<GeoSidePanelTab>> = [
  { id: 'copilot', label: 'Copilot', icon: <CopilotIcon className="h-5 w-5" /> },
  {
    id: 'projects',
    label: 'Projetos',
    icon: <FolderKanban className="h-4 w-4" strokeWidth={1.8} />,
  },
];

export type GeoSidePanelProps = {
  // Colapso controlado pelo pai: quando o painel de detalhe abre, GeoPage recolhe a doca
  // (uma doca, um painel por vez) sem perder o estado — quem abre e fecha é a barra de pesquisa.
  collapsed: boolean;
  tab: GeoSidePanelTab;
  onTabChange: (tab: GeoSidePanelTab) => void;
  // Estado da conversa vive no GeoPage: o chat sobrevive a trocas de conteúdo da doca.
  conversation: CopilotConversation;
  copilotView: CopilotPanelView;
  onCopilotViewChange: (view: CopilotPanelView) => void;
  onSelectSession: (sessionId: string) => void;
  onNewConversation: () => void;
  onClientAction: (action: CopilotMapAction) => void;
  onInternalLink: (link: InternalLink) => void;
  // Projetos de trabalho (REQ-MOD01-015) — a lista vive aqui, o CRUD é do GeoPage.
  projects: Project[];
  projectsLoading: boolean;
  canEdit: boolean;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => Promise<ProjectDeleteSummary>;
};

/**
 * Doca fixa à esquerda da Planta Externa: duas abas — Copilot (chat que também pilota o mapa) e
 * Projetos (coleções de trabalho, REQ-MOD01-015). A hierarquia é exclusiva da Planta Interna.
 */
export function GeoSidePanel({
  collapsed,
  tab,
  onTabChange,
  conversation,
  copilotView,
  onCopilotViewChange,
  onSelectSession,
  onNewConversation,
  onClientAction,
  onInternalLink,
  projects,
  projectsLoading,
  canEdit,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
}: GeoSidePanelProps) {
  const isMobile = useIsMobile();

  // Colapsada, a doca não deixa vestígio sobre o mapa: quem a reabre é o ícone do Copilot da
  // barra de pesquisa (ver GeoSearchBar/GeoPage).
  if (collapsed) return null;

  const searching = copilotView === 'search';

  return (
    <aside
      className={
        isMobile
          ? `hover-scroll-host absolute inset-0 z-40 flex w-full flex-col bg-white ${DOCK_SEARCH_CLEARANCE_PT_CLASS}`
          : `hover-scroll-host flex h-full ${DOCK_WIDTH_CLASS} max-w-[80vw] shrink-0 flex-col border-r border-app-border bg-white ${DOCK_SEARCH_CLEARANCE_PT_CLASS} ${DOCK_ELEVATION_CLASS} shadow-dock`
      }
    >
      <UnderlineTabs
        tabs={SIDE_TABS}
        value={tab}
        onChange={onTabChange}
        idPrefix="geo-side"
        ariaLabel="Navegação do painel lateral"
        className="border-b border-app-border"
      />

      {tab === 'copilot' ? (
        <div id="geo-side-tabpanel" role="tabpanel" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-app-border px-3 py-1.5">
            {searching || !conversation.session ? (
              <span className="truncate text-[0.8rem] font-semibold text-app-text">
                {searching ? 'Conversas' : 'Nova conversa'}
              </span>
            ) : (
              <EditableTitle
                key={conversation.session.id}
                title={conversation.session.title}
                onSave={(title) => void conversation.rename(title)}
              />
            )}
            <div className="flex items-center gap-1.5">
              <ToolbarButton
                icon={Search}
                label="Pesquisar conversas"
                active={searching}
                onClick={() => onCopilotViewChange(searching ? 'chat' : 'search')}
              />
              <ToolbarButton
                icon={MessageSquarePlus}
                label="Nova conversa"
                onClick={onNewConversation}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {searching ? (
              <ConversationList compact onSelectSession={onSelectSession} />
            ) : (
              <CopilotChat
                conversation={conversation}
                variant="panel"
                onClientAction={onClientAction}
                onInternalLink={onInternalLink}
              />
            )}
          </div>
        </div>
      ) : (
        <div
          id="geo-side-tabpanel"
          role="tabpanel"
          className="hover-scroll min-h-0 flex-1 overflow-y-auto p-3"
        >
          <ProjectListView
            projects={projects}
            loading={projectsLoading}
            canEdit={canEdit}
            onCreate={onCreateProject}
            onOpen={onOpenProject}
            onDelete={onDeleteProject}
          />
        </div>
      )}
    </aside>
  );
}

/**
 * Título da conversa editável no lugar: clique para editar, salva ao perder o foco ou com Enter;
 * Esc descarta. Título vazio volta ao anterior.
 */
function EditableTitle({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          cancelledRef.current = false;
          setDraft(title);
          setEditing(true);
        }}
        title="Clique para renomear a conversa"
        className="min-w-0 flex-1 cursor-text truncate rounded-md px-1 py-0.5 text-left text-[0.8rem] font-semibold text-app-text transition hover:bg-app-accent-soft"
      >
        {title}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      maxLength={200}
      aria-label="Título da conversa"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelledRef.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setEditing(false);
        if (cancelledRef.current) return;
        const next = draft.trim();
        if (next && next !== title) onSave(next);
      }}
      className="min-w-0 flex-1 rounded-md border border-app-accent-border bg-white px-1 py-0.5 text-[0.8rem] font-semibold text-app-text outline-none"
    />
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: typeof Search;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded-[9px] border text-app-text transition hover:border-app-accent-border hover:bg-app-accent-soft ${
        active ? 'border-app-accent-border bg-app-accent-soft' : 'border-app-border bg-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
