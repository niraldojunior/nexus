import { AppError } from './app-error.js';

export const unauthorizedError = (): AppError =>
  new AppError('authentication required', { code: 'AUTH_REQUIRED', statusCode: 401 });

export const forbiddenError = (): AppError =>
  new AppError('invalid bearer token', { code: 'AUTH_FORBIDDEN', statusCode: 403 });

// Listagem sem `limit` explícito encostou no teto compartilhado (ver src/shared/http/list-query.ts) —
// nunca truncamos em silêncio, então o chamador precisa paginar com `limit`/`offset` explícitos.
export const listTooLargeError = (): AppError =>
  new AppError(
    'list exceeds the implicit size limit; pass explicit limit/offset to paginate',
    { code: 'LIST_TOO_LARGE', statusCode: 400 },
  );

// Pool Oracle esgotado (NJS-040/NJS-076, lançado antes de qualquer SQL sair) — ver issue #291.
// Diagnóstico, não prevenção: torna a starvation legível como 503 em vez de 500 genérico.
export const databaseUnavailableError = (): AppError =>
  new AppError('database pool exhausted', { code: 'DATABASE_UNAVAILABLE', statusCode: 503 });
