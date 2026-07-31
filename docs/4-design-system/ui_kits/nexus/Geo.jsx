// V.tal Nexus UI kit — Geographic console (TMF673/674/675)
function Geo() {
  const { Badge, StatusPill, Button } = window.VTalNexusDesignSystem_63587b;
  const D = window.NexusData.geo;
  const [tab, setTab] = React.useState('mapa');
  const [selectedId, setSelectedId] = React.useState(D.sites[0].id);
  const selected = D.sites.find((site) => site.id === selectedId) || D.sites[0];
  const missingPlace = D.sites.filter((site) => !site.map);

  const tabs = [
    { id: 'mapa', label: 'Mapa', icon: 'map' },
    { id: 'sites', label: 'Sites', icon: 'building-2' },
    { id: 'hierarquia', label: 'Hierarquia', icon: 'git-fork' },
    { id: 'enderecos', label: 'Endereços', icon: 'map-pin' },
    { id: 'locations', label: 'Locations', icon: 'drafting-compass' },
    { id: 'catalogo', label: 'Catálogo Geo', icon: 'settings-2' },
  ];

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 'var(--content-max)' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <GeoMetric label="Sites TMF674" value="1.842" icon="building-2" tone="brand" />
        <GeoMetric label="Com place válido" value="94,8%" icon="map-pinned" tone="green" />
        <GeoMetric label="Endereços TMF673" value="4,7M" icon="map-pin" tone="blue" />
        <GeoMetric
          label="Pendências Geo"
          value={String(missingPlace.length)}
          icon="triangle-alert"
          tone="amber"
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 5,
            background: 'var(--surface-card)',
            padding: 4,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            overflowX: 'auto',
          }}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                height: 34,
                padding: '0 11px',
                borderRadius: 5,
                border: 'none',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: 12.5,
                fontWeight: 700,
                background: tab === item.id ? 'var(--vt-ink)' : 'transparent',
                color: tab === item.id ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="secondary" iconLeft={<Icon name="upload" size={15} />}>
            Importar
          </Button>
          <Button variant="secondary" iconLeft={<Icon name="pen-tool" size={15} />}>
            Desenhar área
          </Button>
          <Button variant="secondary" iconLeft={<Icon name="crosshair" size={15} />}>
            Geocodificar
          </Button>
          <Button variant="secondary" iconLeft={<Icon name="download" size={15} />}>
            Exportar GeoJSON
          </Button>
          <Button variant="primary" iconLeft={<Icon name="plus" size={15} />}>
            Novo Site
          </Button>
        </div>
      </div>

      {tab === 'mapa' && (
        <GeoMap
          D={D}
          selected={selected}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          missingPlace={missingPlace}
        />
      )}
      {tab === 'sites' && <GeoSites D={D} setSelectedId={setSelectedId} setTab={setTab} />}
      {tab === 'hierarquia' && <GeoHierarchy D={D} />}
      {tab === 'enderecos' && <GeoAddresses D={D} />}
      {tab === 'locations' && <GeoLocations D={D} />}
      {tab === 'catalogo' && <GeoCatalog D={D} />}
    </div>
  );
}

function GeoMetric({ label, value, icon, tone }) {
  const toneMap = {
    brand: ['var(--vt-yellow)', 'var(--vt-ink)'],
    green: ['var(--status-green-soft)', 'var(--status-green)'],
    blue: ['var(--status-blue-soft)', 'var(--status-blue)'],
    amber: ['var(--status-amber-soft)', 'var(--status-amber)'],
  };
  const colors = toneMap[tone] || toneMap.blue;
  return (
    <div
      className="vt-card"
      style={{
        minHeight: 86,
        padding: 14,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-tertiary)',
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 7,
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            fontWeight: 800,
            color: 'var(--text-primary)',
          }}
        >
          {value}
        </div>
      </div>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: colors[0],
          color: colors[1],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={18} />
      </div>
    </div>
  );
}

