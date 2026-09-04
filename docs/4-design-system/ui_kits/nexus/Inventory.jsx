// V.tal Nexus UI kit — Inventário (network elements table)
function Inventory({ onNavigate }) {
  const { Badge, StatusPill, Button } = window.VTalNexusDesignSystem_63587b;
  const D = window.NexusData;
  const [filter, setFilter] = React.useState('Todos');
  const types = ['Todos', 'OLT', 'CTO', 'Splitter', 'Poste', 'Cabo'];
  const rows = filter === 'Todos' ? D.elements : D.elements.filter((e) => e.type === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 'var(--content-max)' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, background: 'var(--surface-card)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: '6px 13px', borderRadius: 5, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
              background: filter === t ? 'var(--vt-ink)' : 'transparent',
              color: filter === t ? '#fff' : 'var(--text-secondary)',
              transition: 'all .15s var(--ease)',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" iconLeft={<Icon name="sliders-horizontal" size={15} />}>Filtros</Button>
          <Button variant="primary" iconLeft={<Icon name="plus" size={15} />}>Novo elemento</Button>
        </div>
      </div>

      {/* table */}
      <div className="vt-card" style={{ overflow: 'hidden', padding: 0 }}>
        <table className="vt-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Elemento</th>
              <th>Classe</th>
              <th>Localização</th>
              <th>Status</th>
              <th>Ocupação</th>
              <th>Fornecedor</th>
              <th>Sync</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} onClick={() => onNavigate('topology')} style={{ cursor: 'pointer' }}>
                <td style={{ paddingLeft: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: ELEMENT_META[e.type]?.color }}>
                      <Icon name={ELEMENT_META[e.type]?.icon} size={14} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{e.id}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{e.site}</div>
                    </div>
                  </div>
                </td>
                <td><Badge tone="neutral">{e.tipo}</Badge></td>
                <td style={{ maxWidth: 240 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.addr}</span>
                </td>
                <td><StatusPill status={e.status} pulse={e.status === 'online'} /></td>
                <td>
                  {e.ports === '—' ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--surface-inset)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ width: `${e.used}%`, height: '100%', background: e.used >= 90 ? 'var(--status-red)' : e.used >= 70 ? 'var(--status-amber)' : 'var(--status-green)' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', width: 60 }}>{e.used}% · {e.ports}</span>
                    </div>
                  )}
                </td>
                <td><span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.vendor}</span></td>
                <td><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{e.sync}</span></td>
                <td style={{ paddingRight: 12 }}><Icon name="chevron-right" size={16} color="var(--text-tertiary)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>{rows.length} de 38,1M recursos · TMF639 Resource Inventory</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="ghost" size="sm" iconLeft={<Icon name="chevron-left" size={14} />}>Anterior</Button>
            <Button variant="ghost" size="sm" iconRight={<Icon name="chevron-right" size={14} />}>Próximo</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Inventory });
