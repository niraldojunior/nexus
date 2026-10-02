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

/**
 * A UF é comparada diretamente, sem LIMPASTRING. A sigla em BADDR_UF_ABRV já é maiúscula, sem
 * acento e sem espaço (verificado no DR: 27 siglas distintas, 1:1 com BADDR_UF_ID), então a
 * normalização não mudava nenhum valor — só impedia o uso de índice e forçava uma chamada
 * PL/SQL por linha varrida. O índice funcional DL_INFRANODE_IDX5 cobre apenas
 * LIMPASTRING(BAIRRO); nunca existiu equivalente para a coluna de UF.
 */
export function ufInfranodePredicate(infranodeAlias: string, bindName = 'uf'): string {
  return `${infranodeAlias}.BADDR_UF_ABRV = :${bindName}`;
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
