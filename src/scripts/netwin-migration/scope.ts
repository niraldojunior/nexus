import type { MigrationScope } from './types.js';

export function normalizeScopeName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/**
 * A origem Netwin armazena o endereço em uma única string delimitada por vírgulas.
 * O predicado compara um segmento inteiro, com acentos/capitalização ignorados,
 * para não confundir o bairro com trecho de logradouro ou complemento.
 */
/**
 * DL_INFRANODE é a fonte estruturada e indexada para endereço de planta OSP.
 * A função LIMPASTRING é a mesma expressão do índice DL_INFRANODE_IDX5.
 */
export function neighborhoodInfranodePredicate(
  infranodeAlias: string,
  bindName = 'bairro',
): string {
  return `NETWIN.LIMPASTRING(${infranodeAlias}.BAIRRO) = :${bindName}`;
}

export function municipalityInfranodePredicate(
  infranodeAlias: string,
  bindName = 'municipio',
): string {
  return `NETWIN.LIMPASTRING(${infranodeAlias}.BADDR_MUNICIPIO) = :${bindName}`;
}

export function ufInfranodePredicate(infranodeAlias: string, bindName = 'uf'): string {
  return `NETWIN.LIMPASTRING(${infranodeAlias}.BADDR_UF_ABRV) = :${bindName}`;
}

export function infranodeScopeBinds(
  scope: Pick<MigrationScope, 'bairro' | 'municipio' | 'uf'>,
): Record<string, string> {
  return {
    ...(scope.bairro ? { bairro: normalizeScopeName(scope.bairro) } : {}),
    ...(scope.municipio ? { municipio: normalizeScopeName(scope.municipio) } : {}),
    ...(scope.uf ? { uf: normalizeScopeName(scope.uf) } : {}),
  };
}
