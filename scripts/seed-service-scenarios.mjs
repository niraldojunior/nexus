#!/usr/bin/env node
/**
 * Seed de cenários reais da V.tal para o Módulo de Serviços (TMF633/TMF638).
 *
 * Popula o inventário com os produtos das duas BUs, cada um como uma cadeia canônica
 * Recurso → RFS (supportingResource) → CFS (supportingService + subscriber):
 *
 *   BU Rede Neutra FTTH (B2B2C, wholesale) — categoria "Acesso"
 *     · 10 assinantes 500M da TIM
 *     · 15 assinantes 1G da NIO
 *     ·  3 assinantes 400M da Claro
 *
 *   BU Atacado (B2B2B) — categorias "Transporte/Atacado" e "Conectividade Empresarial"
 *     · 3 circuitos IP Connect GPON      (Transporte)
 *     · 4 circuitos IP Connect P2P       (Transporte)
 *     · 3 circuitos Link Dedicado        (Enterprise)
 *     · 5 circuitos VPN L3               (Enterprise)
 *
 * É idempotente: identifica por nome o que já existe (recursos, RFS, CFS, specs, parties)
 * e cria apenas o que falta, então pode ser re-executado com segurança e sempre converge
 * para o conjunto-alvo — sem violar a constraint UNIQUE de serialNumber.
 *
 * Uso (com o backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/seed-service-scenarios.mjs
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me — mesmo token default do frontend)
 */

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const SEED_TAG = 'vtal-scenarios';

// Posicionamento geográfico dos sites no RJ (spread Rio / Niterói / São Gonçalo).
// coord = [lng, lat] (ordem GeoJSON, como o mapa espera). Os equipamentos ancorados
// em cada site ganham um ponto próprio (jitter) ao redor desta coordenada.
const SITE_GEO = {
  'CO TIM':              { city: 'Rio de Janeiro', street: 'Av. Rio Branco, 1',                 coord: [-43.1786, -22.9035] },
  'CO NIO':              { city: 'Rio de Janeiro', street: 'Av. N. Sra. de Copacabana, 500',    coord: [-43.1866, -22.9711] },
  'POP IP Connect GPON': { city: 'Rio de Janeiro', street: 'Rua Conde de Bonfim, 300',          coord: [-43.2323, -22.9249] },
  'CO Claro':            { city: 'Niterói',        street: 'Rua da Conceição, 100',             coord: [-43.1150, -22.8940] },
  'POP IP Connect P2P':  { city: 'Niterói',        street: 'Av. Roberto Silveira, 200',         coord: [-43.1050, -22.9060] },
  'POP Link Dedicado':   { city: 'São Gonçalo',    street: 'Rua Dr. Nilo Peçanha, 50',          coord: [-43.0537, -22.8268] },
  'POP VPN L3':          { city: 'São Gonçalo',    street: 'Av. Presidente Kennedy, 800',       coord: [-43.0230, -22.8230] },
};

// Specs de site por papel — CO, POP e o Ponto de instalação do assinante.
const SPEC_CO = 'Estação (CO)';
const SPEC_POP = 'POP';
const SPEC_PI = 'Ponto de instalação';

// Tipos de recurso que ficam do rack para dentro (C2): o `place` deles é o
// próprio CO/POP. O que não estiver aqui é CPE de assinante e ganha um Ponto de
// instalação próprio.
const INSIDE_SITE_TYPES = new Set(['Port', 'Card', 'Shelf', 'OLT', 'Rack']);

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

const tag = () => ({ name: 'seed', value: SEED_TAG, valueType: 'string' });
const pad = (n) => String(n).padStart(4, '0');

// Índices de idempotência, preenchidos a partir do snapshot inicial.
const resourceByName = new Map(); // name -> { id, '@type' }
const rfsByName = new Map(); // name -> { id }
const cfsByName = new Map(); // name -> { id }
const specByName = new Map(); // name -> id
const partyByName = new Map(); // name -> id
const siteByName = new Map(); // name -> id
const siteSpecByName = new Map(); // nome da spec de site -> id
const siteHasPlace = new Set(); // nomes de sites que já têm Location (place)
const resourceSiteByName = new Map(); // resource name -> site name (âncora geográfica)

