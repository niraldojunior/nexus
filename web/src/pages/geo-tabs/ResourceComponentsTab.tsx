import { AlertCircle, Info } from 'lucide-react';
import type { ResourceComponentConnection, ResourceComponentNode } from '../../services/resourceApi';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import { InternalComponentsView } from './internal-components/InternalComponentsView';

export type ResourceComponentsTabProps = {
  components: ResourceComponentNode[];
  connections: ResourceComponentConnection[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
  rootResource: {
    name: string;
    resourceType?: string;
    specificationName?: string;
    status?: string;
  };
  onOpenPort?: (node: GeoTreeNode) => void;
};

function ComponentsSkeleton() {
  return (
    <div className="animate-pulse rounded-[18px] border border-dashed border-app-border bg-app-panel/40 p-3">
      <div className="h-16 rounded-[14px] border border-app-border bg-white" />
      <div className="ml-4 mt-2 h-10 rounded-[10px] border border-app-border bg-white" />
      <div className="ml-8 mt-2 h-10 rounded-[10px] border border-app-border bg-white" />
    </div>
  );
}

export function ResourceComponentsTab({
  components,
  connections,
  truncated,
  loading,
  error,
  reload,
  rootResource,
}: ResourceComponentsTabProps) {
  if (loading) return <ComponentsSkeleton />;

  if (error) {
    return (
      <div className="grid gap-3 rounded-[18px] border border-dashed border-status-red/30 bg-status-red-soft p-4 text-[0.84rem] text-status-red">
        <span className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Não foi possível carregar a estrutura interna.
        </span>
        <button type="button" onClick={reload} className="w-fit text-[0.8rem] font-semibold underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!components.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Este recurso não possui componentes internos cadastrados.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {truncated ? (
        <div className="flex items-center gap-2 rounded-[14px] border border-status-amber/30 bg-status-amber-soft p-3 text-[0.82rem] text-status-amber">
          <Info className="h-4 w-4 shrink-0" />
          <span>Árvore de componentes truncada (limite de 2000 nós atingido).</span>
        </div>
      ) : null}
      <InternalComponentsView
        components={components}
        connections={connections}
        rootResource={{ ...rootResource, componentCount: components.length }}
      />
    </div>
  );
}
