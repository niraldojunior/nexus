import { describe, expect, it } from 'vitest';
import { cepFromText, formatCep, normalizeCep } from './cep';

describe('normalizeCep', () => {
  it('extrai os 8 dígitos de um CEP mascarado', () => {
    expect(normalizeCep('24220-401')).toBe('24220401');
  });
  it('devolve null para valor incompleto ou vazio', () => {
    expect(normalizeCep('123')).toBeNull();
    expect(normalizeCep(null)).toBeNull();
    expect(normalizeCep(undefined)).toBeNull();
  });
});

describe('formatCep', () => {
  it('aplica a máscara canônica dos Correios', () => {
    expect(formatCep('24220401')).toBe('24220-401');
    expect(formatCep('24220-401')).toBe('24220-401');
  });
});

describe('cepFromText', () => {
  it('encontra o CEP em texto livre, com ou sem hífen', () => {
    expect(cepFromText('Rua Exemplo, 24220-401, Niterói')).toBe('24220401');
    expect(cepFromText('cep 24220401 numero 155')).toBe('24220401');
    expect(cepFromText('sem cep aqui')).toBeNull();
  });
});
