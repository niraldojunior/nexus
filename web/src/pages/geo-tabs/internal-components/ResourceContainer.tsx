import type { ComponentViewMode } from './componentViewMode';
import { getResourceVisualState } from './resourceVisualState';
import { ResourceGraphHeader } from './ResourceGraphHeader';
import { ResourceLeaf } from './ResourceLeaf';
import { ResourcePort } from './ResourcePort';
import type { InternalGraphNode } from './useInternalResourceGraph';

export type ResourceNodeInteraction = {
  selectedId: string | null;
  onSelect: (node: InternalGraphNode) => void;
};

export function ResourceContainer({
  node,
  interaction,
  viewMode = 'detailed',
}: {
  node: InternalGraphNode;
  interaction: ResourceNodeInteraction;
  viewMode?: ComponentViewMode;
}) {
  if (node.children.length === 0) {
    return node.resourceType === 'Port' ? (
      <ResourcePort
        node={node}
        selected={node.id === interaction.selectedId}
        onSelect={interaction.onSelect}
        viewMode={viewMode}
      />
    ) : (
      <ResourceLeaf
        node={node}
        selected={node.id === interaction.selectedId}
        onSelect={interaction.onSelect}
        viewMode={viewMode}
      />
    );
  }

  const leaves = node.children.filter((child) => child.children.length === 0);
  const containers = node.children.filter((child) => child.children.length > 0);
  const visualState = getResourceVisualState(node);
  const simplified = viewMode === 'simplified';

  return (
    <section
      data-graph-node-id={node.id}
      aria-label={`${node.name}, ${visualState.label}`}
      className={`min-w-0 rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-muted-hover)] p-3 transition ${
        node.id === interaction.selectedId ? 'ring-2 ring-app-accent-border/40' : ''
      }`}
    >
      <ResourceGraphHeader
        name={node.name}
        resourceType={node.resourceType}
        specificationName={node.specification?.name}
        status={node.status}
        indicatorClassName={visualState.indicatorClassName}
        viewMode={viewMode}
      />
      {leaves.length ? (
        <div
          className={
            simplified
              ? 'flex flex-wrap gap-1 rounded-[8px] border border-app-border bg-white p-1.5'
              : 'flex flex-wrap gap-1.5 rounded-[8px] border border-app-border bg-white p-2'
          }
        >
          {leaves.map((child) => (
            <ResourceContainer key={child.id} node={child} interaction={interaction} viewMode={viewMode} />
          ))}
        </div>
      ) : null}
      {containers.length ? (
        <div className={leaves.length ? 'mt-2 grid gap-2' : 'grid gap-2'}>
          {containers.map((child) => (
            <ResourceContainer key={child.id} node={child} interaction={interaction} viewMode={viewMode} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
