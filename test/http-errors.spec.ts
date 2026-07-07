import assert from 'node:assert/strict';
import { test } from 'vitest';
import { forbiddenError, unauthorizedError } from '../src/shared/errors/http-errors.js';

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
