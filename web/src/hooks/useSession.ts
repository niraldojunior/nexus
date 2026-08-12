import { useSyncExternalStore } from 'react';
import {
  getSessionUser,
  isAdmin,
  isAuthenticated,
  subscribeSession,
  type SessionUser,
} from '../services/session';

export type SessionState = {
  authenticated: boolean;
  admin: boolean;
  user: SessionUser | null;
};

// Reflete a sessão do localStorage no React e re-renderiza em login/logout/expiração
// (subscribeSession). useSyncExternalStore mantém todos os assinantes consistentes.
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, snapshot, snapshot);
}

let cached: SessionState | null = null;

function snapshot(): SessionState {
  const authenticated = isAuthenticated();
  const user = getSessionUser();
  const admin = isAdmin();
  // getSnapshot precisa devolver referência estável enquanto nada muda, senão o
  // useSyncExternalStore entra em loop de re-render.
  if (
    cached &&
    cached.authenticated === authenticated &&
    cached.admin === admin &&
    cached.user?.id === user?.id
  ) {
    return cached;
  }
  cached = { authenticated, admin, user };
  return cached;
}
