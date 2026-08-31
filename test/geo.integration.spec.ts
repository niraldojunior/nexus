import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';
import { createTestDatabase as createPostgresTestDatabase } from './test-utils.js';
import { createDatabaseClient } from '../src/shared/persistence/database-factory.js';
import { databaseConfigOf } from '../src/shared/config/env.js';
import { COVERAGE_CELL_METERS, lngLatToMercator } from '../src/modules/geo/coverage-grid.js';

const createLogger = () => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

const createConfig = (port: number, databaseUrl: string) => ({
  appName: 'v-tal-nexus',
  authEnabled: true,
  authToken: 'secret',
  databaseUrl,
  logLevel: 'info' as const,
  nodeEnv: 'test' as const,
  port,
});

const requestJson = async (
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ statusCode: number; body: unknown }> => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          authorization: 'Bearer secret',
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            body: text ? JSON.parse(text) : undefined,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

type GeoTreeResponseNode = {
  id?: string;
  kind?: string;
  label?: string;
  descendantCount?: number;
  hasChildren?: boolean;
  geometry?: { coordinates?: unknown };
};

test('Geo HTTP integration handles spec, location and site creation', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const address = await requestJson(port, 'POST', '/v1/geo/addresses', {
    street: 'Rua Voluntarios da Patria',
  });
  assert.equal(address.statusCode, 201);

  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Central Office',
    category: 'Site',
  });
  assert.equal(spec.statusCode, 201);

  const location = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
  });
  assert.equal(location.statusCode, 201);

  const site = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'CO Botafogo',
    siteSpecificationId: (spec.body as { id: string }).id,
    placeId: (location.body as { id: string }).id,
    addressId: (address.body as { id: string }).id,
  });
  assert.equal(site.statusCode, 201);
});

