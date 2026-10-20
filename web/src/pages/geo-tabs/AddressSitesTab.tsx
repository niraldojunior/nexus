import { Building2, Loader2 } from 'lucide-react';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { AddressSitesState } from '../../hooks/useAddressSites';

type AddressSitesTabProps = {
  state: AddressSitesState;
  onSelectSite: (site: GeoTreeNode) => void;
};

/**
 * Aba "Locais" do painel de Endereço: lista os Locais (GeographicSite) já cadastrados para o
 * endereço consultado. Clicar num Local abre o painel dele (mesmo caminho da busca por nome).
 */
export function AddressSitesTab({ state, onSelectSite }: AddressSitesTabProps) {
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-sm text-app-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Buscando Locais deste endereço…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="px-1 py-3 text-sm text-app-muted" role="alert">
        Não foi possível consultar os Locais deste endereço.
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div className="px-1 py-3 text-sm text-app-muted">
        Informe rua e número para consultar os Locais deste endereço.
      </div>
    );
  }
  if (state.sites.length === 0) {
    return (
      <div className="px-1 py-3 text-sm text-app-muted">
        Nenhum Local cadastrado para este endereço.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {state.sites.map((site) => (
        <li key={site.id}>
          <button
            type="button"
            onClick={() => onSelectSite(site)}
            className="flex w-full items-start gap-3 rounded-lg border border-app-border px-3 py-2 text-left transition hover:bg-app-surface-hover"
          >
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold text-app-text">
                {site.label}
              </span>
              {site.sublabel || site.status ? (
                <span className="block break-words text-xs text-app-muted">
                  {[site.sublabel, site.status].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
