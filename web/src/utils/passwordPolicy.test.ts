import { describe, expect, it } from 'vitest';
import {
  checkPassword,
  generatePassword,
  isPasswordValid,
  MIN_PASSWORD_LENGTH,
  passwordStrength,
} from './passwordPolicy';

const idsMet = (value: string) =>
  checkPassword(value)
    .filter((check) => check.met)
    .map((check) => check.id);

describe('checkPassword', () => {
  it('marca apenas a regra atendida quando só há minúsculas', () => {
    expect(idsMet('abc')).toEqual(['lowercase']);
  });

  it('marca comprimento, minúscula, maiúscula, número e símbolo numa senha completa', () => {
    expect(idsMet('Senha1234567!')).toEqual([
      'length',
      'uppercase',
      'lowercase',
      'digit',
      'symbol',
    ]);
  });

  it('aceita símbolos acentuados/não-ASCII como símbolo', () => {
    expect(idsMet('senhã')).toContain('symbol');
  });
});

describe('isPasswordValid', () => {
  it('reprova enquanto falta qualquer classe', () => {
    expect(isPasswordValid('senha1234567')).toBe(false); // sem maiúscula e símbolo
    expect(isPasswordValid('Senha1234567')).toBe(false); // sem símbolo
    expect(isPasswordValid('Senha!')).toBe(false); // curta
  });

  it('aprova quando todas as regras passam', () => {
    expect(isPasswordValid('Senha1234567!')).toBe(true);
  });
});

describe('passwordStrength', () => {
  it('classifica em fraca/média/forte', () => {
    expect(passwordStrength('abc')).toBe('fraca');
    expect(passwordStrength('Senha123456!')).toBe('media'); // 12 chars, todas as classes
    expect(passwordStrength('Senha1234567890!')).toBe('forte'); // 16+ chars
  });
});

describe('generatePassword', () => {
  it('gera senha válida em muitas iterações', () => {
    for (let i = 0; i < 200; i += 1) {
      const generated = generatePassword();
      expect(generated.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
      expect(isPasswordValid(generated)).toBe(true);
    }
  });

  it('respeita o comprimento pedido e nunca fica abaixo do mínimo', () => {
    expect(generatePassword(20)).toHaveLength(20);
    expect(generatePassword(4).length).toBe(MIN_PASSWORD_LENGTH);
  });

  it('produz valores distintos entre chamadas', () => {
    expect(generatePassword()).not.toEqual(generatePassword());
  });
});
