#!/usr/bin/env node
/**
 * Seed de uma rede GPON fim a fim em Icaraí (Niterói/RJ).
 *
 * Monta o caminho óptico completo, da porta da OLT até a ONT na casa do
 * assinante, com geometria real para tudo que existe na rua:
 *
 *   Estação Icaraí (CO)
 *     └── 3º Andar                    (SubSite)
 *          └── Sala GPON              (SubSite)
 *               └── OLT ─ Placa GPON ─ Porta GPON 1..8
 *                          │
 *                          └─ porta 1 → CABO PRIMÁRIO (feeder, LineString)
 *                                        → SPLITTER 1:8 no POSTE P-001
 *                                          → 3 × CABO SECUNDÁRIO (LineString)
 *                                            → 3 × CDOE, cada uma no seu poste
 *                                              → 3 × CABO DROP cada
 *                                                → 9 casas, 1 ONT em cada
 *
 * Cada casa fecha o fim a fim no Módulo 3: um RFS que consome a ONT + a porta
 * GPON (supportingResource) e um CFS de banda larga com subscriber.
 *
 * Modelagem — como isto se encaixa no cânone:
 *   · C2 — Do rack para dentro é Resource: OLT, placa e portas têm `place` = o
 *     GeographicSite da Sala GPON. Acima do rack (Sala → Andar → Estação) é
 *     hierarquia de GeographicSite.
 *   · C4 — Cada casa é um "Ponto de instalação" (Home Connected), não um Service.
 *   · Planta externa — poste, splitter, CDOE e cabos NÃO ficam dentro de um site:
 *     eles têm coordenada própria na rua, então `place` = GeographicLocation
 *     (Point para os equipamentos, LineString para a rota dos cabos). O
 *     `referencePoint` da Location dá o rótulo amigável ("Poste P-001 — ...").
 *
 * É idempotente: identifica tudo por nome e cria só o que falta.
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/seed-gpon-niteroi.mjs
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 */

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const SEED_TAG = 'gpon-icarai';

// ---------------------------------------------------------------- geografia --
//
// Icaraí é um bairro de malha ortogonal girada: as ruas correm em dois rumos
// fixos — o das transversais que descem para a praia e o das paralelas a ela.
// Um cabo aéreo segue o poste, o poste segue a calçada e a calçada segue a rua,
// então NENHUM segmento pode cortar quarteirão na diagonal: todo trecho anda
// sobre um dos dois rumos e vira em esquina.
//
// Não há serviço de rota disponível neste ambiente (Directions, Routes,
// Geocoding e OSRM estão todos bloqueados/desabilitados), então a malha é
// construída analiticamente: uma origem real na Rua Gavião Peixoto, os dois
// rumos medidos sobre o traçado do bairro, e um reticulado de esquinas. As rotas
// são caminhos por esse reticulado, o que garante ângulo reto nas curvas.

// Rumos em graus (azimute: 0 = norte, cresce no sentido horário).
const RUMO_RUA = 137; // desce a Gavião Peixoto, sentido sudeste
const RUMO_TRAVESSA = 47; // transversais, sentido nordeste

// Quarteirão típico de Icaraí.
const BLOCO_RUA = 130; // metros
const BLOCO_TRAVESSA = 115; // metros

// Conversão metro → grau na latitude de Niterói (-22.9).
const M_POR_GRAU_LAT = 110574;
const M_POR_GRAU_LNG = 102545;

// Anda `metros` a partir de um ponto seguindo um rumo. Distância negativa anda
// no sentido oposto — é assim que a malha cobre os dois lados da estação.
function walk([lng, lat], rumoGraus, metros) {
  const rad = (rumoGraus * Math.PI) / 180;
  return [
    lng + (Math.sin(rad) * metros) / M_POR_GRAU_LNG,
    lat + (Math.cos(rad) * metros) / M_POR_GRAU_LAT,
  ];
}

