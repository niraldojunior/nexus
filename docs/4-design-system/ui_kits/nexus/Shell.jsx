// V.tal Nexus UI kit — application shell (sidebar + topbar)
function Shell({ active, onNavigate, onLogout, children, title, subtitle, headerRight }) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const nav = [
    { id: 'dashboard', label: 'Visão Geral', icon: 'layout-dashboard' },
    { id: 'inventory', label: 'Inventário', icon: 'database' },
    { id: 'viability', label: 'Viabilidade', icon: 'zap' },
    { id: 'topology', label: 'Topologia', icon: 'share-2' },
  ];

  const secondary = [
    { id: 'geo', label: 'Geo', icon: 'map' },
    { id: 'logradouros', label: 'Logradouros', icon: 'map-pin' },
    { id: 'api', label: 'API & Integrações', icon: 'plug' },
  ];

  const sidebarWidth = isCollapsed ? 56 : 256;

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--surface-app)' }}>
      <aside
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          background: 'linear-gradient(180deg, #2f343a, var(--surface-sidebar))',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-on-dark)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
          zIndex: 5,
          padding: isCollapsed ? '12px 4px' : '12px 8px',
          transition: 'width var(--transition-sidebar)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            gap: 6,
            marginBottom: 10,
          }}
        >
          {!isCollapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <img src="../../assets/nexus-mark-white.svg" alt="Nexus" style={{ height: 30, flexShrink: 0 }} />
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.1 }}>Nexus</span>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)' }}>Network inventory</span>
              </div>
            </div>
          ) : null}
          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="btn-icon sidebar-toggle-btn"
            style={{
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'transparent',
              cursor: 'pointer',
              border: 'none',
              flexShrink: 0,
            }}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            type="button"
          >
            <Icon name="chevron-left" size={16} />
          </button>
        </div>

        <button
          type="button"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 48,
              marginBottom: 10,
              padding: isCollapsed ? '0' : '0 14px',
            border: '1px solid transparent',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.045)',
            color: 'var(--text-on-dark)',
            cursor: 'pointer',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
          }}
        >
          <Icon name="plus" size={16} />
          {!isCollapsed && <span style={{ fontSize: 13, fontWeight: 700 }}>Nova consulta</span>}
        </button>

        <nav style={{ flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {nav.map((item) => (
            <NavItem
              key={item.id}
              {...item}
              active={active === item.id}
              collapsed={isCollapsed}
              onClick={() => onNavigate(item.id)}
            />
          ))}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 8px' }} />
          {!isCollapsed && (
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.3)', padding: '4px 12px 8px' }}>
              Domínios
            </div>
          )}
          {secondary.map((item) => (
            <NavItem
              key={item.id}
              {...item}
              active={active === item.id}
              collapsed={isCollapsed}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>

        <div style={{ padding: isCollapsed ? '8px 0 0' : '12px 12px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={onLogout}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onLogout(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 52,
              padding: isCollapsed ? '8px 0' : '8px 10px',
              borderRadius: '14px',
              cursor: 'pointer',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
            }}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--vt-yellow)',
              color: 'var(--vt-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 12,
              flexShrink: 0,
            }}>
              NR
            </div>
            {!isCollapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Niraldo R.</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Eng. de Rede</div>
              </div>
            )}
            {!isCollapsed && <Icon name="log-out" size={15} color="rgba(255,255,255,0.45)" />}
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 'var(--header-height)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '0 24px',
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)' }}>V.tal Nexus</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {headerRight}
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--content-pad, 10px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({ label, icon, active, onClick, collapsed }) {
  const [hover, setHover] = React.useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 48,
        width: '100%',
        padding: collapsed ? '0' : '0 14px',
        borderRadius: 16,
        cursor: 'pointer',
        justifyContent: collapsed ? 'center' : 'flex-start',
        color: active ? '#fff' : (hover ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.52)'),
        background: active ? 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))' : (hover ? 'rgba(255,255,255,0.06)' : 'transparent'),
        boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.16)' : 'none',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        fontFamily: 'var(--font-display)',
        transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {active && !collapsed && (
        <span style={{
          position: 'absolute',
          right: 0,
          top: 9,
          bottom: 9,
          width: 3,
          borderRadius: 999,
          background: 'var(--vt-yellow)',
        }} />
      )}
      <Icon name={icon} size={18} />
      {!collapsed && <span>{label}</span>}
    </div>
  );
}

Object.assign(window, { Shell });
