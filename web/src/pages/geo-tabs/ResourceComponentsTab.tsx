import { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
} from 'lucide-react';
import { useResourceComponents } from '../../hooks/useResourceComponents';
import { ResourceIcon } from '../../components/ResourceIcon';
import { ResourceStateLights } from './ResourceStateLights';
import { portDropState } from '../../utils/portDropState';
import { resourceIconFor } from '../../utils/resourceIcon';
import type { GeoTreeNode } from '../../services/geoTreeApi';

export type ResourceComponentsTabProps = {
  resourceId: string;
  onOpenResource: (id: string) => void;
  onOpenPort?: (node: GeoTreeNode) => void;
};

export function ResourceComponentsTab({
  resourceId,
  onOpenResource,
  onOpenPort,
}: ResourceComponentsTabProps) {
  const { components, truncated, loading, error, reload } = useResourceComponents(resourceId);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        Carregando componentes…
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

  if (!components.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Este recurso não possui componentes internos.
      </div>
    );
  }

  // Identifica nós que possuem filhos para exibir chevron de expansão
  const parentIds = new Set<string>();
  for (const node of components) {
    if (node.parentId) {
      parentIds.add(node.parentId);
    }
  }

  // Filtra nós ocultos por colapso de algum ancestral
  const hiddenIds = new Set<string>();
  for (const node of components) {
    if (node.parentId && (collapsedIds.has(node.parentId) || hiddenIds.has(node.parentId))) {
      hiddenIds.add(node.id);
    }
  }

  const visibleNodes = components.filter((node) => !hiddenIds.has(node.id));

  return (
    <div className="grid gap-2">
      {truncated ? (
        <div className="flex items-center gap-2 rounded-[14px] border border-status-amber/30 bg-status-amber-soft p-3 text-[0.82rem] text-status-amber">
          <Info className="h-4 w-4 shrink-0" />
          <span>Árvore de componentes truncada (limite de 2000 nós atingido).</span>
        </div>
      ) : null}

      {visibleNodes.map((node) => {
        const isPort = node.resourceType === 'Port';
        const hasChildren = parentIds.has(node.id);
        const isCollapsed = collapsedIds.has(node.id);
        const indentPadding = Math.max(0, (node.depth - 1) * 16);

        if (isPort && node.portInfo) {
          const dropState = portDropState({
            '@type': 'ResourcePortDetail',
            resource: {
              id: node.id,
              name: node.name,
              '@type': 'PhysicalResource',
              resourceType: 'Port',
              status: 'active',
              administrativeState: 'unlocked',
              operationalState: 'enabled',
              usageState: 'idle',
              resourceSpecificationId: '',
              resourceSpecification: { id: '', '@referredType': 'ResourceSpecification' },
              relatedParty: [],
              characteristic: [],
            },
            derivedUsageState: 'idle',
            hasActiveService: node.portInfo.hasActiveService ?? false,
            drops:
              node.portInfo.activeDropOnt || (node.portInfo.dropCount ?? 0) > 0
                ? [
                    {
                      resource: {
                        id: '',
                        name: '',
                        '@referredType': 'PhysicalResource' as const,
                        resourceType: 'DropCable',
                      },
                      active: (node.portInfo.dropCount ?? 0) > 0,
                      ...(node.portInfo.activeDropOnt
                        ? {
                            ont: {
                              id: node.portInfo.activeDropOnt.id,
                              name: node.portInfo.activeDropOnt.name,
                              '@referredType': 'PhysicalResource',
                              resourceType: node.portInfo.activeDropOnt.resourceType,
                            },
                          }
                        : {}),
                    },
                  ]
                : [],
          });

          const portNode: GeoTreeNode = {
            id: `resource:${node.id}`,
            refId: node.id,
            kind: 'resource',
            resourceType: node.resourceType,
            status: node.status,
            label: node.name,
            sublabel: node.portInfo.role,
            hasChildren: false,
          };

          return (
            <div
              key={node.id}
              style={{ paddingLeft: `${indentPadding}px` }}
              className="flex w-full min-w-0 items-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => (onOpenPort ? onOpenPort(portNode) : onOpenResource(node.id))}
                className="flex flex-1 min-w-0 items-center gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
              >
                <ResourceIcon
                  resource={{
                    resourceType: node.resourceType ?? '',
                    status: node.status,
                    name: node.name,
                  }}
                  variant="badge"
                  size={26}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text">
                    {node.portInfo.role === 'FO.O' && node.portInfo.index !== undefined
                      ? `FO.O.${node.portInfo.index}`
                      : node.portInfo.role ?? node.name}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] leading-snug text-app-muted">
                    {dropState.label ??
                      resourceIconFor({
                        resourceType: node.resourceType ?? '',
                        status: node.status,
                        name: node.name,
                      }).label}
                  </span>
                </span>
                <ResourceStateLights
                  administrativeState={node.portInfo.administrativeState}
                  operationalState={node.portInfo.operationalState}
                  usageState={node.portInfo.usageState}
                  dropDisabled={dropState.hasDisabledDrop}
                />
              </button>
            </div>
          );
        }

        const typeInfo = resourceIconFor({
          resourceType: node.resourceType ?? '',
          status: node.status,
          name: node.name,
        });

        return (
          <div
            key={node.id}
            style={{ paddingLeft: `${indentPadding}px` }}
            className="flex w-full min-w-0 items-center gap-1.5"
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapse(node.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-app-muted hover:bg-app-accent-soft hover:text-app-text"
                title={isCollapsed ? 'Expandir' : 'Recolher'}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            ) : (
              <div className="h-7 w-7 shrink-0" />
            )}

            <button
              type="button"
              onClick={() => onOpenResource(node.id)}
              className="flex flex-1 min-w-0 items-start gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
            >
              <ResourceIcon
                resource={{
                  resourceType: node.resourceType ?? '',
                  status: node.status,
                  name: node.name,
                }}
                variant="badge"
                size={26}
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text">
                  {node.name}
                </span>
                <span className="mt-0.5 block break-words text-[0.75rem] leading-snug text-app-muted">
                  {[typeInfo.label, node.model, node.serialNumber].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">
                Abrir
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
