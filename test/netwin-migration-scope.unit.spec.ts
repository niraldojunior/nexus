import { describe, expect, it } from 'vitest';
import {
  infranodeScopeBinds,
  municipalityInfranodePredicate,
  neighborhoodInfranodePredicate,
  normalizeScopeName,
  ufInfranodePredicate,
} from '../src/scripts/netwin-migration/scope.js';

describe('netwin-migration: bairro scope', () => {
  it('normaliza acentos para a comparação estruturada sem alterar o valor da CLI', () => {
    expect(normalizeScopeName('Icaraí')).toBe('ICARAI');
    expect(infranodeScopeBinds({ bairro: 'Icaraí', municipio: 'Niterói', uf: 'RJ' })).toEqual({
      bairro: 'ICARAI',
      municipio: 'NITEROI',
      uf: 'RJ',
    });
  });

  it('gera predicados com bind sobre os campos estruturados de DL_INFRANODE', () => {
    expect(neighborhoodInfranodePredicate('infranode')).toBe(
      'NETWIN.LIMPASTRING(infranode.BAIRRO) = :bairro',
    );
    expect(municipalityInfranodePredicate('infranode')).toBe(
      'NETWIN.LIMPASTRING(infranode.BADDR_MUNICIPIO) = :municipio',
    );
    expect(ufInfranodePredicate('infranode')).toBe(
      'NETWIN.LIMPASTRING(infranode.BADDR_UF_ABRV) = :uf',
    );
  });

  it('mantém os binds do recorte de bairro isolados da consulta sem escopo', () => {
    const scopeBinds = infranodeScopeBinds({ bairro: 'Icaraí', municipio: 'Niterói' });
    const queryBinds = (includeScope: boolean) => ({
      ...(includeScope ? scopeBinds : {}),
      lastId: 0,
      batchSize: 2_000,
    });

    expect(queryBinds(true)).toEqual({
      bairro: 'ICARAI',
      municipio: 'NITEROI',
      lastId: 0,
      batchSize: 2_000,
    });
    expect(queryBinds(false)).toEqual({ lastId: 0, batchSize: 2_000 });
  });
});
