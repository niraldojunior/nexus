import { ResourceIcon } from '../../../components/ResourceIcon';
import type { ComponentViewMode } from './componentViewMode';
import { getResourceVisualState } from './resourceVisualState';
import { ResourceSimplifiedTile } from './ResourceSimplifiedTile';
import type { InternalGraphNode } from './useInternalResourceGraph';

export function ResourcePort({
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

  const label =
    node.portInfo?.role === 'FO.O' && node.portInfo.index !== undefined
      ? String(node.portInfo.index).padStart(2, '0')
      : (node.portInfo?.role ?? node.name);
  const visualState = getResourceVisualState(node);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
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
            size={13}
          />
        </span>
      </button>
      <span className="min-w-0 break-words font-mono text-[0.66rem] font-semibold leading-tight text-app-text">
        {label}
      </span>
    </div>
  );
}
