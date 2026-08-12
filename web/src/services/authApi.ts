// Cliente das rotas de autenticação e administração de usuários (`/v1/auth/*`, `/v1/users`).
// A sessão (token + usuário) é guardada por services/session.ts.
import { getToken, type SessionUser } from './session';

const API_BASE_URL = '/v1';

export type LoginResponse = {
  token: string;
  expiresAt: number;
  user: SessionUser;
};

export type AdminUser = SessionUser & {
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
};

const authHeaders = (): HeadersInit => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function requestJson<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: authHeaders(),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : (undefined as T);
  if (!response.ok) {
    const record = payload as Record<string, unknown> | undefined;
    const message =
      (record && (typeof record.message === 'string' ? record.message : undefined)) ??
      (record && (typeof record.error === 'string' ? record.error : undefined)) ??
      `Falha na requisição (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export const login = (email: string, password: string): Promise<LoginResponse> =>
  requestJson<LoginResponse>(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    body: { email, password },
  });

export const fetchMe = (): Promise<SessionUser> =>
  requestJson<SessionUser>(`${API_BASE_URL}/auth/me`);

export const logout = (): Promise<void> =>
  requestJson<void>(`${API_BASE_URL}/auth/logout`, { method: 'POST' });

export const changeOwnPassword = (currentPassword: string, newPassword: string): Promise<void> =>
  requestJson<void>(`${API_BASE_URL}/auth/password`, {
    method: 'POST',
    body: { currentPassword, newPassword },
  });

// ---- Administração de usuários (papéis tenant.admin / platform.admin) ----

export const listUsers = (): Promise<AdminUser[]> =>
  requestJson<AdminUser[]>(`${API_BASE_URL}/users`);

export const createUser = (input: {
  email: string;
  name: string;
  password: string;
  roles: string[];
  tenantId?: string;
}): Promise<AdminUser> =>
  requestJson<AdminUser>(`${API_BASE_URL}/users`, { method: 'POST', body: input });

export const setUserRoles = (id: string, roles: string[]): Promise<AdminUser> =>
  requestJson<AdminUser>(`${API_BASE_URL}/users/${encodeURIComponent(id)}/roles`, {
    method: 'POST',
    body: { roles },
  });

export const setUserStatus = (id: string, status: 'active' | 'disabled'): Promise<AdminUser> =>
  requestJson<AdminUser>(`${API_BASE_URL}/users/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: { status },
  });

export const resetUserPassword = (id: string, password: string): Promise<AdminUser> =>
  requestJson<AdminUser>(`${API_BASE_URL}/users/${encodeURIComponent(id)}/password`, {
    method: 'POST',
    body: { password },
  });

export const deleteUser = (id: string): Promise<void> =>
  requestJson<void>(`${API_BASE_URL}/users/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Papéis disponíveis para atribuição na tela de Usuários (ver docs/3-system-design/security.md §3).
export const ASSIGNABLE_ROLES = [
  'inventory.reader',
  'inventory.editor',
  'order.requester',
  'order.operator',
  'catalog.admin',
  'tenant.admin',
  'platform.admin',
] as const;
