import { useRef, useState } from 'react';
import { ResourceIcon } from '../../../components/ResourceIcon';
import { Tooltip } from '../../../components/ui/Tooltip';
import { getResourceVisualState } from './resourceVisualState';
import type { InternalGraphNode } from './useInternalResourceGraph';

/**
 * Tile reduzido para a visão simplificada: ~metade do tamanho do tile
 * detalhado, sem a faixa de rótulo abaixo do ícone. Borda fixa (não varia
 * com o estado) e fundo na cor de status — nome e especificação só aparecem
 * no tooltip ao passar o mouse.
 */
export function ResourceSimplifiedTile({
  node,
  selected,
  onSelect,
}: {
  node: InternalGraphNode;
  selected: boolean;
  onSelect: (node: InternalGraphNode) => void;
}) {
  const visualState = getResourceVisualState(node);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const specification = node.specification?.name ?? node.resourceType;

  return (
    <button
      ref={buttonRef}
      type="button"
      data-graph-node-id={node.id}
      onClick={() => onSelect(node)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${node.name}, ${visualState.label}`}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border border-app-ink transition ${visualState.indicatorClassName} ${
        selected ? 'ring-2 ring-app-accent-border ring-offset-1 ring-offset-white' : ''
      }`}
    >
      <ResourceIcon
        resource={{ resourceType: node.resourceType ?? '', status: node.status, name: node.name }}
        variant="glyph"
        size={12}
      />
      <Tooltip anchorRect={hovered ? buttonRef.current?.getBoundingClientRect() ?? null : null} open={hovered}>
        <div className="truncate text-[0.78rem] font-semibold text-app-text">{node.name}</div>
        {specification ? <div className="truncate text-[0.7rem] text-app-muted">{specification}</div> : null}
      </Tooltip>
    </button>
  );
}