// Estação Icaraí, na Rua Gavião Peixoto — origem do reticulado.
const CO_COORD = [-43.1062, -22.9028];
const CO_ADDRESS = { street: 'Rua Gavião Peixoto', streetNr: '220' };

// Esquina (i, j): i quarteirões descendo a rua principal, j nas transversais.
const esquina = (i, j) => walk(walk(CO_COORD, RUMO_RUA, i * BLOCO_RUA), RUMO_TRAVESSA, j * BLOCO_TRAVESSA);

// Poste do splitter primário: duas quadras abaixo da estação, virando uma
// transversal à direita.
const POSTE_SPLITTER = {
  tag: 'P-001',
  coord: esquina(2, 1),
  street: 'Rua Gavião Peixoto esq. Rua Cinco de Julho',
};

// Feeder: desce a Gavião Peixoto duas quadras e vira na Cinco de Julho.
const ROTA_PRIMARIO = [CO_COORD, esquina(1, 0), esquina(2, 0), esquina(2, 1)];

// Posiciona uma casa: anda `ao longo` metros pela rua a partir da esquina e
// recua `recuo` metros para dentro do quarteirão, onde fica a testada do lote.
const casaEm = (i, j, aoLongo, recuo) => walk(walk(esquina(i, j), RUMO_RUA, aoLongo), RUMO_TRAVESSA, recuo);

// Drop: sai do poste, corre pela calçada até a testada da casa e entra no lote.
const rotaDrop = (poste, i, j, aoLongo, recuo) => {
  const testada = walk(esquina(i, j), RUMO_RUA, aoLongo);
  return [poste, testada, walk(testada, RUMO_TRAVESSA, recuo)];
};

// Três ramais secundários, cada um terminando no poste de uma CDOE.
const RAMAIS = [
  {
    cdoe: 'CDOE-01',
    poste: { tag: 'P-002', coord: esquina(1, 3), street: 'Rua Tavares de Macedo' },
    // Sobe uma quadra pela transversal e segue duas quadras pela Tavares de Macedo.
    rota: [esquina(2, 1), esquina(2, 2), esquina(1, 2), esquina(1, 3)],
    casas: [
      { street: 'Rua Tavares de Macedo', streetNr: '318', at: [1, 3, 40, 22] },
      { street: 'Rua Domingues de Sá', streetNr: '145', at: [1, 3, -45, 22] },
      { street: 'Rua Moreira César', streetNr: '77', at: [1, 3, 85, -20] },
    ],
  },
  {
    cdoe: 'CDOE-02',
    poste: { tag: 'P-003', coord: esquina(4, 2), street: 'Rua Lopes Trovão' },
    rota: [esquina(2, 1), esquina(3, 1), esquina(4, 1), esquina(4, 2)],
    casas: [
      { street: 'Rua Lopes Trovão', streetNr: '462', at: [4, 2, 45, 20] },
      { street: 'Rua Presidente Backer', streetNr: '210', at: [4, 2, -40, 20] },
      { street: 'Rua Miguel de Frias', streetNr: '88', at: [4, 2, 90, -22] },
    ],
  },
  {
    cdoe: 'CDOE-03',
    poste: { tag: 'P-004', coord: esquina(3, -1), street: 'Rua Andrade Neves' },
    rota: [esquina(2, 1), esquina(2, 0), esquina(3, 0), esquina(3, -1)],
    casas: [
      { street: 'Rua Andrade Neves', streetNr: '146', at: [3, -1, 45, -20] },
      { street: 'Rua Otávio Carneiro', streetNr: '54', at: [3, -1, -45, -20] },
      { street: 'Rua Álvares de Azevedo', streetNr: '199', at: [3, -1, 90, 22] },
    ],
  },
];

const PORTAS_POR_PLACA = 8;
const CITY = 'Niterói';
const UF = 'RJ';

// ------------------------------------------------------------------- infra --

