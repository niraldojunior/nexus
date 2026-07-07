import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { formatDate, generateId, truncateString } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

test('truncateString keeps short values and trims long values', () => {
  assert.equal(truncateString('Nexus', 10), 'Nexus');
  assert.equal(truncateString('Inventario de rede', 10), 'Inventario...');
});

test('generateId combines the timestamp and random suffix', () => {
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

  assert.equal(generateId(), 'loyw3v284fzzzxjylrx');
});

test('formatDate returns a localized pt-BR string', () => {
  const formatted = formatDate(new Date('2024-12-09T10:30:00.000Z'));

  assert.match(formatted, /2024/);
  assert.match(formatted, /\d{2}:\d{2}/);
});
