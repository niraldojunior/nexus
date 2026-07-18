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

let created = { resources: 0, rfs: 0, cfs: 0, specs: 0, parties: 0, sites: 0 };
let reused = { resources: 0, rfs: 0, cfs: 0 };
let failures = [];

async function bootstrapIndexes() {
  const ws = await api('GET', '/v1/service/workspace?tab=CustomerFacingService&limit=1&offset=0');
  for (const spec of ws.serviceSpecificationOptions ?? []) specByName.set(spec.name, spec.id);
  for (const r of ws.resourceOptions ?? []) resourceByName.set(r.name, { id: r.id, '@type': r['@type'] });
  for (const s of ws.customerFacingServices ?? []) cfsByName.set(s.name, { id: s.id });
  for (const s of ws.resourceFacingServices ?? []) rfsByName.set(s.name, { id: s.id });

  const sites = await api('GET', '/v1/geo/sites');
  for (const site of Array.isArray(sites) ? sites : []) {
    if (site?.name && !siteByName.has(site.name)) siteByName.set(site.name, site.id);
  }
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

async function ensureSite(name) {
  if (siteByName.has(name)) return siteByName.get(name);
  const siteSpecName = 'Ponto de instalação';
  let siteSpecId = specByName.get(`SITE:${siteSpecName}`);
  if (!siteSpecId) {
    const s = await api('POST', '/v1/geo/site-specifications', { name: siteSpecName, category: 'Site' });
    siteSpecId = s.id;
    specByName.set(`SITE:${siteSpecName}`, siteSpecId);
  }
  const site = await api('POST', '/v1/geo/sites', { name, siteSpecificationId: siteSpecId });
  siteByName.set(name, site.id);
  created.sites++;
  return site.id;
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
  const siteId = await ensureSite(`CO ${tenant}`);

  for (let i = 1; i <= count; i++) {
    const serial = `ONT-${tenant}-${pad(i)}`;
    const subscriberId = `SUB-${tenant}-${pad(i)}`;
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
  const siteId = await ensureSite(`POP ${product}`);

  for (let i = 1; i <= count; i++) {
    const subscriberId = `SUB-${cfsPrefix}-${pad(i)}`;
    const partyId = await ensureParty(`Cliente ${product} ${i}`);
    try {
      const resource = await ensureResource(`${accessLabel}-${pad(i)}`, resourceSpecId, siteId, `${cfsPrefix}-${pad(i)}`);
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

  console.log('\n== Resumo ==');
  console.log(`Recursos: ${created.resources} criados, ${reused.resources} reaproveitados`);
  console.log(`RFS:      ${created.rfs} criados, ${reused.rfs} reaproveitados`);
  console.log(`CFS:      ${created.cfs} criados, ${reused.cfs} reaproveitados`);
  console.log(`Specs:    ${created.specs} | Parties: ${created.parties} | Sites: ${created.sites}`);
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
