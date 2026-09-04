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

  return { elements, viabilities, modules, activity };
})();
