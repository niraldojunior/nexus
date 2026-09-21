// Sincronização de deep-link para Studio > Dados Mestres (Organizações e Papéis, issue #275).
//
// Permite abrir diretamente uma organização (`/studio/organizations?org=<id>`) ou um papel
// (`/studio/party-roles?role=<id>`) sem alterar o parser global de rotas em `appRoute.ts`
// (mesmo precedente de `utils/geoViewState.ts`).
//
// A aba ativa não é serializada na URL (segue a regra canônica do appRoute.ts).
// A gravação na URL usa `history.replaceState` para não poluir o histórico do navegador.

const PARAM_ORG = 'org';
const PARAM_ROLE = 'role';

export type PartyViewParams = {
  orgId?: string;
  roleId?: string;
};

export function parsePartyViewParams(search: string = typeof window !== 'undefined' ? window.location.search : ''): PartyViewParams {
  const params = new URLSearchParams(search);
  const org = params.get(PARAM_ORG)?.trim();
  const role = params.get(PARAM_ROLE)?.trim();
  return {
    orgId: org || undefined,
    roleId: role || undefined,
  };
}

export function writePartyViewParams(section: 'organizations' | 'party-roles', selectedId?: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);

  // Limpa ambos os parâmetros primeiro
  url.searchParams.delete(PARAM_ORG);
  url.searchParams.delete(PARAM_ROLE);

  if (selectedId) {
    if (section === 'organizations') {
      url.searchParams.set(PARAM_ORG, selectedId);
    } else if (section === 'party-roles') {
      url.searchParams.set(PARAM_ROLE, selectedId);
    }
  }

  window.history.replaceState({}, '', url.toString());
}

export function clearPartyViewParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM_ORG);
  url.searchParams.delete(PARAM_ROLE);
  window.history.replaceState({}, '', url.toString());
}