async function api(method, pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const tag = () => ({ name: 'seed', value: SEED_TAG, valueType: 'string' });

// Índices de idempotência.
const siteSpecByName = new Map();
const siteByName = new Map();
const resSpecByName = new Map();
const resourceByName = new Map();
const rfsByName = new Map();
const cfsByName = new Map();
const svcSpecByName = new Map();
const partyByName = new Map();
const addressByLocationId = new Map(); // location -> address, para não duplicar logradouro
const sitePlaceByName = new Map(); // site -> Location dele, para reposicionar geometria

const created = { sites: 0, locations: 0, addresses: 0, regeometria: 0, resources: 0, specs: 0, rfs: 0, cfs: 0, links: 0 };
const reused = { sites: 0, resources: 0, services: 0 };

async function bootstrap() {
  const [siteSpecs, sites, addresses, resourceWs, serviceWs] = await Promise.all([
    api('GET', '/v1/geo/site-specifications'),
    api('GET', '/v1/geo/sites'),
    api('GET', '/v1/geo/addresses'),
    api('GET', '/v1/resource/workspace?tab=PhysicalResource&limit=1&offset=0'),
    api('GET', '/v1/service/workspace?tab=CustomerFacingService&limit=1&offset=0'),
  ]);

  for (const a of addresses ?? []) {
    if (a?.geographicLocationId) addressByLocationId.set(a.geographicLocationId, a.id);
  }

  for (const spec of siteSpecs ?? []) if (spec?.name) siteSpecByName.set(spec.name, spec.id);
  // Sites terminados são ignorados: prender o seed a um homônimo morto ancora a
  // massa num site invisível no mapa (era a causa da inconsistência anterior).
  for (const site of sites ?? []) {
    if (site?.name && site.status !== 'terminated' && !siteByName.has(site.name)) {
      siteByName.set(site.name, site.id);
      if (site.place?.id) sitePlaceByName.set(site.name, site.place.id);
    }
  }
  for (const spec of resourceWs.resourceSpecificationOptions ?? []) resSpecByName.set(spec.name, spec.id);
  // O `place` entra no índice para que uma re-execução reaproveite a geometria já
  // criada em vez de gerar uma Location nova e deixar a antiga órfã.
  for (const r of resourceWs.physicalResources ?? []) {
    resourceByName.set(r.name, { id: r.id, '@type': r['@type'], place: r.place });
  }
  for (const spec of serviceWs.serviceSpecificationOptions ?? []) svcSpecByName.set(spec.name, spec.id);
  for (const s of serviceWs.resourceFacingServices ?? []) rfsByName.set(s.name, { id: s.id });
  for (const s of serviceWs.customerFacingServices ?? []) cfsByName.set(s.name, { id: s.id });
}

// -------------------------------------------------------------------- geo ----

async function ensureSiteSpec(name, category) {
  const found = siteSpecByName.get(name);
  if (found) return found;
  const spec = await api('POST', '/v1/geo/site-specifications', { name, category });
  siteSpecByName.set(name, spec.id);
  created.specs++;
  return spec.id;
}

async function createPoint(coord, referencePoint) {
  const location = await api('POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: coord },
    spatialRef: 'EPSG:4326',
    ...(referencePoint ? { referencePoint } : {}),
  });
  created.locations++;
  return location.id;
}

// A rota do cabo é uma LineString: é ela que o mapa desenha como traçado.
async function createRoute(coords, referencePoint) {
  const location = await api('POST', '/v1/geo/locations', {
    geometryType: 'LineString',
    geometry: { type: 'LineString', coordinates: coords },
    spatialRef: 'EPSG:4326',
    ...(referencePoint ? { referencePoint } : {}),
  });
  created.locations++;
  return location.id;
}

// Resolve a geometria de um grupo de recursos que compartilham o mesmo local
// (poste e a caixa fixada nele, por exemplo). Se qualquer um deles já existe,
// devolve a Location dele; só cria uma nova quando nenhum existe ainda. Sem isto,
// re-executar o seed depois de uma falha parcial gera geometria duplicada e
// abandona a anterior.
async function locationFor(resourceNames, factory) {
  for (const name of resourceNames) {
    const existing = resourceByName.get(name);
    if (existing?.place?.id) return existing.place.id;
  }
  return factory();
}

