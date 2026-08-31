#!/usr/bin/env node
/**
 * Popula 6 das 8 portas de saída do splitter de CDOE-02-ICARAI com clientes reais
 * (issue #171/#173/#177 — validação da aba Portas com consumo de verdade, não só portas vazias).
 *
 * `scripts/load-cto-ports.mjs` já materializou `CDOE-02-ICARAI · Splitter` com `FO.I` +
 * `FO.O.1`..`FO.O.8`, mas nenhuma porta de saída está ligada a um cliente. Este script fecha
 * o fim a fim (C2/C3/C4) para 6 delas, a partir da coordenada real da CDOE:
 *
 *   FO.O.1..4  → cliente ATIVO:  site (Ponto de instalação) + cabo drop + ONT + RFS + CFS,
 *                todos ativos. O RFS consome a porta do SPLITTER da CDOE (não a porta da OLT —
 *                essa é quem os 9 clientes do seed original, ligados direto à OLT, já usam).
 *   FO.O.5..6  → cliente CHURN: mesma planta física (site, drop, ONT), mas RFS+CFS em
 *                `state: 'terminated'`. Por realismo operacional, a ONT (equipamento do cliente,
 *                normalmente recolhido) vai para `administrativeState: 'locked'`; o cabo drop
 *                (fica instalado no poste/casa) permanece `unlocked`/ativo — C6: resource não é
 *                excluído, só perde estado; service termina.
 *   FO.O.7..8  → seguem livres, sem nenhuma alteração.
 *
 * Geometria: mesmos rumos fixos de Icaraí usados em `seed-gpon-niteroi.mjs` (a malha é
 * ortogonal — RUMO_RUA desce a via principal, RUMO_TRAVESSA cruza) — aqui partindo direto da
 * coordenada real da CDOE (lida da API em runtime), não de um reticulado de esquinas.
 *
 * Idempotente: identifica tudo por nome exato (`findResourceByExactName`/
 * `findServiceByExactName`, padrão de `load-cto-ports.mjs`) e só cria o que falta. Para cada
 * cliente, confirma primeiro `Porta FO.O → connectedTo → CaboDrop` e só então remove a aresta
 * legada `CDOE → CaboDrop` (issue #177).
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/seed-cdoe02-splitter-clients.mjs             # dry-run — só relatório
 *   node scripts/seed-cdoe02-splitter-clients.mjs --apply     # grava
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 */

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const APPLY = process.argv.includes('--apply');
const SEED_TAG = 'gpon-icarai';

const CDOE_NAME = 'CDOE-02-ICARAI';
const SPLITTER_NAME = `${CDOE_NAME} · Splitter`;
const CITY = 'Niterói';
const UF = 'RJ';

// ---------------------------------------------------------------- geografia --
// Mesmos rumos/conversões de `seed-gpon-niteroi.mjs` — ver o cabeçalho de lá para o racional
// completo (malha ortogonal de Icaraí, sem serviço de rota disponível no ambiente).
const RUMO_RUA = 137;
const RUMO_TRAVESSA = 47;
const M_POR_GRAU_LAT = 110574;
const M_POR_GRAU_LNG = 102545;

function walk([lng, lat], rumoGraus, metros) {
  const rad = (rumoGraus * Math.PI) / 180;
  return [
    lng + (Math.sin(rad) * metros) / M_POR_GRAU_LNG,
    lat + (Math.cos(rad) * metros) / M_POR_GRAU_LAT,
  ];
}

// Seis clientes próximos da CDOE, nas mesmas ruas das 3 casas originais do ramal CDOE-02
// (Rua Lopes Trovão 462, Rua Presidente Backer 210, Rua Miguel de Frias 88 — ver RAMAIS em
// seed-gpon-niteroi.mjs), com números distintos para não colidir.
const CLIENTES = [
  { seq: '10', port: 1, status: 'ativo', street: 'Rua Lopes Trovão', streetNr: '470', aoLongo: 35, recuo: 18 },
  { seq: '11', port: 2, status: 'ativo', street: 'Rua Lopes Trovão', streetNr: '452', aoLongo: -30, recuo: 18 },
  { seq: '12', port: 3, status: 'ativo', street: 'Rua Presidente Backer', streetNr: '225', aoLongo: 60, recuo: -15 },
  { seq: '13', port: 4, status: 'ativo', street: 'Rua Miguel de Frias', streetNr: '102', aoLongo: -55, recuo: -15 },
  { seq: '14', port: 5, status: 'churn', street: 'Rua Lopes Trovão', streetNr: '500', aoLongo: 90, recuo: 18 },
  { seq: '15', port: 6, status: 'churn', street: 'Rua Miguel de Frias', streetNr: '60', aoLongo: -70, recuo: 20 },
];

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

