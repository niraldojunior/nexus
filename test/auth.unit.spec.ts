import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
} from '../src/modules/auth/password.js';
import { signAccessToken } from '../src/modules/auth/jwt.js';

const base64UrlDecode = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

describe('auth/password', () => {
  it('faz o roundtrip hash → verify da senha correta', async () => {
    const hash = await hashPassword('senha-super-secreta-123');
    assert.ok(hash.startsWith('scrypt$'));
    assert.equal(await verifyPassword('senha-super-secreta-123', hash), true);
  });

  it('rejeita a senha errada', async () => {
    const hash = await hashPassword('senha-super-secreta-123');
    assert.equal(await verifyPassword('senha-errada-123456', hash), false);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const a = await hashPassword('senha-super-secreta-123');
    const b = await hashPassword('senha-super-secreta-123');
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('senha-super-secreta-123', a), true);
    assert.equal(await verifyPassword('senha-super-secreta-123', b), true);
  });

  it(`recusa senha com menos de ${MIN_PASSWORD_LENGTH} caracteres`, async () => {
    await assert.rejects(() => hashPassword('curta'), WeakPasswordError);
  });

  it('devolve false para um hash malformado em vez de lançar', async () => {
    assert.equal(await verifyPassword('qualquer', 'não-é-um-hash'), false);
  });
});

describe('auth/jwt', () => {
  const secret = 'segredo-de-teste';

  it('emite um JWT HS256 com os claims esperados e assinatura válida', () => {
    const { token, expiresAt } = signAccessToken(
      { sub: 'ext-1', tenantId: 'default', roles: ['inventory.reader'], tokenVersion: 3 },
      secret,
      3600,
    );
    const [header, payload, signature] = token.split('.');
    assert.ok(header && payload && signature);

    const decodedHeader = JSON.parse(base64UrlDecode(header).toString('utf8'));
    assert.equal(decodedHeader.alg, 'HS256');

    const decoded = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    assert.equal(decoded.sub, 'ext-1');
    assert.equal(decoded.tenant_id, 'default');
    assert.deepEqual(decoded.roles, ['inventory.reader']);
    assert.equal(decoded.tv, 3);
    assert.equal(decoded.exp, expiresAt);
    assert.ok(typeof decoded.jti === 'string' && decoded.jti.length > 0);

    // Assinatura confere com o mesmo HMAC que o verificador (request-context) recomputa.
    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    assert.equal(signature, expected);
  });

  it('uma alteração no segredo invalida a assinatura', () => {
    const { token } = signAccessToken(
      { sub: 'ext-1', tenantId: 'default', roles: [], tokenVersion: 0 },
      secret,
      3600,
    );
    const [header, payload, signature] = token.split('.');
    const forged = createHmac('sha256', 'outro-segredo')
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    assert.notEqual(signature, forged);
  });
});
