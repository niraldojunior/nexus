// V.tal Nexus UI kit — application shell (sidebar + topbar)
function Shell({ active, onNavigate, onLogout, children, title, subtitle, headerRight }) {
  const nav = [
    { id: 'dashboard', label: 'Visão Geral', icon: 'layout-dashboard' },
    { id: 'inventory', label: 'Inventário', icon: 'database' },
    { id: 'viability', label: 'Viabilidade', icon: 'zap' },
    { id: 'topology', label: 'Topologia', icon: 'share-2' },
  ];
  const secondary = [
    { id: 'sites', label: 'Sites & POPs', icon: 'building-2' },
    { id: 'logradouros', label: 'Logradouros', icon: 'map-pin' },
    { id: 'api', label: 'API & Integrações', icon: 'plug' },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--surface-app)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-width)', flexShrink: 0, background: 'var(--surface-sidebar)',
        display: 'flex', flexDirection: 'column', color: 'var(--text-on-dark)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)', zIndex: 5,
      }}>
        <div style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <img src="../../assets/nexus-mark-white.svg" alt="Nexus" style={{ height: 26, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em', color: '#fff' }}>Nexus</span>
        </div>
        <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {nav.map((it) => <NavItem key={it.id} {...it} active={active === it.id} onClick={() => onNavigate(it.id)} />)}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 8px' }} />
          <div style={{ font: 'var(--text-eyebrow)', textTransform: 'uppercase', letterSpacing: '.05em', color: 'rgba(255,255,255,0.3)', padding: '4px 12px 8px' }}>Domínios</div>
          {secondary.map((it) => <NavItem key={it.id} {...it} active={active === it.id} onClick={() => onNavigate(it.id)} />)}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
            onClick={onLogout}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--vt-yellow)', color: 'var(--vt-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>NR</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Niraldo R.</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Eng. de Rede</div>
            </div>
            <Icon name="log-out" size={15} color="rgba(255,255,255,0.4)" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          height: 'var(--header-height)', flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 24px', background: 'var(--surface-card)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ font: 'var(--text-h3)', color: 'var(--text-primary)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {headerRight}
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--content-pad)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({ label, icon, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 11, height: 32, padding: '0 10px',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: active ? '#fff' : (hover ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)'),
        background: active ? 'rgba(255,255,255,0.08)' : (hover ? 'rgba(255,255,255,0.04)' : 'transparent'),
        fontSize: 12.5, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-display)',
      }}>
      {active && <span style={{
        position: 'absolute', right: 0, top: 6, bottom: 6, width: 2, borderRadius: 1,
        background: 'var(--vt-yellow)',
      }} />}
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </div>
  );
}

Object.assign(window, { Shell });
