import { ResourceIcon } from '../../../components/ResourceIcon';
import type { ComponentViewMode } from './componentViewMode';

/**
 * Cabeçalho farol + ícone + nome, reutilizado pela raiz
 * (InternalComponentsView) e por cada container filho (ResourceContainer).
 * Todos os cabeçalhos usam 1 linha compacta no formato "<nome> (<tipo>)".
 */
export function ResourceGraphHeader({
  name,
  resourceType,
  specificationName,
  status,
  indicatorClassName,
  viewMode,
  className = 'mb-2',
}: {
  name: string;
  resourceType?: string;
  specificationName?: string;
  status?: string;
  indicatorClassName: string;
  viewMode: ComponentViewMode;
  className?: string;
}) {
  const specification = specificationName ?? resourceType ?? 'Recurso';

  if (viewMode === 'simplified') {
    return (
      <div
        data-testid="resource-graph-header"
        data-view-mode="simplified"
        className={`${className} flex min-w-0 items-center gap-1.5 rounded-[8px] border border-app-border px-1.5 py-1`}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${indicatorClassName}`} aria-hidden="true" />
        <ResourceIcon resource={{ resourceType: resourceType ?? '', status, name }} variant="glyph" size={16} />
        <div className="min-w-0 flex-1 break-words text-[0.76rem] font-semibold leading-snug text-app-text">
          {name} <span className="font-normal text-app-muted">({specification})</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="resource-graph-header"
      data-view-mode="detailed"
      className={`${className} flex min-w-0 items-center gap-1.5 rounded-[8px] border border-app-border px-1.5 py-1`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${indicatorClassName}`} aria-hidden="true" />
      <ResourceIcon resource={{ resourceType: resourceType ?? '', status, name }} variant="glyph" size={16} />
      <div className="min-w-0 flex-1 break-words text-[0.76rem] font-semibold leading-snug text-app-text">
        {name} <span className="font-normal text-app-muted">({specification})</span>
      </div>
    </div>
  );
}
