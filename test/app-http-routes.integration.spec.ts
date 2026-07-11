import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson, startHttpTestApp } from './test-utils.js';

test('App bootstrap and entity creation routes', async (t) => {
  const app = await startHttpTestApp('nexus-app-bootstrap-');
  t.after(app.cleanup);

  const before = await app.requestJson('GET', '/v1/bootstrap');
  assert.equal(before.statusCode, 200);
  assert.equal((before.body as { status: string }).status, 'ready');

  const created = await app.requestJson('POST', '/v1/bootstrap/entities', { label: 'Nexus Node' });
  assert.equal(created.statusCode, 201);
  assert.equal((created.body as { label: string }).label, 'Nexus Node');

  const after = await app.requestJson('GET', '/v1/bootstrap');
  assert.equal(
    (after.body as { entities: number }).entities,
    (before.body as { entities: number }).entities + 1,
  );
});

test('Users API creates, lists, reads, updates and deletes users', async (t) => {
  const app = await startHttpTestApp('nexus-app-users-');
  t.after(app.cleanup);

  const created = await app.requestJson('POST', '/v1/users', {
    externalId: 'ext-1',
    name: 'Ana Silva',
    email: 'ana@example.com',
  });
  assert.equal(created.statusCode, 201);
  const user = created.body as { id: string; name: string; email: string };
  assert.equal(user.name, 'Ana Silva');

  const list = await app.requestJson('GET', '/v1/users');
  assert.equal(list.statusCode, 200);
  assert.ok((list.body as Array<{ id: string }>).some((entry) => entry.id === user.id));

  const fetched = await app.requestJson('GET', `/v1/users/${user.id}`);
  assert.equal(fetched.statusCode, 200);
  assert.equal((fetched.body as { id: string }).id, user.id);

  const updated = await app.requestJson('PUT', `/v1/users/${user.id}`, { name: 'Ana Souza' });
  assert.equal(updated.statusCode, 200);
  assert.equal((updated.body as { name: string }).name, 'Ana Souza');

  const missing = await app.requestJson('GET', '/v1/users/does-not-exist');
  assert.equal(missing.statusCode, 404);
  assert.equal((missing.body as { error: string }).error, 'USER_NOT_FOUND');

  const deleted = await app.requestJson('DELETE', `/v1/users/${user.id}`);
  assert.equal(deleted.statusCode, 204);

  const deletedAgain = await app.requestJson('DELETE', `/v1/users/${user.id}`);
  assert.equal(deletedAgain.statusCode, 404);
});

test('Searches API creates, lists, reads, updates and deletes searches', async (t) => {
  const app = await startHttpTestApp('nexus-app-searches-');
  t.after(app.cleanup);

  const created = await app.requestJson('POST', '/v1/searches', {
    query: 'sites in RJ',
    filters: { state: 'RJ' },
  });
  assert.equal(created.statusCode, 201);
  const search = created.body as { id: string; query: string };
  assert.equal(search.query, 'sites in RJ');

  const list = await app.requestJson('GET', '/v1/searches');
  assert.equal(list.statusCode, 200);
  assert.ok((list.body as Array<{ id: string }>).some((entry) => entry.id === search.id));

  const mine = await app.requestJson('GET', '/v1/searches/my');
  assert.equal(mine.statusCode, 200);
  assert.ok((mine.body as Array<{ id: string }>).some((entry) => entry.id === search.id));

  const fetched = await app.requestJson('GET', `/v1/searches/${search.id}`);
  assert.equal(fetched.statusCode, 200);

  const updated = await app.requestJson('PUT', `/v1/searches/${search.id}`, { query: 'sites in SP' });
  assert.equal(updated.statusCode, 200);
  assert.equal((updated.body as { query: string }).query, 'sites in SP');

  const missing = await app.requestJson('GET', '/v1/searches/does-not-exist');
  assert.equal(missing.statusCode, 404);
  assert.equal((missing.body as { error: string }).error, 'SEARCH_NOT_FOUND');

  const deleted = await app.requestJson('DELETE', `/v1/searches/${search.id}`);
  assert.equal(deleted.statusCode, 204);

  const deletedAgain = await app.requestJson('DELETE', `/v1/searches/${search.id}`);
  assert.equal(deletedAgain.statusCode, 404);
});

test('Chat completions route falls back to local knowledge provider without an OpenAI key', async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const app = await startHttpTestApp('nexus-app-chat-');
  t.after(() => {
    app.cleanup();
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
  });

  const response = await app.requestJson('POST', '/v1/chat/completions', {
    messages: [{ role: 'user', content: 'Quais sites existem no Rio de Janeiro?' }],
  });

  assert.equal(response.statusCode, 200);
  const body = response.body as { object: string; choices: Array<{ message: { role: string } }> };
  assert.equal(body.object, 'chat.completion');
  assert.equal(body.choices[0]?.message.role, 'assistant');

  const invalid = await app.requestJson('POST', '/v1/chat/completions', { messages: [] });
  assert.equal(invalid.statusCode, 400);
  assert.equal((invalid.body as { error: string }).error, 'INVALID_MESSAGE');
});