async function createAddress({ street, streetNr, locationId }) {
  const address = await api('POST', '/v1/geo/addresses', {
    street,
    streetNr,
    city: CITY,
    stateOrProvince: UF,
    country: 'BR',
    geographicLocationId: locationId,
  });
  if (locationId) addressByLocationId.set(locationId, address.id);
  return address.id;
}

// Reposiciona uma geometria já existente quando o traçado mudou. Sem isto, uma
// correção de rota só valeria para massa criada do zero — o seed é idempotente
// por nome, então nunca recriaria a Location de um cabo que já existe.
const mesmaGeometria = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-9 && Math.abs(p[1] - b[i][1]) < 1e-9);

async function ensureRouteGeometry(locationId, coordinates) {
  if (!locationId) return;
  const current = await api('GET', `/v1/geo/locations/${locationId}`);
  if (mesmaGeometria(current?.geometry?.coordinates, coordinates)) return;
  await api('PATCH', `/v1/geo/locations/${locationId}`, {
    geometryType: 'LineString',
    geometry: { type: 'LineString', coordinates },
  });
  created.regeometria++;
}

async function ensurePointGeometry(locationId, coord) {
  if (!locationId) return;
  const current = await api('GET', `/v1/geo/locations/${locationId}`);
  if (mesmaGeometria([current?.geometry?.coordinates], [coord])) return;
  await api('PATCH', `/v1/geo/locations/${locationId}`, {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: coord },
  });
  created.regeometria++;
}

// Todo elemento de planta externa (poste, caixa, cabo) pertence a um logradouro.
// Sem endereço na Location, a árvore de Locais não consegue derivar UF/município
// e joga o item inteiro no balde "Sem UF" — fora da navegação de Niterói.
// Idempotente: só cria o endereço se aquela Location ainda não tiver um.
async function ensureStreetAddress(locationId, street) {
  if (!locationId || addressByLocationId.has(locationId)) return;
  await createAddress({ street, locationId });
  created.addresses++;
}

async function ensureSite({ name, specName, category, coord, address, parentSiteId }) {
  if (siteByName.has(name)) {
    reused.sites++;
    return siteByName.get(name);
  }
  const siteSpecificationId = await ensureSiteSpec(specName, category);
  const payload = { name, siteSpecificationId, status: 'active', characteristic: [tag()] };
  if (coord) {
    const locationId = await createPoint(coord, name);
    sitePlaceByName.set(name, locationId);
    payload.placeId = locationId;
    if (address) payload.addressId = await createAddress({ ...address, locationId });
  }
  if (parentSiteId) payload.parentSiteId = parentSiteId;

  const site = await api('POST', '/v1/geo/sites', payload);
  siteByName.set(name, site.id);
  created.sites++;
  return site.id;
}

// --------------------------------------------------------------- recursos ----

async function ensureResourceSpec(name, category, resourceType) {
  const found = resSpecByName.get(name);
  if (found) return found;
  const spec = await api('POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
    name,
    category,
    resourceType,
  });
  resSpecByName.set(name, spec.id);
  created.specs++;
  return spec.id;
}

// Estação que atende a planta externa deste seed. Preenchida assim que a Estação
// Icaraí existe; ver `servingSiteCharacteristic` abaixo.
let servingSiteId = null;

// Recurso de planta externa mora na rua: seu `place` é a Location do ponto, não o
// Site da estação. Sem a characteristic `servingSite` nada o liga à estação, e a
// árvore de navegação do Geo não consegue expandi-lo a partir dela. Planta interna
// (place = Site) não precisa: ela já pende do local onde está.
const servingSiteCharacteristic = (placeType) =>
  placeType === 'GeographicLocation' && servingSiteId
    ? [{ name: 'servingSite', value: servingSiteId, valueType: 'string' }]
    : [];

