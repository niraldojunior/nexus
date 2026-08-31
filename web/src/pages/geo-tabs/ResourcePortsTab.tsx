import { Loader2, Waypoints } from 'lucide-react';
import { useResourcePorts } from '../../hooks/useResourcePorts';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import { resourceIconFor } from '../../utils/resourceIcon';
import { ResourceIcon } from '../../components/ResourceIcon';
import { StatusBadge } from './StatusBadge';

export type ResourcePortsTabProps = {
  ctoNode: GeoTreeNode;
  onOpenPort: (node: GeoTreeNode) => void;
};

/**
 * Aba "Portas" do painel de Recurso (issue #171 Fase 3) — exclusiva de CTO. Lista as
 * portas do(s) splitter(s) contidos na CTO, agrupadas por splitter. Piloto
 * Niterói/Icaraí (`scripts/load-cto-ports.mjs`); nenhuma outra carga materializa
 * porta hoje — CTO sem splitter contido mostra o estado vazio.
 */
export function ResourcePortsTab({ ctoNode, onOpenPort }: ResourcePortsTabProps) {
  const { groups, loading } = useResourcePorts(ctoNode);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        Carregando portas…
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Esta CTO ainda não tem splitter/portas materializados.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <div key={group.splitter.id} className="grid gap-2">
          <div className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
            <Waypoints className="h-3.5 w-3.5 shrink-0" />
            {group.splitter.label}
          </div>
          {group.ports.length ? (
            <div className="grid gap-2">
              {group.ports.map((port) => (
                <button
                  key={port.id}
                  type="button"
                  onClick={() => onOpenPort(port)}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon
                    resource={{
                      resourceType: port.resourceType ?? '',
                      status: port.status,
                      name: port.label,
                      sublabel: port.sublabel,
                    }}
                    variant="badge"
                    size={26}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">
                      {port.label.split('·').pop()?.trim() ?? port.label}
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] leading-snug text-app-muted">
                      {resourceIconFor({
                        resourceType: port.resourceType ?? '',
                        status: port.status,
                        name: port.label,
                        sublabel: port.sublabel,
                      }).label}
                    </span>
                  </span>
                  {port.status ? <StatusBadge status={port.status} /> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[14px] border border-dashed border-app-border p-3 text-[0.82rem] text-app-muted">
              Splitter sem portas materializadas.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
