import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';
import { createTestConfig, createTestDatabase, createTestLogger } from './test-utils.js';
import { signAccessToken } from '../src/modules/auth/jwt.js';

const ADMIN_EMAIL = 'admin@vtal.com.br';
const ADMIN_PASSWORD = 'admin-password-1234';
const JWT_SECRET = 'test-jwt-secret-1234567890';

type TestResponse = { statusCode: number; body: unknown };

const startAuthApp = async (prefix: string) => {
  const database = createTestDatabase(prefix);
  const config = {
    ...createTestConfig(0, database.databaseUrl),
    authJwtSecret: JWT_SECRET,
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    authAccessTokenTtlHours: 12,
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
  options: { token?: string; rawAuth?: string; body?: unknown } = {},
): Promise<TestResponse> =>
  new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string | number> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    else if (options.rawAuth) headers.authorization = options.rawAuth;
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

test('login: sucesso com o admin semente e erro genérico com senha errada', async (t) => {
  const app = await startAuthApp('nexus-auth-login-');
  t.after(app.cleanup);

  const ok = await request(app.port, 'POST', '/v1/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert.equal(ok.statusCode, 200);
  const okBody = ok.body as { token: string; user: { roles: string[] } };
  assert.ok(okBody.token.split('.').length === 3);
  assert.ok(okBody.user.roles.includes('platform.admin'));

  const wrong = await request(app.port, 'POST', '/v1/auth/login', {
    body: { email: ADMIN_EMAIL, password: 'senha-errada-1234' },
  });
  assert.equal(wrong.statusCode, 401);
  assert.equal((wrong.body as { error: string }).error, 'AUTH_INVALID_CREDENTIALS');

  const unknown = await request(app.port, 'POST', '/v1/auth/login', {
    body: { email: 'ninguem@vtal.com.br', password: 'qualquer-coisa-1234' },
  });
  // Mesma resposta que senha errada — não revela se a conta existe.
  assert.equal(unknown.statusCode, 401);
  assert.equal((unknown.body as { error: string }).error, 'AUTH_INVALID_CREDENTIALS');
});

test('regressão do bypass: JWT com assinatura inválida é rejeitado', async (t) => {
  const app = await startAuthApp('nexus-auth-bypass-');
  t.after(app.cleanup);

  // Token bem-formado, assinado com o segredo ERRADO. Antes da correção, ensureAuthorized
  // aceitava qualquer JWT quando havia verificador configurado, sem checar a assinatura.
  const forged = signAccessToken(
    { sub: 'atacante', tenantId: 'default', roles: ['platform.admin'], tokenVersion: 0 },
    'segredo-errado',
    3600,
  ).token;

  const response = await request(app.port, 'GET', '/v1/searches', { token: forged });
  assert.notEqual(response.statusCode, 200);
  assert.equal(response.statusCode, 403);
});

test('/auth/me e revogação por logout (token_version)', async (t) => {
  const app = await startAuthApp('nexus-auth-me-');
  t.after(app.cleanup);

  const token = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);

  const me = await request(app.port, 'GET', '/v1/auth/me', { token });
  assert.equal(me.statusCode, 200);
  assert.equal((me.body as { email: string }).email, ADMIN_EMAIL);

  const loggedOut = await request(app.port, 'POST', '/v1/auth/logout', { token });
  assert.equal(loggedOut.statusCode, 204);

  // O mesmo token não vale mais — token_version foi incrementado.
  const afterLogout = await request(app.port, 'GET', '/v1/auth/me', { token });
  assert.equal(afterLogout.statusCode, 401);
});

test('RBAC: usuário não-admin recebe 403 na administração de usuários', async (t) => {
  const app = await startAuthApp('nexus-auth-rbac-');
  t.after(app.cleanup);

  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);

  const created = await request(app.port, 'POST', '/v1/users', {
    token: adminToken,
    body: {
      email: 'reader@vtal.com.br',
      name: 'Leitor',
      password: 'reader-password-1234',
      roles: ['inventory.reader'],
    },
  });
  assert.equal(created.statusCode, 201);

  const readerToken = await loginToken(app.port, 'reader@vtal.com.br', 'reader-password-1234');

  const forbidden = await request(app.port, 'GET', '/v1/users', { token: readerToken });
  assert.equal(forbidden.statusCode, 403);

  // O admin continua podendo listar.
  const allowed = await request(app.port, 'GET', '/v1/users', { token: adminToken });
  assert.equal(allowed.statusCode, 200);
});

test('histórico Geo: ranking por visitas, isolamento por usuário e limpeza', async (t) => {
  const app = await startAuthApp('nexus-auth-history-');
  t.after(app.cleanup);

  const adminToken = await loginToken(app.port, ADMIN_EMAIL, ADMIN_PASSWORD);
  await request(app.port, 'POST', '/v1/users', {
    token: adminToken,
    body: {
      email: 'geo@vtal.com.br',
      name: 'Geo',
      password: 'geo-password-12345',
      roles: ['inventory.reader'],
    },
  });
  const userToken = await loginToken(app.port, 'geo@vtal.com.br', 'geo-password-12345');

  const recordAddress = (token: string, key: string, label: string) =>
    request(app.port, 'POST', '/v1/geo/search-history', {
      token,
      body: { entryKey: key, kind: 'address', label, payload: { label } },
    });

  // Endereço A visitado 2x, endereço B 1x → A deve vir primeiro (mais visitado).
  await recordAddress(userToken, 'address:a', 'Endereço A');
  await recordAddress(userToken, 'address:a', 'Endereço A');
  await recordAddress(userToken, 'address:b', 'Endereço B');

  const list = await request(app.port, 'GET', '/v1/geo/search-history', { token: userToken });
  assert.equal(list.statusCode, 200);
  const entries = list.body as Array<{ entryKey: string; visitCount: number }>;
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.entryKey, 'address:a');
  assert.equal(entries[0]?.visitCount, 2);
  assert.equal(entries[1]?.entryKey, 'address:b');

  // Isolamento: o admin não vê o histórico do outro usuário.
  const adminList = await request(app.port, 'GET', '/v1/geo/search-history', { token: adminToken });
  assert.equal(adminList.statusCode, 200);
  assert.equal((adminList.body as unknown[]).length, 0);

  // Remoção individual e limpeza total.
  const removed = await request(app.port, 'DELETE', '/v1/geo/search-history/address:a', {
    token: userToken,
  });
  assert.equal(removed.statusCode, 204);
  const afterRemove = await request(app.port, 'GET', '/v1/geo/search-history', { token: userToken });
  assert.equal((afterRemove.body as unknown[]).length, 1);

  const cleared = await request(app.port, 'DELETE', '/v1/geo/search-history', { token: userToken });
  assert.equal(cleared.statusCode, 204);
  const afterClear = await request(app.port, 'GET', '/v1/geo/search-history', { token: userToken });
  assert.equal((afterClear.body as unknown[]).length, 0);

  // Sem sessão de usuário real (token estático de máquina), o histórico exige requireUser.
  const anon = await request(app.port, 'GET', '/v1/geo/search-history', { rawAuth: 'Bearer secret' });
  assert.equal(anon.statusCode, 401);
});
