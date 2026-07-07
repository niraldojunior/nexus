import assert from 'node:assert/strict';
import { test } from 'vitest';
import { getNexusCopilotContext, prependNexusCopilotContext } from '../src/modules/search/nexus-copilot-context.js';

test('getNexusCopilotContext carrega o MD de treinamento do repositorio', () => {
  const context = getNexusCopilotContext();

  assert.match(context, /Nexus Copilot/);
  assert.match(context, /V\.tal/i);
  assert.match(context, /TMF688/i);
});

test('prependNexusCopilotContext injeta system message quando o chat nao traz contexto', () => {
  const messages = prependNexusCopilotContext([{ role: 'user', content: 'Pergunta' }]);

  assert.equal(messages[0]?.role, 'system');
  assert.match(messages[0]?.content ?? '', /Nexus Copilot/);
  assert.equal(messages[1]?.role, 'user');
});

test('prependNexusCopilotContext preserva system message existente', () => {
  const messages = prependNexusCopilotContext([
    { role: 'system', content: 'Contexto proprio' },
    { role: 'user', content: 'Pergunta' },
  ]);

  assert.equal(messages[0]?.content, 'Contexto proprio');
  assert.equal(messages.length, 2);
});
