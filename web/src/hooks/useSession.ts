import { useSyncExternalStore } from 'react';
import {
  canAdminStudio,
  canEditInventory,
  canEditStudio,
  canViewStudio,
  getSessionUser,
  isAdmin,
  isAuthenticated,
  subscribeSession,
  type SessionUser,
} from '../services/session';

export type SessionState = {
  authenticated: boolean;
  admin: boolean;
  // Pode editar Geo/Resource/Service (painéis de Locais e Recursos) — inventory.editor ou
  // platform.admin. Ver canEditInventory em services/session.ts.
  canEdit: boolean;
  canViewStudio: boolean;
  canEditStudio: boolean;
  canAdminStudio: boolean;
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
  const canEdit = canEditInventory();
  const studioView = canViewStudio();
  const studioEdit = canEditStudio();
  const studioAdmin = canAdminStudio();
  // getSnapshot precisa devolver referência estável enquanto nada muda, senão o
  // useSyncExternalStore entra em loop de re-render.
  if (
    cached &&
    cached.authenticated === authenticated &&
    cached.admin === admin &&
    cached.canEdit === canEdit &&
    cached.canViewStudio === studioView &&
    cached.canEditStudio === studioEdit &&
    cached.canAdminStudio === studioAdmin &&
    cached.user?.id === user?.id
  ) {
    return cached;
  }
  cached = {
    authenticated,
    admin,
    canEdit,
    canViewStudio: studioView,
    canEditStudio: studioEdit,
    canAdminStudio: studioAdmin,
    user,
  };
  return cached;
}
