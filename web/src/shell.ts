type NavItem = {
  id: string;
  label: string;
  locked: boolean;
  icon: string;
};

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', locked: true, icon: 'grid' },
  { id: 'geo', label: 'Locais e Sites', locked: false, icon: 'map-pin' },
  { id: 'resource', label: 'Recursos', locked: true, icon: 'layers-3' },
  { id: 'service', label: 'Serviços', locked: true, icon: 'workflow' },
  { id: 'order', label: 'Projetos', locked: true, icon: 'folder-kanban' },
  { id: 'chat', label: 'Chat', locked: true, icon: 'messages-square' },
];

const icon = (name: string) => {
  const common = 'aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  const icons: Record<string, string> = {
    grid: `<svg ${common}><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>`,
    'map-pin': `<svg ${common}><path d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>`,
    'layers-3': `<svg ${common}><path d="M12 3 2.5 8 12 13l9.5-5L12 3Z"></path><path d="m2.5 13 9.5 5 9.5-5"></path><path d="m2.5 18 9.5 5 9.5-5"></path></svg>`,
    workflow: `<svg ${common}><path d="M4 6h6"></path><path d="M14 6h6"></path><path d="M10 6v12"></path><circle cx="4" cy="6" r="1.5"></circle><circle cx="20" cy="6" r="1.5"></circle><circle cx="10" cy="18" r="1.5"></circle></svg>`,
    'folder-kanban': `<svg ${common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"></path><path d="M8 11v5"></path><path d="M12 10v6"></path><path d="M16 12v4"></path></svg>`,
    'messages-square': `<svg ${common}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"></path><path d="M8 8h8"></path><path d="M8 12h5"></path></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`,
    'sidebar-toggle': `<svg ${common}><rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M11 8l4 4-4 4"></path></svg>`,
  };
  return icons[name] || icons.grid;
};

export const renderShell = (active: string, content: string) => `
  <div class="app" data-sidebar-state="expanded">
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand">
          <div class="brand-mark">N</div>
          <div class="brand-copy">
            <div class="brand-title">Nexus</div>
          </div>
        </div>
        <button class="sidebar-toggle" data-sidebar-toggle aria-label="Recolher menu">
          ${icon('sidebar-toggle')}
        </button>
      </div>
      <button class="new-chat">
        <span class="new-chat__icon">${icon('plus')}</span>
        <span class="new-chat__text">Novo Chat</span>
      </button>
      <nav class="nav">
        ${nav.map((item) => `
          <button class="nav-item ${item.id === active ? 'active' : ''} ${item.locked ? 'locked' : ''}" aria-current="${item.id === active ? 'page' : 'false'}" data-route="${item.id}" ${item.locked ? 'disabled' : ''}>
            <span class="nav-item__icon">${icon(item.icon)}</span>
            <span class="nav-item__copy">
              <strong>${item.label}</strong>
            </span>
          </button>`).join('')}
      </nav>
    </aside>
    <div class="main-shell">
      <header class="topbar" aria-hidden="true"></header>
      <main class="main">
        ${content}
      </main>
    </div>
  </div>
`;
