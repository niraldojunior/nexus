import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  getSessionRoles,
  getSessionUser,
  getToken,
  isAdmin,
  isAuthenticated,
  setSession,
  subscribeSession,
  type SessionUser,
} from './session';

// Monta um token no formato JWT (header.payload.assinatura). O frontend só decodifica o
// payload para a UI — a assinatura não é verificada aqui —, então basta um base64url válido.
const base64Url = (value: object): string =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const makeToken = (payload: Record<string, unknown>): string =>
  `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(payload)}.assinatura`;

const user: SessionUser = {
  id: 'u1',
  externalId: 'ana@vtal.com.br',
  name: 'Ana',
  email: 'ana@vtal.com.br',
  roles: ['inventory.reader'],
  tenantId: 'default',
  status: 'active',
};

const futureExp = Math.floor(Date.now() / 1000) + 3600;
const pastExp = Math.floor(Date.now() / 1000) - 10;

afterEach(() => {
  clearSession();
  localStorage.clear();
});

describe('session', () => {
  it('guarda e lê token e usuário; autentica com token válido', () => {
    setSession({
      token: makeToken({ sub: 'ana', roles: ['inventory.reader'], exp: futureExp }),
      user,
    });
    expect(getToken()).toBeTruthy();
    expect(getSessionUser()?.name).toBe('Ana');
    expect(isAuthenticated()).toBe(true);
  });

  it('clearSession remove token e usuário', () => {
    setSession({ token: makeToken({ exp: futureExp }), user });
    clearSession();
    expect(getToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('não autentica com token expirado', () => {
    setSession({ token: makeToken({ exp: pastExp }), user });
    expect(isAuthenticated()).toBe(false);
  });

  it('não autentica quando o token não é um JWT', () => {
    localStorage.setItem('authToken', 'change-me');
    expect(isAuthenticated()).toBe(false);
  });

  it('extrai papéis do token e reconhece admin', () => {
    setSession({ token: makeToken({ roles: ['platform.admin'], exp: futureExp }), user });
    expect(getSessionRoles()).toContain('platform.admin');
    expect(isAdmin()).toBe(true);
  });

  it('não reconhece admin sem papel administrativo', () => {
    setSession({ token: makeToken({ roles: ['inventory.reader'], exp: futureExp }), user });
    expect(isAdmin()).toBe(false);
  });

  it('notifica assinantes em login e logout', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    setSession({ token: makeToken({ exp: futureExp }), user });
    clearSession();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setSession({ token: makeToken({ exp: futureExp }), user });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
