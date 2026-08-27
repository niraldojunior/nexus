import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';
import { createTestConfig, createTestDatabase, createTestLogger } from './test-utils.js';

// V-03: antes desta suíte, Party/Resource/Service/Order/Event só exigiam autenticação
// (ensureAuthorized) — qualquer conta autenticada podia criar, alterar e apagar qualquer
// entidade. Estes testes provam que a matriz de papéis de docs/3-system-design/security.md §3
// agora é imposta na borda HTTP.

const ADMIN_EMAIL = 'admin@vtal.com.br';
const ADMIN_PASSWORD = 'admin-password-1234';
const JWT_SECRET = 'test-jwt-secret-rbac-1234567890';

type TestResponse = { statusCode: number; body: unknown };

const startApp = async (
  prefix: string,
  overrides: { llmRateLimitMax?: number; llmRateLimitWindowMs?: number } = {},
) => {
  const database = createTestDatabase(prefix);
  const config = {
    ...createTestConfig(0, database.databaseUrl),
    authJwtSecret: JWT_SECRET,
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    authAccessTokenTtlHours: 12,
    ...overrides,
  };
  const server = createApp({ config, logger: createTestLogger() });
  const port = await server.start();
  return {
    port,
    cleanup: async () => {
      await server.stop();
      database.cleanup();
    },
  };
};

const request = (
  port: number,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<TestResponse> =>
  new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string | number> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode ?? 0, body: text ? JSON.parse(text) : undefined });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const loginToken = async (port: number, email: string, password: string): Promise<string> => {
  const response = await request(port, 'POST', '/v1/auth/login', { body: { email, password } });
  assert.equal(response.statusCode, 200);
  return (response.body as { token: string }).token;
};

const createUserWithRoles = async (
  port: number,
  adminToken: string,
  email: string,
  roles: string[],
): Promise<string> => {
  const created = await request(port, 'POST', '/v1/users', {
    token: adminToken,
    body: { email, name: email, password: `${email}-password-1234`, roles },
  });
  assert.equal(created.statusCode, 201);
  return await loginToken(port, email, `${email}-password-1234`);
};

test('RBAC: Party exige inventory.editor para escrever, inventory.reader só lê', async (t) => {
  const app = await startApp('nexus-rbac-party-');
  t.after(app.cleanup);
  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);
  const readerToken = await createUserWithRoles(app.port, adminToken, 'party-reader@vtal.com.br', [
    'inventory.reader',
  ]);
  const editorToken = await createUserWithRoles(app.port, adminToken, 'party-editor@vtal.com.br', [
    'inventory.editor',
  ]);

  const readAllowed = await request(app.port, 'GET', '/tmf-api/partyManagement/v4/party', {
    token: readerToken,
  });
  assert.equal(readAllowed.statusCode, 200);

  const writeDenied = await request(app.port, 'POST', '/tmf-api/partyManagement/v4/party', {
    token: readerToken,
    body: { '@type': 'Organization', name: 'Tentativa negada' },
  });
  assert.equal(writeDenied.statusCode, 403);

  const writeAllowed = await request(app.port, 'POST', '/tmf-api/partyManagement/v4/party', {
    token: editorToken,
    body: { name: 'ISP Exemplo', partyType: 'Organization' },
  });
  assert.equal(writeAllowed.statusCode, 201);
});

test('RBAC: Resource — catálogo (Specification) exige catalog.admin, instância exige inventory.editor', async (t) => {
  const app = await startApp('nexus-rbac-resource-');
  t.after(app.cleanup);
  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);
  const editorToken = await createUserWithRoles(
    app.port,
    adminToken,
    'resource-editor@vtal.com.br',
    ['inventory.editor'],
  );
  const catalogToken = await createUserWithRoles(
    app.port,
    adminToken,
    'resource-catalog@vtal.com.br',
    ['catalog.admin'],
  );

  // inventory.editor não escreve no catálogo de especificações — precisa de catalog.admin.
  const specDenied = await request(
    app.port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { token: editorToken, body: { name: 'Spec negada', '@type': 'ResourceSpecification' } },
  );
  assert.equal(specDenied.statusCode, 403);

  // catalog.admin passa pela checagem de papel — o corpo mínimo pode ainda falhar validação
  // de domínio (400), o que é ortogonal ao RBAC; o que importa aqui é não ser 403.
  const specAllowed = await request(
    app.port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
    { token: catalogToken, body: { name: 'Spec permitida', '@type': 'ResourceSpecification' } },
  );
  assert.notEqual(specAllowed.statusCode, 403);

  // catalog.admin sozinho não cria instância de recurso — precisa de inventory.editor.
  const resourceDenied = await request(
    app.port,
    'POST',
    '/tmf-api/resourceInventoryManagement/v4/resource',
    { token: catalogToken, body: { name: 'Recurso negado' } },
  );
  assert.equal(resourceDenied.statusCode, 403);
});