test('Geo HTTP integration supports TMF aliases, workspace transaction, status event and relatedSite', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const spec = await requestJson(
    port,
    'POST',
    '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification',
    {
      name: 'Ponto de Instalacao',
      category: 'Site',
    },
  );
  assert.equal(spec.statusCode, 201);

  const feederSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'CTO',
    category: 'Site',
  });
  assert.equal(feederSpec.statusCode, 201);

  const feeder = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'CTO ICA-014',
    siteSpecificationId: (feederSpec.body as { id: string }).id,
  });
  assert.equal(feeder.statusCode, 201);

  const workspace = await requestJson(port, 'POST', '/v1/geo/workspace/site-at-address', {
    location: {
      geometryType: 'Point',
      geometry: { type: 'Point', coordinates: [-43.1059, -22.9092] },
    },
    address: {
      street: 'Rua Belisario Augusto',
      streetNr: '145',
      city: 'Niteroi',
      stateOrProvince: 'RJ',
      country: 'BR',
    },
    site: {
      name: 'PI Belisario',
      siteSpecificationId: (spec.body as { id: string }).id,
    },
    fedBySiteId: (feeder.body as { id: string }).id,
  });
  assert.equal(workspace.statusCode, 201);
  assert.equal((workspace.body as { site: { '@type': string } }).site['@type'], 'GeographicSite');
  assert.equal(
    (workspace.body as { site: { relatedSite: Array<{ relationshipType: string }> } }).site
      .relatedSite[0]?.relationshipType,
    'fedBy',
  );

  const siteId = (workspace.body as { site: { id: string } }).site.id;
  const patch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/geographicSiteManagement/v4/geographicSite/${siteId}`,
    {
      status: 'active',
    },
  );
  assert.equal(patch.statusCode, 200);

  const events = await requestJson(port, 'GET', `/v1/geo/sites/${siteId}/events`);
  assert.equal(events.statusCode, 200);
  assert.ok(
    (events.body as Array<{ eventType: string }>).some(
      (event) => event.eventType === 'GeographicSiteStatusChangeEvent',
    ),
  );
});

test('Geo HTTP integration exposes bootstrap, allowedChildren and containment impact', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const bootstrap = await requestJson(port, 'POST', '/v1/geo/site-specifications/bootstrap');
  assert.equal(bootstrap.statusCode, 200);
  // BOOTSTRAP_SPECIFICATIONS em service.ts — Region, Functional Group, CO, POP, Cabinet,
  // Installation Point, Customer Site, Condominium, Block, Floor, Room, Cage.
  assert.equal((bootstrap.body as { specs: unknown[] }).specs.length, 12);

  const regionSpecs = await requestJson(port, 'GET', '/v1/geo/site-specifications?code=REGION');
  const centralSpecs = await requestJson(port, 'GET', '/v1/geo/site-specifications?code=CO');
  assert.equal(regionSpecs.statusCode, 200);
  assert.equal(centralSpecs.statusCode, 200);

  const regionSpecId = (regionSpecs.body as Array<{ id: string }>)[0]?.id;
  const centralSpecId = (centralSpecs.body as Array<{ id: string }>)[0]?.id;
  assert.ok(regionSpecId);
  assert.ok(centralSpecId);

  const allowedChildren = await requestJson(
    port,
    'GET',
    `/v1/geo/site-specifications/${regionSpecId}/allowedChildren`,
  );
  assert.equal(allowedChildren.statusCode, 200);
  assert.ok((allowedChildren.body as Array<{ code: string }>).some((item) => item.code === 'CO'));

  const region = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'RJ',
    siteSpecificationId: regionSpecId,
  });
  assert.equal(region.statusCode, 201);

  const central = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'CO Botafogo',
    siteSpecificationId: centralSpecId,
    parentSiteId: (region.body as { id: string }).id,
  });
  assert.equal(central.statusCode, 201);

  const impact = await requestJson(
    port,
    'POST',
    `/v1/geo/site-specifications/${regionSpecId}/containment-impact`,
    {
      allowedChildSpecIds: [],
    },
  );
  assert.equal(impact.statusCode, 200);
  assert.equal((impact.body as { blocking: boolean }).blocking, true);
});

test('Geo tree serves one level per call, with counts, pagination and child flags', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const idOf = (response: { body: unknown }) => (response.body as { id: string }).id;

  // Estação com endereço (é dele que saem UF e Município) e ponto próprio.
  const stationSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Estação',
    category: 'Site',
  });
  // A contenção precisa ser declarada nos dois lados do catálogo: sem isso a criação da
  // sala é recusada com 409 GEO_SPEC_CONTAINMENT_NOT_ALLOWED.
  const roomSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Sala',
    category: 'SubSite',
    allowedParentSpecIds: [idOf(stationSpec)],
  });
  await requestJson(port, 'PATCH', `/v1/geo/site-specifications/${idOf(stationSpec)}`, {
    allowedChildSpecIds: [idOf(roomSpec)],
  });
  const address = await requestJson(port, 'POST', '/v1/geo/addresses', {
    street: 'Rua Coronel Moreira Cesar',
    city: 'Niterói',
    stateOrProvince: 'RJ',
    country: 'BR',
  });
  const stationPlace = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.107, -22.906] },
  });
  const station = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'Icaraí (ICI)',
    siteSpecificationId: idOf(stationSpec),
    placeId: idOf(stationPlace),
    addressId: idOf(address),
    status: 'active',
  });
  const room = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'Sala GPON',
    siteSpecificationId: idOf(roomSpec),
    parentSiteId: idOf(station),
    status: 'active',
  });
  assert.equal(room.statusCode, 201);

  // Planta externa: a caixa fica na rua (place = Location própria) e se liga à
  // estação pela characteristic `servingSite`; o splitter pende da caixa e reaproveita
  // a mesma Location (é o mesmo ponto físico — não tem pin próprio no mapa).
  const boxSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    {
      name: 'CDOE 1:8',
      category: 'Infrastructure.Passive',
      resourceType: 'CTO',
    },
  );
  const splitterSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    {
      name: 'Splitter óptico 1:8',
      category: 'Infrastructure.Passive',
      resourceType: 'Splitter',
    },
  );
  const cableSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    {
      name: 'Cabo secundário 6FO',
      category: 'Cable.OutsidePlant',
      resourceType: 'DistributionCable',
    },
  );
  const boxPlace = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.108, -22.907] },
  });
  const box = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE-1108',
    resourceSpecificationId: idOf(boxSpec),
    placeId: idOf(boxPlace),
    placeType: 'GeographicLocation',
    characteristic: [{ name: 'servingSite', value: idOf(station), valueType: 'string' }],
  });
  assert.equal(box.statusCode, 201);

  const splitter = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'CDOE-1108 · S32_1',
      resourceSpecificationId: idOf(splitterSpec),
      placeId: idOf(boxPlace),
      placeType: 'GeographicLocation',
      characteristic: [{ name: 'servingSite', value: idOf(station), valueType: 'string' }],
    },
  );
  assert.equal(splitter.statusCode, 201);
  const containsLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(box)}/relationships`,
    { id: idOf(splitter), relationshipType: 'containsAsChild' },
  );
  assert.equal(containsLink.statusCode, 201);

  // O splitter alimenta um cabo secundário — é o que a árvore de navegação deve
  // mostrar direto sob a caixa, pulando o splitter (pass-through).
  const cablePlace = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'LineString',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-43.108, -22.907],
        [-43.109, -22.908],
      ],
    },
  });
  const secondaryCable = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'Cabo Secundário 01',
      resourceSpecificationId: idOf(cableSpec),
      placeId: idOf(cablePlace),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(secondaryCable.statusCode, 201);
  const connectedLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(splitter)}/relationships`,
    { id: idOf(secondaryCable), relationshipType: 'connectedTo' },
  );
  assert.equal(connectedLink.statusCode, 201);

  // Abertura: UF → Município → Estações → Estação, sem contar recursos de
  // nenhuma delas — a estação nasce com "+" e o volume só chega ao abri-la.
  const roots = await requestJson(port, 'GET', '/v1/geo/tree/roots');
  assert.equal(roots.statusCode, 200);
  const rootNodes = roots.body as GeoTreeResponseNode[];
  assert.deepEqual(
    rootNodes.map((item) => item.kind),
    ['uf', 'city', 'group', 'site'],
  );
  assert.equal(rootNodes[0]?.label, 'RJ');
  assert.equal(rootNodes[1]?.label, 'Niterói');
  assert.equal(rootNodes[2]?.label, 'Estações');
  const stationNode = rootNodes[3];
  assert.equal(stationNode?.id, `site:${idOf(station)}`);
  assert.equal(stationNode?.descendantCount, undefined);
  assert.equal(stationNode?.hasChildren, true);
  assert.deepEqual(stationNode?.geometry?.coordinates, [-43.107, -22.906]);

  // Escopo de navegação (default): a sala é item interno e some por completo — só
  // a caixa aparece.
  const children = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${idOf(station)}`,
  );
  assert.equal(children.statusCode, 200);
  const page = children.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.equal(page.total, 1);
  assert.deepEqual(
    page.nodes.map((item) => item.label),
    ['CDOE-1108'],
  );
  // A caixa ganha "+": mesmo com o splitter escondido, o pass-through acha o cabo.
  assert.equal(page.nodes[0]?.hasChildren, true);

  // Escopo de detalhe (`scope=all`): sala e caixa voltam as duas, sem filtro.
  const childrenAll = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${idOf(station)}&scope=all`,
  );
  assert.equal(childrenAll.statusCode, 200);
  const pageAll = childrenAll.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.equal(pageAll.total, 2);
  assert.deepEqual(
    pageAll.nodes.map((item) => item.label),
    ['Sala GPON', 'CDOE-1108'],
  );
  // Sala vazia não ganha "+"; caixa com splitter ganha (splitter tem 1 filho direto).
  assert.equal(pageAll.nodes[0]?.hasChildren, false);
  assert.equal(pageAll.nodes[1]?.hasChildren, true);

  // Paginação em `scope=all`: a janela atravessa sub-locais e recursos, e o total
  // não muda.
  const firstPage = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${idOf(station)}&limit=1&scope=all`,
  );
  const secondPage = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${idOf(station)}&limit=1&offset=1&scope=all`,
  );
  assert.equal(
    (firstPage.body as { nodes: Array<{ label: string }> }).nodes[0]?.label,
    'Sala GPON',
  );
  assert.equal((secondPage.body as { total: number }).total, 2);
  assert.equal(
    (secondPage.body as { nodes: Array<{ label: string }> }).nodes[0]?.label,
    'CDOE-1108',
  );

  // Nível seguinte da planta em escopo de navegação: o splitter não aparece — o
  // cabo secundário que ele alimenta sobe direto para este nível (pass-through).
  const boxChildren = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=resource:${idOf(box)}`,
  );
  const boxPage = boxChildren.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.equal(boxPage.total, 1);
  assert.equal(boxPage.nodes[0]?.label, 'Cabo Secundário 01');
  assert.equal(boxPage.nodes[0]?.hasChildren, false);

  // O mesmo nível em `scope=all`: o splitter aparece, com "+" (tem o cabo como filho).
  const boxChildrenAll = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=resource:${idOf(box)}&scope=all`,
  );
  const boxPageAll = boxChildrenAll.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.equal(boxPageAll.total, 1);
  assert.equal(boxPageAll.nodes[0]?.label, 'CDOE-1108 · S32_1');
  assert.equal(boxPageAll.nodes[0]?.hasChildren, true);

  const missingNode = await requestJson(port, 'GET', '/v1/geo/tree/children');
  assert.equal(missingNode.statusCode, 400);

  // Caminho até a Estação — é o que o cliente expande para revelar o nó na árvore.
  const stationPath = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/path?nodeId=site:${idOf(station)}`,
  );
  assert.equal(stationPath.statusCode, 200);
  assert.deepEqual((stationPath.body as { path: string[] }).path, [
    'uf:RJ',
    'city:RJ|Niterói',
    'group:RJ|Niterói|stations',
    `site:${idOf(station)}`,
  ]);

  // Caminho até a caixa: planta externa presa à estação por `servingSite`.
  const boxPath = await requestJson(port, 'GET', `/v1/geo/tree/path?nodeId=resource:${idOf(box)}`);
  assert.deepEqual((boxPath.body as { path: string[] }).path, [
    'uf:RJ',
    'city:RJ|Niterói',
    'group:RJ|Niterói|stations',
    `site:${idOf(station)}`,
    `resource:${idOf(box)}`,
  ]);

  // Caminho até o cabo secundário: ele pende do splitter, que é item interno — o
  // caminho devolvido pula o splitter, espelhando o pass-through da árvore.
  const cablePath = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/path?nodeId=resource:${idOf(secondaryCable)}`,
  );
  assert.deepEqual((cablePath.body as { path: string[] }).path, [
    'uf:RJ',
    'city:RJ|Niterói',
    'group:RJ|Niterói|stations',
    `site:${idOf(station)}`,
    `resource:${idOf(box)}`,
    `resource:${idOf(secondaryCable)}`,
  ]);

  const missingPathNode = await requestJson(port, 'GET', '/v1/geo/tree/path');
  assert.equal(missingPathNode.statusCode, 400);

  // Nó por id, hidratado — completa a seleção feita a partir de uma feature do InfraOverlay
  // (canvas do mapa), que só carrega o essencial pra desenhar. A Estação vem completa (Site).
  const stationNodeById = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/node?id=site:${idOf(station)}`,
  );
  assert.equal(stationNodeById.statusCode, 200);
  assert.equal((stationNodeById.body as GeoTreeResponseNode).label, 'Icaraí (ICI)');

  // A caixa vem com a geometria de ponto e `hasChildren` real (o splitter tem 1 filho direto,
  // mesma régua de pass-through que `children` já valida acima).
  const boxNodeById = await requestJson(port, 'GET', `/v1/geo/tree/node?id=resource:${idOf(box)}`);
  assert.equal(boxNodeById.statusCode, 200);
  const boxHydrated = boxNodeById.body as GeoTreeResponseNode;
  assert.equal(boxHydrated.label, 'CDOE-1108');
  assert.equal(boxHydrated.hasChildren, true);
  assert.deepEqual(boxHydrated.geometry?.coordinates, [-43.108, -22.907]);

  // O cabo secundário vem com a rota INTEIRA (2 vértices) — não um trecho recortado por tile,
  // ao contrário do que uma feature do índice `geo_map_feature` traria.
  const cableNodeById = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/node?id=resource:${idOf(secondaryCable)}`,
  );
  assert.equal(cableNodeById.statusCode, 200);
  assert.deepEqual((cableNodeById.body as GeoTreeResponseNode).geometry?.coordinates, [
    [-43.108, -22.907],
    [-43.109, -22.908],
  ]);

  const missingIdParam = await requestJson(port, 'GET', '/v1/geo/tree/node');
  assert.equal(missingIdParam.statusCode, 400);

  const unknownNode = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/node?id=resource:00000000-0000-0000-0000-000000000000',
  );
  assert.equal(unknownNode.statusCode, 404);
});

test('Geo tree pass-through skips a chain of hidden splitters to the first visible descendant', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const idOf = (response: { body: unknown }) => (response.body as { id: string }).id;

  const boxSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'CDOE 1:8', category: 'Infrastructure.Passive', resourceType: 'CTO' },
  );
  const splitterSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'Splitter óptico 1:8', category: 'Infrastructure.Passive', resourceType: 'Splitter' },
  );
  const cableSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    {
      name: 'Cabo secundário 6FO',
      category: 'Cable.OutsidePlant',
      resourceType: 'DistributionCable',
    },
  );
  const place = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.108, -22.907] },
  });

  const box = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE-2201',
    resourceSpecificationId: idOf(boxSpec),
    placeId: idOf(place),
    placeType: 'GeographicLocation',
  });
  assert.equal(box.statusCode, 201);
  // Caixa → splitter A (containsAsChild) → splitter B (connectedTo, cascata rara mas
  // possível) → cabo (connectedTo). Dois saltos internos seguidos.
  const splitterA = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'CDOE-2201 · S1',
      resourceSpecificationId: idOf(splitterSpec),
      placeId: idOf(place),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(splitterA.statusCode, 201);
  const splitterB = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'CDOE-2201 · S1 · S1',
      resourceSpecificationId: idOf(splitterSpec),
      placeId: idOf(place),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(splitterB.statusCode, 201);
  const cable = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'Cabo Secundário 02',
      resourceSpecificationId: idOf(cableSpec),
      placeId: idOf(place),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(cable.statusCode, 201);

  const boxSplitterLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(box)}/relationships`,
    { id: idOf(splitterA), relationshipType: 'containsAsChild' },
  );
  assert.equal(boxSplitterLink.statusCode, 201);
  const splitterSplitterLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(splitterA)}/relationships`,
    { id: idOf(splitterB), relationshipType: 'connectedTo' },
  );
  assert.equal(splitterSplitterLink.statusCode, 201);
  const splitterCableLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(splitterB)}/relationships`,
    { id: idOf(cable), relationshipType: 'connectedTo' },
  );
  assert.equal(splitterCableLink.statusCode, 201);

  const boxChildren = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=resource:${idOf(box)}`,
  );
  const boxPage = boxChildren.body as { total: number; nodes: GeoTreeResponseNode[] };
  // Os dois splitters somem; só o cabo do fim da cadeia sobe para este nível, uma
  // única vez (sem duplicar por causa dos dois saltos internos).
  assert.equal(boxPage.total, 1);
  assert.deepEqual(
    boxPage.nodes.map((item) => item.label),
    ['Cabo Secundário 02'],
  );
});

test('Geo tree hides Port like Splitter (issue #171 Fase 3), but a drop hanging off a hidden Port still passes through', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const idOf = (response: { body: unknown }) => (response.body as { id: string }).id;

  const boxSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'CDOE 1:8', category: 'Infrastructure.Passive', resourceType: 'CTO' },
  );
  const splitterSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'Splitter óptico 1:8', category: 'Infrastructure.Passive', resourceType: 'Splitter' },
  );
  const portSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'Porta de Splitter', category: 'Equipment.Access', resourceType: 'Port' },
  );
  const cableSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'Cabo drop 1FO', category: 'Cable.OutsidePlant', resourceType: 'DropCable' },
  );
  const place = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.108, -22.907] },
  });

  const box = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE-ICARAI-01',
    resourceSpecificationId: idOf(boxSpec),
    placeId: idOf(place),
    placeType: 'GeographicLocation',
  });
  assert.equal(box.statusCode, 201);
  const splitter = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'CDOE-ICARAI-01 · Splitter',
      resourceSpecificationId: idOf(splitterSpec),
      placeId: idOf(place),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(splitter.statusCode, 201);
  const portaOut = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'CDOE-ICARAI-01 · Splitter · FO.O.1',
      resourceSpecificationId: idOf(portSpec),
      placeId: idOf(place),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(portaOut.statusCode, 201);
  const drop = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'Drop Cliente 01',
    resourceSpecificationId: idOf(cableSpec),
    placeId: idOf(place),
    placeType: 'GeographicLocation',
  });
  assert.equal(drop.statusCode, 201);

  const boxSplitterLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(box)}/relationships`,
    { id: idOf(splitter), relationshipType: 'containsAsChild' },
  );
  assert.equal(boxSplitterLink.statusCode, 201);
  const splitterPortLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(splitter)}/relationships`,
    { id: idOf(portaOut), relationshipType: 'containsAsChild' },
  );
  assert.equal(splitterPortLink.statusCode, 201);
  const portDropLink = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(portaOut)}/relationships`,
    { id: idOf(drop), relationshipType: 'connectedTo' },
  );
  assert.equal(portDropLink.statusCode, 201);

  // scope 'tree' (default): Splitter e Porta somem, o drop pendurado na Porta escondida
  // passa através dos dois saltos e aparece direto sob a caixa.
  const boxChildrenTree = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=resource:${idOf(box)}`,
  );
  const boxTreePage = boxChildrenTree.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.equal(boxTreePage.total, 1);
  assert.deepEqual(
    boxTreePage.nodes.map((item) => item.label),
    ['Drop Cliente 01'],
  );

  // scope 'all' (painel de detalhe): Splitter aparece — é aqui que a aba Portas busca.
  const boxChildrenAll = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=resource:${idOf(box)}&scope=all`,
  );
  const boxAllPage = boxChildrenAll.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.deepEqual(
    boxAllPage.nodes.map((item) => item.label).sort(),
    ['CDOE-ICARAI-01 · Splitter'],
  );

  const splitterChildrenAll = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=resource:${idOf(splitter)}&scope=all`,
  );
  const splitterAllPage = splitterChildrenAll.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.deepEqual(
    splitterAllPage.nodes.map((item) => item.label),
    ['CDOE-ICARAI-01 · Splitter · FO.O.1'],
  );

  // A busca continua sem devolver item interno, agora também para Porta.
  const search = await requestJson(port, 'GET', '/v1/geo/tree/search?q=icarai-01');
  assert.equal(search.statusCode, 200);
  const searchResults = search.body as GeoTreeResponseNode[];
  assert.equal(
    searchResults.some((item) => item.label === 'CDOE-ICARAI-01 · Splitter · FO.O.1'),
    false,
  );
});

test('Geo tree viewport serves passive infra by bounding box, independent of hierarchy state', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const idOf = (response: { body: unknown }) => (response.body as { id: string }).id;

  const resourceSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    {
      name: 'CDOE 1:8',
      category: 'Infrastructure.Passive',
      resourceType: 'CTO',
    },
  );

  // Caixa pontual e cabo (LineString) nunca expandidos na árvore — o viewport
  // precisa achá-los só pela geometria, não por nó pai carregado.
  const boxPlace = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.108, -22.907] },
  });
  const box = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE-1108',
    resourceSpecificationId: idOf(resourceSpec),
    placeId: idOf(boxPlace),
    placeType: 'GeographicLocation',
  });
  assert.equal(box.statusCode, 201);

  const cablePlace = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'LineString',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-43.109, -22.908],
        [-43.107, -22.906],
      ],
    },
  });
  const cable = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'Cabo Primário 01',
      resourceSpecificationId: idOf(resourceSpec),
      placeId: idOf(cablePlace),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(cable.statusCode, 201);

  // Splitter na mesma Location da caixa (reaproveita o ponto físico dela) — não deve
  // ganhar pin próprio no mapa.
  const splitterSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'Splitter óptico 1:8', category: 'Infrastructure.Passive', resourceType: 'Splitter' },
  );
  const splitter = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'CDOE-1108 · S32_1',
      resourceSpecificationId: idOf(splitterSpec),
      placeId: idOf(boxPlace),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(splitter.statusCode, 201);

  // Ponto de Instalação (categoria Site, não-CO): só visível no mapa em escala de
  // detalhe — pela mesma régua de um Recurso — então entra pelo viewport, não por
  // roots() (ver GeoTreeService.sitesInViewport).
  const piSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Ponto de Instalação',
    category: 'Site',
  });
  const piPlace = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.109, -22.909] },
  });
  const piAddress = await requestJson(port, 'POST', '/v1/geo/addresses', {
    street: 'Rua do PI',
    geographicLocationId: idOf(piPlace),
  });
  const pi = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'PI Icaraí Viewport',
    siteSpecificationId: idOf(piSpec),
    status: 'Active',
    placeId: idOf(piPlace),
    addressId: idOf(piAddress),
  });
  assert.equal(pi.statusCode, 201);

  // Bbox que cobre a região de Icaraí: caixa, cabo e o Ponto de Instalação voltam, sem
  // expandir nada antes; o splitter fica de fora — não tem ponto próprio no mapa.
  const insideBbox = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/viewport?minLng=-43.12&minLat=-22.92&maxLng=-43.10&maxLat=-22.90',
  );
  assert.equal(insideBbox.statusCode, 200);
  const insideNodes = insideBbox.body as GeoTreeResponseNode[];
  assert.deepEqual(insideNodes.map((item) => item.label).sort(), [
    'CDOE-1108',
    'Cabo Primário 01',
    'PI Icaraí Viewport',
  ]);
  const piNode = insideNodes.find((item) => item.label === 'PI Icaraí Viewport');
  assert.equal(piNode?.kind, 'site');

  // `include` (RF-011, controle de camadas do mapa) restringe o que o servidor busca — com um
  // grupo desligado no cliente, a requisição nem pede aquele shape.
  const insideBboxUrl = (include: string) =>
    `/v1/geo/tree/viewport?minLng=-43.12&minLat=-22.92&maxLng=-43.10&maxLat=-22.90&include=${include}`;

  const onlyResourcePoints = await requestJson(port, 'GET', insideBboxUrl('resource-points'));
  assert.equal(onlyResourcePoints.statusCode, 200);
  assert.deepEqual(
    (onlyResourcePoints.body as GeoTreeResponseNode[]).map((item) => item.label),
    ['CDOE-1108'],
  );

  const onlyResourceLines = await requestJson(port, 'GET', insideBboxUrl('resource-lines'));
  assert.equal(onlyResourceLines.statusCode, 200);
  assert.deepEqual(
    (onlyResourceLines.body as GeoTreeResponseNode[]).map((item) => item.label),
    ['Cabo Primário 01'],
  );

  const onlySites = await requestJson(port, 'GET', insideBboxUrl('sites'));
  assert.equal(onlySites.statusCode, 200);
  assert.deepEqual(
    (onlySites.body as GeoTreeResponseNode[]).map((item) => item.label),
    ['PI Icaraí Viewport'],
  );

  // Camadas de recurso combinadas (sem Sites): caixa + cabo, sem o Ponto de Instalação.
  const resourcesOnly = await requestJson(
    port,
    'GET',
    insideBboxUrl('resource-points,resource-lines'),
  );
  assert.equal(resourcesOnly.statusCode, 200);
  assert.deepEqual((resourcesOnly.body as GeoTreeResponseNode[]).map((item) => item.label).sort(), [
    'CDOE-1108',
    'Cabo Primário 01',
  ]);

  // Token desconhecido é ignorado; nenhum token reconhecido não busca nada.
  const unknownInclude = await requestJson(port, 'GET', insideBboxUrl('bogus'));
  assert.equal(unknownInclude.statusCode, 200);
  assert.deepEqual(unknownInclude.body, []);

  // Bbox longe da região: nada volta.
  const outsideBbox = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/viewport?minLng=-43.30&minLat=-23.00&maxLng=-43.25&maxLat=-22.95',
  );
  assert.equal(outsideBbox.statusCode, 200);
  assert.deepEqual(outsideBbox.body, []);

  const missingBounds = await requestJson(port, 'GET', '/v1/geo/tree/viewport?minLng=-43.12');
  assert.equal(missingBounds.statusCode, 400);
});

test('Geo coverage serves the GPON heat grid and neighborhood polygons by bounding box', async (t) => {
  const database = createPostgresTestDatabase('geo-coverage');
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  // Mesma instância de banco que o app usa (PostgresDatabase é singleton por URL): a
  // cobertura é semeada direto nas tabelas de projeção, como faz o build-gpon-coverage.
  const db = createDatabaseClient(databaseConfigOf(createConfig(0, database.databaseUrl)));

  const coverageChars = (stat: {
    key: string;
    neighborhood: string;
    city: string;
    uf: string;
    cdoTotal: number;
    cdoAvailable: number;
  }) =>
    JSON.stringify([
      { group: '_coverage', name: 'kind', value: 'GponCoverage', valueType: 'string' },
      { group: '_coverage', name: 'neighborhood', value: stat.neighborhood, valueType: 'string' },
      { group: '_coverage', name: 'city', value: stat.city, valueType: 'string' },
      { group: '_coverage', name: 'uf', value: stat.uf, valueType: 'string' },
      { group: '_coverage', name: 'neighborhoodKey', value: stat.key, valueType: 'string' },
      { group: '_coverage', name: 'cdoTotal', value: stat.cdoTotal, valueType: 'integer' },
      { group: '_coverage', name: 'cdoAvailable', value: stat.cdoAvailable, valueType: 'integer' },
      {
        group: '_coverage',
        name: 'cdoUnavailable',
        value: stat.cdoTotal - stat.cdoAvailable,
        valueType: 'integer',
      },
      {
        group: '_coverage',
        name: 'availabilityRatio',
        value: stat.cdoTotal > 0 ? stat.cdoAvailable / stat.cdoTotal : 0,
        valueType: 'decimal',
      },
      { group: '_coverage', name: 'coveredAreaKm2', value: 0.25, valueType: 'decimal' },
    ]);

  // Bbox fixo do polígono semeado (as duas áreas do teste compartilham o mesmo quadrado, por
  // simplicidade) — geo_gpon_coverage_area guarda o bbox pronto, como build-gpon-coverage.mjs.
  const AREA_BOUNDS = { minLng: -43.108, minLat: -22.908, maxLng: -43.1, maxLat: -22.902 };

  const seedArea = async (
    locId: string,
    stat: {
      key: string;
      neighborhood: string;
      city: string;
      uf: string;
      cdoTotal: number;
      cdoAvailable: number;
    },
    cells: Array<{ gx: number; gy: number; total: number; avail: number }>,
  ) => {
    await db.run(
      `INSERT INTO tmf_geographic_location
         (id, geometry_type, geometry, spatial_ref, reference_point, characteristics)
       VALUES (?, 'Polygon', ?, 'EPSG:4326', ?, ?)`,
      [
        locId,
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-43.108, -22.908],
              [-43.1, -22.908],
              [-43.1, -22.902],
              [-43.108, -22.902],
              [-43.108, -22.908],
            ],
          ],
        }),
        `GPON:${stat.key}`,
        coverageChars(stat),
      ],
    );
    for (const cell of cells) {
      await db.run(
        `INSERT INTO geo_gpon_coverage_cell
           (tenant_id, grid_size_m, grid_x, grid_y, coverage_area_id, cdo_total, cdo_available)
         VALUES ('default', ?, ?, ?, ?, ?, ?)`,
        [COVERAGE_CELL_METERS, cell.gx, cell.gy, locId, cell.total, cell.avail],
      );
    }
    // Índice de leitura por polígono (ver GeoCoverageService.areaIndexLevel) — o que o loader
    // grava em geo_gpon_coverage_area para o nível neighborhood.
    await db.run(
      `INSERT INTO geo_gpon_coverage_area
         (tenant_id, location_id, lod_level, cell_size_m, min_lng, min_lat, max_lng, max_lat,
          area_key, neighborhood, city, uf, cdo_total, cdo_available, covered_area_km2)
       VALUES ('default', ?, 'neighborhood', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.25)`,
      [
        locId,
        COVERAGE_CELL_METERS,
        AREA_BOUNDS.minLng,
        AREA_BOUNDS.minLat,
        AREA_BOUNDS.maxLng,
        AREA_BOUNDS.maxLat,
        stat.key,
        stat.neighborhood,
        stat.city,
        stat.uf,
        stat.cdoTotal,
        stat.cdoAvailable,
      ],
    );
  };

  // Alinha as células ao mesmo mapeamento bbox→grade do serviço, ancorando em Icaraí.
  const [x0, y0] = lngLatToMercator(-43.106, -22.906);
  const gx = Math.floor(x0 / COVERAGE_CELL_METERS);
  const gy = Math.floor(y0 / COVERAGE_CELL_METERS);

  // cdoTotal nas characteristics (5 e 4) é a contagem REAL do bairro, de propósito diferente
  // da soma das células — é o que o balão exibe.
  await seedArea(
    '11111111-1111-7111-8111-111111111111',
    {
      key: 'RJ|Niterói|Icaraí',
      neighborhood: 'Icaraí',
      city: 'Niterói',
      uf: 'RJ',
      cdoTotal: 5,
      cdoAvailable: 3,
    },
    [
      { gx, gy, total: 3, avail: 2 },
      { gx: gx + 1, gy, total: 2, avail: 1 },
    ],
  );
  await seedArea(
    '22222222-2222-7222-8222-222222222222',
    {
      key: 'RJ|Niterói|Santa Rosa',
      neighborhood: 'Santa Rosa',
      city: 'Niterói',
      uf: 'RJ',
      cdoTotal: 4,
      cdoAvailable: 0,
    },
    [{ gx: gx + 2, gy, total: 4, avail: 0 }],
  );

  const bbox = 'minLng=-43.108&minLat=-22.910&maxLng=-43.100&maxLat=-22.902';

  // fine: 3 células, cada uma com o índice do seu bairro; estatística vem das characteristics.
  const fine = await requestJson(port, 'GET', `/v1/geo/coverage?${bbox}&level=fine`);
  assert.equal(fine.statusCode, 200);
  const fineBody = fine.body as {
    level: string;
    grid: { sizeMeters: number };
    cells: number[][];
    neighborhoods: Array<{
      id: number;
      neighborhood: string;
      cdoTotal: number;
      cdoAvailable: number;
    }>;
    truncated: boolean;
  };
  assert.equal(fineBody.level, 'fine');
  assert.equal(fineBody.grid.sizeMeters, COVERAGE_CELL_METERS);
  assert.equal(fineBody.cells.length, 3);
  assert.equal(fineBody.neighborhoods.length, 2);
  const icarai = fineBody.neighborhoods.find((item) => item.neighborhood === 'Icaraí');
  assert.ok(icarai);
  assert.equal(
    icarai!.cdoTotal,
    5,
    'estatística do balão é a contagem real, não a soma das células',
  );
  assert.equal(icarai!.cdoAvailable, 3);
  // Toda célula referencia um índice de bairro válido.
  for (const cell of fineBody.cells) {
    assert.ok(cell[4]! >= 0 && cell[4]! < fineBody.neighborhoods.length);
  }

  // coarse: campo de densidade agregado; a soma bate com a das células finas.
  const coarse = await requestJson(port, 'GET', `/v1/geo/coverage?${bbox}&level=coarse`);
  assert.equal(coarse.statusCode, 200);
  const coarseBody = coarse.body as {
    level: string;
    grid: { sizeMeters: number };
    cells: number[][];
  };
  assert.equal(coarseBody.level, 'coarse');
  assert.equal(coarseBody.grid.sizeMeters, COVERAGE_CELL_METERS * 5);
  const totalCdo = coarseBody.cells.reduce((sum, cell) => sum + cell[2]!, 0);
  const totalAvail = coarseBody.cells.reduce((sum, cell) => sum + cell[3]!, 0);
  assert.equal(totalCdo, 9);
  assert.equal(totalAvail, 3);

  // neighborhood: polígonos de bairro com geometria e estatística, lidos do índice
  // geo_gpon_coverage_area (1 round-trip, sem varrer a grade nem characteristics).
  const neighborhoodLevel = await requestJson(
    port,
    'GET',
    `/v1/geo/coverage?${bbox}&level=neighborhood`,
  );
  assert.equal(neighborhoodLevel.statusCode, 200);
  const neighborhoodBody = neighborhoodLevel.body as {
    level: string;
    areas: Array<{
      id: string;
      neighborhoodIndex: number;
      geometry: { type: string };
      bounds: [number, number, number, number];
    }>;
    neighborhoods: Array<{ neighborhood: string; cdoTotal: number; cdoAvailable: number }>;
  };
  assert.equal(neighborhoodBody.level, 'neighborhood');
  assert.equal(neighborhoodBody.areas.length, 2);
  assert.equal(neighborhoodBody.neighborhoods.length, 2);
  for (const polygon of neighborhoodBody.areas) {
    assert.equal(polygon.geometry.type, 'Polygon');
    assert.ok(polygon.neighborhoodIndex >= 0);
    assert.deepEqual(polygon.bounds, [
      AREA_BOUNDS.minLng,
      AREA_BOUNDS.minLat,
      AREA_BOUNDS.maxLng,
      AREA_BOUNDS.maxLat,
    ]);
  }
  const icaraiArea = neighborhoodBody.neighborhoods.find((item) => item.neighborhood === 'Icaraí');
  assert.ok(icaraiArea);
  assert.equal(icaraiArea!.cdoTotal, 5);
  assert.equal(icaraiArea!.cdoAvailable, 3);

  // `area` é aceito como alias de `neighborhood` (nome do nível antes da LOD por
  // município/estado) — mesma resposta.
  const areaAlias = await requestJson(port, 'GET', `/v1/geo/coverage?${bbox}&level=area`);
  assert.equal(areaAlias.statusCode, 200);
  assert.equal((areaAlias.body as { level: string }).level, 'neighborhood');
  assert.equal((areaAlias.body as { areas: unknown[] }).areas.length, 2);

  // bbox distante: nada volta.
  const empty = await requestJson(
    port,
    'GET',
    '/v1/geo/coverage?minLng=-43.30&minLat=-23.00&maxLng=-43.25&maxLat=-22.95&level=fine',
  );
  assert.equal(empty.statusCode, 200);
  const emptyBody = empty.body as { cells: number[][]; neighborhoods: unknown[] };
  assert.deepEqual(emptyBody.cells, []);
  assert.deepEqual(emptyBody.neighborhoods, []);

  const missingBounds = await requestJson(port, 'GET', '/v1/geo/coverage?minLng=-43.12&level=fine');
  assert.equal(missingBounds.statusCode, 400);
});

test('Geo tree search finds stations and resources by name, but never sub-sites', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const idOf = (response: { body: unknown }) => (response.body as { id: string }).id;

  const siteSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Central de Icaraí',
    category: 'Site',
  });
  // A contenção precisa ser declarada nos dois lados do catálogo (ver 'Geo tree serves one
  // level per call').
  const subSiteSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Sala Técnica',
    category: 'SubSite',
    allowedParentSpecIds: [idOf(siteSpec)],
  });
  await requestJson(port, 'PATCH', `/v1/geo/site-specifications/${idOf(siteSpec)}`, {
    allowedChildSpecIds: [idOf(subSiteSpec)],
  });
  const address = await requestJson(port, 'POST', '/v1/geo/addresses', {
    street: 'Rua Belisário Augusto',
    city: 'Niterói',
    stateOrProvince: 'RJ',
    country: 'BR',
  });
  const location = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.107, -22.906] },
  });
  const station = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'Estação Icaraí Central',
    siteSpecificationId: idOf(siteSpec),
    addressId: idOf(address),
    placeId: idOf(location),
    status: 'active',
  });
  assert.equal(station.statusCode, 201);

  // Sala é SubSite (interior da estação) — nunca deve voltar na busca (C2/§9 do
  // AGENTS.md: o usuário só pesquisa locais e recursos, não salas/andares).
  const room = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'Sala Icaraí Técnica',
    siteSpecificationId: idOf(subSiteSpec),
    parentSiteId: idOf(station),
    status: 'active',
  });
  assert.equal(room.statusCode, 201);

  const resourceSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    {
      name: 'CDOE 1:8',
      category: 'Infrastructure.Passive',
      resourceType: 'CTO',
    },
  );
  const boxPlace = await requestJson(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.108, -22.907] },
  });
  const box = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE Icaraí 08',
    resourceSpecificationId: idOf(resourceSpec),
    placeId: idOf(boxPlace),
    placeType: 'GeographicLocation',
  });
  assert.equal(box.statusCode, 201);

  // Splitter dentro da caixa: some do mapa, da árvore E da busca (não tem ponto próprio
  // no mapa para a seleção pousar — mesma regra dos dois primeiros).
  const splitterSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'Splitter óptico 1:8', category: 'Infrastructure.Passive', resourceType: 'Splitter' },
  );
  const splitter = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'CDOE Icaraí 08 · Splitter',
      resourceSpecificationId: idOf(splitterSpec),
      placeId: idOf(boxPlace),
      placeType: 'GeographicLocation',
    },
  );
  assert.equal(splitter.statusCode, 201);

  const search = await requestJson(port, 'GET', '/v1/geo/tree/search?q=icara');
  assert.equal(search.statusCode, 200);
  const results = search.body as GeoTreeResponseNode[];
  assert.deepEqual(results.map((item) => item.label).sort(), [
    'CDOE Icaraí 08',
    'Estação Icaraí Central',
  ]);
  assert.equal(
    results.some((item) => item.label === 'Sala Icaraí Técnica'),
    false,
  );
  assert.equal(
    results.some((item) => item.label === 'CDOE Icaraí 08 · Splitter'),
    false,
  );

  // Caminho de prefixo (searchResourceCandidates): "CDOE" casa direto no início do nome,
  // sem precisar da varredura por substring.
  const prefixSearch = await requestJson(port, 'GET', '/v1/geo/tree/search?q=CDOE');
  assert.equal(prefixSearch.statusCode, 200);
  assert.deepEqual((prefixSearch.body as GeoTreeResponseNode[]).map((item) => item.label), [
    'CDOE Icaraí 08',
  ]);

  const noMatch = await requestJson(port, 'GET', '/v1/geo/tree/search?q=zzz-nao-existe');
  assert.deepEqual(noMatch.body, []);

  const emptyTerm = await requestJson(port, 'GET', '/v1/geo/tree/search?q=');
  assert.deepEqual(emptyTerm.body, []);

  // Filtro de escopo da barra de pesquisa (RF-013): `kinds=site` restringe a busca só a
  // Estações — o mesmo termo "icara" que antes trazia Estação + CDOE agora só traz a
  // Estação.
  const onlySites = await requestJson(port, 'GET', '/v1/geo/tree/search?q=icara&kinds=site');
  assert.deepEqual((onlySites.body as GeoTreeResponseNode[]).map((item) => item.label), [
    'Estação Icaraí Central',
  ]);

  // `kinds=resource` restringe a Recursos — a Estação some, o CDOE (CTO) permanece.
  const onlyResources = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/search?q=icara&kinds=resource',
  );
  assert.deepEqual((onlyResources.body as GeoTreeResponseNode[]).map((item) => item.label), [
    'CDOE Icaraí 08',
  ]);

  // `types=CTO` restringe ainda mais, dentro de Recurso — o mesmo resultado aqui porque só
  // há um recurso no acervo de teste, mas comprova que o parâmetro chega ao SQL.
  const onlyCto = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/search?q=icara&kinds=resource&types=CTO',
  );
  assert.deepEqual((onlyCto.body as GeoTreeResponseNode[]).map((item) => item.label), [
    'CDOE Icaraí 08',
  ]);

  // `types=Pole` (tipo que não existe no acervo de teste) não casa com o CDOE — o filtro de
  // tipo é aplicado de verdade, não só o de kind.
  const wrongType = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/search?q=icara&kinds=resource&types=Pole',
  );
  assert.deepEqual(wrongType.body, []);
});

test('App exposes health without auth and protected routes reject missing token', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const health = await new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/health', method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });

  assert.equal(health.statusCode, 200);
  assert.equal((health.body as { status: string }).status, 'ok');

  const protectedRoute = await new Promise<{ statusCode: number; body: unknown }>(
    (resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/v1/bootstrap', method: 'GET' },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () =>
            resolve({
              statusCode: res.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end();
    },
  );

  assert.equal(protectedRoute.statusCode, 401);
  assert.equal((protectedRoute.body as { error: string }).error, 'AUTH_REQUIRED');
});

test('Projetos de trabalho: local exige GEONET, herda status do projeto, e a cascata de status do PATCH funciona', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Ponto de Instalação',
    category: 'Site',
  });
  assert.equal(spec.statusCode, 201);
  const specId = (spec.body as { id: string }).id;

  const project = await requestJson(port, 'POST', '/v1/geo/projects', { name: 'Projeto de teste' });
  assert.equal(project.statusCode, 201);
  const projectId = (project.body as { id: string; status: string }).id;
  assert.equal((project.body as { status: string }).status, 'planned');

  // RN-008: sem geonetAddressId, a criação de local é recusada.
  const rejected = await requestJson(port, 'POST', `/v1/geo/projects/${projectId}/sites`, {
    location: { geometryType: 'Point', geometry: { type: 'Point', coordinates: [-43.1, -22.9] } },
    address: { street: 'Rua Teste' },
    site: { name: 'Local sem Geonet', siteSpecificationId: specId },
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(
    (rejected.body as { error: string }).error,
    'GEO_PROJECT_SITE_GEONET_ADDRESS_REQUIRED',
  );

  // RN-007: com geonetAddressId, cria — e ignora o status enviado pelo cliente (herda do
  // projeto, que nasce 'planned').
  const created = await requestJson(port, 'POST', `/v1/geo/projects/${projectId}/sites`, {
    location: { geometryType: 'Point', geometry: { type: 'Point', coordinates: [-43.1, -22.9] } },
    address: { street: 'Rua Teste' },
    site: { name: 'Local A', siteSpecificationId: specId, status: 'Active' },
    geonetAddressId: 'geonet-123',
    note: 'observação de campo',
  });
  assert.equal(created.statusCode, 201);
  const siteId = (created.body as { site: { id: string; status: string } }).site.id;
  assert.equal((created.body as { site: { status: string } }).site.status, 'Planned');

  // GET /sites devolve a observação e o id do Geonet junto do nó de árvore — sem bbox, a
  // resposta é paginada (issue #72, PROJECT_PANEL_SITE_LIMIT): { items, offset, limit, hasMore }.
  const sites = await requestJson(port, 'GET', `/v1/geo/projects/${projectId}/sites`);
  assert.equal(sites.statusCode, 200);
  const siteNode = (
    sites.body as { items: Array<{ refId: string; note: string; geonetAddressId: string }> }
  ).items.find((node) => node.refId === siteId);
  assert.equal(siteNode?.note, 'observação de campo');
  assert.equal(siteNode?.geonetAddressId, 'geonet-123');

  // PATCH de nome/tipo/observação do local, pela nova rota dedicada.
  const patchedSite = await requestJson(
    port,
    'PATCH',
    `/v1/geo/projects/${projectId}/sites/${siteId}`,
    { name: 'Local A renomeado', note: 'nova observação' },
  );
  assert.equal(patchedSite.statusCode, 200);
  assert.equal((patchedSite.body as { site: { name: string } }).site.name, 'Local A renomeado');
  assert.equal((patchedSite.body as { note: string }).note, 'nova observação');

  // RF-010: PATCH do projeto para 'active' cascateia (best-effort) para o Site vinculado.
  const patchedProject = await requestJson(port, 'PATCH', `/v1/geo/projects/${projectId}`, {
    status: 'active',
  });
  assert.equal(patchedProject.statusCode, 200);
  assert.equal((patchedProject.body as { status: string }).status, 'active');
  assert.equal(
    (patchedProject.body as { siteCascade?: { updated: number; skipped: number } }).siteCascade
      ?.updated,
    1,
  );

  const siteAfterCascade = await requestJson(port, 'GET', `/v1/geo/sites/${siteId}`);
  assert.equal((siteAfterCascade.body as { status: string }).status, 'Active');

  // RN-009: "Remover do projeto" desvincula o local (soft-terminate + unlink), C6.
  const removed = await requestJson(
    port,
    'DELETE',
    `/v1/geo/projects/${projectId}/sites/${siteId}`,
  );
  assert.equal(removed.statusCode, 204);
  const sitesAfterRemove = await requestJson(port, 'GET', `/v1/geo/projects/${projectId}/sites`);
  assert.deepEqual((sitesAfterRemove.body as { items: unknown[] }).items, []);
});

test('Projetos de trabalho: terminar o projeto libera os locais (viram Active, não Retired) e não volta', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Ponto de Instalação Término',
    category: 'Site',
  });
  const specId = (spec.body as { id: string }).id;

  const project = await requestJson(port, 'POST', '/v1/geo/projects', {
    name: 'Projeto a terminar',
  });
  const projectId = (project.body as { id: string }).id;

  const created = await requestJson(port, 'POST', `/v1/geo/projects/${projectId}/sites`, {
    location: { geometryType: 'Point', geometry: { type: 'Point', coordinates: [-43.2, -22.95] } },
    address: { street: 'Rua do Término' },
    site: { name: 'Local Liberado Pelo Termino', siteSpecificationId: specId },
    geonetAddressId: 'geonet-terminado-1',
  });
  const siteId = (created.body as { site: { id: string } }).site.id;

  // Enquanto o projeto está em curso, o local fica escondido da navegação geral (RN-003).
  const hiddenSearch = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/search?q=Local%20Liberado%20Pelo%20Termino',
  );
  assert.deepEqual(hiddenSearch.body, []);

  // RF-010: terminar cascateia para Active (liberação), não Retired (o antigo comportamento).
  const terminated = await requestJson(port, 'PATCH', `/v1/geo/projects/${projectId}`, {
    status: 'terminated',
  });
  assert.equal(terminated.statusCode, 200);
  assert.equal((terminated.body as { status: string }).status, 'terminated');
  assert.equal((terminated.body as { siteCascade?: { updated: number } }).siteCascade?.updated, 1);

  const siteAfterTermination = await requestJson(port, 'GET', `/v1/geo/sites/${siteId}`);
  assert.equal((siteAfterTermination.body as { status: string }).status, 'Active');

  // O local volta a existir na navegação geral (busca) uma vez que o projeto terminou.
  const visibleSearch = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/search?q=Local%20Liberado%20Pelo%20Termino',
  );
  assert.equal((visibleSearch.body as Array<{ label: string }>).length, 1);

  // Projeto terminado não volta: qualquer tentativa de mudar o status é rejeitada.
  const reopen = await requestJson(port, 'PATCH', `/v1/geo/projects/${projectId}`, {
    status: 'active',
  });
  assert.equal(reopen.statusCode, 409);
  assert.equal((reopen.body as { error: string }).error, 'GEO_PROJECT_TERMINATED_IMMUTABLE');
});

// issue #58: DELETE /v1/geo/projects/:id operava em massa (GeoService.transitionProjectSites),
// devolvendo 200 com um resumo em vez de 204 silencioso. A REQ-MOD01-017 v1.17 (commit
// c41a0e5) substituiu esse comportamento por arquivamento administrativo: DELETE só é aceito
// depois que o projeto já chegou a um estado terminal via PATCH (terminated/cancelled) — a
// cascata de Site (ver "cascata de status do PATCH funciona") já roda ali, não mais no DELETE.
test('DELETE /v1/geo/projects/:id: arquiva projeto terminado e devolve o resumo; 404 para id inexistente', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const missing = await requestJson(port, 'DELETE', '/v1/geo/projects/does-not-exist');
  assert.equal(missing.statusCode, 404);
  assert.equal((missing.body as { error: string }).error, 'GEO_PROJECT_NOT_FOUND');

  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Ponto de Instalação Delete',
    category: 'Site',
  });
  const specId = (spec.body as { id: string }).id;

  const project = await requestJson(port, 'POST', '/v1/geo/projects', { name: 'Projeto a apagar' });
  const projectId = (project.body as { id: string }).id;

  const created = await requestJson(port, 'POST', `/v1/geo/projects/${projectId}/sites`, {
    location: { geometryType: 'Point', geometry: { type: 'Point', coordinates: [-43.3, -22.8] } },
    address: { street: 'Rua a Apagar' },
    site: { name: 'Local a Apagar', siteSpecificationId: specId },
    geonetAddressId: 'geonet-delete-1',
  });
  const siteId = (created.body as { site: { id: string } }).site.id;

  // Arquivar um projeto ainda em curso é recusado — só terminal (terminated/cancelled) arquiva.
  const premature = await requestJson(port, 'DELETE', `/v1/geo/projects/${projectId}`);
  assert.equal(premature.statusCode, 409);
  assert.equal(
    (premature.body as { error: string }).error,
    'GEO_PROJECT_ARCHIVE_REQUIRES_TERMINAL_STATUS',
  );

  // Terminar libera o local (vira Active — RF-010) antes do projeto poder ser arquivado.
  const terminated = await requestJson(port, 'PATCH', `/v1/geo/projects/${projectId}`, {
    status: 'terminated',
  });
  assert.equal(terminated.statusCode, 200);

  const deleted = await requestJson(port, 'DELETE', `/v1/geo/projects/${projectId}`);
  assert.equal(deleted.statusCode, 200);
  const summary = deleted.body as { archived: boolean; project: { id: string } };
  assert.equal(summary.archived, true);
  assert.equal(summary.project.id, projectId);

  // Não há GET /v1/geo/projects/:id — confirma pela lista que o projeto sumiu (archived_at).
  const projectsAfter = await requestJson(port, 'GET', '/v1/geo/projects');
  assert.ok(!(projectsAfter.body as Array<{ id: string }>).some((p) => p.id === projectId));
  const siteAfter = await requestJson(port, 'GET', `/v1/geo/sites/${siteId}`);
  assert.equal((siteAfter.body as { status: string }).status, 'Active');
});

test('DELETE /v1/geo/projects/:id: projeto não-terminado é recusado e mantém vínculos íntegros', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Ponto de Instalação Bloqueio',
    category: 'Site',
  });
  const specId = (spec.body as { id: string }).id;

  const project = await requestJson(port, 'POST', '/v1/geo/projects', {
    name: 'Projeto com local bloqueado',
  });
  const projectId = (project.body as { id: string }).id;

  const freeSite = await requestJson(port, 'POST', `/v1/geo/projects/${projectId}/sites`, {
    location: { geometryType: 'Point', geometry: { type: 'Point', coordinates: [-43.4, -22.7] } },
    address: { street: 'Rua Livre' },
    site: { name: 'Local Livre', siteSpecificationId: specId },
    geonetAddressId: 'geonet-bloqueio-1',
  });
  const freeSiteId = (freeSite.body as { site: { id: string } }).site.id;

  const blockedSite = await requestJson(port, 'POST', `/v1/geo/projects/${projectId}/sites`, {
    location: { geometryType: 'Point', geometry: { type: 'Point', coordinates: [-43.5, -22.6] } },
    address: { street: 'Rua Bloqueada' },
    site: { name: 'Local Bloqueado', siteSpecificationId: specId },
    geonetAddressId: 'geonet-bloqueio-2',
  });
  const blockedSiteId = (blockedSite.body as { site: { id: string } }).site.id;

  const feederSite = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'Alimentador do Bloqueado',
    siteSpecificationId: specId,
  });
  const feederSiteId = (feederSite.body as { id: string }).id;

  const relationship = await requestJson(
    port,
    'POST',
    `/v1/geo/sites/${blockedSiteId}/relationships`,
    { relatedSiteId: feederSiteId, relationshipType: 'fedBy' },
  );
  assert.equal(relationship.statusCode, 201);

  // Projeto ainda 'planned' (não terminal): arquivar é recusado, nada muda.
  const deleted = await requestJson(port, 'DELETE', `/v1/geo/projects/${projectId}`);
  assert.equal(deleted.statusCode, 409);
  assert.equal(
    (deleted.body as { error: string }).error,
    'GEO_PROJECT_ARCHIVE_REQUIRES_TERMINAL_STATUS',
  );

  // Projeto continua existindo, com os dois vínculos intactos e nenhum local tocado.
  const projectsAfter = await requestJson(port, 'GET', '/v1/geo/projects');
  assert.ok((projectsAfter.body as Array<{ id: string }>).some((p) => p.id === projectId));
  const sitesAfter = await requestJson(port, 'GET', `/v1/geo/projects/${projectId}/sites`);
  assert.equal((sitesAfter.body as { items: unknown[] }).items.length, 2);

  assert.equal(
    ((await requestJson(port, 'GET', `/v1/geo/sites/${freeSiteId}`)).body as { status: string })
      .status,
    'Planned',
  );
  assert.equal(
    ((await requestJson(port, 'GET', `/v1/geo/sites/${blockedSiteId}`)).body as { status: string })
      .status,
    'Planned',
  );
});

test('Painel unificado de Local: Origem do Site e vínculo/desvínculo de Recurso', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const idOf = (response: { body: unknown }) => (response.body as { id: string }).id;

  // Origem 'manual': Site criado direto por /v1/geo/sites, sem projeto e sem _origin.system.
  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Ponto de Instalação Origem',
    category: 'Site',
  });
  const site = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'Site Cadastro Livre',
    siteSpecificationId: idOf(spec),
  });
  assert.equal(site.statusCode, 201);
  const siteId = idOf(site);

  const manualOrigin = await requestJson(port, 'GET', `/v1/geo/sites/${siteId}/origin`);
  assert.equal(manualOrigin.statusCode, 200);
  assert.equal((manualOrigin.body as { kind: string }).kind, 'manual');

  // Origem 'project': Site nascido dentro de um Projeto de trabalho.
  const project = await requestJson(port, 'POST', '/v1/geo/projects', { name: 'Projeto Origem' });
  const projectSite = await requestJson(port, 'POST', `/v1/geo/projects/${idOf(project)}/sites`, {
    location: {
      geometryType: 'Point',
      geometry: { type: 'Point', coordinates: [-43.15, -22.91] },
    },
    address: { street: 'Rua Origem Projeto' },
    site: { name: 'Site do Projeto Origem', siteSpecificationId: idOf(spec) },
    geonetAddressId: 'geonet-origem-1',
  });
  const projectSiteId = (projectSite.body as { site: { id: string } }).site.id;
  const projectOrigin = await requestJson(port, 'GET', `/v1/geo/sites/${projectSiteId}/origin`);
  assert.equal(projectOrigin.statusCode, 200);
  assert.deepEqual(projectOrigin.body, {
    kind: 'project',
    projectId: idOf(project),
    projectName: 'Projeto Origem',
  });

  // Vínculo/desvínculo de Recurso (aba Recursos): linkar, desvincular (o recurso continua
  // existindo, só perde o place) e terminar (soft-terminate, C6).
  const resourceSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'OLT Origem', category: 'Equipment.Access', resourceType: 'OLT' },
  );
  const resource = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    {
      '@type': 'PhysicalResource',
      name: 'OLT Painel Unificado',
      resourceSpecificationId: idOf(resourceSpec),
    },
  );
  assert.equal(resource.statusCode, 201);
  const resourceId = idOf(resource);

  const linked = await requestJson(port, 'POST', `/v1/geo/sites/${siteId}/resources`, {
    resourceId,
  });
  assert.equal(linked.statusCode, 200);
  assert.equal((linked.body as { place?: { id: string } }).place?.id, siteId);

  const siteResources = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${siteId}&scope=all`,
  );
  assert.equal(siteResources.statusCode, 200);
  assert.deepEqual(
    (siteResources.body as { nodes: Array<{ label: string }> }).nodes.map((n) => n.label),
    ['OLT Painel Unificado'],
  );

  const unlinked = await requestJson(
    port,
    'DELETE',
    `/v1/geo/sites/${siteId}/resources/${resourceId}?mode=unlink`,
  );
  assert.equal(unlinked.statusCode, 204);
  const resourceAfterUnlink = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${resourceId}`,
  );
  assert.equal((resourceAfterUnlink.body as { place?: unknown }).place, undefined);
  assert.notEqual((resourceAfterUnlink.body as { status: string }).status, 'terminated');

  // Relinka e agora termina (mode=terminate) — soft-terminate, não DELETE físico.
  await requestJson(port, 'POST', `/v1/geo/sites/${siteId}/resources`, { resourceId });
  const terminated = await requestJson(
    port,
    'DELETE',
    `/v1/geo/sites/${siteId}/resources/${resourceId}?mode=terminate`,
  );
  assert.equal(terminated.statusCode, 204);
  const resourceAfterTerminate = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${resourceId}`,
  );
  assert.equal((resourceAfterTerminate.body as { status: string }).status, 'terminated');
});

