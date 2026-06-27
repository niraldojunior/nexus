// V.tal Nexus UI kit — Viabilidade (address feasibility check, "Viabilidade Fuzzy")
function Viability() {
  const { Input, Button, Card, Badge, StatusPill } = window.VTalNexusDesignSystem_63587b;
  const D = window.NexusData;
  const [query, setQuery] = React.useState('Rua das Palmeiras, 320');
  const [result, setResult] = React.useState(D.viabilities[0]);
  const [loading, setLoading] = React.useState(false);

  const run = (v) => {
    setLoading(true);
    setResult(null);
    setTimeout(() => { setResult(v); setLoading(false); }, 550);
  };

  const tone = { viavel: 'green', parcial: 'amber', inviavel: 'red' };
  const head = {
    viavel: { t: 'Endereço viável', d: 'Atendimento imediato pela rede existente', ic: 'circle-check-big' },
    parcial: { t: 'Viabilidade parcial', d: 'Requer expansão de rede de curto prazo', ic: 'circle-alert' },
    inviavel: { t: 'Endereço inviável', d: 'Sem infraestrutura de rede no raio de atendimento', ic: 'circle-x' },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 'var(--gap-card)', maxWidth: 1200 }}>
      {/* Search panel */}
      <Card pad={24} style={{ height: 'fit-content' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--vt-yellow)', color: 'var(--vt-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="zap" size={18} />
          </div>
          <div style={{ font: 'var(--text-h3)' }}>Motor de viabilidade</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>Consulta fuzzy por endereço, coordenada ou CEP — evoluído do Viabilidade Fuzzy.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Endereço ou coordenada" iconLeft={<Icon name="search" size={16} />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rua, número, CEP…" />
          <Button variant="primary" fullWidth iconLeft={<Icon name="radar" size={16} />} onClick={() => run(D.viabilities[0])}>Verificar viabilidade</Button>
        </div>
        <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div className="vt-eyebrow" style={{ marginBottom: 10 }}>Consultas recentes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {D.viabilities.map((v) => (
              <div key={v.addr} onClick={() => { setQuery(v.addr); run(v); }} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-inset)', cursor: 'pointer',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--status-${tone[v.status]})`, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.addr}</span>
                <Icon name="corner-down-right" size={13} color="var(--text-tertiary)" />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Result */}
      <div>
        {loading && (
          <Card pad={48} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 320 }}>
            <div style={{ width: 40, height: 40, border: '4px solid var(--surface-inset)', borderTopColor: 'var(--vt-yellow)', borderRadius: '50%', animation: 'vtspin 0.9s linear infinite' }} />
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Avaliando rede no raio de atendimento…</span>
            <style>{`@keyframes vtspin{to{transform:rotate(360deg)}}`}</style>
          </Card>
        )}
        {result && !loading && (
          <Card pad={0} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 24, background: `var(--status-${tone[result.status]}-soft)`, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: `var(--status-${tone[result.status]})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={head[result.status].ic} size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--text-primary)' }}>{head[result.status].t}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{head[result.status].d}</div>
              </div>
              <StatusPill status={result.status} />
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <Icon name="map-pin" size={15} color="var(--text-tertiary)" />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{result.addr}</span>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>· {result.city}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <Fact icon="ruler" label="Distância ao CTO mais próximo" value={result.dist > 800 ? '> 800 m' : `${result.dist} m`} />
                <Fact icon="box" label="Caixa terminal" value={result.cto} />
                <Fact icon="plug" label="Portas livres" value={result.ports > 0 ? `${result.ports} disponíveis` : 'Nenhuma'} tone={result.ports > 0 ? 'green' : 'red'} />
                <Fact icon="clock" label="Prazo estimado" value={result.eta} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <Button variant="primary" iconLeft={<Icon name="file-plus-2" size={15} />} disabled={result.status === 'inviavel'}>Gerar ordem de serviço</Button>
                <Button variant="secondary" iconLeft={<Icon name="share-2" size={15} />}>Ver na topologia</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Fact({ icon, label, value, tone }) {
  return (
    <div style={{ background: 'var(--surface-inset)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon name={icon} size={13} color="var(--text-tertiary)" />
        <span style={{ font: 'var(--text-eyebrow)', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: tone ? `var(--status-${tone})` : 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

Object.assign(window, { Viability });