function GeoMap({ D, selected, selectedId, setSelectedId, missingPlace }) {
  const { Badge, StatusPill, Button } = window.VTalNexusDesignSystem_63587b;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 360px',
        gap: 14,
        minHeight: 560,
      }}
    >
      <div
        className="vt-card"
        style={{ position: 'relative', overflow: 'hidden', padding: 0, minHeight: 560 }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #DCE4EC, #F8FAFC 45%, #E5E7EB)',
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.42,
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '6%',
            top: '13%',
            width: '38%',
            height: '30%',
            border: '2px solid rgba(59,130,246,0.42)',
            background: 'rgba(59,130,246,0.08)',
            borderRadius: '44% 56% 62% 38%',
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '14%',
            top: '24%',
            width: '26%',
            height: '42%',
            border: '2px solid rgba(16,185,129,0.38)',
            background: 'rgba(16,185,129,0.08)',
            borderRadius: '54% 46% 42% 58%',
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '18%',
            bottom: '18%',
            right: '16%',
            height: 3,
            background:
              'linear-gradient(90deg, transparent, var(--status-blue), var(--status-green), transparent)',
            transform: 'rotate(-8deg)',
            opacity: 0.7,
            zIndex: 2,
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            right: 14,
            zIndex: 5,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              padding: '0 12px',
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-full)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Icon name="search" size={15} color="var(--text-tertiary)" />
            <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
              Buscar site, endereço ou polígono
            </span>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {['Sites', 'Regiões', 'Relações', 'Sem place'].map((layer) => (
              <span
                key={layer}
                style={{
                  height: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 10px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.9)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: layer === 'Sem place' ? 'var(--status-amber)' : 'var(--vt-yellow)',
                  }}
                />
                {layer}
              </span>
            ))}
          </div>
        </div>

        {D.sites
          .filter((site) => site.map)
          .map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => setSelectedId(site.id)}
              title={site.name}
              style={{
                position: 'absolute',
                left: `${site.map.x}%`,
                top: `${site.map.y}%`,
                zIndex: 4,
                width: selectedId === site.id ? 42 : 34,
                height: selectedId === site.id ? 42 : 34,
                marginLeft: -17,
                marginTop: -17,
                borderRadius: 10,
                border: selectedId === site.id ? '3px solid var(--vt-ink)' : '2px solid #fff',
                background:
                  site.status === 'planejado'
                    ? 'var(--status-purple)'
                    : site.status === 'degradado'
                      ? 'var(--status-amber)'
                      : 'var(--vt-yellow)',
                color: site.status === 'ativo' ? 'var(--vt-ink)' : '#fff',
                boxShadow: '0 10px 24px rgba(24,25,25,0.22)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={site.spec === 'Cabinet' ? 'archive' : 'building-2'} size={16} />
            </button>
          ))}

        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            zIndex: 5,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(24,25,25,0.88)',
            color: '#fff',
          }}
        >
          <Icon name="mouse-pointer-click" size={15} color="var(--vt-yellow)" />
          <span style={{ fontSize: 12.5 }}>
            Clique no mapa cria Location; Novo Site abre wizard TMF674.
          </span>
        </div>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="vt-card" style={{ padding: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-tertiary)',
                }}
              >
                Site selecionado
              </div>
              <h3 style={{ marginTop: 5, fontSize: 18 }}>{selected.name}</h3>
            </div>
            <StatusPill status={selected.status} />
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <GeoField label="Tipo" value={`${selected.spec} · ${selected.category}`} />
            <GeoField label="ParentSite" value={selected.parent} />
            <GeoField label="Address" value={selected.address} />
            <GeoField label="Place" value={selected.location} />
            <GeoField label="Tenant / origem" value={`${selected.tenant} · ${selected.origin}`} />
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" iconLeft={<Icon name="move" size={14} />}>
              Mover no mapa
            </Button>
            <Button variant="ghost" size="sm" iconLeft={<Icon name="history" size={14} />}>
              Audit trail
            </Button>
          </div>
        </div>

        <div className="vt-card" style={{ padding: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
              Pendências de coordenada
            </div>
            <Badge tone="amber">{missingPlace.length}</Badge>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {missingPlace.map((site) => (
              <div
                key={site.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '9px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {site.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{site.parent}</div>
                </div>
                <Button variant="ghost" size="sm">
                  Geocodificar
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="vt-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
            Impacto topológico
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {D.relationships.map((rel) => (
              <div
                key={`${rel.from}-${rel.to}`}
                style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}
              >
                <strong style={{ color: 'var(--text-primary)' }}>{rel.from}</strong> {rel.type}{' '}
                {rel.to}
                <br />
                <span style={{ color: 'var(--text-tertiary)' }}>{rel.impact}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function GeoField({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{ marginTop: 3, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.35 }}
      >
        {value}
      </div>
    </div>
  );
}

function GeoSites({ D, setSelectedId, setTab }) {
  const { Badge, StatusPill } = window.VTalNexusDesignSystem_63587b;
  return (
    <div className="vt-card" style={{ overflow: 'hidden', padding: 0 }}>
      <table className="vt-table">
        <thead>
          <tr>
            <th style={{ paddingLeft: 20 }}>Site</th>
            <th>Tipo</th>
            <th>ParentSite</th>
            <th>Status</th>
            <th>Address</th>
            <th>Place</th>
            <th>Completude</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {D.sites.map((site) => (
            <tr
              key={site.id}
              onClick={() => {
                setSelectedId(site.id);
                setTab('mapa');
              }}
              style={{ cursor: 'pointer' }}
            >
              <td style={{ paddingLeft: 16 }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 12.5 }}>
                  {site.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {site.id}
                </div>
              </td>
              <td>
                <Badge tone={site.category === 'SubSite' ? 'purple' : 'brand'}>{site.spec}</Badge>
              </td>
              <td>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {site.parent}
                </span>
              </td>
              <td>
                <StatusPill status={site.status} />
              </td>
              <td style={{ maxWidth: 260 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {site.address}
                </span>
              </td>
              <td>
                <Badge tone={site.map ? 'green' : 'amber'}>
                  {site.map ? 'Válido' : 'Pendente'}
                </Badge>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: 'var(--surface-inset)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${site.completeness}%`,
                        height: '100%',
                        background:
                          site.completeness >= 90
                            ? 'var(--status-green)'
                            : site.completeness >= 80
                              ? 'var(--status-amber)'
                              : 'var(--status-red)',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      width: 36,
                    }}
                  >
                    {site.completeness}%
                  </span>
                </div>
              </td>
              <td style={{ paddingRight: 12 }}>
                <Icon name="chevron-right" size={16} color="var(--text-tertiary)" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeoHierarchy({ D }) {
  const { Badge } = window.VTalNexusDesignSystem_63587b;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14 }}>
      <div className="vt-card" style={{ padding: 18 }}>
        <TreeLine
          level={0}
          icon="globe-2"
          name="Brasil"
          meta="Region · site-region-br"
          count="2 UFs"
        />
        <TreeLine
          level={1}
          icon="map"
          name="São Paulo"
          meta="Region · parentSite=Brasil"
          count="3 Sites"
        />
        <TreeLine
          level={2}
          icon="building-2"
          name="POP Casa Verde"
          meta="POP · Site"
          count="1 SubSite"
        />
        <TreeLine
          level={3}
          icon="door-open"
          name="Sala Técnica 2A"
          meta="Room · SubSite"
          count="0"
        />
        <TreeLine
          level={2}
          icon="archive"
          name="Armário Santana 044"
          meta="Cabinet · Site"
          count="0"
        />
        <TreeLine
          level={1}
          icon="map"
          name="Rio de Janeiro"
          meta="Region · parentSite=Brasil"
          count="2 Sites"
        />
        <TreeLine
          level={2}
          icon="building-2"
          name="Central Botafogo"
          meta="CentralOffice · Site"
          count="0"
        />
        <TreeLine level={2} icon="building-2" name="POP Tijuca" meta="POP · Site" count="0" />
      </div>
      <div className="vt-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
          Validação de contenção
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <RuleBadge ok label="POP abaixo de Region" />
          <RuleBadge ok label="Room abaixo de POP" />
          <RuleBadge label="Cage abaixo de Region" />
        </div>
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--status-red-soft)',
            color: 'var(--text-secondary)',
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>Bloqueio esperado:</strong> Cage só pode
          ser filho de Room. A UI deve impedir a seleção de Region como parentSite.
        </div>
        <div style={{ marginTop: 14 }}>
          <Badge tone="brand">allowedParentSpec / allowedChildSpec</Badge>
        </div>
      </div>
    </div>
  );
}

function TreeLine({ level, icon, name, meta, count }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        paddingLeft: level * 26,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: level <= 1 ? 'var(--vt-yellow)' : 'var(--surface-inset)',
            color: level <= 1 ? 'var(--vt-ink)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={14} />
        </div>
        <div>
          <div style={{ fontSize: 12.8, fontWeight: 800, color: 'var(--text-primary)' }}>
            {name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{meta}</div>
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{count}</span>
    </div>
  );
}

function RuleBadge({ ok, label }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12.5,
        color: 'var(--text-secondary)',
      }}
    >
      <Icon
        name={ok ? 'check-circle-2' : 'x-circle'}
        size={15}
        color={ok ? 'var(--status-green)' : 'var(--status-red)'}
      />
      {label}
    </div>
  );
}

function GeoAddresses({ D }) {
  return (
    <SimpleGeoTable
      rows={D.addresses}
      columns={[
        ['id', 'ID'],
        ['main', 'Endereço'],
        ['city', 'Cidade/UF'],
        ['quality', 'Qualidade'],
        ['location', 'GeographicLocation'],
        ['refs', 'Refs'],
      ]}
    />
  );
}

function GeoLocations({ D }) {
  return (
    <SimpleGeoTable
      rows={D.locations}
      columns={[
        ['id', 'ID'],
        ['name', 'Nome'],
        ['geometry', 'Geometria'],
        ['spatialRef', 'SpatialRef'],
        ['refs', 'Referenciado por'],
      ]}
    />
  );
}

function GeoCatalog({ D }) {
  return (
    <SimpleGeoTable
      rows={D.specs}
      columns={[
        ['code', 'Código'],
        ['name', 'SiteSpecification'],
        ['category', 'Categoria'],
        ['children', 'allowedChildSpec'],
        ['status', 'Status'],
      ]}
    />
  );
}

function SimpleGeoTable({ rows, columns }) {
  const { Badge } = window.VTalNexusDesignSystem_63587b;
  return (
    <div className="vt-card" style={{ overflow: 'hidden', padding: 0 }}>
      <table className="vt-table">
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th key={col[0]} style={index === 0 ? { paddingLeft: 20 } : null}>
                {col[1]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || row.code || rowIndex}>
              {columns.map((col, colIndex) => {
                const value = row[col[0]];
                const isStatus =
                  col[0] === 'quality' ||
                  col[0] === 'status' ||
                  col[0] === 'geometry' ||
                  col[0] === 'category';
                return (
                  <td key={col[0]} style={colIndex === 0 ? { paddingLeft: 16 } : null}>
                    {isStatus ? (
                      <Badge tone={badgeTone(value)}>{value}</Badge>
                    ) : (
                      <span
                        style={{
                          fontSize: 12.5,
                          color: colIndex === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontFamily: colIndex === 0 ? 'var(--font-mono)' : 'var(--font-ui)',
                          fontWeight: colIndex === 0 ? 700 : 500,
                        }}
                      >
                        {value}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function badgeTone(value) {
  if (['Validado', 'Active', 'Point', 'Site'].includes(value)) return 'green';
  if (['Polygon', 'MultiPolygon', 'Region'].includes(value)) return 'blue';
  if (['LineString', 'SubSite'].includes(value)) return 'purple';
  if (['Geocodificar'].includes(value)) return 'amber';
  return 'neutral';
}

Object.assign(window, { Geo });
