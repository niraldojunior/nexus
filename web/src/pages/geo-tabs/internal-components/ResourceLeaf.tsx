import { ResourceIcon } from '../../../components/ResourceIcon';
import type { ComponentViewMode } from './componentViewMode';
import { getResourceVisualState } from './resourceVisualState';
import { ResourceSimplifiedTile } from './ResourceSimplifiedTile';
import type { InternalGraphNode } from './useInternalResourceGraph';

export function ResourceLeaf({
  node,
  selected,
  onSelect,
  viewMode = 'detailed',
}: {
  node: InternalGraphNode;
  selected: boolean;
  onSelect: (node: InternalGraphNode) => void;
  viewMode?: ComponentViewMode;
}) {
  if (viewMode === 'simplified') {
    return <ResourceSimplifiedTile node={node} selected={selected} onSelect={onSelect} />;
  }

  const visualState = getResourceVisualState(node);

  return (
    <div className="flex w-12 min-w-0 flex-col items-center gap-1">
      <button
        type="button"
        data-graph-node-id={node.id}
        onClick={() => onSelect(node)}
        aria-label={`${node.name}, ${visualState.label}`}
        className={`flex h-9 w-9 items-center justify-center rounded-[6px] border transition ${visualState.surfaceClassName} ${visualState.borderClassName} ${visualState.borderStyleClassName} ${
          selected ? 'ring-2 ring-app-accent-border ring-offset-1 ring-offset-white' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 items-center justify-center rounded-[5px] ${visualState.indicatorClassName}`}
        >
          <ResourceIcon
            resource={{ resourceType: node.resourceType ?? '', status: node.status, name: node.name }}
            variant="glyph"
            size={16}
          />
        </span>
      </button>
      <span className="w-full truncate text-center text-[0.66rem] font-medium leading-none text-app-text">
        {node.name}
      </span>
    </div>
  );
}
