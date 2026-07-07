import { afterEach, expect, test, vi } from 'vitest';
import { sendMessage } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

test('sendMessage posts the expected payload and returns assistant content', async () => {
  localStorage.setItem('authToken', 'token-123');
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Resposta' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const content = await sendMessage([{ role: 'user', content: 'Hello' }]);

  expect(content).toBe('Resposta');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/chat/completions');
});

test('sendMessage surfaces backend error payloads', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ error: 'Falha controlada' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(sendMessage([{ role: 'user', content: 'Hello' }])).rejects.toThrow('Falha controlada');
});

test('sendMessage rejects empty assistant responses', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ choices: [{ message: {} }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(sendMessage([{ role: 'user', content: 'Hello' }])).rejects.toThrow('A resposta do ChatGPT veio vazia.');
});
