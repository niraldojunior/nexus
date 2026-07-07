import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { createLogger } from '../src/shared/logging/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('createLogger routes severities to console methods and honors the level gate', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const logger = createLogger('info');

  logger.debug({ step: 'ignored' }, 'debug');
  logger.info({ step: 'kept' }, 'info');
  logger.warn({ step: 'warn' }, 'warn');
  logger.error({ step: 'error' }, 'error');

  assert.equal(logSpy.mock.calls.length, 1);
  assert.equal(errorSpy.mock.calls.length, 2);

  const infoEntry = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
    level: string;
    message: string;
    details: { step: string };
    timestamp: string;
  };

  assert.equal(infoEntry.level, 'info');
  assert.equal(infoEntry.message, 'info');
  assert.equal(infoEntry.details.step, 'kept');
  assert.match(infoEntry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('createLogger emits debug entries only when level is debug', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const logger = createLogger('debug');

  logger.debug({ enabled: true }, 'debug');

  assert.equal(logSpy.mock.calls.length, 1);
  const debugEntry = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { level: string; message: string };
  assert.equal(debugEntry.level, 'debug');
  assert.equal(debugEntry.message, 'debug');
});
