import { ChevronRight } from 'lucide-react';
import { siteKindFromSpec, formatAddress, type GeoDirectory } from '../../utils/placeLabel';
import type { GeoSite, GeoSpec } from '../../services/geoApi';

export type ListTabProps = {
  sites: GeoSite[];
  specs: Map<string, GeoSpec>;
  addressesById: Map<string, any>;
  selectedSiteId: string | null;
  onSelectSite: (site: GeoSite) => void;
  onOpenDetail: (site: GeoSite) => void;
};

/**
 * Aba "Lista" do GeoPage — tabela buscável de locais.
 * Mostra Site + Tipo + Endereço + Status via PlaceLabel.
 */
export function ListTab({
  sites,
  specs,
  addressesById,
  selectedSiteId,
  onSelectSite,
  onOpenDetail,
}: ListTabProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 border-b border-app-border bg-white px-6 py-4">
        <h2 className="font-display text-[1.15rem] font-semibold text-app-text">Locais cadastrados</h2>
        <p className="mt-1 text-[0.86rem] text-app-muted">{sites.length} local(is) no inventário</p>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-app-accent-soft">
            <tr>
              <th className="border-b border-app-border px-6 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Nome</th>
              <th className="border-b border-app-border px-6 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Tipo</th>
              <th className="border-b border-app-border px-6 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Endereço</th>
              <th className="border-b border-app-border px-6 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Status</th>
              <th className="border-b border-app-border px-6 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted"></th>
            </tr>
          </thead>
          <tbody>
            {sites.length ? (
              sites.map((site) => {
                const spec = specs.get(site.siteSpecificationId);
                const kind = siteKindFromSpec(spec);
                const address = site.address ? addressesById.get(site.address.id) : undefined;
                const isSelected = site.id === selectedSiteId;
                return (
                  <tr
                    key={site.id}
                    className={`border-b border-app-border transition ${
                      isSelected ? 'bg-app-accent-soft' : 'hover:bg-app-accent-soft'
                    }`}
                  >
                    <td className="px-6 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectSite(site)}
                        className="text-left"
                      >
                        <span className="text-[0.92rem] font-semibold text-app-text">{site.name}</span>
                      </button>
                    </td>
                    <td className="px-6 py-3 text-[0.84rem] text-app-muted">
                      {spec?.name || 'Não informado'}
                    </td>
                    <td className="px-6 py-3 text-[0.84rem] text-app-muted">
                      {address ? formatAddress(address) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={site.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(site)}
                        className="inline-flex items-center gap-1 rounded-[12px] px-2 py-1 text-[0.78rem] font-semibold text-app-text hover:bg-app-border transition"
                      >
                        Detalhes
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-app-muted">
                  Nenhum local cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusLabel: Record<string, string> = {
    planned: 'Planejado',
    active: 'Ativo',
    suspended: 'Suspenso',
    terminated: 'Terminado',
  };
  const colorClass =
    status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'planned' ? 'bg-blue-50 text-blue-700 border-blue-200'
    : status === 'suspended' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-700 border-gray-200';
  return (
    <span className={`inline-block rounded-[999px] border px-2.5 py-1 text-[0.75rem] font-semibold ${colorClass}`}>
      {statusLabel[status] || status}
    </span>
  );
}
