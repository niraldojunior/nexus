import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  databaseUnavailableError,
  forbiddenError,
  listTooLargeError,
  unauthorizedError,
} from '../src/shared/errors/http-errors.js';

test('unauthorizedError builds the canonical auth required AppError', () => {
  const error = unauthorizedError();

  assert.equal(error.name, 'AppError');
  assert.equal(error.message, 'authentication required');
  assert.equal(error.code, 'AUTH_REQUIRED');
  assert.equal(error.statusCode, 401);
});

test('forbiddenError builds the canonical auth forbidden AppError', () => {
  const error = forbiddenError();

  assert.equal(error.name, 'AppError');
  assert.equal(error.message, 'invalid bearer token');
  assert.equal(error.code, 'AUTH_FORBIDDEN');
  assert.equal(error.statusCode, 403);
});

test('listTooLargeError builds the canonical 400 for implicit lists over the cap (issue #291)', () => {
  const error = listTooLargeError();

  assert.equal(error.name, 'AppError');
  assert.equal(error.code, 'LIST_TOO_LARGE');
  assert.equal(error.statusCode, 400);
});

test('databaseUnavailableError builds the canonical 503 for pool exhaustion (issue #291)', () => {
  const error = databaseUnavailableError();

  assert.equal(error.name, 'AppError');
  assert.equal(error.code, 'DATABASE_UNAVAILABLE');
  assert.equal(error.statusCode, 503);
});
