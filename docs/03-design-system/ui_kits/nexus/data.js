// V.tal Nexus — mock network inventory data (UI kit only, not production)
window.NexusData = (function () {
  const elements = [
    { id: 'OLT-SP-CAS-014', type: 'OLT', tipo: 'OLT', site: 'POP Casa Verde', addr: 'Av. Casa Verde, 1820 — São Paulo/SP', status: 'online', ports: '8.192', used: 78, vendor: 'Huawei MA5800', sync: 'há 2 min' },
    { id: 'CTO-4821', type: 'CTO', tipo: 'CTO', site: 'Caixa Terminal', addr: 'Rua das Palmeiras, 320 — São Paulo/SP', status: 'online', ports: '16', used: 25, vendor: 'Furukawa', sync: 'há 11 min' },
    { id: 'SPL-1x32-7745', type: 'Splitter', tipo: 'Splitter', site: 'CEO Vila Maria', addr: 'Rua Guilherme, 77 — São Paulo/SP', status: 'ativo', ports: '32', used: 91, vendor: 'Fiberhome', sync: 'há 4 min' },
    { id: 'CTO-9930', type: 'CTO', tipo: 'CTO', site: 'Caixa Terminal', addr: 'Al. dos Anapurus, 145 — São Paulo/SP', status: 'degradado', ports: '16', used: 100, vendor: 'Furukawa', sync: 'há 1 h' },
    { id: 'OLT-RJ-TIJ-002', type: 'OLT', tipo: 'OLT', site: 'POP Tijuca', addr: 'Rua Conde de Bonfim, 455 — Rio de Janeiro/RJ', status: 'online', ports: '4.096', used: 64, vendor: 'Nokia ISAM', sync: 'há 3 min' },
    { id: 'POSTE-SP-22841', type: 'Poste', tipo: 'Poste', site: 'Infra aérea', addr: 'Rua Voluntários, 12 — São Paulo/SP', status: 'ativo', ports: '—', used: 40, vendor: 'Enel', sync: 'há 2 d' },
    { id: 'CTO-4477', type: 'CTO', tipo: 'CTO', site: 'Caixa Terminal', addr: 'Rua Cardeal, 88 — Guarulhos/SP', status: 'planejado', ports: '16', used: 0, vendor: 'Furukawa', sync: '—' },
    { id: 'CABO-FO-SP-0912', type: 'Cabo', tipo: 'Cabo', site: 'Backbone', addr: 'Eixo Marginal Tietê — 12 km', status: 'online', ports: '144 FO', used: 55, vendor: 'Prysmian', sync: 'há 6 min' },
    { id: 'SPL-1x8-3320', type: 'Splitter', tipo: 'Splitter', site: 'CEO Santana', addr: 'Rua Alfredo Pujol, 500 — São Paulo/SP', status: 'offline', ports: '8', used: 0, vendor: 'Fiberhome', sync: 'há 5 h' },
    { id: 'CTO-1188', type: 'CTO', tipo: 'CTO', site: 'Caixa Terminal', addr: 'Rua das Acácias, 9 — Osasco/SP', status: 'online', ports: '16', used: 50, vendor: 'Furukawa', sync: 'há 22 min' },
  ];

  const viabilities = [
    { addr: 'Rua das Palmeiras, 320', city: 'São Paulo/SP', status: 'viavel', dist: 42, cto: 'CTO-4821', ports: 12, eta: 'Imediata' },
    { addr: 'Al. dos Anapurus, 145', city: 'São Paulo/SP', status: 'parcial', dist: 180, cto: 'CTO-9930', ports: 0, eta: '15 dias (expansão)' },
    { addr: 'Rua Voluntários, 12', city: 'São Paulo/SP', status: 'inviavel', dist: 920, cto: '—', ports: 0, eta: 'Sem rede' },
  ];

  const modules = [
    { name: 'Geosite', desc: 'Sites, POPs e estações', icon: 'building-2', count: '1.842' },
    { name: 'Logradouros', desc: 'Endereçamento e CEPs', icon: 'map-pin', count: '4,7M' },
    { name: 'Geonet', desc: 'Topologia física da rede', icon: 'share-2', count: '38,1M' },
    { name: 'Viabilidade Fuzzy', desc: 'Motor de viabilidade', icon: 'zap', count: '98,4%' },
  ];

  const activity = [
    { who: 'Sync TM Forum', what: 'Reconciliação de 1.204 recursos (TMF639)', when: 'há 2 min', tone: 'blue' },
    { who: 'CTO-9930', what: 'Saturação de portas atingiu 100%', when: 'há 1 h', tone: 'amber' },
    { who: 'SPL-1x8-3320', what: 'Elemento sem resposta — marcado offline', when: 'há 5 h', tone: 'red' },
    { who: 'OLT-SP-CAS-014', what: 'Provisionamento de 320 novos ONTs', when: 'há 6 h', tone: 'green' },
  ];

  const geo = {
    sites: [
      {
        id: 'site-rj-bot-co-01',
        name: 'Central Botafogo',
        spec: 'CentralOffice',
        category: 'Site',
        status: 'ativo',
        parent: 'Rio de Janeiro',
        address: 'Rua Voluntários da Pátria, 320 — Rio de Janeiro/RJ',
        location: 'Point · -43.1886, -22.9519',
        tenant: 'V.tal',
        origin: 'Netwin',
        completeness: 98,
        map: { x: 63, y: 56 },
      },
      {
        id: 'site-sp-cas-pop-03',
        name: 'POP Casa Verde',
        spec: 'POP',
        category: 'Site',
        status: 'ativo',
        parent: 'São Paulo',
        address: 'Av. Casa Verde, 1820 — São Paulo/SP',
        location: 'Point · -46.6602, -23.4991',
        tenant: 'V.tal',
        origin: 'Geosite',
        completeness: 94,
        map: { x: 42, y: 48 },
      },
      {
        id: 'site-sp-arm-044',
        name: 'Armário Santana 044',
        spec: 'Cabinet',
        category: 'Site',
        status: 'planejado',
        parent: 'São Paulo',
        address: 'Rua Alfredo Pujol, 500 — São Paulo/SP',
        location: 'Point · -46.6288, -23.5012',
        tenant: 'ISP Alfa',
        origin: 'OZMAP',
        completeness: 82,
        map: { x: 48, y: 39 },
      },
      {
        id: 'site-rj-tij-pop-02',
        name: 'POP Tijuca',
        spec: 'POP',
        category: 'Site',
        status: 'degradado',
        parent: 'Rio de Janeiro',
        address: 'Rua Conde de Bonfim, 455 — Rio de Janeiro/RJ',
        location: 'Point · -43.2366, -22.9249',
        tenant: 'V.tal',
        origin: 'NetworkCore',
        completeness: 90,
        map: { x: 69, y: 43 },
      },
      {
        id: 'site-sp-sla-pop03-2a',
        name: 'Sala Técnica 2A',
        spec: 'Room',
        category: 'SubSite',
        status: 'ativo',
        parent: 'POP Casa Verde',
        address: 'Herdado do site pai',
        location: 'Sem place próprio',
        tenant: 'V.tal',
        origin: 'Nexus',
        completeness: 76,
        map: null,
      },
    ],
    regions: [
      { id: 'site-region-br', name: 'Brasil', type: 'Region', children: 2 },
      { id: 'site-region-sp', name: 'São Paulo', type: 'Region', parent: 'Brasil', children: 3 },
      { id: 'site-region-rj', name: 'Rio de Janeiro', type: 'Region', parent: 'Brasil', children: 2 },
      { id: 'site-region-botafogo', name: 'Botafogo', type: 'Region', parent: 'Rio de Janeiro', children: 1 },
    ],
    addresses: [
      { id: 'addr-rj-bot-320', main: 'Rua Voluntários da Pátria, 320', city: 'Rio de Janeiro/RJ', quality: 'Validado', location: 'loc-rj-bot-co-01', refs: 1 },
      { id: 'addr-sp-cas-1820', main: 'Av. Casa Verde, 1820', city: 'São Paulo/SP', quality: 'Validado', location: 'loc-sp-cas-pop-03', refs: 2 },
      { id: 'addr-sp-pujol-500', main: 'Rua Alfredo Pujol, 500', city: 'São Paulo/SP', quality: 'Geocodificar', location: 'Pendente', refs: 1 },
    ],
    locations: [
      { id: 'loc-rj-bot-co-01', name: 'Central Botafogo', geometry: 'Point', spatialRef: 'EPSG:4326', refs: 'Site + Address' },
      { id: 'loc-region-botafogo', name: 'Bairro Botafogo', geometry: 'Polygon', spatialRef: 'EPSG:4326', refs: 'Region' },
      { id: 'loc-cov-sp-norte', name: 'Cobertura SP Norte', geometry: 'MultiPolygon', spatialRef: 'EPSG:4326', refs: 'Viabilidade' },
      { id: 'loc-rota-marginal-0912', name: 'Eixo Marginal Tietê', geometry: 'LineString', spatialRef: 'EPSG:4326', refs: 'Cabo' },
    ],
    specs: [
      { code: 'REG', name: 'Region', category: 'Region', children: 'Region, Site', status: 'Active' },
      { code: 'FG', name: 'FunctionalGroup', category: 'FunctionalGroup', children: 'FunctionalGroup, Site', status: 'Active' },
      { code: 'CO', name: 'CentralOffice', category: 'Site', children: 'Floor, Room', status: 'Active' },
      { code: 'POP', name: 'POP', category: 'Site', children: 'Floor, Room', status: 'Active' },
      { code: 'ARM', name: 'Cabinet', category: 'Site', children: 'Nenhum', status: 'Active' },
      { code: 'AND', name: 'Floor', category: 'SubSite', children: 'Room', status: 'Active' },
      { code: 'SLA', name: 'Room', category: 'SubSite', children: 'Cage', status: 'Active' },
      { code: 'CAGE', name: 'Cage', category: 'SubSite', children: 'Nenhum', status: 'Active' },
    ],
    relationships: [
      { from: 'Central Botafogo', to: 'POP Tijuca', type: 'feeds', impact: '17 Sites dependentes' },
      { from: 'POP Casa Verde', to: 'Armário Santana 044', type: 'feeds', impact: '42 CTOs na área' },
      { from: 'POP Casa Verde', to: 'POPs de Borda Sudeste', type: 'memberOf', impact: 'Grupo funcional' },
    ],
  };

  return { elements, viabilities, modules, activity, geo };
})();