test('Manchas de Projeto (REQ-MOD01-017): GET /areas lê o que o script grava, e GET /sites filtra por bbox e limita a página', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  // Mesma instância que o app usa — a mancha é semeada direto nas tabelas de projeção, como
  // faz scripts/build-project-areas.mjs (INSERT em tmf_geographic_location + geo_project_area).
  const db = createDatabaseClient(databaseConfigOf(createConfig(0, database.databaseUrl)));

  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Ponto de Instalação Mancha',
    category: 'Site',
  });
  const specId = (spec.body as { id: string }).id;

  const project = await requestJson(port, 'POST', '/v1/geo/projects', { name: 'Projeto Manchas' });
  const projectId = (project.body as { id: string }).id;

  // Dois locais dentro de uma mesma mancha (Icaraí), um fora dela (bem distante).
  const createSite = async (name: string, coordinates: [number, number]) => {
    const response = await requestJson(port, 'POST', `/v1/geo/projects/${projectId}/sites`, {
      location: { geometryType: 'Point', geometry: { type: 'Point', coordinates } },
      address: { street: 'Rua Teste' },
      site: { name, siteSpecificationId: specId },
      geonetAddressId: `geonet-${name}`,
    });
    assert.equal(response.statusCode, 201);
    return (response.body as { site: { id: string } }).site.id;
  };
  const nearSiteId = await createSite('Local Icaraí', [-43.106, -22.906]);
  const farSiteId = await createSite('Local Distante', [10, 10]);

  // Semeia a mancha de concentração cobrindo só o local de Icaraí — mesma forma que o script
  // grava (Polygon em tmf_geographic_location + vínculo em geo_project_area).
  const locationId = '33333333-3333-7333-8333-333333333333';
  await db.run(
    `INSERT INTO tmf_geographic_location
       (id, geometry_type, geometry, spatial_ref, reference_point, characteristics)
     VALUES (?, 'Polygon', ?, 'EPSG:4326', ?, '[]')`,
    [
      locationId,
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [-43.108, -22.908],
            [-43.1, -22.908],
            [-43.1, -22.902],
            [-43.108, -22.902],
            [-43.108, -22.908],
          ],
        ],
      }),
      `PROJECT:${projectId}`,
    ],
  );
  await db.run(
    `INSERT INTO geo_project_area
       (project_id, location_id, kind, site_count, site_ids, centroid_lng, centroid_lat, area_km2, position)
     VALUES (?, ?, 'concentration', 1, ?, -43.106, -22.906, 0.25, 0)`,
    [projectId, locationId, JSON.stringify([nearSiteId])],
  );

  const areas = await requestJson(port, 'GET', `/v1/geo/projects/${projectId}/areas`);
  assert.equal(areas.statusCode, 200);
  const areaList = (areas.body as { areas: Array<Record<string, unknown>> }).areas;
  assert.equal(areaList.length, 1);
  assert.equal(areaList[0]?.kind, 'concentration');
  assert.equal(areaList[0]?.siteCount, 1);
  assert.deepEqual(areaList[0]?.siteIds, [nearSiteId]);
  assert.deepEqual(areaList[0]?.centroid, [-43.106, -22.906]);
  assert.equal((areaList[0]?.geometry as { type: string })?.type, 'Polygon');

  // GET /sites com bbox devolve só o local dentro da caixa (Icaraí), não o distante.
  const bboxSites = await requestJson(
    port,
    'GET',
    `/v1/geo/projects/${projectId}/sites?minLng=-43.2&minLat=-23&maxLng=-43&maxLat=-22.8`,
  );
  assert.equal(bboxSites.statusCode, 200);
  const bboxRefIds = (bboxSites.body as Array<{ refId: string }>).map((node) => node.refId);
  assert.deepEqual(bboxRefIds, [nearSiteId]);

  // bbox longe de ambos os locais devolve lista vazia.
  const emptyBbox = await requestJson(
    port,
    'GET',
    `/v1/geo/projects/${projectId}/sites?minLng=0&minLat=0&maxLng=1&maxLat=1`,
  );
  assert.deepEqual(emptyBbox.body, []);

  // Sem bbox, a resposta é paginada (issue #72, PROJECT_PANEL_SITE_LIMIT): { items, offset,
  // limit, hasMore } — `limit` pagina a lista completa (2 locais).
  const limited = await requestJson(port, 'GET', `/v1/geo/projects/${projectId}/sites?limit=1`);
  assert.equal((limited.body as { items: unknown[] }).items.length, 1);
  const full = await requestJson(port, 'GET', `/v1/geo/projects/${projectId}/sites`);
  const fullRefIds = (full.body as { items: Array<{ refId: string }> }).items.map(
    (node) => node.refId,
  );
  assert.deepEqual(new Set(fullRefIds), new Set([nearSiteId, farSiteId]));

  // Projeto sem manchas geradas: GET /areas devolve lista vazia.
  const otherProject = await requestJson(port, 'POST', '/v1/geo/projects', {
    name: 'Projeto Sem Manchas',
  });
  const otherAreas = await requestJson(
    port,
    'GET',
    `/v1/geo/projects/${(otherProject.body as { id: string }).id}/areas`,
  );
  assert.deepEqual(otherAreas.body, { areas: [] });
});

test('App root returns Nexus shell html', async (t) => {
  const database = createTestDatabase();
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const html = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () =>
        resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('error', reject);
    req.end();
  });

  assert.equal(html.statusCode, 200);
  assert.match(html.body, /<title>v-tal-nexus - Nexus<\/title>/);
  assert.match(html.body, /Interface migrada para Vite/);
});

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  return createPostgresTestDatabase('nexus-geo-');
};
