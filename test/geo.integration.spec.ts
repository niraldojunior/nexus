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
  assert.equal((bootstrap.body as { specs: unknown[] }).specs.length, 9);

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
  assert.equal((firstPage.body as { nodes: Array<{ label: string }> }).nodes[0]?.label, 'Sala GPON');
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
    { name: 'Cabo secundário 6FO', category: 'Cable.OutsidePlant', resourceType: 'DistributionCable' },
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
  const splitterA = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE-2201 · S1',
    resourceSpecificationId: idOf(splitterSpec),
    placeId: idOf(place),
    placeType: 'GeographicLocation',
  });
  assert.equal(splitterA.statusCode, 201);
  const splitterB = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE-2201 · S1 · S1',
    resourceSpecificationId: idOf(splitterSpec),
    placeId: idOf(place),
    placeType: 'GeographicLocation',
  });
  assert.equal(splitterB.statusCode, 201);
  const cable = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'Cabo Secundário 02',
    resourceSpecificationId: idOf(cableSpec),
    placeId: idOf(place),
    placeType: 'GeographicLocation',
  });
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
  const splitter = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE-1108 · S32_1',
    resourceSpecificationId: idOf(splitterSpec),
    placeId: idOf(boxPlace),
    placeType: 'GeographicLocation',
  });
  assert.equal(splitter.statusCode, 201);

  // Bbox que cobre a região de Icaraí: caixa e cabo voltam, sem expandir nada antes;
  // o splitter fica de fora — não tem ponto próprio no mapa.
  const insideBbox = await requestJson(
    port,
    'GET',
    '/v1/geo/tree/viewport?minLng=-43.12&minLat=-22.92&maxLng=-43.10&maxLat=-22.90',
  );
  assert.equal(insideBbox.statusCode, 200);
  const insideNodes = insideBbox.body as GeoTreeResponseNode[];
  assert.deepEqual(insideNodes.map((item) => item.label).sort(), ['CDOE-1108', 'Cabo Primário 01']);

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

  const seedArea = async (
    locId: string,
    stat: { key: string; neighborhood: string; city: string; uf: string; cdoTotal: number; cdoAvailable: number },
    cells: Array<{ gx: number; gy: number; total: number; avail: number }>,
  ) => {
    await db.run(
      `INSERT INTO tmf_geographic_location
         (id, href, geometry_type, geometry, spatial_ref, reference_point, characteristics)
       VALUES (?, ?, 'Polygon', ?, 'EPSG:4326', ?, ?)`,
      [
        locId,
        `/tmf-api/geographicLocationManagement/v4/geographicLocation/${locId}`,
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
  };

  // Alinha as células ao mesmo mapeamento bbox→grade do serviço, ancorando em Icaraí.
  const [x0, y0] = lngLatToMercator(-43.106, -22.906);
  const gx = Math.floor(x0 / COVERAGE_CELL_METERS);
  const gy = Math.floor(y0 / COVERAGE_CELL_METERS);

  // cdoTotal nas characteristics (5 e 4) é a contagem REAL do bairro, de propósito diferente
  // da soma das células — é o que o balão exibe.
  await seedArea(
    '11111111-1111-7111-8111-111111111111',
    { key: 'RJ|Niterói|Icaraí', neighborhood: 'Icaraí', city: 'Niterói', uf: 'RJ', cdoTotal: 5, cdoAvailable: 3 },
    [
      { gx, gy, total: 3, avail: 2 },
      { gx: gx + 1, gy, total: 2, avail: 1 },
    ],
  );
  await seedArea(
    '22222222-2222-7222-8222-222222222222',
    { key: 'RJ|Niterói|Santa Rosa', neighborhood: 'Santa Rosa', city: 'Niterói', uf: 'RJ', cdoTotal: 4, cdoAvailable: 0 },
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
    neighborhoods: Array<{ id: number; neighborhood: string; cdoTotal: number; cdoAvailable: number }>;
    truncated: boolean;
  };
  assert.equal(fineBody.level, 'fine');
  assert.equal(fineBody.grid.sizeMeters, COVERAGE_CELL_METERS);
  assert.equal(fineBody.cells.length, 3);
  assert.equal(fineBody.neighborhoods.length, 2);
  const icarai = fineBody.neighborhoods.find((item) => item.neighborhood === 'Icaraí');
  assert.ok(icarai);
  assert.equal(icarai!.cdoTotal, 5, 'estatística do balão é a contagem real, não a soma das células');
  assert.equal(icarai!.cdoAvailable, 3);
  // Toda célula referencia um índice de bairro válido.
  for (const cell of fineBody.cells) {
    assert.ok(cell[4]! >= 0 && cell[4]! < fineBody.neighborhoods.length);
  }

  // coarse: campo de densidade agregado; a soma bate com a das células finas.
  const coarse = await requestJson(port, 'GET', `/v1/geo/coverage?${bbox}&level=coarse`);
  assert.equal(coarse.statusCode, 200);
  const coarseBody = coarse.body as { level: string; grid: { sizeMeters: number }; cells: number[][] };
  assert.equal(coarseBody.level, 'coarse');
  assert.equal(coarseBody.grid.sizeMeters, COVERAGE_CELL_METERS * 5);
  const totalCdo = coarseBody.cells.reduce((sum, cell) => sum + cell[2]!, 0);
  const totalAvail = coarseBody.cells.reduce((sum, cell) => sum + cell[3]!, 0);
  assert.equal(totalCdo, 9);
  assert.equal(totalAvail, 3);

  // area: polígonos de bairro com geometria e estatística.
  const area = await requestJson(port, 'GET', `/v1/geo/coverage?${bbox}&level=area`);
  assert.equal(area.statusCode, 200);
  const areaBody = area.body as {
    level: string;
    areas: Array<{ id: string; neighborhoodIndex: number; geometry: { type: string } }>;
    neighborhoods: Array<{ neighborhood: string }>;
  };
  assert.equal(areaBody.level, 'area');
  assert.equal(areaBody.areas.length, 2);
  assert.equal(areaBody.neighborhoods.length, 2);
  for (const polygon of areaBody.areas) {
    assert.equal(polygon.geometry.type, 'Polygon');
    assert.ok(polygon.neighborhoodIndex >= 0);
  }

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

  // Splitter dentro da caixa: some do mapa e da árvore, mas continua encontrável
  // pelo nome — diferente da sala, ele não é filtrado da busca.
  const splitterSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { name: 'Splitter óptico 1:8', category: 'Infrastructure.Passive', resourceType: 'Splitter' },
  );
  const splitter = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'CDOE Icaraí 08 · Splitter',
    resourceSpecificationId: idOf(splitterSpec),
    placeId: idOf(boxPlace),
    placeType: 'GeographicLocation',
  });
  assert.equal(splitter.statusCode, 201);

  const search = await requestJson(port, 'GET', '/v1/geo/tree/search?q=icara');
  assert.equal(search.statusCode, 200);
  const results = search.body as GeoTreeResponseNode[];
  assert.deepEqual(results.map((item) => item.label).sort(), [
    'CDOE Icaraí 08',
    'CDOE Icaraí 08 · Splitter',
    'Estação Icaraí Central',
  ]);
  assert.equal(
    results.some((item) => item.label === 'Sala Icaraí Técnica'),
    false,
  );

  const noMatch = await requestJson(port, 'GET', '/v1/geo/tree/search?q=zzz-nao-existe');
  assert.deepEqual(noMatch.body, []);

  const emptyTerm = await requestJson(port, 'GET', '/v1/geo/tree/search?q=');
  assert.deepEqual(emptyTerm.body, []);
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
