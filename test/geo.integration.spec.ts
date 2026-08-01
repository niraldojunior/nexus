import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';
import { createTestDatabase as createPostgresTestDatabase } from './test-utils.js';

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
  const roomSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Sala',
    category: 'SubSite',
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
  // estação pela characteristic `servingSite`; o splitter pende da caixa.
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
    name: 'CDOE-1108',
    resourceSpecificationId: idOf(resourceSpec),
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
      resourceSpecificationId: idOf(resourceSpec),
      placeId: idOf(boxPlace),
      placeType: 'GeographicLocation',
      characteristic: [{ name: 'servingSite', value: idOf(station), valueType: 'string' }],
    },
  );
  const link = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${idOf(box)}/relationships`,
    { id: idOf(splitter), relationshipType: 'containsAsChild' },
  );
  assert.equal(link.statusCode, 201);

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

  // Filhos diretos: a sala e a caixa — o splitter não, ele pende da caixa.
  const children = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${idOf(station)}`,
  );
  assert.equal(children.statusCode, 200);
  const page = children.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.equal(page.total, 2);
  assert.deepEqual(
    page.nodes.map((item) => item.label),
    ['Sala GPON', 'CDOE-1108'],
  );
  // Sala vazia não ganha "+"; caixa com splitter ganha.
  assert.equal(page.nodes[0]?.hasChildren, false);
  assert.equal(page.nodes[1]?.hasChildren, true);

  // Paginação: a janela atravessa sub-locais e recursos, e o total não muda.
  const firstPage = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${idOf(station)}&limit=1`,
  );
  const secondPage = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=site:${idOf(station)}&limit=1&offset=1`,
  );
  assert.equal((firstPage.body as { nodes: unknown[] }).nodes.length, 1);
  assert.equal((secondPage.body as { total: number }).total, 2);
  assert.equal(
    (secondPage.body as { nodes: Array<{ label: string }> }).nodes[0]?.label,
    'CDOE-1108',
  );

  // Nível seguinte da planta: o splitter que a caixa contém.
  const boxChildren = await requestJson(
    port,
    'GET',
    `/v1/geo/tree/children?nodeId=resource:${idOf(box)}`,
  );
  const boxPage = boxChildren.body as { total: number; nodes: GeoTreeResponseNode[] };
  assert.equal(boxPage.total, 1);
  assert.equal(boxPage.nodes[0]?.label, 'CDOE-1108 · S32_1');
  assert.equal(boxPage.nodes[0]?.hasChildren, false);

  const missingNode = await requestJson(port, 'GET', '/v1/geo/tree/children');
  assert.equal(missingNode.statusCode, 400);
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

  // Bbox que cobre a região de Icaraí: caixa e cabo voltam, sem expandir nada antes.
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
  const subSiteSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Sala Técnica',
    category: 'SubSite',
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