/** Busca por nome é substring — filtra o exato aqui (mesmo padrão de load-cto-ports.mjs). */
async function findResourceByExactName(name) {
  const results = await api(
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource?name=${encodeURIComponent(name)}`,
  );
  return (results ?? []).find((r) => r.name === name) ?? null;
}

async function findServiceByExactName(name) {
  const results = await api(
    'GET',
    `/tmf-api/serviceInventoryManagement/v4/service?name=${encodeURIComponent(name)}`,
  );
  return (results ?? []).find((s) => s.name === name) ?? null;
}

async function findSiteByExactName(name) {
  const results = await api('GET', `/v1/geo/sites?name=${encodeURIComponent(name)}`);
  return (results?.items ?? results ?? []).find((s) => s.name === name) ?? null;
}

async function findSiteSpecByExactName(name) {
  const specs = await api('GET', '/v1/geo/site-specifications');
  return (specs ?? []).find((s) => s.name === name) ?? null;
}

const report = {
  sitesCreated: 0,
  sitesReused: 0,
  locationsCreated: 0,
  addressesCreated: 0,
  resourcesCreated: 0,
  resourcesReused: 0,
  resourcesToCreate: [],
  servicesCreated: 0,
  servicesReused: 0,
  servicesToCreate: [],
  linksCreated: 0,
  legacyLinksRemoved: 0,
};

async function createPoint(coord, referencePoint) {
  if (!APPLY) return `dry-run-loc:${referencePoint}`;
  const location = await api('POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: coord },
    spatialRef: 'EPSG:4326',
    referencePoint,
  });
  report.locationsCreated++;
  return location.id;
}

async function createRoute(coords, referencePoint) {
  if (!APPLY) return `dry-run-loc:${referencePoint}`;
  const location = await api('POST', '/v1/geo/locations', {
    geometryType: 'LineString',
    geometry: { type: 'LineString', coordinates: coords },
    spatialRef: 'EPSG:4326',
    referencePoint,
  });
  report.locationsCreated++;
  return location.id;
}

async function createAddress({ street, streetNr, locationId }) {
  if (!APPLY) return `dry-run-addr:${street} ${streetNr}`;
  const address = await api('POST', '/v1/geo/addresses', {
    street,
    streetNr,
    city: CITY,
    stateOrProvince: UF,
    country: 'BR',
    geographicLocationId: locationId,
  });
  report.addressesCreated++;
  return address.id;
}

async function ensureSite({ name, siteSpecificationId, coord, address }) {
  const found = await findSiteByExactName(name);
  if (found) {
    report.sitesReused++;
    return { id: found.id, placeId: found.place?.id };
  }
  if (!APPLY) {
    return { id: `dry-run:${name}`, placeId: undefined };
  }
  const locationId = await createPoint(coord, name);
  const addressId = await createAddress({ ...address, locationId });
  const site = await api('POST', '/v1/geo/sites', {
    name,
    siteSpecificationId,
    status: 'active',
    placeId: locationId,
    addressId,
    characteristic: [],
  });
  report.sitesCreated++;
  return { id: site.id, placeId: locationId };
}

async function ensureResource({
  name,
  specId,
  placeId,
  placeType,
  serialNumber,
  model,
  administrativeState,
  characteristic = [],
}) {
  const found = await findResourceByExactName(name);
  if (found) {
    report.resourcesReused++;
    return { id: found.id, '@type': found['@type'] ?? 'PhysicalResource' };
  }
  if (!APPLY) {
    report.resourcesToCreate.push(name);
    return { id: `dry-run:${name}`, '@type': 'PhysicalResource' };
  }
  const resource = await api('POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name,
    resourceSpecificationId: specId,
    placeId,
    placeType,
    ...(serialNumber ? { serialNumber } : {}),
    ...(model ? { model } : {}),
    ...(administrativeState ? { administrativeState } : {}),
    characteristic: [tag(), ...characteristic],
  });
  report.resourcesCreated++;
  return { id: resource.id, '@type': resource['@type'] };
}

async function listRelationships(resourceId) {
  return await api('GET', `/tmf-api/resourceInventoryManagement/v4/resource/${resourceId}/relationships`);
}

async function ensureLink(fromRef, toRef, relationshipType) {
  if (!fromRef || !toRef) return false;
  if (!APPLY) return false;
  if (fromRef.id.startsWith('dry-run:') || toRef.id.startsWith('dry-run:')) return false;
  const existing = await listRelationships(fromRef.id);
  if ((existing ?? []).some((relationship) => relationship.id === toRef.id && relationship.relationshipType === relationshipType)) {
    return false;
  }
  await api('POST', `/tmf-api/resourceInventoryManagement/v4/resource/${fromRef.id}/relationships`, {
    id: toRef.id,
    relationshipType,
    '@referredType': 'Resource',
  });
  report.linksCreated++;
  return true;
}

async function removeLink(fromRef, toRef, relationshipType) {
  if (!fromRef || !toRef || !APPLY) return false;
  if (fromRef.id.startsWith('dry-run:') || toRef.id.startsWith('dry-run:')) return false;
  const existing = await listRelationships(fromRef.id);
  if (!(existing ?? []).some((relationship) => relationship.id === toRef.id && relationship.relationshipType === relationshipType)) {
    return false;
  }
  await api(
    'DELETE',
    `/tmf-api/resourceInventoryManagement/v4/resource/${fromRef.id}/relationships/${toRef.id}/${encodeURIComponent(relationshipType)}`,
  );
  report.legacyLinksRemoved++;
  return true;
}

async function repairDropConnection({ cdoeRef, portaRef, drop }) {
  if (!APPLY || drop.id.startsWith('dry-run:')) return;
  await ensureLink(portaRef, drop, 'connectedTo');
  const portLinks = await listRelationships(portaRef.id);
  const connected = (portLinks ?? []).some(
    (relationship) => relationship.id === drop.id && relationship.relationshipType === 'connectedTo',
  );
  if (!connected) {
    throw new Error(`Não foi possível confirmar Porta → CaboDrop para ${drop.id}.`);
  }
  await removeLink(cdoeRef, drop, 'connectedTo');
}

async function ensureRfs({ name, specId, supportingResource, siteId, state, characteristics }) {
  const found = await findServiceByExactName(name);
  if (found) {
    report.servicesReused++;
    return { id: found.id };
  }
  if (!APPLY) {
    report.servicesToCreate.push(name);
    return { id: `dry-run:${name}` };
  }
  const rfs = await api('POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'ResourceFacingService',
    name,
    serviceSpecificationId: specId,
    category: 'Acesso',
    state,
    supportingResource,
    place: [{ id: siteId, '@referredType': 'GeographicSite', role: 'serviceLocation' }],
    serviceCharacteristic: [tag(), ...characteristics],
  });
  report.servicesCreated++;
  return { id: rfs.id };
}

async function ensureCfs({ name, specId, subscriberId, rfsId, partyId, siteId, state, characteristics }) {
  const found = await findServiceByExactName(name);
  if (found) {
    report.servicesReused++;
    return { id: found.id };
  }
  if (!APPLY) {
    report.servicesToCreate.push(name);
    return { id: `dry-run:${name}` };
  }
  const cfs = await api('POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'CustomerFacingService',
    name,
    serviceSpecificationId: specId,
    category: 'Banda Larga',
    state,
    subscriberId,
    supportingService: [{ id: rfsId, '@referredType': 'ResourceFacingService' }],
    relatedParty: [{ id: partyId, role: 'subscriber' }],
    place: [{ id: siteId, '@referredType': 'GeographicSite', role: 'installationAddress' }],
    serviceCharacteristic: [tag(), ...characteristics],
  });
  report.servicesCreated++;
  return { id: cfs.id };
}

async function ensureParty(name) {
  const parties = await api('GET', '/tmf-api/partyManagement/v4/party');
  const found = (parties ?? []).find((p) => p.name === name);
  if (found) return found.id;
  if (!APPLY) return `dry-run:${name}`;
  const party = await api('POST', '/tmf-api/partyManagement/v4/party', { '@type': 'Organization', name });
  return party.id;
}

// ------------------------------------------------------------------- fluxo ----

async function main() {
  console.log(`seed-cdoe02-splitter-clients: apply=${APPLY} base=${BASE}\n`);

  const cdoe = await findResourceByExactName(CDOE_NAME);
  if (!cdoe) throw new Error(`${CDOE_NAME} não encontrada — rode seed-gpon-niteroi.mjs primeiro.`);
  const cdoeFull = await api('GET', `/tmf-api/resourceInventoryManagement/v4/resource/${cdoe.id}`);
  const cdoeRef = { id: cdoe.id, '@type': cdoe['@type'] ?? 'PhysicalResource' };
  if (!cdoeFull.place?.id) throw new Error(`${CDOE_NAME} não tem place — não é possível geolocalizar os clientes.`);
  const cdoeLoc = await api('GET', `/v1/geo/locations/${cdoeFull.place.id}`);
  const cdoeCoord = cdoeLoc.geometry.coordinates;

  const splitter = await findResourceByExactName(SPLITTER_NAME);
  if (!splitter) throw new Error(`${SPLITTER_NAME} não encontrado — rode load-cto-ports.mjs --apply primeiro.`);

  const piSpec = await findSiteSpecByExactName('Ponto de instalação');
  if (!piSpec) throw new Error('Spec de site "Ponto de instalação" não encontrada no catálogo.');

  const dropSpec = await api(
    'GET',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification?name=${encodeURIComponent('Cabo drop 1FO')}`,
  ).then((r) => (r ?? []).find((s) => s.name === 'Cabo drop 1FO'));
  if (!dropSpec) throw new Error('Spec de recurso "Cabo drop 1FO" não encontrada — rode seed-gpon-niteroi.mjs primeiro.');

  const ontSpec = await api(
    'GET',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification?name=${encodeURIComponent('ONT GPON Icaraí')}`,
  ).then((r) => (r ?? []).find((s) => s.name === 'ONT GPON Icaraí'));
  if (!ontSpec) throw new Error('Spec de recurso "ONT GPON Icaraí" não encontrada — rode seed-gpon-niteroi.mjs primeiro.');

  const rfsSpecRow = await api(
    'GET',
    `/tmf-api/serviceCatalogManagement/v4/serviceSpecification?name=${encodeURIComponent('Acesso GPON FTTH')}`,
  ).then((r) => (r ?? []).find((s) => s.name === 'Acesso GPON FTTH'));
  if (!rfsSpecRow) throw new Error('ServiceSpecification "Acesso GPON FTTH" não encontrada.');

  const cfsSpecRow = await api(
    'GET',
    `/tmf-api/serviceCatalogManagement/v4/serviceSpecification?name=${encodeURIComponent('Banda Larga Residencial 1G')}`,
  ).then((r) => (r ?? []).find((s) => s.name === 'Banda Larga Residencial 1G'));
  if (!cfsSpecRow) throw new Error('ServiceSpecification "Banda Larga Residencial 1G" não encontrada.');

  const tenantId = await ensureParty('V.tal Varejo Icaraí');

  for (const cliente of CLIENTES) {
    const isChurn = cliente.status === 'churn';
    const enderecoCasa = `${cliente.street}, ${cliente.streetNr}`;
    const portaNome = `${SPLITTER_NAME} · FO.O.${cliente.port}`;
    const porta = await findResourceByExactName(portaNome);
    if (!porta) {
      console.log(`  ! ${portaNome} não encontrada — pulando cliente ${cliente.seq}.`);
      continue;
    }
    const portaRef = { id: porta.id, '@type': porta['@type'] ?? 'PhysicalResource' };

    const casaCoord = walk(walk(cdoeCoord, RUMO_RUA, cliente.aoLongo), RUMO_TRAVESSA, cliente.recuo);
    const testada = walk(cdoeCoord, RUMO_RUA, cliente.aoLongo);
    const rotaDrop = [cdoeCoord, testada, casaCoord];

    const site = await ensureSite({
      name: `PI ${enderecoCasa}`,
      siteSpecificationId: piSpec.id,
      coord: casaCoord,
      address: { street: cliente.street, streetNr: cliente.streetNr },
    });

    const dropLoc = await createRoute(rotaDrop, `Cabo drop — ${CDOE_NAME} → ${enderecoCasa}`);
    const drop = await ensureResource({
      name: `CABO-DROP-ICARAI-${cliente.seq}`,
      specId: dropSpec.id,
      placeId: dropLoc,
      placeType: 'GeographicLocation',
      serialNumber: `CABO-DROP-ICARAI-${cliente.seq}`,
      administrativeState: 'unlocked', // sempre ativo, inclusive nos churns — ver cabeçalho
    });
    await repairDropConnection({ cdoeRef, portaRef, drop });

    const ont = await ensureResource({
      name: `ONT-ICARAI-${cliente.seq}`,
      specId: ontSpec.id,
      placeId: site.id.startsWith('dry-run:') ? undefined : site.id,
      placeType: 'GeographicSite',
      serialNumber: `ONT-ICARAI-${cliente.seq}`,
      model: 'HG8245Q2',
      administrativeState: isChurn ? 'locked' : 'unlocked',
    });
    await ensureLink(drop, ont, 'connectedTo');

    const rfsState = isChurn ? 'terminated' : 'active';
    const rfs = await ensureRfs({
      name: `Acesso-GPON-CDOE02-${cliente.seq}`,
      specId: rfsSpecRow.id,
      supportingResource: [
        { id: ont.id, '@referredType': 'PhysicalResource', role: 'cpe' },
        { id: portaRef.id, '@referredType': 'PhysicalResource', role: 'access' },
      ],
      siteId: site.id,
      state: rfsState,
      characteristics: [{ name: 'tecnologia', value: 'GPON', valueType: 'string' }],
    });
    await ensureCfs({
      name: `Banda Larga 1G — ${enderecoCasa}`,
      specId: cfsSpecRow.id,
      subscriberId: `SUB-ICARAI-${cliente.seq}`,
      rfsId: rfs.id,
      partyId: tenantId,
      siteId: site.id,
      state: rfsState,
      characteristics: [
        { name: 'velocidade_download', value: '1000', valueType: 'number' },
        { name: 'modelo_comercial', value: 'direto', valueType: 'string' },
        ...(isChurn ? [{ name: 'motivo_termino', value: 'churn', valueType: 'string' }] : []),
      ],
    });
  }

  console.log('== Relatório ==');
  console.log(`Sites:     ${report.sitesCreated} criados, ${report.sitesReused} reaproveitados`);
  console.log(`Locations: ${report.locationsCreated}`);
  console.log(`Endereços: ${report.addressesCreated}`);
  if (!APPLY) {
    console.log(`Recursos que seriam criados (${report.resourcesToCreate.length}):`);
    for (const name of report.resourcesToCreate) console.log(`  + ${name}`);
    console.log(`Recursos já existentes (reaproveitados): ${report.resourcesReused}`);
    console.log(`Serviços que seriam criados (${report.servicesToCreate.length}):`);
    for (const name of report.servicesToCreate) console.log(`  + ${name}`);
    console.log(`Serviços já existentes (reaproveitados): ${report.servicesReused}`);
    console.log('\nRode de novo com --apply para gravar.');
  } else {
    console.log(`Recursos: ${report.resourcesCreated} criados, ${report.resourcesReused} reaproveitados`);
    console.log(`Ligações: ${report.linksCreated} criadas; ${report.legacyLinksRemoved} legadas removidas`);
    console.log(`Serviços: ${report.servicesCreated} criados, ${report.servicesReused} reaproveitados`);
    console.log('\n4 clientes ativos (FO.O.1-4), 2 churns (FO.O.5-6), FO.O.7-8 livres.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
