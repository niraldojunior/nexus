import { AlertCircle, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { useResourceConnections } from '../../hooks/useResourceConnections';
import { ResourceIcon } from '../../components/ResourceIcon';
import { useResourceTypeVisualIdentities } from '../../hooks/useResourceTypeVisualIdentities';
import { resourceIconFor } from '../../utils/resourceIcon';
import type { ResourceConnection } from '../../services/resourceApi';

export type ResourceConnectionsTabProps = {
  resourceId: string;
  /** @deprecated Relações não navegam mais para o painel do recurso relacionado. */
  onOpenResource?: (id: string) => void;
};

const RELATIONSHIP_TYPE_LABELS: Record<string, { outgoing: string; incoming: string }> = {
  mountedOn: { outgoing: 'Montado em', incoming: 'Suporta' },
  supports: { outgoing: 'Suporta', incoming: 'Montado em' },
  fedBy: { outgoing: 'Alimentado por', incoming: 'Alimenta' },
  feeds: { outgoing: 'Alimenta', incoming: 'Alimentado por' },
  serves: { outgoing: 'Atende', incoming: 'Atendido por' },
  servedBy: { outgoing: 'Atendido por', incoming: 'Atende' },
  terminatesOn: { outgoing: 'Termina em', incoming: 'Termina' },
  terminates: { outgoing: 'Termina', incoming: 'Termina em' },
  connectedTo: { outgoing: 'Conectado a', incoming: 'Conectado a' },
};

function formatGroupHeader(relationshipType: string, direction: 'outgoing' | 'incoming'): string {
  const pair = RELATIONSHIP_TYPE_LABELS[relationshipType];
  if (pair) {
    return direction === 'outgoing' ? pair.outgoing : pair.incoming;
  }
  return `${relationshipType} (${direction === 'outgoing' ? 'saída' : 'entrada'})`;
}

export function ResourceConnectionsTab({ resourceId }: ResourceConnectionsTabProps) {
  const { connections, loading, error, reload } = useResourceConnections(resourceId);
  const presentationForResourceType = useResourceTypeVisualIdentities();

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        Carregando conexões…
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-3 rounded-[18px] border border-dashed border-status-red/30 bg-status-red-soft p-4 text-[0.84rem] text-status-red">
        <span className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </span>
        <button
          type="button"
          onClick={reload}
          className="w-fit text-[0.8rem] font-semibold underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!connections.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Este recurso não possui conexões registradas.
      </div>
    );
  }

  // `connectedTo` é simétrica. A mesma aresta pode estar persistida nos dois sentidos e a
  // projeção a encontra como entrada e saída; para a leitura operacional, ela é uma conexão só.
  const uniqueConnections = new Map<string, ResourceConnection>();
  for (const connection of connections) {
    const key =
      connection.relationshipType === 'connectedTo'
        ? `${connection.relationshipType}::${connection.resource.id}`
        : `${connection.relationshipType}::${connection.direction}::${connection.resource.id}`;
    const existing = uniqueConnections.get(key);
    if (!existing || (existing.direction === 'incoming' && connection.direction === 'outgoing')) {
      uniqueConnections.set(key, connection);
    }
  }

  // Agrupa conexões por (relationshipType + direction).
  const grouped = new Map<string, { label: string; direction: 'outgoing' | 'incoming'; items: ResourceConnection[] }>();

  for (const conn of uniqueConnections.values()) {
    const key = `${conn.relationshipType}::${conn.direction}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(conn);
    } else {
      grouped.set(key, {
        label: formatGroupHeader(conn.relationshipType, conn.direction),
        direction: conn.direction,
        items: [conn],
      });
    }
  }

  return (
    <div className="grid gap-4">
      {Array.from(grouped.entries()).map(([key, group]) => (
        <div key={key} className="grid gap-2">
          <div className="flex items-center gap-1.5 text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
            {group.direction === 'outgoing' ? (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-app-accent" />
            ) : (
              <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-app-muted" />
            )}
            <span>{group.label}</span>
            <span className="text-app-muted/70">({group.items.length})</span>
          </div>

          <div className="grid gap-2">
            {group.items.map((conn) => {
              const res = conn.resource;
              const typeInfo = resourceIconFor({
                resourceType: res.resourceType ?? '',
                status: res.status,
                name: res.name,
              });
              const resourceTypeName =
                presentationForResourceType(res.resourceType)?.name ?? typeInfo.label;

              return (
                <div
                  key={`${conn.direction}-${res.id}`}
                  className="flex w-full min-w-0 items-start gap-2.5 rounded-[14px] border border-app-border px-3 py-2"
                >
                  <ResourceIcon
                    resource={{
                      resourceType: res.resourceType ?? '',
                      status: res.status,
                      name: res.name,
                    }}
                    variant="glyph"
                    size={26}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text">
                      {res.name}
                    </span>
                    <span className="mt-0.5 block break-words text-[0.75rem] leading-snug text-app-muted">
                      {resourceTypeName}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
