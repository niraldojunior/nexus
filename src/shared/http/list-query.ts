// Teto compartilhado para endpoints de listagem Geo que historicamente não tinham LIMIT algum
// (parseGeoListQuery, parseGeoSpecificationListQuery) — ver issue #291. A query sem filtro
// `GET /v1/geo/sites` varreu `tmf_geographic_site` inteira pós-migração RJ (192.698 ms) e
// derrubou o processo por OOM.
//
// Semântica deliberada: nunca truncar em silêncio. Scripts de carga (scripts/estacoes_carregar.mjs,
// scripts/seed-service-scenarios.mjs e outros) chamam `GET /v1/geo/sites` sem `limit` e montam um
// índice completo nome→id para serem idempotentes — um corte silencioso os faria ver base parcial
// e recriar sites existentes (a mesma classe de bug das specs duplicadas, ver
// estacao-central-office-duplicate-spec na memória do projeto). Por isso: sem `limit` explícito,
// o teto é aplicado e, se houver mais linhas do que ele, a resposta é 400 — nunca um 200 cortado.
import { listTooLargeError } from '../errors/http-errors.js';

export const MAX_LIST_LIMIT = 1000;

export type ResolvedListLimit = {
  /** Linhas a pedir ao repositório. Quando implícito, é MAX_LIST_LIMIT + 1 — o "+1" é o que
   *  permite distinguir "a base tem exatamente o teto" de "a base excede o teto" sem truncar. */
  limit: number;
  /** true quando o chamador não mandou `limit` — é esse caso que pode estourar em 400. */
  implicit: boolean;
};

/** Resolve o `limit` efetivo a pedir ao repositório a partir do valor cru (já parseado) da query string. */
export const resolveListLimit = (
  rawLimit: number | undefined,
  max: number = MAX_LIST_LIMIT,
): ResolvedListLimit => {
  if (rawLimit === undefined) {
    return { limit: max + 1, implicit: true };
  }
  const clamped = Math.min(Math.max(1, Math.trunc(rawLimit)), max);
  return { limit: clamped, implicit: false };
};

/**
 * Garante que uma listagem implícita (sem `limit` do chamador) não excede o teto. Lança
 * `LIST_TOO_LARGE` (400) em vez de truncar — quem precisa da base inteira deve paginar
 * explicitamente com `limit`/`offset`. Devolve as linhas inalteradas quando dentro do teto.
 */
export const assertListBounded = <T>(
  rows: T[],
  resolved: ResolvedListLimit,
  max: number = MAX_LIST_LIMIT,
): T[] => {
  if (resolved.implicit && rows.length > max) {
    throw listTooLargeError();
  }
  return rows;
};
