import {
  Briefcase,
  Boxes,
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
import { PageId, RecentGroup, RecentItem } from '../types';
import { ResearchHistoryPage } from '../pages/ResearchHistoryPage';
import { RESOURCE_CATEGORY_DEFAULTS } from '../data/resourceCatalogDefaults';
import {
  groupResourceCategories,
  resourceInfraSectionLabel,
  sidebarCategoryLabel,
} from '../data/resourceCategoryViews';
import { SERVICE_CATEGORY_DEFAULTS } from '../data/serviceCatalogDefaults';
import { listServiceCategories } from '../data/serviceCategoryViews';
import { isCivilInfrastructureCategory } from '../utils/resourceSpecificationForm';
import NexusMark from './NexusMark';

type PrimaryItemId =
  | 'conversations'
  | 'research'
  | 'geo'
  | 'resource'
  | 'service'
  | 'order'
  | 'studio';

/**
 * Item de submenu de categoria — a forma comum entre Resource e Service. `sectionLabel` é opcional
 * (só Resource usa, para separar Infraestrutura Civil de Infraestrutura de Rede — ver
 * resourceCategoryItems abaixo); quando presente e diferente do item anterior, o Sidebar insere
 * um cabeçalho de seção antes do item.
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
  activeResourceCategory: string;
  resourceMenuOpen: boolean;
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
  onToggleResourceMenu: () => void;
  onSelectResourceCategory: (categoryCode: string) => void;
  onToggleServiceMenu: () => void;
  onSelectServiceCategory: (categoryCode: string) => void;
  onOpenRecentItem: (conversationId: string) => void;
  onSelectResearchSession?: (sessionId: string) => void;
  researchSessionRefreshTrigger?: number;
  // Sessão atual: identidade no rodapé, "Sair" e a entrada de administração de Usuários
  // (só para admin). Ver useSession/App.
  sessionUser?: { name: string; email?: string; roles: string[] } | null;
  isAdmin?: boolean;
  canViewStudio?: boolean;
  onLogout?: () => void;
}

const primaryItems: Array<{ id: PrimaryItemId; label: string; icon: LucideIcon }> = [
  { id: 'research', label: 'Nova Conversa', icon: Plus },
  { id: 'conversations', label: 'Conversas', icon: MessagesSquare },
  { id: 'geo', label: 'Mapa', icon: MapPinned },
  { id: 'resource', label: 'Recursos', icon: Boxes },
  { id: 'service', label: 'Serviços', icon: Briefcase },
  { id: 'order', label: 'Ordens', icon: FolderTree },
  { id: 'studio', label: 'Studio', icon: Presentation },
];

const initialOf = (name?: string): string => name?.trim()?.[0]?.toUpperCase() ?? 'U';

// Rede antes de Civil, espelhando a ordem das abas do catálogo em Configurações (ver
// ResourceCatalogTab) — cada categoria ganha um `sectionLabel` para o Sidebar desenhar o
// cabeçalho de seção só na primeira ocorrência de cada grupo.
const allResourceCategories = groupResourceCategories(RESOURCE_CATEGORY_DEFAULTS).flatMap(
  (group) => group.categories,
);
const resourceCategoryItems: CategoryMenuItem[] = [
  ...allResourceCategories.filter((category) => !isCivilInfrastructureCategory(category.code)),
  ...allResourceCategories.filter((category) => isCivilInfrastructureCategory(category.code)),
].map((category) => ({
  code: category.code,
  label: sidebarCategoryLabel(category),
  sectionLabel: resourceInfraSectionLabel(category.code),
}));

const serviceCategoryItems: CategoryMenuItem[] = listServiceCategories(
  SERVICE_CATEGORY_DEFAULTS,
).map((category) => ({ code: category.code, label: category.name }));

export default function Sidebar({
  collapsed,
  isMobile = false,
  showMobileToggle = true,
  currentPage,
  activeResearchSessionId,
  activeResourceCategory,
  resourceMenuOpen,
  activeServiceCategory,
  serviceMenuOpen,
  onToggleCollapse,
  onNewResearch,
  onSelectPage,
  onToggleResourceMenu,
  onSelectResourceCategory,
  onToggleServiceMenu,
  onSelectServiceCategory,
  onSelectResearchSession,
  researchSessionRefreshTrigger,
  sessionUser,
  isAdmin = false,
  canViewStudio = false,
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

  // Classes do <aside>. No rail recolhido não usamos overflow-hidden: o tooltip
  // (.vt-sb-tip) dos itens precisa escapar da sidebar para aparecer ao lado do ícone.
  const asideClassName = isMobile
    ? `vt-main-nav fixed inset-y-0 left-0 z-50 flex w-[248px] max-w-[85vw] flex-col overflow-hidden border-r border-app-border bg-app-sidebar shadow-soft transition-transform duration-300 ease-in-out ${
        collapsed ? '-translate-x-full' : 'translate-x-0'
      }`
    : `vt-main-nav flex flex-col ${collapsed ? '' : 'overflow-hidden'} border-r border-app-border bg-app-sidebar transition-[width,min-width] duration-200 ease-in-out ${
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
            className="vt-sb-btn vt-sb-btn-lg w-full"
            style={{ justifyContent: contentCollapsed ? 'center' : 'flex-start' }}
          >
            {!contentCollapsed ? (
              <NexusMark className="h-[22px] w-[22px] shrink-0" />
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
                <NexusMark className="h-[22px] w-[22px] transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" />
                <PanelLeftOpen
                  className="absolute h-[18px] w-[18px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  strokeWidth={1.8}
                />
              </button>
            )}
            {!contentCollapsed && (
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 17,
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
            o mesmo gap do nav — sem espaçamento extra entre grupos. */}
        <div className="hover-scroll relative min-h-0 flex-1 overflow-y-auto">
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
                .filter(({ id }) => id !== 'research' && (id !== 'studio' || canViewStudio))
                .map(({ id, label, icon: Icon }) => {
                  const isActive =
                    (id === 'conversations' &&
                      (currentPage === 'conversas' || currentPage === 'conversation')) ||
                    ((id === 'geo' ||
                      id === 'resource' ||
                      id === 'service' ||
                      id === 'order' ||
                      id === 'studio') &&
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
                            const previousSectionLabel = categoryMenu.items[index - 1]?.sectionLabel;
                            const showSectionHeader =
                              Boolean(item.sectionLabel) && item.sectionLabel !== previousSectionLabel;
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
          <div
            className="vt-sb-btn vt-sb-btn-lg w-full"
            style={{ justifyContent: contentCollapsed ? 'center' : 'flex-start' }}
          >
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
            {!contentCollapsed && (
              <>
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
                  title="Configurações"
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
              </>
            )}
            {contentCollapsed && <span className="vt-sb-tip">{sessionUser?.name ?? 'Usuário'}</span>}
          </div>
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
