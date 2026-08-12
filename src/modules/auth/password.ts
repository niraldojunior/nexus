import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';

// Hash de senha com scrypt nativo do Node — sem dependência externa (bcrypt/argon2 são
// addons nativos que quebrariam o build serverless da Vercel e a imagem Docker). Os
// parâmetros seguem a recomendação do RFC 7914 para uso interativo; ~16 MB de memória por
// derivação, abaixo do maxmem padrão de 32 MB.
const SCRYPT_COST = 16384; // N
const SCRYPT_BLOCK = 8; // r
const SCRYPT_PARALLEL = 1; // p
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 12;

const derive = (
  password: string,
  salt: Buffer,
  keylen: number,
  cost: number,
  block: number,
  parallel: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keylen,
      { N: cost, r: block, p: parallel, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey as Buffer)),
    );
  });

// Estende AppError para virar um 400 limpo no boundary HTTP (ver handleHttpError), em vez de
// um 500 genérico — a senha fraca é erro do cliente.
export class WeakPasswordError extends AppError {
  constructor() {
    super(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`, {
      code: 'AUTH_WEAK_PASSWORD',
      statusCode: 400,
    });
    this.name = 'WeakPasswordError';
  }
}

// Formato `scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>`, auto-descritivo: os parâmetros de
// custo viajam junto do hash, então uma futura elevação de custo não invalida os antigos.
export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
  const salt = randomBytes(SALT_BYTES);
  const derived = await derive(password, salt, KEY_LENGTH, SCRYPT_COST, SCRYPT_BLOCK, SCRYPT_PARALLEL);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK}$${SCRYPT_PARALLEL}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const cost = Number(parts[1]);
  const block = Number(parts[2]);
  const parallel = Number(parts[3]);
  if (!Number.isInteger(cost) || !Number.isInteger(block) || !Number.isInteger(parallel)) return false;
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (expected.length === 0) return false;
  const derived = await derive(password, salt, expected.length, cost, block, parallel);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
