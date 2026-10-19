import { useRef, useState } from 'react';
import type { ResourceComponentConnection, ResourceComponentNode } from '../../../services/resourceApi';
import type { ComponentViewMode } from './componentViewMode';
import { ResourceConnectionsLayer } from './ResourceConnectionsLayer';
import { ResourceContainer } from './ResourceContainer';
import { ResourceGraphHeader } from './ResourceGraphHeader';
import { getResourceVisualState } from './resourceVisualState';
import { useInternalGraphGeometry } from './useInternalGraphGeometry';
import {
  splitGraphChildren,
  useInternalResourceGraph,
  type InternalGraphNode,
} from './useInternalResourceGraph';

const VIEW_MODE_OPTIONS: Array<{ value: ComponentViewMode; label: string }> = [
  { value: 'simplified', label: 'Simplificada' },
  { value: 'detailed', label: 'Detalhada' },
];

export function InternalComponentsView({
  components,
  connections,
  rootResource,
}: {
  components: ResourceComponentNode[];
  connections: ResourceComponentConnection[];
  rootResource: {
    name: string;
    resourceType?: string;
    specificationName?: string;
    status?: string;
    componentCount: number;
  };
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ComponentViewMode>('simplified');
  const hostRef = useRef<HTMLDivElement>(null);
  const zoom = 1;
  const { rootChildren, edges } = useInternalResourceGraph(components, connections);
  const { leaves: rootLeaves, containers: rootContainers } = splitGraphChildren(rootChildren);
  const { rects, contentSize } = useInternalGraphGeometry(hostRef, zoom);
  const interaction = {
    selectedId,
    onSelect: (selected: InternalGraphNode) => setSelectedId(selected.id),
  };
  const rootVisualState = getResourceVisualState({
    id: rootResource.name,
    status: rootResource.status,
  });

  return (
    <div>
      <div className="mb-2 flex">
        <div
          role="group"
          aria-label="Densidade do diagrama"
          className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1"
        >
          {VIEW_MODE_OPTIONS.map((option) => {
            const active = viewMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setViewMode(option.value)}
                className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                  active
                    ? 'bg-app-panel text-app-text font-semibold shadow-sm'
                    : 'text-app-muted hover:text-app-text'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-w-0 max-w-full overflow-x-hidden rounded-[10px] border border-app-border bg-white p-2">
        <section className="min-w-0 max-w-full rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-muted-hover)] p-3">
          <ResourceGraphHeader
            name={rootResource.name}
            resourceType={rootResource.resourceType}
            specificationName={rootResource.specificationName}
            status={rootResource.status}
            indicatorClassName={rootVisualState.indicatorClassName}
            viewMode={viewMode}
            className="mb-1.5"
          />
          <div
            data-testid="internal-components-diagram"
            className="min-w-0 max-w-full overflow-hidden rounded-[8px] border border-[var(--border-strong)] bg-white p-2"
          >
            <div
              className="w-full min-w-0 origin-top-left"
              style={zoom === 1 ? undefined : { transform: `scale(${zoom})` }}
            >
              <div ref={hostRef} data-testid="internal-components-graph-host" className="relative w-full min-w-0">
                <ResourceConnectionsLayer
                  connections={edges}
                  rects={rects}
                  contentSize={contentSize}
                  selectedId={selectedId}
                />
                <div className="relative">
                  {rootLeaves.length ? (
                    <div data-testid="root-component-leaves" className="flex flex-wrap gap-1.5">
                      {rootLeaves.map((node) => (
                        <ResourceContainer key={node.id} node={node} interaction={interaction} viewMode={viewMode} />
                      ))}
                    </div>
                  ) : null}
                  {rootContainers.length ? (
                    <div
                      data-testid="root-component-containers"
                      className={rootLeaves.length ? 'mt-2 grid grid-cols-[minmax(0,1fr)] gap-2' : 'grid grid-cols-[minmax(0,1fr)] gap-2'}
                    >
                      {rootContainers.map((node) => (
                        <ResourceContainer key={node.id} node={node} interaction={interaction} viewMode={viewMode} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