let created = { resources: 0, rfs: 0, cfs: 0, specs: 0, parties: 0, sites: 0, sitesLocated: 0, equipLocated: 0 };
let reused = { resources: 0, rfs: 0, cfs: 0 };
let failures = [];

async function bootstrapIndexes() {
  const ws = await api('GET', '/v1/service/workspace?tab=CustomerFacingService&limit=1&offset=0');
  for (const spec of ws.serviceSpecificationOptions ?? []) specByName.set(spec.name, spec.id);
  for (const r of ws.resourceOptions ?? []) resourceByName.set(r.name, { id: r.id, '@type': r['@type'] });
  for (const s of ws.customerFacingServices ?? []) cfsByName.set(s.name, { id: s.id });
  for (const s of ws.resourceFacingServices ?? []) rfsByName.set(s.name, { id: s.id });

  // Sites terminados são ignorados na indexação: re-execuções antigas deixaram
  // homônimos soft-terminados (C6) sem coordenada, e prender o seed a um deles
  // ancorava os serviços num site invisível no mapa e na árvore.
  const siteSpecs = await api('GET', '/v1/geo/site-specifications');
  for (const spec of Array.isArray(siteSpecs) ? siteSpecs : []) {
    if (spec?.name && !siteSpecByName.has(spec.name)) siteSpecByName.set(spec.name, spec.id);
  }

  const sites = await api('GET', '/v1/geo/sites');
  for (const site of Array.isArray(sites) ? sites : []) {
    if (!site?.name || site.status === 'terminated') continue;
    if (!siteByName.has(site.name)) siteByName.set(site.name, site.id);
    if (site.place?.id) siteHasPlace.add(site.name);
  }
}

// ---- Posicionamento geográfico (idempotente) ----------------------------

async function createLocationPoint(coord) {
  const loc = await api('POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: coord },
    spatialRef: 'EPSG:4326',
  });
  return loc.id;
}

async function createRjAddress({ street, city, locationId }) {
  const addr = await api('POST', '/v1/geo/addresses', {
    street,
    city,
    stateOrProvince: 'RJ',
    country: 'BR',
    geographicLocationId: locationId,
  });
  return addr.id;
}

// Deslocamento determinístico (~±400m) a partir do nome, para espalhar os
// equipamentos ao redor do seu CO/POP sem empilhar todos os pins no mesmo ponto.
function jitterCoord([lng, lat], seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const dx = (((h >>> 0) & 0xffff) / 0xffff - 0.5) * 0.008;
  const dy = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.008;
  return [lng + dx, lat + dy];
}

async function ensureServiceSpec(name, category, serviceType) {
  if (specByName.has(name)) return specByName.get(name);
  const spec = await api('POST', '/tmf-api/serviceCatalogManagement/v4/serviceSpecification', {
    name,
    category,
    serviceType,
    serviceSpecificationCharacteristic: [tag()],
  });
  specByName.set(name, spec.id);
  created.specs++;
  return spec.id;
}

async function ensureResourceSpec(name, category, resourceType) {
  if (specByName.has(`R:${name}`)) return specByName.get(`R:${name}`);
  const spec = await api('POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
    name,
    category,
    resourceType,
  });
  specByName.set(`R:${name}`, spec.id);
  return spec.id;
}

async function ensureParty(name) {
  if (partyByName.has(name)) return partyByName.get(name);
  const existing = await api('GET', `/tmf-api/partyManagement/v4/party?name=${encodeURIComponent(name)}&limit=5`);
  const match = Array.isArray(existing) ? existing.find((p) => p.name === name) : undefined;
  if (match) {
    partyByName.set(name, match.id);
    return match.id;
  }
  const party = await api('POST', '/tmf-api/partyManagement/v4/party', { name, partyType: 'Organization' });
  partyByName.set(name, party.id);
  created.parties++;
  return party.id;
}

// Reusa a spec de site já cadastrada; só cria se realmente não existir. Antes o
// índice era populado com uma chave que o bootstrap nunca preenchia, então cada
// execução duplicava a spec.
async function ensureSiteSpec(name) {
  const cached = siteSpecByName.get(name);
  if (cached) return cached;
  const spec = await api('POST', '/v1/geo/site-specifications', { name, category: 'Site' });
  siteSpecByName.set(name, spec.id);
  return spec.id;
}

