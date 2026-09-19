import {
  Briefcase,
  FolderTree,
  LogOut,
  type LucideIcon,
  MapPinned,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Presentation,
  Settings,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PageId, RecentGroup, RecentItem } from '../types';
import { ResearchHistoryPage } from '../pages/ResearchHistoryPage';
import { SERVICE_CATEGORY_DEFAULTS } from '../data/serviceCatalogDefaults';
import { listServiceCategories } from '../data/serviceCategoryViews';
import NexusMark from './NexusMark';

type PrimaryItemId = 'conversations' | 'research' | 'geo' | 'service' | 'order' | 'studio';

/**
 * Item de submenu de categoria (usado por Service).
 */
type CategoryMenuItem = { code: string; label: string; sectionLabel?: string };

interface SidebarProps {
  collapsed: boolean;
  isMobile?: boolean;
  // No mobile, o botão flutuante que abre o drawer some quando outra tela já oferece
  // essa entrada — é o caso da página Locais, onde a marca do Nexus dentro da barra de
  // pesquisa abre o menu (ver GeoSearchBar/GeoPage). Fora desse caso, é a única porta.
  showMobileToggle?: boolean;
  currentPage: PageId;
  activeRecentConversationId: string | null;
  activeResearchSessionId: string | null;
  activeServiceCategory: string;
  serviceMenuOpen: boolean;
  settingsOpen?: boolean;
  recentItems: RecentItem[];
  recentGroup: RecentGroup;
  onGroupChange: (group: RecentGroup) => void;
  onToggleCollapse: () => void;
  onNewConversation: () => void;
  onNewResearch: () => void;
  onSelectPage: (page: PageId | 'settings') => void;
  onToggleServiceMenu: () => void;
  onSelectServiceCategory: (categoryCode: string) => void;
  onOpenRecentItem: (conversationId: string) => void;
  onSelectResearchSession?: (sessionId: string) => void;
  researchSessionRefreshTrigger?: number;
  // Sessão atual: identidade no rodapé, "Sair" e a entrada de administração de Usuários
  // (só para admin). Ver useSession/App.
  sessionUser?: { name: string; email?: string; avatarUrl?: string | null; roles: string[] } | null;
  isAdmin?: boolean;
  canViewStudio?: boolean;
  canViewOrder?: boolean;
  onLogout?: () => void;
}

const primaryItems: Array<{ id: PrimaryItemId; label: string; icon: LucideIcon }> = [
  { id: 'research', label: 'Nova Conversa', icon: Plus },
  { id: 'conversations', label: 'Conversas', icon: MessagesSquare },
  { id: 'geo', label: 'Locais e Recursos', icon: MapPinned },
  { id: 'service', label: 'Serviços', icon: Briefcase },
  { id: 'order', label: 'Ordens', icon: FolderTree },
  { id: 'studio', label: 'Studio', icon: Presentation },
];

const initialOf = (name?: string): string => name?.trim()?.[0]?.toUpperCase() ?? 'U';

const serviceCategoryItems: CategoryMenuItem[] = listServiceCategories(
  SERVICE_CATEGORY_DEFAULTS,
).map((category) => ({ code: category.code, label: category.name }));

