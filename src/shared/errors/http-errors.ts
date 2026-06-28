import { AppError } from './app-error.js';

export const unauthorizedError = (): AppError =>
  new AppError('authentication required', { code: 'AUTH_REQUIRED', statusCode: 401 });

export const forbiddenError = (): AppError =>
  new AppError('invalid bearer token', { code: 'AUTH_FORBIDDEN', statusCode: 403 });