// Cada papel tem a sua spec: sem isso todo site cai em "Ponto de instalação" e o
// mapa pinta CO e POP como se fossem endereço de cliente.
function siteSpecNameFor(siteName) {
  if (siteName.startsWith('CO ')) return SPEC_CO;
  if (siteName.startsWith('POP ')) return SPEC_POP;
  return SPEC_PI;
}

async function ensureSite(name) {
  if (siteByName.has(name)) return siteByName.get(name);
  const siteSpecId = await ensureSiteSpec(siteSpecNameFor(name));
  const site = await api('POST', '/v1/geo/sites', { name, siteSpecificationId: siteSpecId, status: 'active' });
  siteByName.set(name, site.id);
  created.sites++;
  return site.id;
}

// Igual a ensureSite, mas garante que o site tenha Location (Point) + Address no
// RJ — assim renderiza como pin no mapa e aninha sob RJ → Município na árvore.
async function ensureSiteLocated(name) {
  const siteId = await ensureSite(name);
  if (siteHasPlace.has(name)) return siteId;
  const geo = SITE_GEO[name];
  if (!geo) return siteId;
  const locationId = await createLocationPoint(geo.coord);
  const addressId = await createRjAddress({ street: geo.street, city: geo.city, locationId });
  await api('PATCH', `/v1/geo/sites/${siteId}`, { placeId: locationId, addressId });
  siteHasPlace.add(name);
  created.sitesLocated++;
  return siteId;
}

// Ancora cada equipamento no lugar onde ele fisicamente está, sempre via
// GeographicSite — nunca uma Location solta, que quebraria o vínculo Geo↔Resource
// e deixaria o recurso rotulado como "Ponto no mapa".
//
//   · Porta/placa/rack  → o próprio CO/POP (do rack para dentro, C2).
//   · ONT e demais CPE  → um Ponto de instalação próprio (Home Connected, C4),
//                          com coordenada jitterada ao redor do CO que o serve.
//
// Idempotente: pula recursos que já apontam para um GeographicSite.
async function anchorEquipment() {
  const ws = await api('GET', '/v1/resource/workspace?tab=PhysicalResource&limit=1&offset=0');
  const byId = new Map();
  for (const r of ws.physicalResources ?? []) byId.set(r.id, r);

  for (const [name, ref] of resourceByName) {
    const siteName = resourceSiteByName.get(name);
    const geo = siteName ? SITE_GEO[siteName] : undefined;
    if (!geo) continue;
    const resource = byId.get(ref.id);
    if (resource?.place?.['@referredType'] === 'GeographicSite') continue;

    try {
      let placeId;
      if (INSIDE_SITE_TYPES.has(resource?.resourceType)) {
        placeId = await ensureSite(siteName);
      } else {
        const locationId = await createLocationPoint(jitterCoord(geo.coord, name));
        const addressId = await createRjAddress({ street: geo.street, city: geo.city, locationId });
        const piSite = await api('POST', '/v1/geo/sites', {
          name: `PI ${name}`,
          siteSpecificationId: await ensureSiteSpec(SPEC_PI),
          placeId: locationId,
          addressId,
          status: 'active',
        });
        placeId = piSite.id;
        created.sites++;
      }
      await api('PATCH', `/tmf-api/resourceInventoryManagement/v4/resource/${ref.id}`, {
        placeId,
        placeType: 'GeographicSite',
      });
      created.equipLocated++;
    } catch (err) {
      failures.push(`Geo equip ${name}: ${err.message}`);
    }
  }
}

async function ensureResource(name, resourceSpecId, siteId, serialNumber) {
  const found = resourceByName.get(name);
  if (found) {
    reused.resources++;
    return found;
  }
  const resource = await api('POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name,
    resourceSpecificationId: resourceSpecId,
    placeId: siteId,
    placeType: 'GeographicSite',
    serialNumber,
  });
  const ref = { id: resource.id, '@type': resource['@type'] };
  resourceByName.set(name, ref);
  created.resources++;
  return ref;
}

