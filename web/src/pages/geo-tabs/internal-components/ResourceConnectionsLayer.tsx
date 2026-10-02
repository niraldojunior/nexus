import type { ResourceComponentConnection } from '../../../services/resourceApi';
import { routeOrthogonalPath, type GraphRect } from './internalResourceLayout';

export function ResourceConnectionsLayer({
  connections,
  rects,
  contentSize,
  selectedId,
}: {
  connections: ResourceComponentConnection[];
  rects: Map<string, GraphRect>;
  contentSize: { width: number; height: number };
  selectedId: string | null;
}) {
  const ordered = [...connections].sort((left, right) => {
    const leftTouches = left.fromId === selectedId || left.toId === selectedId;
    const rightTouches = right.fromId === selectedId || right.toId === selectedId;
    return Number(leftTouches) - Number(rightTouches);
  });

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0"
      width={contentSize.width}
      height={contentSize.height}
      viewBox={`0 0 ${contentSize.width} ${contentSize.height}`}
    >
      {ordered.map((connection) => {
        const source = rects.get(connection.fromId);
        const target = rects.get(connection.toId);
        if (!source || !target) return null;
        const highlighted = connection.fromId === selectedId || connection.toId === selectedId;
        const path = routeOrthogonalPath(source, target);
        return (
          <g key={`${connection.relationshipType}:${connection.fromId}:${connection.toId}`}>
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={highlighted ? 2 : 1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={highlighted ? 'text-app-accent' : 'text-app-border'}
              opacity={selectedId ? (highlighted ? 1 : 0.15) : 0.6}
            />
          </g>
        );
      })}
    </svg>
  );
}