export default function Sidebar({
  collapsed,
  isMobile = false,
  showMobileToggle = true,
  currentPage,
  activeResearchSessionId,
  activeServiceCategory,
  serviceMenuOpen,
  onToggleCollapse,
  onNewResearch,
  onSelectPage,
  onToggleServiceMenu,
  onSelectServiceCategory,
  onSelectResearchSession,
  researchSessionRefreshTrigger,
  sessionUser,
  isAdmin = false,
  canViewStudio = false,
  canViewOrder = false,
  onLogout,
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
    service: {
      items: serviceCategoryItems,
      open: serviceMenuOpen,
      activeCode: activeServiceCategory,
      onToggle: onToggleServiceMenu,
      onSelect: onSelectServiceCategory,
    },
  };

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarTriggerRect, setAvatarTriggerRect] = useState<DOMRect | null>(null);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleClose = () => setAvatarMenuOpen(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAvatarMenuOpen(false);
        avatarButtonRef.current?.focus();
      }
    };
    window.addEventListener('resize', handleClose);
    window.addEventListener('scroll', handleClose, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [avatarMenuOpen]);

  const handleAvatarClick = () => {
    if (!contentCollapsed) return;
    if (avatarButtonRef.current) {
      setAvatarTriggerRect(avatarButtonRef.current.getBoundingClientRect());
      setAvatarMenuOpen((open) => !open);
    }
  };

  // No mobile a sidebar é um drawer sobreposto (sempre com conteúdo completo);
  // no desktop ela recolhe para um rail fino de ícones. `contentCollapsed` só
  // é verdadeiro no caso do rail — o drawer mobile nunca esconde os rótulos.
  const contentCollapsed = !isMobile && collapsed;
  const closeMobileDrawer = () => {
    if (isMobile) onToggleCollapse();
  };

  // Classes do <aside>. No rail recolhido não usamos overflow-hidden: o tooltip
  // (.vt-sb-tip) dos itens precisa escapar da sidebar para aparecer ao lado do ícone.
  const asideClassName = isMobile
    ? `vt-main-nav vt-main-nav-mobile fixed inset-y-0 left-0 z-50 flex w-[248px] max-w-[85vw] flex-col overflow-hidden bg-app-sidebar shadow-soft transition-transform duration-300 ease-in-out ${
        collapsed ? '-translate-x-full' : 'translate-x-0'
      }`
    : `vt-main-nav flex flex-col ${collapsed ? '' : 'overflow-hidden'} bg-app-sidebar transition-[width,min-width] duration-200 ease-in-out ${
        collapsed ? 'w-[58px] min-w-[58px]' : 'w-[248px] min-w-[248px]'
      }`;

  return (
    <>
      {isMobile && collapsed && showMobileToggle ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="fixed left-3 top-3 z-[60] flex h-10 w-10 items-center justify-center rounded-xl border border-app-border bg-white text-app-text shadow-soft"
          aria-label="Abrir barra lateral"
        >
          <NexusMark className="h-7 w-7" />
        </button>
      ) : null}

      {isMobile && !collapsed ? (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onToggleCollapse}
          aria-hidden="true"
        />
      ) : null}

      <aside className={asideClassName}>
        {/* SidebarHeader — compacto: a lista de itens começa logo abaixo da marca. */}
        <div className="flex flex-shrink-0 items-center px-2 pt-1.5 pb-0.5">
          <div
            className="vt-sb-btn vt-sb-btn-lg w-full !gap-1.5"
            style={{ justifyContent: contentCollapsed ? 'center' : 'flex-start' }}
          >
            {!contentCollapsed ? (
              <NexusMark className="h-[26px] w-[26px] shrink-0" ink="var(--text-primary)" />
            ) : (
              // No rail recolhido, o botão é a marca do Nexus; o hover revela o ícone de
              // abrir a sidebar — a troca é só CSS, sem estado; o clique expande a barra.
              <button
                type="button"
                onClick={onToggleCollapse}
                className="group relative flex h-[40px] w-[40px] items-center justify-center"
                aria-label="Expandir barra lateral"
                title="Expandir"
              >
                <NexusMark
                  className="h-[26px] w-[26px] transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
                  ink="var(--text-primary)"
                />
                <PanelLeftOpen
                  className="absolute h-[20px] w-[20px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  strokeWidth={1.8}
                />
              </button>
            )}
            {!contentCollapsed && (
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 20,
                  letterSpacing: 'var(--tracking-snug)',
                  color: 'var(--text-primary)',
                  flex: 1,
                }}
              >
                Nexus
              </span>
            )}
            {!contentCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex items-center text-app-muted hover:text-app-text"
                aria-label="Recolher barra lateral"
                title="Recolher"
              >
                <PanelLeftClose className="h-4 w-4" strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>

        {/* Navigation — container de scroll sem padding horizontal: a calha da
            scrollbar fica colada na borda direita do aside. O padding vive no
            <nav> interno. Todos os itens (incluindo Nova Conversa) compartilham
            o mesmo gap do nav — sem espaçamento extra entre grupos.
            Quando contraído no desktop (rail 58px), usamos overflow-visible para
            que os tooltips (.vt-sb-tip) não sejam recortados na borda direita. */}
        <div
          className={`hover-scroll relative min-h-0 flex-1 ${
            contentCollapsed ? 'overflow-visible' : 'overflow-y-auto'
          }`}
        >
          <div className="h-full">
            <nav className="flex flex-col gap-[2px] px-2">
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
              {primaryItems
                .filter(
                  ({ id }) =>
                    id !== 'research' &&
                    (id !== 'studio' || canViewStudio) &&
                    ((id !== 'service' && id !== 'order') || canViewOrder),
                )
                .map(({ id, label, icon: Icon }) => {
                  const isActive =
                    (id === 'conversations' &&
                      (currentPage === 'conversas' || currentPage === 'conversation')) ||
                    ((id === 'geo' || id === 'service' || id === 'order' || id === 'studio') &&
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
                        <div className="my-1 ml-4 space-y-0.5 border-l border-app-border pl-2">
                          {categoryMenu.items.map((item, index) => {
                            const subItemActive =
                              currentPage === id && categoryMenu.activeCode === item.code;
                            const previousSectionLabel =
                              categoryMenu.items[index - 1]?.sectionLabel;
                            const showSectionHeader =
                              Boolean(item.sectionLabel) &&
                              item.sectionLabel !== previousSectionLabel;
                            return (
                              <div key={item.code}>
                                {showSectionHeader ? (
                                  <div className="vt-sb-group-label text-[0.72rem]">
                                    {item.sectionLabel}
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    categoryMenu.onSelect(item.code);
                                    closeMobileDrawer();
                                  }}
                                  className={`vt-sb-btn w-full text-left text-xs ${
                                    subItemActive ? 'is-active' : ''
                                  }`}
                                >
                                  <span className="truncate">{item.label}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              {isAdmin ? (
                <NavItem
                  active={currentPage === 'configuracoes'}
                  icon={Settings}
                  label="Configurações"
                  onClick={() => {
                    onSelectPage('configuracoes');
                    closeMobileDrawer();
                  }}
                  collapsed={contentCollapsed}
                />
              ) : null}
            </nav>

            {!contentCollapsed ? (
              <div className="pb-2 px-2">
                <ResearchHistoryPage
                  activeSessionId={activeResearchSessionId}
                  refreshTrigger={researchSessionRefreshTrigger}
                  onSessionSelected={(sessionId) => {
                    onSelectResearchSession?.(sessionId);
                    closeMobileDrawer();
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-app-border p-2">
          {contentCollapsed ? (
            <button
              ref={avatarButtonRef}
              type="button"
              onClick={handleAvatarClick}
              aria-haspopup="menu"
              aria-expanded={avatarMenuOpen}
              className="vt-sb-btn vt-sb-btn-lg w-full flex items-center justify-center p-1 rounded-xl transition hover:bg-app-accent-soft"
              title="Menu do usuário"
            >
              {sessionUser?.avatarUrl ? (
                <img
                  src={sessionUser.avatarUrl}
                  alt={sessionUser.name}
                  className="h-7 w-7 rounded-full object-cover border border-app-border"
                />
              ) : (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--vt-yellow)',
                    color: 'var(--vt-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {initialOf(sessionUser?.name)}
                </div>
              )}
              {!avatarMenuOpen && (
                <span className="vt-sb-tip">{sessionUser?.name ?? 'Usuário'}</span>
              )}
            </button>
          ) : (
            <div className="vt-sb-btn vt-sb-btn-lg w-full flex items-center gap-2.5">
              {sessionUser?.avatarUrl ? (
                <img
                  src={sessionUser.avatarUrl}
                  alt={sessionUser.name}
                  className="h-7 w-7 rounded-full object-cover border border-app-border"
                />
              ) : (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--vt-yellow)',
                    color: 'var(--vt-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {initialOf(sessionUser?.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-app-text">
                  {sessionUser?.name ?? 'Administrador'}
                </div>
                <div className="truncate text-[0.75rem] text-app-muted">
                  {sessionUser?.email ?? 'admin@vtal.com.br'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectPage('settings');
                  closeMobileDrawer();
                }}
                className="rounded p-1 text-app-muted hover:text-app-text"
                title="Preferências"
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
              {onLogout ? (
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    closeMobileDrawer();
                  }}
                  className="rounded p-1 text-app-muted hover:text-red-600"
                  title="Sair"
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </aside>

      {avatarMenuOpen && avatarTriggerRect && (
        <AvatarFloatingMenu
          rect={avatarTriggerRect}
          onClose={() => setAvatarMenuOpen(false)}
          onOpenSettings={() => {
            setAvatarMenuOpen(false);
            onSelectPage('settings');
          }}
          onLogout={() => {
            setAvatarMenuOpen(false);
            onLogout?.();
          }}
        />
      )}
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
      title={collapsed ? label : undefined}
      className={`vt-sb-btn relative flex w-full items-center text-left ${
        collapsed ? 'vt-sb-btn-rail' : ''
      } ${active ? 'is-active' : ''}`}
    >
      <Icon className="menu-item-icon h-[1.12rem] w-[1.12rem] shrink-0" strokeWidth={1.8} />
      {!collapsed && (
        <span
          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: 'var(--fs-body)', lineHeight: 1.2 }}
        >
          {label}
        </span>
      )}
      {collapsed && <span className="vt-sb-tip">{label}</span>}
    </button>
  );
}

function AvatarFloatingMenu({
  rect,
  onClose,
  onOpenSettings,
  onLogout,
}: {
  rect: DOMRect;
  onClose: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const width = 190;
  // Abre à direita do rail de 58px, alinhado com o rodapé
  const left = Math.min(rect.right + 10, window.innerWidth - width - 12);
  const bottom = Math.max(12, window.innerHeight - rect.bottom);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="menu"
        style={{ left, bottom, width }}
        className="fixed z-50 flex flex-col overflow-hidden rounded-[16px] border border-app-border bg-app-panel p-1.5 shadow-modal"
      >
        <button
          type="button"
          role="menuitem"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.88rem] font-medium text-app-text transition hover:bg-app-accent-soft"
        >
          <Settings className="h-4 w-4 text-app-muted" strokeWidth={1.8} />
          <span>Preferências</span>
        </button>

        <div className="my-1 border-t border-app-border" />

        <button
          type="button"
          role="menuitem"
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.88rem] font-medium text-status-red transition hover:bg-status-red-soft"
        >
          <LogOut className="h-4 w-4 text-status-red" strokeWidth={1.8} />
          <span>Sair</span>
        </button>
      </div>
    </>,
    document.body,
  );
}