async function ensureResource({ name, specId, placeId, placeType, serialNumber, model, characteristic = [] }) {
  const found = resourceByName.get(name);
  if (found) {
    reused.resources++;
    return found;
  }
  const resource = await api('POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name,
    resourceSpecificationId: specId,
    placeId,
    placeType,
    ...(serialNumber ? { serialNumber } : {}),
    ...(model ? { model } : {}),
    characteristic: [tag(), ...servingSiteCharacteristic(placeType), ...characteristic],
  });
  const ref = { id: resource.id, '@type': resource['@type'] };
  resourceByName.set(name, ref);
  created.resources++;
  return ref;
}

// Liga dois recursos. Idempotente: o repositório faz upsert da aresta
// (resourceId, relatedId, tipo), então re-executar não duplica.
async function link(fromRef, toRef, relationshipType) {
  if (!fromRef || !toRef) return;
  await api('POST', `/tmf-api/resourceInventoryManagement/v4/resource/${fromRef.id}/relationships`, {
    id: toRef.id,
    relationshipType,
    '@referredType': 'Resource',
  });
  created.links++;
}

// --------------------------------------------------------------- serviços ----

async function ensureServiceSpec(name, category, serviceType) {
  const found = svcSpecByName.get(name);
  if (found) return found;
  const spec = await api('POST', '/tmf-api/serviceCatalogManagement/v4/serviceSpecification', {
    name,
    category,
    serviceType,
    serviceSpecificationCharacteristic: [tag()],
  });
  svcSpecByName.set(name, spec.id);
  created.specs++;
  return spec.id;
}

async function ensureParty(name) {
  if (partyByName.has(name)) return partyByName.get(name);
  const parties = await api('GET', '/tmf-api/partyManagement/v4/party');
  const found = (parties ?? []).find((p) => p.name === name);
  if (found) {
    partyByName.set(name, found.id);
    return found.id;
  }
  const party = await api('POST', '/tmf-api/partyManagement/v4/party', { '@type': 'Organization', name });
  partyByName.set(name, party.id);
  return party.id;
}

async function ensureRfs({ name, specId, supportingResource, siteId, characteristics }) {
  const found = rfsByName.get(name);
  if (found) {
    reused.services++;
    return found;
  }
  const rfs = await api('POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'ResourceFacingService',
    name,
    serviceSpecificationId: specId,
    category: 'Acesso',
    state: 'active',
    supportingResource,
    place: [{ id: siteId, '@referredType': 'GeographicSite', role: 'serviceLocation' }],
    serviceCharacteristic: [tag(), ...characteristics],
  });
  const ref = { id: rfs.id };
  rfsByName.set(name, ref);
  created.rfs++;
  return ref;
}

async function ensureCfs({ name, specId, subscriberId, rfsId, partyId, siteId, characteristics }) {
  const found = cfsByName.get(name);
  if (found) {
    reused.services++;
    return found;
  }
  const cfs = await api('POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'CustomerFacingService',
    name,
    serviceSpecificationId: specId,
    category: 'Banda Larga',
    state: 'active',
    subscriberId,
    supportingService: [{ id: rfsId, '@referredType': 'ResourceFacingService' }],
    relatedParty: [{ id: partyId, role: 'subscriber' }],
    place: [{ id: siteId, '@referredType': 'GeographicSite', role: 'installationAddress' }],
    serviceCharacteristic: [tag(), ...characteristics],
  });
  cfsByName.set(name, { id: cfs.id });
  created.cfs++;
  return { id: cfs.id };
}

// ------------------------------------------------------------------- fluxo ----

const pad = (n) => String(n).padStart(2, '0');

