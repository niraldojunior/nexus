// V.tal Nexus UI kit — Topologia (network path + element detail)
function Topology() {
  const { Card, Badge, StatusPill, Button } = window.VTalNexusDesignSystem_63587b;

  const path = [
    { type: 'OLT', id: 'OLT-SP-CAS-014', label: 'Head-end', sub: 'POP Casa Verde' },
    { type: 'Cabo', id: 'CABO-FO-SP-0912', label: 'Feeder 144FO', sub: '4,2 km' },
    { type: 'Splitter', id: 'SPL-1x32-7745', label: '1:32', sub: 'CEO Vila Maria' },
    { type: 'CTO', id: 'CTO-4821', label: '16 portas', sub: '12 livres' },
    { type: 'Site', id: 'ONT-cliente', label: 'Cliente', sub: 'Drop ativo' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'var(--gap-card)', maxWidth: 'var(--content-max)', alignItems: 'start' }}>
      {/* Topology path */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-card)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div>
              <div style={{ font: 'var(--text-h3)' }}>Caminho óptico</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>OLT → Cliente · 5 elementos · 4,2 km</div>
            </div>
            <Badge tone="green" dot>Fim a fim íntegro</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {path.map((n, i) => (
              <React.Fragment key={n.id}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: ELEMENT_META[n.type]?.color, boxShadow: 'var(--shadow-sm)' }}>
                    <Icon name={ELEMENT_META[n.type]?.icon} size={24} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{n.id}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>{n.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{n.sub}</div>
                  </div>
                </div>
                {i < path.length - 1 && (
                  <div style={{ flex: '0 0 36px', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 38 }}>
                    <div style={{ width: '100%', height: 2, background: 'linear-gradient(90deg, var(--border-strong), var(--vt-yellow), var(--border-strong))' }} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ font: 'var(--text-h3)', marginBottom: 16 }}>Métricas ópticas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <OptMetric label="Potência RX" value="-21.4" unit="dBm" tone="green" />
            <OptMetric label="Atenuação" value="0.28" unit="dB/km" tone="green" />
            <OptMetric label="ORL" value="32.1" unit="dB" tone="amber" />
          </div>
        </Card>
      </div>

      {/* Element panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-card)' }}>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 13, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: ELEMENT_META.CTO.color }}>
              <Icon name="box" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>CTO-4821</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Caixa de Terminação Óptica</div>
            </div>
            <StatusPill status="online" pulse />
          </div>
          <div style={{ padding: '6px 20px' }}>
            {[
              ['Endereço', 'Rua das Palmeiras, 320'],
              ['Município', 'São Paulo / SP'],
              ['Coordenadas', '-23.5614, -46.6558'],
              ['Fornecedor', 'Furukawa'],
              ['Portas', '16 (4 ocupadas · 12 livres)'],
              ['Recurso TMF', 'TMF639-RI-0x9F2A'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>{k}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontFamily: k === 'Coordenadas' || k === 'Recurso TMF' ? 'var(--font-mono)' : 'inherit' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 16, display: 'flex', gap: 10 }}>
            <Button variant="primary" size="sm" fullWidth iconLeft={<Icon name="pencil" size={14} />}>Editar</Button>
            <Button variant="secondary" size="sm" fullWidth iconLeft={<Icon name="code" size={14} />}>API</Button>
          </div>
        </Card>

        <Card style={{ background: 'var(--vt-ink)', border: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="plug-zap" size={16} color="var(--vt-yellow)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Padrão TM Forum</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>Este recurso é exposto via Open API TMF639 (Resource Inventory) e reconciliado a cada 15 min.</p>
          <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--vt-yellow)', background: 'rgba(255,255,255,0.06)', padding: '8px 11px', borderRadius: 6 }}>GET /resourceInventory/v4/resource/0x9F2A</div>
        </Card>
      </div>
    </div>
  );
}

function OptMetric({ label, value, unit, tone }) {
  return (
    <div style={{ background: 'var(--surface-inset)', borderRadius: 'var(--radius-sm)', padding: 14, textAlign: 'center' }}>
      <div style={{ font: 'var(--text-eyebrow)', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: `var(--status-${tone})` }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{unit}</div>
    </div>
  );
}

Object.assign(window, { Topology });
