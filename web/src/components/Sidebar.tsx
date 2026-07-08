import {
  Briefcase,
  Boxes,
  FolderTree,
  type LucideIcon,
  MapPinned,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
} from 'lucide-react';
import { PageId, RecentGroup, RecentItem } from '../types';
import { ResearchHistoryPage } from '../pages/ResearchHistoryPage';

type PrimaryItemId = 'conversations' | 'research' | 'geo' | 'resource' | 'service' | 'order';

interface SidebarProps {
  collapsed: boolean;
  currentPage: PageId;
  activeRecentConversationId: string | null;
  activeResearchSessionId: string | null;
  settingsOpen: boolean;
  recentItems: RecentItem[];
  recentGroup: RecentGroup;
  onGroupChange: (group: RecentGroup) => void;
  onToggleCollapse: () => void;
  onNewConversation: () => void;
  onNewResearch: () => void;
  onSelectPage: (page: PageId | 'settings') => void;
  onOpenRecentItem: (conversationId: string) => void;
  onSelectResearchSession?: (sessionId: string) => void;
  researchSessionRefreshTrigger?: number;
}

const primaryItems: Array<{ id: PrimaryItemId; label: string; icon: LucideIcon }> = [
  { id: 'research', label: 'Nova Conversa', icon: Plus },
  { id: 'conversations', label: 'Conversas', icon: MessagesSquare },
  { id: 'geo', label: 'Locais', icon: MapPinned },
  { id: 'resource', label: 'Recursos', icon: Boxes },
  { id: 'service', label: 'Serviços', icon: Briefcase },
  { id: 'order', label: 'Ordens', icon: FolderTree },
];

export default function Sidebar({
  collapsed,
  currentPage,
  activeResearchSessionId,
  settingsOpen,
  onToggleCollapse,
  onNewResearch,
  onSelectPage,
  onSelectResearchSession,
  researchSessionRefreshTrigger,
}: SidebarProps) {
  return (
    <aside
      className={`flex flex-col overflow-hidden border-r border-app-border bg-app-sidebar shadow-soft transition-[width,min-width] duration-300 ease-in-out ${
        collapsed ? 'w-[50px] min-w-[50px]' : 'w-[256px] min-w-[256px]'
      }`}
    >
      <div
        className={`flex min-h-[53px] items-center pb-3 pt-3 ${
          collapsed ? 'justify-center px-0' : 'pl-4 pr-[15px]'
        }`}
      >
        <button
          type="button"
          className={`overflow-hidden whitespace-nowrap font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-app-text transition-all duration-200 ease-in-out ${
            collapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[140px] opacity-100'
          }`}
        >
          Nexus
        </button>
        <div className={`${collapsed ? 'flex items-center' : 'ml-auto flex items-center'}`}>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-xl border border-transparent p-0 text-app-text transition hover:bg-app-accent-soft"
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.8} />
            ) : (
              <PanelLeftClose className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>

      <div className="px-0">
        <nav className="space-y-0.6">
          {primaryItems.map(({ id, label, icon: Icon }) => {
            const isActive =
              (id === 'research' && currentPage === 'research' && activeResearchSessionId === null) ||
              (id === 'conversations' && (currentPage === 'conversas' || currentPage === 'conversation')) ||
              ((id === 'geo' || id === 'resource' || id === 'service' || id === 'order') &&
                currentPage === id);

            return (
              <NavItem
                key={id}
                active={isActive}
                icon={Icon}
                label={label}
                onClick={() => {
                  if (id === 'research') {
                    onNewResearch();
                    return;
                  }
                  if (id === 'conversations') {
                    onSelectPage('conversas');
                    return;
                  }
                  onSelectPage(id);
                }}
                collapsed={collapsed}
              />
            );
          })}
        </nav>
      </div>

      <div
        className={`relative min-h-0 flex-1 overflow-hidden ${collapsed ? 'pointer-events-none' : ''}`}
      >
        <div
          className={`h-full transition-opacity duration-150 ${collapsed ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="flex items-center justify-between pl-4 pr-[15px] pb-2 pt-2">
            <span className="text-[0.8rem] font-medium text-app-muted">
              Conversas recentes
            </span>
          </div>

          <div className="h-full overflow-y-auto px-3 pb-2">
            <ResearchHistoryPage
              activeSessionId={activeResearchSessionId}
              refreshTrigger={researchSessionRefreshTrigger}
              onSessionSelected={(sessionId) => {
                onSelectResearchSession?.(sessionId);
              }}
            />
          </div>
        </div>
      </div>

      <div
        className={`flex min-h-[56px] border-t border-app-border pl-[15px] pr-[15px] ${
          collapsed ? 'items-center justify-center' : 'items-center gap-4'
        }`}
      >
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-app-accent text-app-text">
          <span className="text-[1.12rem] font-medium">N</span>
        </div>
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.96rem] font-semibold leading-[1.1] text-app-text">
                Niraldo R.
              </div>
              <div className="text-[0.84rem] leading-[1.1] text-app-muted">Operações de Rede</div>
            </div>
            <button
              type="button"
              onClick={() => onSelectPage('settings')}
              className={`rounded-xl border border-transparent p-1.5 transition ${
                settingsOpen
                  ? 'border-[#E6C54D] bg-[#F6E8A8] text-app-text'
                  : 'text-app-muted hover:bg-app-accent-soft hover:text-app-text'
              }`}
              aria-label="Configurações"
            >
              <Settings className="h-[1rem] w-[1rem]" strokeWidth={1.8} />
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function NavItem({
  active,
  icon: Icon,
  label,
  onClick,
  collapsed = false,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`menu-item-nav flex w-full items-center text-left transition ${
        collapsed
          ? 'h-[32px] justify-center px-0'
          : 'h-[32px] rounded-[14px] px-[15px] gap-4 border'
      } ${
        collapsed
          ? 'text-app-text'
          : active
            ? 'border-[#E6C54D] bg-[#F6E8A8] text-app-text'
            : 'border-transparent text-app-text hover:bg-app-accent-soft'
      }`}
    >
      {collapsed ? (
        <span
          className={`flex h-[31px] w-[31px] items-center justify-center rounded-full transition ${
            active
              ? 'border border-[#E6C54D] bg-[#F6E8A8]'
              : 'border border-transparent hover:bg-app-accent-soft'
          }`}
        >
          <Icon className="menu-item-icon h-[1.14rem] w-[1.14rem]" strokeWidth={1.8} />
        </span>
      ) : (
        <Icon className="menu-item-icon h-[1.18rem] w-[1.18rem]" strokeWidth={1.8} />
      )}
      <span
        className={`overflow-hidden whitespace-nowrap text-[0.94rem] transition-all duration-200 ease-in-out ${
          active ? 'font-semibold' : 'font-normal'
        } ${
          collapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
