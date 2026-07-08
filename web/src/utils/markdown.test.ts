import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normalizeMarkdownResponse } from './markdown';

test('normalizeMarkdownResponse converts escaped line breaks and tabs', () => {
  const value = normalizeMarkdownResponse('Linha 1\\nLinha 2\\tColuna');

  assert.equal(value, 'Linha 1\nLinha 2  Coluna');
});

test('normalizeMarkdownResponse converts escaped list markers and markdown tokens', () => {
  const value = normalizeMarkdownResponse('\\- item\\n\\*\\*negrito\\*\\* e \\`code\\`');

  assert.equal(value, '- item\n**negrito** e `code`');
});

test('normalizeMarkdownResponse keeps regular markdown unchanged', () => {
  const source = '- item\n**negrito**\n`code`';

  assert.equal(normalizeMarkdownResponse(source), source);
});
