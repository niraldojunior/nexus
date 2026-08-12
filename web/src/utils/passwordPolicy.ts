// Política de qualidade de senha no frontend. Módulo puro (sem React), fonte única de verdade
// para o checklist ao vivo e a geração de senha na tela de Usuários. Espelha o mínimo exigido
// pelo backend em src/modules/auth/password.ts (MIN_PASSWORD_LENGTH); os demais critérios são
// orientação de composição no cliente — o servidor só reprova comprimento < 12.

export const MIN_PASSWORD_LENGTH = 12;

export type PasswordRuleId = 'length' | 'uppercase' | 'lowercase' | 'digit' | 'symbol';

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  test: (value: string) => boolean;
};

export type PasswordCheck = {
  id: PasswordRuleId;
  label: string;
  met: boolean;
};

export type PasswordStrength = 'fraca' | 'media' | 'forte';

// Símbolo = qualquer caractere fora de [A-Za-z0-9], para aceitar acentuados e não prender o
// usuário a uma lista fechada.
const SYMBOL_RE = /[^A-Za-z0-9]/;

// Ordem de exibição no checklist.
export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`,
    test: (value) => value.length >= MIN_PASSWORD_LENGTH,
  },
  { id: 'uppercase', label: 'Uma letra maiúscula (A-Z)', test: (value) => /[A-Z]/.test(value) },
  { id: 'lowercase', label: 'Uma letra minúscula (a-z)', test: (value) => /[a-z]/.test(value) },
  { id: 'digit', label: 'Um número (0-9)', test: (value) => /[0-9]/.test(value) },
  { id: 'symbol', label: 'Um símbolo (!@#$…)', test: (value) => SYMBOL_RE.test(value) },
];

export function checkPassword(value: string): PasswordCheck[] {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
}

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

// Força derivada das regras + comprimento: forte quando todas passam e é longa (16+); média
// quando todas passam; fraca caso contrário.
export function passwordStrength(value: string): PasswordStrength {
  if (!isPasswordValid(value)) return 'fraca';
  return value.length >= 16 ? 'forte' : 'media';
}

// Alfabeto sem caracteres ambíguos (0/O, 1/l/I) por classe, para uma senha gerada legível.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SYMBOL = '!@#$%&*?-_+=';
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

// Inteiro uniforme em [0, max) via crypto.getRandomValues, com rejeição para evitar viés de
// módulo. Disponível no browser e no jsdom do Vitest.
function randomInt(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return value % max;
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

// Gera uma senha que satisfaz todas as regras: um caractere obrigatório de cada classe + o
// resto do alfabeto completo, embaralhado (Fisher-Yates) com a mesma fonte de aleatoriedade.
// Nunca usa Math.random. Invariante: isPasswordValid(generatePassword()) === true.
export function generatePassword(length = 16): string {
  const size = Math.max(length, MIN_PASSWORD_LENGTH);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < size) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
