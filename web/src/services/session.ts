// Fonte única da sessão do usuário no navegador. Deliberadamente mantém a chave
// `localStorage.authToken` que os clientes HTTP já leem (geoApi, services/api, resourceApi,
// serviceApi, partyApi, researchApi) — assim, ao guardar o JWT aqui, todos passam a enviá-lo
// sem nenhuma edição. Decisão: JWT em localStorage (ver plano). O token é decodificado só
// para a UI (nome, papéis, expiração); a verificação de verdade é no backend.

export type SessionUser = {
  id: string;
  externalId: string;
  name: string;
  email?: string;
  roles: string[];
  tenantId: string;
  status: string;
};

type SessionClaims = {
  sub: string;
  tenant_id: string;
  roles: string[];
  exp: number;
  tv: number;
};

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

const listeners = new Set<() => void>();
const notify = (): void => {
  for (const listener of listeners) listener();
};

/** Assina mudanças de sessão (login/logout/expiração). Devolve o cancelador. */
export const subscribeSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

// Valor pronto para o header `Authorization`. Sem sessão, devolve string vazia — nunca um
// token de fallback: enviar "Bearer " faz o backend responder 401, que o fetch-compat já
// trata (limpa a sessão e a UI volta ao login), em vez de a requisição sair autenticada como
// a conta de máquina (AUTH_TOKEN) enquanto o usuário acha que está deslogado.
export const bearerToken = (): string => getToken() ?? '';

export const setSession = (session: { token: string; user: SessionUser }): void => {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  notify();
};

export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notify();
};

export const getSessionUser = (): SessionUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
};

const decodeClaims = (token: string): SessionClaims | null => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as SessionClaims;
  } catch {
    return null;
  }
};

const isExpired = (claims: SessionClaims): boolean =>
  typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now();

/** Há um JWT de sessão presente e ainda válido (não expirado). */
export const isAuthenticated = (): boolean => {
  const token = getToken();
  if (!token) return false;
  const claims = decodeClaims(token);
  return claims !== null && !isExpired(claims);
};

/** Papéis do token da sessão (para condicionar itens de UI como "Usuários"). */
export const getSessionRoles = (): string[] => {
  const token = getToken();
  const claims = token ? decodeClaims(token) : null;
  return claims?.roles ?? [];
};

const USER_ADMIN_ROLES = ['tenant.admin', 'platform.admin'];

export const isAdmin = (): boolean =>
  getSessionRoles().some((role) => USER_ADMIN_ROLES.includes(role));