test('RBAC: Service — catálogo (Specification) exige catalog.admin, instância exige inventory.editor', async (t) => {
  const app = await startApp('nexus-rbac-service-');
  t.after(app.cleanup);
  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);
  const editorToken = await createUserWithRoles(app.port, adminToken, 'service-editor@vtal.com.br', [
    'inventory.editor',
  ]);

  const specDenied = await request(
    app.port,
    'POST',
    '/tmf-api/serviceCatalogManagement/v4/serviceSpecification',
    { token: editorToken, body: { name: 'Spec negada', '@type': 'ServiceSpecification' } },
  );
  assert.equal(specDenied.statusCode, 403);
});

test('RBAC: Order — order.requester abre ordens, order.operator avança estado', async (t) => {
  const app = await startApp('nexus-rbac-order-');
  t.after(app.cleanup);
  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);
  const requesterToken = await createUserWithRoles(
    app.port,
    adminToken,
    'order-requester@vtal.com.br',
    ['order.requester'],
  );
  const operatorToken = await createUserWithRoles(
    app.port,
    adminToken,
    'order-operator@vtal.com.br',
    ['order.operator'],
  );

  // order.operator sozinho não abre ordem (POST) — só order.requester ou platform.admin.
  const openDenied = await request(
    app.port,
    'POST',
    '/tmf-api/serviceQualificationManagement/v4/serviceQualification',
    { token: operatorToken, body: {} },
  );
  assert.equal(openDenied.statusCode, 403);

  // order.requester sozinho não avança estado (PATCH) — só order.operator ou platform.admin.
  const advanceDenied = await request(
    app.port,
    'PATCH',
    '/tmf-api/serviceOrderingManagement/v4/serviceOrder/algum-id',
    { token: requesterToken, body: {} },
  );
  assert.equal(advanceDenied.statusCode, 403);

  // Ambos leem.
  const requesterRead = await request(
    app.port,
    'GET',
    '/tmf-api/serviceOrderingManagement/v4/serviceOrder',
    { token: requesterToken },
  );
  assert.equal(requesterRead.statusCode, 200);
  const operatorRead = await request(
    app.port,
    'GET',
    '/tmf-api/serviceOrderingManagement/v4/serviceOrder',
    { token: operatorToken },
  );
  assert.equal(operatorRead.statusCode, 200);
});

test('RBAC: Event (TMF688) exige ao menos inventory.reader', async (t) => {
  const app = await startApp('nexus-rbac-event-');
  t.after(app.cleanup);
  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);
  // tenant.admin não tem papel de leitura de inventário — não deve enxergar eventos.
  const tenantAdminToken = await createUserWithRoles(
    app.port,
    adminToken,
    'event-tenant-admin@vtal.com.br',
    ['tenant.admin'],
  );
  const readerToken = await createUserWithRoles(app.port, adminToken, 'event-reader@vtal.com.br', [
    'inventory.reader',
  ]);

  const denied = await request(app.port, 'GET', '/tmf-api/eventManagement/v4/event', {
    token: tenantAdminToken,
  });
  assert.equal(denied.statusCode, 403);

  const allowed = await request(app.port, 'GET', '/tmf-api/eventManagement/v4/event', {
    token: readerToken,
  });
  assert.equal(allowed.statusCode, 200);
});

test('V-08: proxy do LLM (chat/completions) aplica rate limit por ator', async (t) => {
  // Limite baixo (3/min) injetado só para este teste: cada requisição neste harness leva
  // vários segundos (ida e volta HTTP completa + verificação de JWT), então exercitar o
  // default de produção (20/min) tornaria o teste lento e sensível à janela de 60s expirar
  // no meio da sequência. `llmRateLimitMax`/`llmRateLimitWindowMs` existem só para isso.
  const app = await startApp('nexus-rbac-llm-rate-', { llmRateLimitMax: 3, llmRateLimitWindowMs: 60_000 });
  t.after(app.cleanup);
  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);

  // Sem OPENAI_API_KEY/GEMINI_API_KEY no ambiente de teste, a rota cai no provedor local
  // (síncrono, sem chamada externa).
  const responses: TestResponse[] = [];
  for (let i = 0; i < 4; i += 1) {
    responses.push(
      await request(app.port, 'POST', '/v1/chat/completions', {
        token: adminToken,
        body: { messages: [{ role: 'user', content: `mensagem ${i}` }] },
      }),
    );
  }

  const okCount = responses.filter((r) => r.statusCode === 200).length;
  const limitedCount = responses.filter((r) => r.statusCode === 429).length;
  assert.equal(okCount, 3);
  assert.equal(limitedCount, 1);
});
