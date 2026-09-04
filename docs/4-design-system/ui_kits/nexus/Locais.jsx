// V.tal Nexus UI kit — Locais module (map, layers, entity detail)
// Adapted from components/core/geo.card.html into a routable screen.
// The Google basemap can't be embedded meaningfully here — a low-chroma
// synthetic terrain stands in for it, per the design system's placeholder rule.
const LAYERS = [
  { group: 'Locais', icon: 'map-pin', items: ['Estações', 'Sites de Rede', 'Sites de Serviço', 'Torres'] },
  { group: 'Infraestrutura Civil', icon: 'network', items: ['Postes', 'Dutos', 'Caixas Subterrâneas'] },
];
// Coords keep clear of the floating panels.
const MARKERS = [
  { t: 'available', x: 40, y: 9 }, { t: 'suspended', x: 54, y: 15 }, { t: 'available', x: 47, y: 24 },
  { t: 'partial', x: 41, y: 38 }, { t: 'available', x: 57, y: 33 }, { t: 'station', x: 52, y: 46, s: 'md' },
  { t: 'available', x: 13, y: 72 }, { t: 'suspended', x: 21, y: 80 },
  { t: 'available', x: 78, y: 73 }, { t: 'partial', x: 87, y: 80 },
];

function Locais({ rail = false }) {
  const { IconTabs, Switch, MapMarker, Badge } = window.VTalNexusDesignSystem_63587b;
  const [tab, setTab] = React.useState('cobertura');
  const [showDetail, setShowDetail] = React.useState(true);
  const [showLayers, setShowLayers] = React.useState(true);
  const [layers, setLayers] = React.useState({ Postes: false, Estações: true, 'Sites de Rede': true, 'Sites de Serviço': true, Torres: true, Dutos: true, 'Caixas Subterrâneas': true });

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, background: '#F1F0EC',
        backgroundImage: 'linear-gradient(90deg, rgba(46,45,57,.05) 1px, transparent 1px), linear-gradient(rgba(46,45,57,.05) 1px, transparent 1px), radial-gradient(circle at 70% 30%, #DDECE0 0 22%, transparent 22%), radial-gradient(circle at 14% 80%, #BFE3EE 0 28%, transparent 28%)',
        backgroundSize: '46px 46px, 46px 46px, 100% 100%, 100% 100%',
      }} />
      {MARKERS.map((m, i) => (
        <div key={i} style={{ position: 'absolute', left: m.x + '%', top: m.y + '%' }}>
          <MapMarker tone={m.t} size={m.s || 'sm'} icon={m.s ? <Icon name="building-2" size={13} /> : null} />
        </div>
      ))}
      <div style={{ position: 'absolute', left: '45%', top: '62%' }}>
        <MapMarker tone="available" size="md" selected icon={<Icon name="building-2" size={13} />} />
      </div>

      {rail && showDetail ? (
        <div className="vt-float-panel" style={{ position: 'absolute', left: 'var(--float-gap)', top: 'var(--float-gap)', width: 320, maxHeight: 'calc(100% - 2 * var(--float-gap))', overflowY: 'auto' }}>
          <div className="vt-searchbar" style={{ border: 'none', boxShadow: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, height: 46 }}>
            <Icon name="sliders-horizontal" size={17} />
            <input defaultValue="CDOI-2924 (ICI)" />
            <Icon name="search" size={17} />
          </div>
          <div className="vt-panel-head">
            <Icon name="chevron-left" size={17} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="vt-panel-eyebrow">CDOI</div>
              <div style={{ font: 'var(--text-h3)' }}>CDOI-2924 (ICI)</div>
            </div>
            <div onClick={() => setShowDetail(false)} style={{ cursor: 'pointer', display: 'flex' }}><Icon name="x" size={17} /></div>
          </div>
          <div style={{ padding: '14px 12px 4px' }}>
            <IconTabs value={tab} onChange={setTab} items={[
              { id: 'visao', label: 'Visão geral', icon: <Icon name="info" size={18} /> },
              { id: 'portas', label: 'Portas', icon: <Icon name="network" size={18} /> },
              { id: 'cobertura', label: 'Cobertura', icon: <Icon name="layers" size={18} /> },
              { id: 'historico', label: 'Histórico', icon: <Icon name="history" size={18} /> },
            ]} />
          </div>
          <div style={{ padding: '12px 16px 16px' }}>
            <dl className="vt-kv">
              <dt>Endereço</dt><dd>Sem endereço</dd>
              <dt>Status</dt><dd><Badge tone="green" dot>Ativo</Badge></dd>
              <dt>Portas</dt><dd>16 · 11 ocupadas</dd>
            </dl>
          </div>
        </div>
      ) : (
        <div className="vt-searchbar" style={{ position: 'absolute', left: 'var(--float-gap)', top: 'var(--float-gap)', width: rail ? 320 : 400 }}>
          <Icon name="sliders-horizontal" size={18} />
          <input placeholder="Pesquise no Nexus" />
          <Icon name="list-filter" size={18} />
          <Icon name="search" size={19} />
        </div>
      )}

      {showLayers ? (
        <div className="vt-float-panel" style={{ position: 'absolute', right: 'var(--float-gap)', top: 'var(--float-gap)', width: 250, padding: '4px 0', maxHeight: 'calc(100% - 2 * var(--float-gap))', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 8px' }}>
            <div style={{ flex: 1, font: 'var(--text-h3)' }}>Camadas</div>
            <div onClick={() => setShowLayers(false)} style={{ cursor: 'pointer', display: 'flex' }}><Icon name="x" size={16} /></div>
          </div>
          {LAYERS.map((g) => (
            <div key={g.group} style={{ borderTop: '1px solid var(--border)', padding: '10px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <Icon name={g.icon} size={16} />
                <span style={{ flex: 1, font: 'var(--fw-semibold) var(--fs-body-relaxed)/1.3 var(--font-ui)' }}>{g.group}</span>
                <Switch size="sm" checked onChange={() => {}} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingLeft: 25 }}>
                {g.items.map((name) => (
                  <Switch key={name} size="sm" label={name} checked={layers[name]} onChange={(v) => setLayers((s) => ({ ...s, [name]: v }))} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="vt-map-btn" style={{ position: 'absolute', right: 'var(--float-gap)', top: 'var(--float-gap)' }} onClick={() => setShowLayers(true)}><Icon name="layers" size={18} /></div>
      )}

      <div className="vt-float-panel" style={{ position: 'absolute', left: 'var(--float-gap)', bottom: 'var(--float-gap)', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderRadius: 'var(--radius-full)' }}>
        <span style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-secondary)' }}>Suspenso</span>
        <span style={{ width: 120, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--map-ramp)' }} />
        <span style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-secondary)' }}>Disponível</span>
      </div>
      <div className="vt-map-btn" style={{ position: 'absolute', right: 'var(--float-gap)', bottom: 'var(--float-gap)' }}><Icon name="locate" size={18} /></div>
    </div>
  );
}

Object.assign(window, { Locais });