async function ensureRfs({ name, specId, category, resource, siteId, characteristics = [] }) {
  const found = rfsByName.get(name);
  if (found) {
    reused.rfs++;
    return found;
  }
  const rfs = await api('POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'ResourceFacingService',
    name,
    serviceSpecificationId: specId,
    category,
    state: 'active',
    supportingResource: [{ id: resource.id, '@referredType': resource['@type'], role: 'access' }],
    place: siteId ? [{ id: siteId, '@referredType': 'GeographicSite', role: 'serviceLocation' }] : undefined,
    serviceCharacteristic: [tag(), ...characteristics],
  });
  const ref = { id: rfs.id };
  rfsByName.set(name, ref);
  created.rfs++;
  return ref;
}

async function ensureCfs({ name, specId, category, subscriberId, rfsId, partyId, siteId, characteristics = [] }) {
  if (cfsByName.has(name)) {
    reused.cfs++;
    return cfsByName.get(name);
  }
  const cfs = await api('POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'CustomerFacingService',
    name,
    serviceSpecificationId: specId,
    category,
    state: 'active',
    subscriberId,
    supportingService: [{ id: rfsId, '@referredType': 'ResourceFacingService', role: 'access' }],
    relatedParty: partyId ? [{ id: partyId, '@referredType': 'Organization', role: 'subscriber' }] : undefined,
    place: siteId ? [{ id: siteId, '@referredType': 'GeographicSite', role: 'installationAddress' }] : undefined,
    serviceCharacteristic: [tag(), { name: 'SubscriberID', value: subscriberId, valueType: 'string' }, ...characteristics],
  });
  const ref = { id: cfs.id };
  cfsByName.set(name, ref);
  created.cfs++;
  return ref;
}

async function seedFtth({ tenant, speedLabel, speedMbps, count }) {
  const category = 'Access';
  const ontSpecId = await ensureResourceSpec('ONT GPON', 'Equipment.CustomerPremises', 'ONT');
  const rfsSpecId = await ensureServiceSpec('Acesso GPON', category, 'RFS');
  const cfsSpecId = await ensureServiceSpec('Bitstream FTTH', category, 'CFS');
  const partyId = await ensureParty(tenant);
  const siteName = `CO ${tenant}`;
  const siteId = await ensureSiteLocated(siteName);

  for (let i = 1; i <= count; i++) {
    const serial = `ONT-${tenant}-${pad(i)}`;
    const subscriberId = `SUB-${tenant}-${pad(i)}`;
    resourceSiteByName.set(serial, siteName);
    try {
      const resource = await ensureResource(serial, ontSpecId, siteId, serial);
      const rfs = await ensureRfs({
        name: `Acesso-GPON-${tenant}-${pad(i)}`,
        specId: rfsSpecId,
        category,
        resource,
        siteId,
        characteristics: [{ name: 'ponPort', value: `0/1/${i}`, valueType: 'string' }],
      });
      await ensureCfs({
        name: `Bitstream-GPON-${speedLabel}-${tenant}-${subscriberId}`,
        specId: cfsSpecId,
        category,
        subscriberId,
        rfsId: rfs.id,
        partyId,
        siteId,
        characteristics: [
          { name: 'downstreamSpeedMbps', value: speedMbps, valueType: 'number' },
          { name: 'businessUnit', value: 'Rede Neutra FTTH', valueType: 'string' },
          { name: 'modelo_comercial', value: 'wholesale', valueType: 'string' },
        ],
      });
    } catch (err) {
      failures.push(`FTTH ${tenant} #${i}: ${err.message}`);
    }
  }
}

