import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'vitest';
import { createApp } from '../src/shared/http/app.js';
import {
  cleanupOracleTables,
  createTestConfig,
  createTestLogger,
  getOracleTestClient,
  isOracleTestConfigured,
} from './test-utils.js';

const oracleConfigured = isOracleTestConfigured();

// V-04: Resource, Service, Order e Party não tinham tenant_id nem filtro algum — qualquer
// tenant lia/alterava dados de qualquer outro. Estes testes provam o isolamento fim a fim
// (schema → repositório → serviço → rota), no mesmo critério do security.md §4: tentar ler
// um recurso de outro tenant exige 404, não 403 (a existência já é informação).
//
// Fora de produção, o token estático aceita `x-tenant-id` por header (ver
// request-context.ts) — usado aqui só para alternar de tenant sem montar dois logins JWT.

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

const startApp = async () => {
  const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
  const port = await server.start();
  return {
    port,
    cleanup: async () => {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    },
  };
};

test.skipIf(!oracleConfigured)('V-04: Resource — instância e catálogo isolados por tenant', async () => {
  const app = await startApp();
  try {
    const specA = await requestJson(
      app.port,
      'POST',
      '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
      TENANT_A,
      { name: 'OLT tenant A', resourceTypeId: 'rt-olt' },
    );
    assert.equal(specA.statusCode, 201);
    const specAId = (specA.body as { id: string }).id;

    const resourceA = await requestJson(
      app.port,
      'POST',
      '/tmf-api/resourceInventoryManagement/v4/resource',
      TENANT_A,
      { '@type': 'PhysicalResource', name: 'OLT-A-0001', resourceSpecificationId: specAId },
    );
    assert.equal(resourceA.statusCode, 201);
    const resourceAId = (resourceA.body as { id: string }).id;

    // Tenant B não enxerga o catálogo nem o recurso do tenant A.
    const specFromB = await requestJson(
      app.port,
      'GET',
      `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${specAId}`,
      TENANT_B,
    );
    assert.equal(specFromB.statusCode, 404);

    const resourceFromB = await requestJson(
      app.port,
      'GET',
      `/tmf-api/resourceInventoryManagement/v4/resource/${resourceAId}`,
      TENANT_B,
    );
    assert.equal(resourceFromB.statusCode, 404);

    // Tenant A continua enxergando o próprio dado.
    const resourceFromA = await requestJson(
      app.port,
      'GET',
      `/tmf-api/resourceInventoryManagement/v4/resource/${resourceAId}`,
      TENANT_A,
    );
    assert.equal(resourceFromA.statusCode, 200);

    // Listagem do tenant B não inclui o recurso do tenant A.
    const listFromB = await requestJson(
      app.port,
      'GET',
      '/tmf-api/resourceInventoryManagement/v4/resource',
      TENANT_B,
    );
    assert.equal(listFromB.statusCode, 200);
    const idsFromB = (listFromB.body as Array<{ id: string }>).map((item) => item.id);
    assert.ok(!idsFromB.includes(resourceAId));
  } finally {
    await app.cleanup();
  }
});

test.skipIf(!oracleConfigured)('V-04: Service — catálogo isolado por tenant', async () => {
  const app = await startApp();
  try {
    const specA = await requestJson(
      app.port,
      'POST',
      '/tmf-api/serviceCatalogManagement/v4/serviceSpecification',
      TENANT_A,
      { name: 'FTTH tenant A', category: 'Broadband', serviceType: 'CFS' },
    );
    assert.equal(specA.statusCode, 201);
    const specAId = (specA.body as { id: string }).id;

    const specFromB = await requestJson(
      app.port,
      'GET',
      `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${specAId}`,
      TENANT_B,
    );
    assert.equal(specFromB.statusCode, 404);

    const specFromA = await requestJson(
      app.port,
      'GET',
      `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${specAId}`,
      TENANT_A,
    );
    assert.equal(specFromA.statusCode, 200);
  } finally {
    await app.cleanup();
  }
});

test.skipIf(!oracleConfigured)(
  'V-04: Order — recurso criado dentro de uma ordem herda o tenant de quem abriu',
  async () => {
    const app = await startApp();
    try {
      const specA = await requestJson(
        app.port,
        'POST',
        '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
        TENANT_A,
        { name: 'ONT tenant A', resourceTypeId: 'rt-ont' },
      );
      assert.equal(specA.statusCode, 201);
      const specAId = (specA.body as { id: string }).id;

      const resourceOrderA = await requestJson(
        app.port,
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
        app.port,
        'GET',
        `/tmf-api/resourceOrderingManagement/v4/resourceOrder/${orderAId}`,
        TENANT_B,
      );
      assert.equal(orderFromB.statusCode, 404);

      const resourceFromB = await requestJson(
        app.port,
        'GET',
        `/tmf-api/resourceInventoryManagement/v4/resource/${createdResourceId}`,
        TENANT_B,
      );
      assert.equal(resourceFromB.statusCode, 404);

      const resourceFromA = await requestJson(
        app.port,
        'GET',
        `/tmf-api/resourceInventoryManagement/v4/resource/${createdResourceId}`,
        TENANT_A,
      );
      assert.equal(resourceFromA.statusCode, 200);
    } finally {
      await app.cleanup();
    }
  },
);

test.skipIf(!oracleConfigured)(
  'V-04: Party — listagem filtra por tenant; leitura por id continua cross-tenant (diretório de "quem")',
  async () => {
    const app = await startApp();
    try {
      const partyA = await requestJson(app.port, 'POST', '/tmf-api/partyManagement/v4/party', TENANT_A, {
        name: 'ISP A cliente',
        partyType: 'Organization',
      });
      assert.equal(partyA.statusCode, 201);
      const partyAId = (partyA.body as { id: string }).id;

      // Listagem do tenant B não inclui o Party criado pelo tenant A — evita vazar a carteira de
      // clientes de um ISP para outro.
      const listFromB = await requestJson(app.port, 'GET', '/tmf-api/partyManagement/v4/party', TENANT_B);
      assert.equal(listFromB.statusCode, 200);
      const idsFromB = (listFromB.body as Array<{ id: string }>).map((item) => item.id);
      assert.ok(!idsFromB.includes(partyAId));

      // Leitura direta por id é cross-tenant de propósito: relatedParty de outros módulos (ex.:
      // fabricante referenciado por uma resourceSpecification de qualquer tenant) precisa
      // resolver independente de quem pergunta. Ver party-repository-interface.ts.
      const partyFromB = await requestJson(
        app.port,
        'GET',
        `/tmf-api/partyManagement/v4/party/${partyAId}`,
        TENANT_B,
      );
      assert.equal(partyFromB.statusCode, 200);
    } finally {
      await app.cleanup();
    }
  },
);