async function main() {
  console.log(`Seed GPON Icaraí (Niterói) em ${BASE} ...\n`);
  await bootstrap();

  // 1. Hierarquia de local: Estação → Andar → Sala GPON.
  const estacaoId = await ensureSite({
    name: 'Estação Icaraí',
    specName: 'Estação (CO)',
    category: 'Site',
    coord: CO_COORD,
    address: CO_ADDRESS,
  });
  servingSiteId = estacaoId;
  const andarId = await ensureSite({
    name: 'Estação Icaraí — 3º Andar',
    specName: 'Andar',
    category: 'SubSite',
    parentSiteId: estacaoId,
  });
  const salaId = await ensureSite({
    name: 'Estação Icaraí — Sala GPON',
    specName: 'Sala técnica',
    category: 'SubSite',
    parentSiteId: andarId,
  });

  // 2. Inside plant: OLT → placa → portas. Tudo mora na Sala GPON (C2).
  const oltSpec = await ensureResourceSpec('OLT Huawei MA5800-X7', 'Equipment.Access', 'OLT');
  const cardSpec = await ensureResourceSpec('Placa GPON GPBH 8p', 'Equipment.Access', 'Card');
  const portSpec = await ensureResourceSpec('Porta GPON', 'Equipment.Access', 'Port');

  const olt = await ensureResource({
    name: 'OLT-ICARAI-01',
    specId: oltSpec,
    placeId: salaId,
    placeType: 'GeographicSite',
    serialNumber: 'OLT-ICARAI-01',
    model: 'MA5800-X7',
  });
  const placa = await ensureResource({
    name: 'PLACA-GPON-ICARAI-01',
    specId: cardSpec,
    placeId: salaId,
    placeType: 'GeographicSite',
    serialNumber: 'PLACA-GPON-ICARAI-01',
    model: 'GPBH',
    characteristic: [{ name: 'slot', value: '1', valueType: 'string' }],
  });
  await link(olt, placa, 'containsAsChild');

  const portas = [];
  for (let i = 1; i <= PORTAS_POR_PLACA; i++) {
    const porta = await ensureResource({
      name: `PORTA-GPON-ICARAI-01-${pad(i)}`,
      specId: portSpec,
      placeId: salaId,
      placeType: 'GeographicSite',
      serialNumber: `PORTA-GPON-ICARAI-01-${pad(i)}`,
      characteristic: [
        { name: 'slot', value: '1', valueType: 'string' },
        { name: 'porta', value: String(i), valueType: 'string' },
      ],
    });
    await link(placa, porta, 'containsAsChild');
    portas.push(porta);
  }
  const portaAtiva = portas[0];

  // 3. Outside plant: poste + splitter + feeder.
  const poleSpec = await ensureResourceSpec('Poste de concreto 9m', 'Infrastructure.Passive', 'Pole');
  const splitterSpec = await ensureResourceSpec('Splitter óptico 1:8', 'Infrastructure.Passive', 'Splitter');
  // CDOE = Caixa de Distribuição Óptica Externa. O catálogo canônico traz o tipo
  // CTO para caixa óptica de rua; as instâncias é que se chamam CDOE-xx.
  const cdoeSpec = await ensureResourceSpec('CDOE 1:8 (caixa de distribuição)', 'Infrastructure.Passive', 'CTO');
  const feederSpec = await ensureResourceSpec('Cabo óptico primário 24FO', 'Cable.OutsidePlant', 'BackboneCable');
  const distSpec = await ensureResourceSpec('Cabo óptico secundário 12FO', 'Cable.OutsidePlant', 'DistributionCable');
  const dropSpec = await ensureResourceSpec('Cabo drop 1FO', 'Cable.OutsidePlant', 'DropCable');
  const ontSpec = await ensureResourceSpec('ONT GPON Icaraí', 'Equipment.CustomerPremises', 'ONT');

  const posteSplitterLoc = await locationFor(
    [`POSTE-${POSTE_SPLITTER.tag}`, 'SPLITTER-1x8-ICARAI-01'],
    () => createPoint(POSTE_SPLITTER.coord, `Poste ${POSTE_SPLITTER.tag} — ${POSTE_SPLITTER.street}`),
  );
  await ensurePointGeometry(posteSplitterLoc, POSTE_SPLITTER.coord);
  await ensureStreetAddress(posteSplitterLoc, POSTE_SPLITTER.street);
  const posteSplitter = await ensureResource({
    name: `POSTE-${POSTE_SPLITTER.tag}`,
    specId: poleSpec,
    placeId: posteSplitterLoc,
    placeType: 'GeographicLocation',
    serialNumber: `POSTE-${POSTE_SPLITTER.tag}`,
  });
  // O splitter fica no poste: mesma coordenada, mais a relação de fixação.
  const splitter = await ensureResource({
    name: 'SPLITTER-1x8-ICARAI-01',
    specId: splitterSpec,
    placeId: posteSplitterLoc,
    placeType: 'GeographicLocation',
    serialNumber: 'SPLITTER-1x8-ICARAI-01',
    characteristic: [{ name: 'razao', value: '1:8', valueType: 'string' }],
  });
  await link(splitter, posteSplitter, 'mountedOn');

  const feederLoc = await locationFor(['CABO-PRIMARIO-ICARAI-01'], () =>
    createRoute(ROTA_PRIMARIO, 'Cabo primário — Estação Icaraí → Poste P-001'),
  );
  await ensureRouteGeometry(feederLoc, ROTA_PRIMARIO);
  await ensureStreetAddress(feederLoc, CO_ADDRESS.street);
  const feeder = await ensureResource({
    name: 'CABO-PRIMARIO-ICARAI-01',
    specId: feederSpec,
    placeId: feederLoc,
    placeType: 'GeographicLocation',
    serialNumber: 'CABO-PRIMARIO-ICARAI-01',
    characteristic: [{ name: 'fibras', value: '24', valueType: 'string' }],
  });
  await link(portaAtiva, feeder, 'connectedTo');
  await link(feeder, splitter, 'connectedTo');

  // 4. Ramais secundários → CDOEs → casas → ONTs → serviços.
  const rfsSpec = await ensureServiceSpec('Acesso GPON FTTH', 'Acesso', 'RFS');
  const cfsSpec = await ensureServiceSpec('Banda Larga Residencial 1G', 'Banda Larga', 'CFS');
  const tenantId = await ensureParty('V.tal Varejo Icaraí');

  let casaSeq = 0;
  for (const ramal of RAMAIS) {
    const posteLoc = await locationFor([`POSTE-${ramal.poste.tag}`, `${ramal.cdoe}-ICARAI`], () =>
      createPoint(ramal.poste.coord, `Poste ${ramal.poste.tag} — ${ramal.poste.street}`),
    );
    await ensurePointGeometry(posteLoc, ramal.poste.coord);
    await ensureStreetAddress(posteLoc, ramal.poste.street);
    const poste = await ensureResource({
      name: `POSTE-${ramal.poste.tag}`,
      specId: poleSpec,
      placeId: posteLoc,
      placeType: 'GeographicLocation',
      serialNumber: `POSTE-${ramal.poste.tag}`,
    });
    const cdoe = await ensureResource({
      name: `${ramal.cdoe}-ICARAI`,
      specId: cdoeSpec,
      placeId: posteLoc,
      placeType: 'GeographicLocation',
      serialNumber: `${ramal.cdoe}-ICARAI`,
      characteristic: [{ name: 'capacidade', value: '8', valueType: 'string' }],
    });
    await link(cdoe, poste, 'mountedOn');

    const secLoc = await locationFor([`CABO-SEC-${ramal.cdoe}`], () =>
      createRoute(ramal.rota, `Cabo secundário — Poste P-001 → ${ramal.cdoe}`),
    );
    await ensureRouteGeometry(secLoc, ramal.rota);
    await ensureStreetAddress(secLoc, ramal.poste.street);
    const secundario = await ensureResource({
      name: `CABO-SEC-${ramal.cdoe}`,
      specId: distSpec,
      placeId: secLoc,
      placeType: 'GeographicLocation',
      serialNumber: `CABO-SEC-${ramal.cdoe}`,
      characteristic: [{ name: 'fibras', value: '12', valueType: 'string' }],
    });
    await link(splitter, secundario, 'connectedTo');
    await link(secundario, cdoe, 'connectedTo');

    for (const casa of ramal.casas) {
      casaSeq += 1;
      const seq = pad(casaSeq);
      const enderecoCasa = `${casa.street}, ${casa.streetNr}`;

      // A casa é um Ponto de instalação (Home Connected, C4).
      const casaSiteId = await ensureSite({
        name: `PI ${enderecoCasa}`,
        specName: 'Ponto de instalação',
        category: 'Site',
        coord: casaEm(...casa.at),
        address: { street: casa.street, streetNr: casa.streetNr },
      });
      await ensurePointGeometry(sitePlaceByName.get(`PI ${enderecoCasa}`), casaEm(...casa.at));

      const dropLoc = await locationFor([`CABO-DROP-ICARAI-${seq}`], () =>
        createRoute(rotaDrop(ramal.poste.coord, ...casa.at), `Cabo drop — ${ramal.cdoe} → ${enderecoCasa}`),
      );
      await ensureRouteGeometry(dropLoc, rotaDrop(ramal.poste.coord, ...casa.at));
      await ensureStreetAddress(dropLoc, casa.street);
      const drop = await ensureResource({
        name: `CABO-DROP-ICARAI-${seq}`,
        specId: dropSpec,
        placeId: dropLoc,
        placeType: 'GeographicLocation',
        serialNumber: `CABO-DROP-ICARAI-${seq}`,
      });
      await link(cdoe, drop, 'connectedTo');

      const ont = await ensureResource({
        name: `ONT-ICARAI-${seq}`,
        specId: ontSpec,
        placeId: casaSiteId,
        placeType: 'GeographicSite',
        serialNumber: `ONT-ICARAI-${seq}`,
        model: 'HG8245Q2',
      });
      await link(drop, ont, 'connectedTo');

      // Fim a fim no Módulo 3: o RFS consome ONT + porta GPON; o CFS vende.
      const rfs = await ensureRfs({
        name: `Acesso-GPON-ICARAI-${seq}`,
        specId: rfsSpec,
        supportingResource: [
          { id: ont.id, '@referredType': 'PhysicalResource', role: 'cpe' },
          { id: portaAtiva.id, '@referredType': 'PhysicalResource', role: 'access' },
        ],
        siteId: casaSiteId,
        characteristics: [{ name: 'tecnologia', value: 'GPON', valueType: 'string' }],
      });
      await ensureCfs({
        name: `Banda Larga 1G — ${enderecoCasa}`,
        specId: cfsSpec,
        subscriberId: `SUB-ICARAI-${seq}`,
        rfsId: rfs.id,
        partyId: tenantId,
        siteId: casaSiteId,
        characteristics: [
          { name: 'velocidade_download', value: '1000', valueType: 'number' },
          { name: 'modelo_comercial', value: 'direto', valueType: 'string' },
        ],
      });
    }
  }

  console.log('== Resumo ==');
  console.log(`Sites:     ${created.sites} criados, ${reused.sites} reaproveitados`);
  console.log(`Locations: ${created.locations} (pontos + rotas LineString), ${created.addresses} logradouros, ${created.regeometria} reposicionadas`);
  console.log(`Recursos:  ${created.resources} criados, ${reused.resources} reaproveitados`);
  console.log(`Ligações:  ${created.links} relacionamentos de recurso`);
  console.log(`Serviços:  ${created.rfs} RFS + ${created.cfs} CFS criados, ${reused.services} reaproveitados`);
  console.log(`Specs:     ${created.specs}`);
  console.log('\nRede GPON de Icaraí presente no inventário.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