async function seedAtacado({ product, category, rfsSpecName, cfsSpecName, resourceType, resourceCategory, count, rfsPrefix, cfsPrefix, accessLabel }) {
  const resourceSpecId = await ensureResourceSpec(accessLabel, resourceCategory, resourceType);
  const rfsSpecId = await ensureServiceSpec(rfsSpecName, category, 'RFS');
  const cfsSpecId = await ensureServiceSpec(cfsSpecName, category, 'CFS');
  const siteName = `POP ${product}`;
  const siteId = await ensureSiteLocated(siteName);

  for (let i = 1; i <= count; i++) {
    const subscriberId = `SUB-${cfsPrefix}-${pad(i)}`;
    const partyId = await ensureParty(`Cliente ${product} ${i}`);
    const resourceName = `${accessLabel}-${pad(i)}`;
    resourceSiteByName.set(resourceName, siteName);
    try {
      const resource = await ensureResource(resourceName, resourceSpecId, siteId, `${cfsPrefix}-${pad(i)}`);
      const rfs = await ensureRfs({
        name: `${rfsPrefix}-${pad(i)}`,
        specId: rfsSpecId,
        category,
        resource,
        siteId,
      });
      await ensureCfs({
        name: `${cfsPrefix}-${pad(i)}`,
        specId: cfsSpecId,
        category,
        subscriberId,
        rfsId: rfs.id,
        partyId,
        siteId,
        characteristics: [
          { name: 'produto', value: product, valueType: 'string' },
          { name: 'businessUnit', value: 'Atacado', valueType: 'string' },
        ],
      });
    } catch (err) {
      failures.push(`Atacado ${product} #${i}: ${err.message}`);
    }
  }
}

async function main() {
  console.log(`Seeding cenários V.tal em ${BASE} ...`);
  await bootstrapIndexes();

  // BU Rede Neutra FTTH (B2B2C)
  await seedFtth({ tenant: 'TIM', speedLabel: '500', speedMbps: 500, count: 10 });
  await seedFtth({ tenant: 'NIO', speedLabel: '1000', speedMbps: 1000, count: 15 });
  await seedFtth({ tenant: 'Claro', speedLabel: '400', speedMbps: 400, count: 3 });

  // BU Atacado (B2B2B)
  await seedAtacado({
    product: 'IP Connect GPON', category: 'Transport',
    rfsSpecName: 'Acesso GPON Atacado', cfsSpecName: 'IP Connect GPON',
    resourceType: 'Port', resourceCategory: 'Equipment.Access', accessLabel: 'PortaGPON',
    count: 3, rfsPrefix: 'Acesso-GPON-IPC', cfsPrefix: 'IPConnect-GPON',
  });
  await seedAtacado({
    product: 'IP Connect P2P', category: 'Transport',
    rfsSpecName: 'Acesso P2P', cfsSpecName: 'IP Connect P2P',
    resourceType: 'Port', resourceCategory: 'Equipment.Access', accessLabel: 'PortaP2P',
    count: 4, rfsPrefix: 'Acesso-P2P', cfsPrefix: 'IPConnect-P2P',
  });
  await seedAtacado({
    product: 'Link Dedicado', category: 'Enterprise',
    rfsSpecName: 'Acesso Ethernet Dedicado', cfsSpecName: 'Link Dedicado Ethernet',
    resourceType: 'Port', resourceCategory: 'Equipment.Access', accessLabel: 'PortaEth',
    count: 3, rfsPrefix: 'Acesso-Ethernet', cfsPrefix: 'LinkDedicado',
  });
  await seedAtacado({
    product: 'VPN L3', category: 'Enterprise',
    rfsSpecName: 'Transporte L3VPN', cfsSpecName: 'VPN L3',
    resourceType: 'Port', resourceCategory: 'Equipment.Access', accessLabel: 'PortaPE',
    count: 5, rfsPrefix: 'Transporte-L3VPN', cfsPrefix: 'VPN-L3',
  });

  // Posiciona os equipamentos no RJ (perto do seu CO/POP) — depois de todos criados.
  await anchorEquipment();

  console.log('\n== Resumo ==');
  console.log(`Recursos: ${created.resources} criados, ${reused.resources} reaproveitados`);
  console.log(`RFS:      ${created.rfs} criados, ${reused.rfs} reaproveitados`);
  console.log(`CFS:      ${created.cfs} criados, ${reused.cfs} reaproveitados`);
  console.log(`Specs:    ${created.specs} | Parties: ${created.parties} | Sites: ${created.sites}`);
  console.log(`Geo RJ:   ${created.sitesLocated} sites posicionados, ${created.equipLocated} equipamentos ancorados`);
  if (failures.length) {
    console.log(`\nFalhas (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nTodos os cenários estão presentes no inventário.');
  }
}

main().catch((err) => {
  console.error('Seed abortado:', err);
  process.exit(1);
});
