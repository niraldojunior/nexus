import { AlertCircle, Loader2, Waypoints } from 'lucide-react';
import { useResourcePorts } from '../../hooks/useResourcePorts';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import { resourceIconFor } from '../../utils/resourceIcon';
import { ResourceIcon } from '../../components/ResourceIcon';
import { ResourceStateLights } from './ResourceStateLights';
import { portDropState } from '../../utils/portDropState';

export type ResourcePortsTabProps = {
  ctoNode: GeoTreeNode;
  onOpenPort: (node: GeoTreeNode) => void;
};

/** Portas de splitter da CTO, com ocupação derivada exclusivamente do grafo Resource. */
export function ResourcePortsTab({ ctoNode, onOpenPort }: ResourcePortsTabProps) {
  const { groups, loading, error, reload } = useResourcePorts(ctoNode);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        Carregando portas…
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-3 rounded-[18px] border border-dashed border-status-red/30 bg-status-red-soft p-4 text-[0.84rem] text-status-red">
        <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
        <button type="button" onClick={reload} className="w-fit text-[0.8rem] font-semibold underline">
          Tentar novamente
        </button>
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
            {group.splitter.name}
            {group.splitter.splitRatio ? <span>· {group.splitter.splitRatio}</span> : null}
          </div>
          {group.ports.length ? (
            <div className="grid gap-2">
              {group.ports.map((port) => {
                const dropState = portDropState(port);
                const portNode: GeoTreeNode = {
                  id: `resource:${port.resource.id}`,
                  refId: port.resource.id,
                  kind: 'resource',
                  resourceType: port.resource.resourceType,
                  status: port.resource.status,
                  label: port.resource.name,
                  sublabel: port.role,
                  hasChildren: false,
                };
                return (
                  <button
                    key={port.resource.id}
                    type="button"
                    onClick={() => onOpenPort(portNode)}
                    className="flex w-full min-w-0 items-center gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                  >
                    <ResourceIcon
                      resource={{ resourceType: port.resource.resourceType ?? '', status: port.resource.status, name: port.resource.name }}
                      variant="badge"
                      size={26}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">
                        {port.role === 'FO.O' && port.index !== undefined ? `FO.O.${port.index}` : port.role ?? port.resource.name}
                      </span>
                      <span className="mt-0.5 block text-[0.75rem] leading-snug text-app-muted">
                        {dropState.label ?? resourceIconFor({ resourceType: port.resource.resourceType ?? '', status: port.resource.status, name: port.resource.name }).label}
                      </span>
                    </span>
                    <ResourceStateLights
                      administrativeState={port.resource.administrativeState}
                      operationalState={port.resource.operationalState}
                      usageState={port.resource.usageState}
                      dropDisabled={dropState.hasDisabledDrop}
                    />
                  </button>
                );
              })}
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
