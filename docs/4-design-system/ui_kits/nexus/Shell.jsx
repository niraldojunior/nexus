// V.tal Nexus UI kit — application shell
// Structural composition follows shadcn/ui's Sidebar pattern (header / content
// with labeled groups of menu buttons / footer / an edge rail that toggles
// icon-collapse) — only the color tokens are ours (V.tal yellow wash, hairline
// borders). No fixed top bar: each page owns its own heading (PageHead).
function Shell({ active, onNavigate, onLogout, children, variant = 'sidebar', collapsible = true, pad = true }) {
  const [rail, setRail] = React.useState(variant === 'rail');

  const primary = [
    { id: 'new', label: 'Nova Conversa', icon: 'plus' },
    { id: 'chats', label: 'Conversas', icon: 'messages-square' },
  ];
  const domains = [
    { id: 'locais', label: 'Locais', icon: 'map-pin' },
    { id: 'inventory', label: 'Recursos', icon: 'boxes' },
    { id: 'services', label: 'Serviços', icon: 'briefcase' },
    { id: 'orders', label: 'Ordens', icon: 'network' },
  ];
  const system = [
    { id: 'studio', label: 'Studio', icon: 'sliders-horizontal' },
    { id: 'settings', label: 'Configurações', icon: 'settings-2' },
  ];
  const recent = ['Viabilidade Icaraí', 'CDOI-2924 (ICI)', 'Cobertura Niterói'];

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--surface-app)', borderTop: '3px solid var(--vt-yellow)' }}>
      {/* Sidebar */}
      <aside style={{
        position: 'relative', width: rail ? 'var(--rail-width)' : 'var(--sidebar-width)',
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)',
        transition: 'width var(--transition-normal)', zIndex: 20,
      }}>
        {/* SidebarHeader */}
        <div style={{ padding: 8, flexShrink: 0 }}>
          <div className="vt-sb-btn vt-sb-btn-lg" style={{ justifyContent: rail ? 'center' : 'flex-start', cursor: rail ? 'pointer' : 'default' }} onClick={rail ? () => setRail(false) : undefined} title={rail ? 'Expandir' : undefined}>
            <img src="../../assets/nexus-mark.svg" alt="Nexus" style={{ height: 22, flexShrink: 0 }} />
            {!rail && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, letterSpacing: 'var(--tracking-snug)', color: 'var(--text-primary)', flex: 1 }}>Nexus</span>}
            {!rail && collapsible && (
              <span onClick={() => setRail(true)} title="Recolher" style={{ display: 'flex', color: 'var(--text-tertiary)' }}>
                <Icon name="panel-left-close" size={16} />
              </span>
            )}
          </div>
        </div>

        {/* SidebarContent */}
        <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 2, alignItems: rail ? 'center' : 'stretch' }}>
          <SBGroup rail={rail} items={primary} active={active} onNavigate={onNavigate} />
          <SBGroup rail={rail} items={domains} active={active} onNavigate={onNavigate} />
          <SBGroup rail={rail} items={system} active={active} onNavigate={onNavigate} />
          {!rail && (
            <SBGroup rail={rail} label="Conversas recentes" items={recent.map((r) => ({ id: r, label: r, icon: 'message-square', muted: true }))} active={active} onNavigate={() => {}} style={{ marginTop: 14 }} />
          )}
        </nav>

        {/* SidebarFooter */}
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--sidebar-border)', padding: 8 }}>
          <div className="vt-sb-btn vt-sb-btn-lg" style={{ justifyContent: rail ? 'center' : 'flex-start' }} onClick={onLogout}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--vt-yellow)', color: 'var(--vt-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>A</div>
            {!rail && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-body-lg)', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Administrador</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>admin@vtal.com.br</div>
                </div>
                <Icon name="chevrons-up-down" size={15} color="var(--text-tertiary)" />
              </>
            )}
            {rail && <span className="vt-sb-tip">Administrador</span>}
          </div>
        </div>

        {/* SidebarRail — hover strip on the edge, toggles collapse */}
        {collapsible && (
          <div className="vt-sb-rail" onClick={() => setRail((r) => !r)} title={rail ? 'Expandir' : 'Recolher'} />
        )}
      </aside>

      {/* Main — no chrome above it */}
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: pad ? '8px var(--content-pad) var(--content-pad)' : 0, position: 'relative' }}>
        {children}
      </main>
    </div>
  );
}

// SidebarGroup: optional label + a SidebarMenu of SBItem buttons.
function SBGroup({ rail, label, items, active, onNavigate, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: rail ? 'center' : 'stretch', ...style }}>
      {!rail && label && <div className="vt-sb-group-label">{label}</div>}
      {items.map((it) => (
        <SBItem key={it.id} {...it} rail={rail} active={active === it.id} onClick={() => onNavigate && onNavigate(it.id)} />
      ))}
    </div>
  );
}

// SidebarMenuButton equivalent.
function SBItem({ label, icon, active, rail, muted, onClick }) {
  return (
    <div
      onClick={onClick}
      className={'vt-sb-btn' + (rail ? ' vt-sb-btn-rail' : '') + (active ? ' is-active' : '')}
      style={muted ? { color: 'var(--text-secondary)', fontWeight: 'var(--fw-regular)' } : undefined}
    >
      <Icon name={icon} size={18} />
      {!rail && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
      {rail && <span className="vt-sb-tip">{label}</span>}
    </div>
  );
}

// Page heading. Lives inside the scrolling content, not in a fixed bar —
// it can be as tall as the page needs and disappears as the user reads.
function PageHead({ title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 'var(--space-5)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center' }}>
          <h1 style={{ letterSpacing: 'var(--tracking-snug)' }}>{title}</h1>
        </div>
        {subtitle && <p style={{ marginTop: 4, fontSize: 'var(--fs-body-lg)', color: 'var(--text-tertiary)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, height: 48 }}>{actions}</div>}
    </div>
  );
}

Object.assign(window, { Shell, PageHead });
