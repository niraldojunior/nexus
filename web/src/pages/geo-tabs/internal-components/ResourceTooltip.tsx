import type { ResourceComponentConnection } from '../../../services/resourceApi';
import { Tooltip } from '../../../components/ui/Tooltip';
import type { InternalGraphNode } from './useInternalResourceGraph';

function valueText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

export function ResourceTooltip({
  node,
  anchorRect,
  nodesById,
  edges,
}: {
  node: InternalGraphNode | null;
  anchorRect: DOMRect | null;
  nodesById: Map<string, InternalGraphNode>;
  edges: ResourceComponentConnection[];
}) {
  if (!node) return null;
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    const text = valueText(value);
    if (text) rows.push({ label, value: text });
  };
  const connectedNames = edges
    .filter((edge) => edge.fromId === node.id || edge.toId === node.id)
    .map((edge) => nodesById.get(edge.fromId === node.id ? edge.toId : edge.fromId)?.name)
    .filter((name): name is string => Boolean(name));

  push('Tipo', node.resourceType);
  push('Status', node.status);
  push('Resource ID', node.id);
  push('Specification', node.specification?.name);
  push('Estado administrativo', node.administrativeState);
  push('Estado operacional', node.operationalState);
  push('Fabricante', node.manufacturer?.name);
  push('Modelo', node.model);
  if (connectedNames.length > 0) push('Conectada a', connectedNames.join(', '));
  for (const characteristic of node.characteristics?.slice(0, 6) ?? []) {
    push(characteristic.name, characteristic.value);
  }

  return (
    <Tooltip anchorRect={anchorRect} open>
      <div className="mb-2 truncate text-[0.82rem] font-semibold text-app-text">{node.name}</div>
      {rows.length ? (
        <dl className="grid gap-1.5">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[auto_1fr] gap-x-2">
              <dt className="text-app-muted">{row.label}</dt>
              <dd className="min-w-0 break-words text-app-text">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Tooltip>
  );
}
