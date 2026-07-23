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
import { RESOURCE_CATEGORY_DEFAULTS } from '../data/resourceCatalogDefaults';
import { groupResourceCategories, sidebarCategoryLabel } from '../data/resourceCategoryViews';
import { SERVICE_CATEGORY_DEFAULTS } from '../data/serviceCatalogDefaults';
import { listServiceCategories } from '../data/serviceCategoryViews';
import Diamond from './Diamond';

type PrimaryItemId = 'conversations' | 'research' | 'geo' | 'resource' | 'service' | 'order';

/** Item de submenu de categoria — a forma comum entre Resource e Service. */
type CategoryMenuItem = { code: string; label: string };

interface SidebarProps {
  collapsed: boolean;
  isMobile?: boolean;
  currentPage: PageId;
  activeRecentConversationId: string | null;
  activeResearchSessionId: string | null;
  activeResourceCategory: string;
  resourceMenuOpen: boolean;
  activeServiceCategory: string;
  serviceMenuOpen: boolean;
  settingsOpen: boolean;
  recentItems: RecentItem[];
  recentGroup: RecentGroup;
  onGroupChange: (group: RecentGroup) => void;
  onToggleCollapse: () => void;
  onNewConversation: () => void;
  onNewResearch: () => void;
  onSelectPage: (page: PageId | 'settings') => void;
  onToggleResourceMenu: () => void;
  onSelectResourceCategory: (categoryCode: string) => void;
  onToggleServiceMenu: () => void;
  onSelectServiceCategory: (categoryCode: string) => void;
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

const resourceCategoryItems: CategoryMenuItem[] = groupResourceCategories(RESOURCE_CATEGORY_DEFAULTS)
  .flatMap((group) => group.categories)
  .map((category) => ({ code: category.code, label: sidebarCategoryLabel(category) }));

const serviceCategoryItems: CategoryMenuItem[] = listServiceCategories(SERVICE_CATEGORY_DEFAULTS).map(
  (category) => ({ code: category.code, label: category.name }),
);

export default function Sidebar({
  collapsed,
  isMobile = false,
  currentPage,
  activeResearchSessionId,
  activeResourceCategory,
  resourceMenuOpen,
  activeServiceCategory,
  serviceMenuOpen,
  settingsOpen,
  onToggleCollapse,
  onNewResearch,
  onSelectPage,
  onToggleResourceMenu,
  onSelectResourceCategory,
  onToggleServiceMenu,
  onSelectServiceCategory,
  onSelectResearchSession,
  researchSessionRefreshTrigger,
}: SidebarProps) {
  // Os módulos com submenu de categoria compartilham a mesma mecânica; só variam os dados.
  const categoryMenus: Partial<
    Record<
      PrimaryItemId,
      {
        items: CategoryMenuItem[];
        open: boolean;
        activeCode: string;
        onToggle: () => void;
        onSelect: (code: string) => void;
      }
    >
  > = {
    resource: {
      items: resourceCategoryItems,
      open: resourceMenuOpen,
      activeCode: activeResourceCategory,
      onToggle: onToggleResourceMenu,
      onSelect: onSelectResourceCategory,
    },
    service: {
      items: serviceCategoryItems,
      open: serviceMenuOpen,
      activeCode: activeServiceCategory,
      onToggle: onToggleServiceMenu,
      onSelect: onSelectServiceCategory,
    },
  };

  // No mobile a sidebar é um drawer sobreposto (sempre com conteúdo completo);
  // no desktop ela recolhe para um rail fino de ícones. `contentCollapsed` só
  // é verdadeiro no caso do rail — o drawer mobile nunca esconde os rótulos.
  const contentCollapsed = !isMobile && collapsed;
  const closeMobileDrawer = () => {
    if (isMobile) onToggleCollapse();
  };

  return (
    <>
      {isMobile && collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="fixed left-3 top-3 z-[60] flex h-10 w-10 items-center justify-center rounded-xl border border-app-border bg-white text-app-text shadow-soft"
          aria-label="Abrir barra lateral"
        >
          <PanelLeftOpen className="h-5 w-5" strokeWidth={1.8} />
        </button>
      ) : null}

      {isMobile && !collapsed ? (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onToggleCollapse}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={
          isMobile
            ? `fixed inset-y-0 left-0 z-50 flex w-[256px] max-w-[85vw] flex-col overflow-hidden border-r border-app-border bg-app-sidebar shadow-soft transition-transform duration-300 ease-in-out ${
                collapsed ? '-translate-x-full' : 'translate-x-0'
              }`
            : `flex flex-col overflow-hidden border-r border-app-border bg-app-sidebar shadow-soft transition-[width,min-width] duration-300 ease-in-out ${
                collapsed ? 'w-[58px] min-w-[58px]' : 'w-[256px] min-w-[256px]'
              }`
        }
      >
      <div
        className={`flex min-h-[53px] items-center pb-3 pt-3 ${
          contentCollapsed ? 'justify-center px-0' : 'pl-4 pr-[15px]'
        }`}
      >
        <button
          type="button"
          className={`overflow-hidden whitespace-nowrap font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-app-text transition-all duration-200 ease-in-out ${
            contentCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[160px] opacity-100'
          }`}
        >
          Nexus
        </button>
        <div className={`${contentCollapsed ? 'flex items-center' : 'ml-auto flex items-center'}`}>
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
          {primaryItems
            .filter(({ id }) => id === 'research')
            .map(({ id, label, icon: Icon }) => (
              <NavItem
                key={id}
                active={currentPage === 'research' && activeResearchSessionId === null}
                icon={Icon}
                label={label}
                onClick={() => {
                  onNewResearch();
                  closeMobileDrawer();
                }}
                collapsed={contentCollapsed}
              />
            ))}
        </nav>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <nav className="space-y-0.6">
            {primaryItems
              .filter(({ id }) => id !== 'research')
              .map(({ id, label, icon: Icon }) => {
                const isActive =
                  (id === 'conversations' && (currentPage === 'conversas' || currentPage === 'conversation')) ||
                  ((id === 'geo' || id === 'resource' || id === 'service' || id === 'order') &&
                    currentPage === id);

                const categoryMenu = categoryMenus[id];

                return (
                  <div key={id}>
                    <NavItem
                      active={isActive}
                      icon={Icon}
                      label={label}
                      onClick={() => {
                        if (id === 'conversations') {
                          onSelectPage('conversas');
                          closeMobileDrawer();
                          return;
                        }
                        if (categoryMenu) {
                          categoryMenu.onToggle();
                          return;
                        }
                        onSelectPage(id);
                        closeMobileDrawer();
                      }}
                      collapsed={contentCollapsed}
                    />
                    {categoryMenu && categoryMenu.open && !contentCollapsed ? (
                      <div className="ml-[35px] mt-1 space-y-1 border-l border-app-border pl-3">
                        {categoryMenu.items.map((item) => {
                          const subItemActive = currentPage === id && categoryMenu.activeCode === item.code;
                          return (
                            <button
                              key={item.code}
                              type="button"
                              onClick={() => {
                                categoryMenu.onSelect(item.code);
                                closeMobileDrawer();
                              }}
                              className={`flex h-[28px] w-full items-center rounded-[10px] px-3 text-left text-[0.84rem] transition ${
                                subItemActive
                                  ? 'bg-app-accent-soft font-semibold text-app-text'
                                  : 'font-medium text-app-muted hover:bg-app-accent-soft hover:text-app-text'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </nav>

          {!contentCollapsed ? (
            <>
              <div className="flex items-center justify-between pb-2 pl-4 pr-[15px] pt-3">
                <span className="text-[0.8rem] font-medium text-app-muted">
                  Conversas recentes
                </span>
              </div>

              <div className="pb-2 pl-4 pr-1">
                <ResearchHistoryPage
                  activeSessionId={activeResearchSessionId}
                  refreshTrigger={researchSessionRefreshTrigger}
                  onSessionSelected={(sessionId) => {
                    onSelectResearchSession?.(sessionId);
                    closeMobileDrawer();
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={`flex min-h-[56px] border-t border-app-border pl-[15px] pr-[15px] ${
          contentCollapsed ? 'items-center justify-center' : 'items-center gap-4'
        }`}
      >
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-app-accent text-app-text">
          <span className="text-[1.12rem] font-medium">N</span>
        </div>
        {!contentCollapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.96rem] font-semibold leading-[1.1] text-app-text">
                Niraldo R.
              </div>
              <div className="text-[0.84rem] leading-[1.1] text-app-muted">Operações de Rede</div>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectPage('settings');
                closeMobileDrawer();
              }}
              className={`rounded-xl border p-1.5 transition ${
                settingsOpen
                  ? 'border-app-border bg-white text-app-text shadow-soft'
                  : 'border-transparent text-app-muted hover:bg-app-accent-soft hover:text-app-text'
              }`}
              aria-label="Configurações"
            >
              <Settings className="h-[1rem] w-[1rem]" strokeWidth={1.8} />
            </button>
          </>
        ) : null}
      </div>
      </aside>
    </>
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
      className={`menu-item-nav relative flex w-full items-center text-left transition ${
        collapsed
          ? 'h-[46px] justify-center px-0'
          : 'h-[34px] rounded-[14px] px-[15px] gap-4 border'
      } ${
        collapsed
          ? 'text-app-text'
          : active
            ? 'border-app-border bg-white text-app-text shadow-soft'
            : 'border-transparent text-app-text hover:bg-app-accent-soft'
      }`}
    >
      {collapsed ? (
        <span
          className={`relative flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border transition ${
            active
              ? 'border-app-accent-border bg-app-accent-soft text-app-text shadow-soft'
              : 'border-transparent text-app-text hover:border-app-border hover:bg-white hover:shadow-soft'
          }`}
        >
          <Icon className="menu-item-icon h-[1.2rem] w-[1.2rem]" strokeWidth={1.8} />
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
      {!collapsed && active ? (
        <span className="ml-auto flex items-center">
          <Diamond size={6} />
        </span>
      ) : null}
    </button>
  );
}
