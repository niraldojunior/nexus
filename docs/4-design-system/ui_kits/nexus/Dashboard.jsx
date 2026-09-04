// V.tal Nexus UI kit — Visão Geral (network overview dashboard)
function Dashboard({ onNavigate }) {
  const { MetricCard, Badge, StatusPill, Card } = window.VTalNexusDesignSystem_63587b;
  const D = window.NexusData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-section)', maxWidth: 'var(--content-max)' }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap-card)' }}>
        <MetricCard label="Homes Passed" value="1.28M" delta="2.4%" icon={<Icon name="house" size={16} />} />
        <MetricCard label="OLTs ativas" value="412" delta="1.1%" icon={<Icon name="server" size={16} />} />
        <MetricCard label="Portas ocupadas" value="68.2" unit="%" deltaDir="down" delta="0.6%" icon={<Icon name="plug" size={16} />} />
        <MetricCard label="Taxa de viabilidade" value="98.4" unit="%" accent icon={<Icon name="zap" size={16} />} />
      </div>

      {/* Modules + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 'var(--gap-card)' }}>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ font: 'var(--text-h3)' }}>Domínios consolidados</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Soluções unificadas no inventário Nexus</div>
            </div>
            <Badge tone="brand">TM Forum SID</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {D.modules.map((m, i) => (
              <div key={m.name} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 14,
                borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
                borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--surface-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', flexShrink: 0 }}>
                  <Icon name={m.icon} size={17} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{m.desc}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>{m.count}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ font: 'var(--text-h3)' }}>Atividade da rede</div>
            <Icon name="activity" size={16} color="var(--text-tertiary)" />
          </div>
          <div style={{ flex: 1 }}>
            {D.activity.map((a) => (
              <div key={a.who} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: `var(--status-${a.tone})` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{a.who}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{a.what}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Saturation strip */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ font: 'var(--text-h3)' }}>Saturação de portas por OLT</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Top elementos por ocupação — clique para inspecionar</div>
          </div>
          <StatusPill status="sincronizando" pulse label="Sincronizando" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {D.elements.filter((e) => e.used > 0).slice(0, 6).map((e) => (
            <div key={e.id} onClick={() => onNavigate('topology')} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
              <div style={{ width: 150, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ELEMENT_META[e.type]?.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>{e.id}</span>
              </div>
              <div style={{ flex: 1, height: 8, background: 'var(--surface-inset)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ width: `${e.used}%`, height: '100%', borderRadius: 'var(--radius-full)', background: e.used >= 90 ? 'var(--status-red)' : e.used >= 70 ? 'var(--status-amber)' : 'var(--status-green)' }} />
              </div>
              <div style={{ width: 44, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{e.used}%</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { Dashboard });
