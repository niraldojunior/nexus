import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';
import { createTestDatabase as createPostgresTestDatabase } from './test-utils.js';

// V-04: Resource, Service, Order e Party não tinham tenant_id nem filtro algum — qualquer
// tenant lia/alterava dados de qualquer outro. Estes testes provam o isolamento fim a fim
// (schema → repositório → serviço → rota), no mesmo critério do security.md §4: tentar ler
// um recurso de outro tenant exige 404, não 403 (a existência já é informação).
//
// Fora de produção, o token estático aceita `x-tenant-id` por header (ver
// request-context.ts) — usado aqui só para alternar de tenant sem montar dois logins JWT.

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

type TestResponse = { statusCode: number; body: unknown };

const requestJson = async (
  port: number,
  method: string,
  path: string,
  tenantId: string,
  body?: unknown,
): Promise<TestResponse> => {
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
          'x-tenant-id': tenantId,
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
          resolve({ statusCode: res.statusCode ?? 0, body: text ? JSON.parse(text) : undefined });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

const TENANT_A = 'isp-a';
const TENANT_B = 'isp-b';

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  return createPostgresTestDatabase('nexus-tenant-isolation-');
};

test('V-04: Resource — instância e catálogo isolados por tenant', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const specA = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    TENANT_A,
    { name: 'OLT tenant A', category: 'Equipment.Access', resourceType: 'OLT' },
  );
  assert.equal(specA.statusCode, 201);
  const specAId = (specA.body as { id: string }).id;

  const resourceA = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    TENANT_A,
    { '@type': 'PhysicalResource', name: 'OLT-A-0001', resourceSpecificationId: specAId },
  );
  assert.equal(resourceA.statusCode, 201);
  const resourceAId = (resourceA.body as { id: string }).id;

  // Tenant B não enxerga o catálogo nem o recurso do tenant A.
  const specFromB = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${specAId}`,
    TENANT_B,
  );
  assert.equal(specFromB.statusCode, 404);

  const resourceFromB = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${resourceAId}`,
    TENANT_B,
  );
  assert.equal(resourceFromB.statusCode, 404);

  // Tenant A continua enxergando o próprio dado.
  const resourceFromA = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${resourceAId}`,
    TENANT_A,
  );
  assert.equal(resourceFromA.statusCode, 200);

  // Listagem do tenant B não inclui o recurso do tenant A.
  const listFromB = await requestJson(
    port,
    'GET',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    TENANT_B,
  );
  assert.equal(listFromB.statusCode, 200);
  const idsFromB = (listFromB.body as Array<{ id: string }>).map((item) => item.id);
  assert.ok(!idsFromB.includes(resourceAId));
});

test('V-04: Service — catálogo isolado por tenant', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const specA = await requestJson(
    port,
    'POST',
    '/tmf-api/serviceCatalogManagement/v4/serviceSpecification',
    TENANT_A,
    { name: 'FTTH tenant A', category: 'Broadband', serviceType: 'CFS' },
  );
  assert.equal(specA.statusCode, 201);
  const specAId = (specA.body as { id: string }).id;

  const specFromB = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${specAId}`,
    TENANT_B,
  );
  assert.equal(specFromB.statusCode, 404);

  const specFromA = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${specAId}`,
    TENANT_A,
  );
  assert.equal(specFromA.statusCode, 200);
});

test('V-04: Order — recurso criado dentro de uma ordem herda o tenant de quem abriu', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const specA = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    TENANT_A,
    { name: 'ONT tenant A', category: 'Equipment.CustomerPremises', resourceType: 'ONT' },
  );
  assert.equal(specA.statusCode, 201);
  const specAId = (specA.body as { id: string }).id;

  const resourceOrderA = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceOrderingManagement/v4/resourceOrder',
    TENANT_A,
    {
      description: 'Provisionamento tenant A',
      resourceOrderItem: [
        {
          action: 'add',
          resource: {
            '@type': 'PhysicalResource',
            name: 'ONT-A-0001',
            resourceSpecificationId: specAId,
            serialNumber: 'ONT-A-0001',
          },
        },
      ],
    },
  );
  assert.equal(resourceOrderA.statusCode, 201);
  const orderAId = (resourceOrderA.body as { id: string }).id;
  const createdResourceId = (
    resourceOrderA.body as {
      resourceOrderItem: Array<{ resourceResult?: { id: string } }>;
    }
  ).resourceOrderItem[0]?.resourceResult?.id;
  assert.ok(createdResourceId, 'esperava resourceResult.id na resposta');

  // Tenant B não enxerga a ordem nem o recurso que ela criou.
  const orderFromB = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceOrderingManagement/v4/resourceOrder/${orderAId}`,
    TENANT_B,
  );
  assert.equal(orderFromB.statusCode, 404);

  const resourceFromB = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${createdResourceId}`,
    TENANT_B,
  );
  assert.equal(resourceFromB.statusCode, 404);

  const resourceFromA = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${createdResourceId}`,
    TENANT_A,
  );
  assert.equal(resourceFromA.statusCode, 200);
});

test('V-04: Party — listagem filtra por tenant; leitura por id continua cross-tenant (diretório de "quem")', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const partyA = await requestJson(port, 'POST', '/tmf-api/partyManagement/v4/party', TENANT_A, {
    name: 'ISP A cliente',
    partyType: 'Organization',
  });
  assert.equal(partyA.statusCode, 201);
  const partyAId = (partyA.body as { id: string }).id;

  // Listagem do tenant B não inclui o Party criado pelo tenant A — evita vazar a carteira de
  // clientes de um ISP para outro.
  const listFromB = await requestJson(port, 'GET', '/tmf-api/partyManagement/v4/party', TENANT_B);
  assert.equal(listFromB.statusCode, 200);
  const idsFromB = (listFromB.body as Array<{ id: string }>).map((item) => item.id);
  assert.ok(!idsFromB.includes(partyAId));

  // Leitura direta por id é cross-tenant de propósito: relatedParty de outros módulos (ex.:
  // fabricante referenciado por uma resourceSpecification de qualquer tenant) precisa
  // resolver independente de quem pergunta. Ver party-repository-interface.ts.
  const partyFromB = await requestJson(
    port,
    'GET',
    `/tmf-api/partyManagement/v4/party/${partyAId}`,
    TENANT_B,
  );
  assert.equal(partyFromB.statusCode, 200);
});
