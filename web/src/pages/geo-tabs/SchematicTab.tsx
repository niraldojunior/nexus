import { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useResourceSchematic } from '../../hooks/useResourceSchematic';
import { useResourceTypeVisualIdentities } from '../../hooks/useResourceTypeVisualIdentities';
import { treeNodeRoute, type GeoSchematicHop, type GeoTreeNode } from '../../services/geoTreeApi';
import { pathLengthMeters, stitchSchematicPath } from '../../utils/dropSimulation';
import { statusBadgeMeta } from '../../utils/geoLabels';
import { siteKindFromSpec, siteKindLabel } from '../../utils/placeLabel';
import { resourceIconFor } from '../../utils/resourceIcon';
import { shortSubstatus } from '../../utils/substatus';
import { NodeIcon } from './HierarchyTreeView';
import type { DropSimulation } from './ViabilityTab';

export type SchematicTabProps = {
  nodeId: string;
  onSimulate: (simulation: DropSimulation | null) => void;
  onPreview: (node: GeoTreeNode | null) => void;
};

const hopStatusLabel = (hop: GeoSchematicHop): string | undefined =>
  hop.node.detail?.substatus ? shortSubstatus(hop.node.detail.substatus) : undefined;

function hopTypeLabel(
  hop: GeoSchematicHop,
  resourceTypeName: (resourceType: string | undefined) => string | undefined,
): string {
  if (hop.role === 'site') {
    const kind = siteKindFromSpec({ category: hop.node.siteCategory, name: hop.node.sublabel });
    return hop.node.sublabel ?? siteKindLabel[kind];
  }
  return (
    resourceTypeName(hop.node.resourceType) ??
    resourceIconFor({
      resourceType: hop.node.resourceType ?? '',
      name: hop.node.label,
      sublabel: hop.node.sublabel,
      status: hop.node.status,
    }).label
  );
}

/** Caminho físico a montante do Resource selecionado até a Estação. */
export function SchematicTab({ nodeId, onSimulate, onPreview }: SchematicTabProps) {
  const { status, path, error } = useResourceSchematic(nodeId);
  const presentationForResourceType = useResourceTypeVisualIdentities();
  const resourceTypeName = (resourceType: string | undefined) =>
    presentationForResourceType(resourceType)?.name;

  const onSimulateRef = useRef(onSimulate);
  onSimulateRef.current = onSimulate;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onSimulateRef.current(null);
    };
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !path) return;
    const cableSegments = path.hops
      .filter((hop) => hop.role === 'cable')
      .map((hop) => treeNodeRoute(hop.node) ?? [])
      .filter((segment) => segment.length > 0);
    const stitched = stitchSchematicPath(cableSegments);
    void Promise.resolve().then(() => {
      if (!mountedRef.current) return;
      onSimulateRef.current(
        stitched.length >= 2
          ? {
              candidateId: nodeId,
              origin: stitched[0],
              path: stitched,
              distanceMeters: pathLengthMeters(stitched),
              approximate: false,
            }
          : null,
      );
    });
  }, [nodeId, status, path]);

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-[0.86rem] text-app-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Traçando o caminho até a Estação...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Não foi possível consultar o esquemático deste recurso. {error}
      </div>
    );
  }

  if (!path || path.hops.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Este recurso não tem caminho a montante registrado.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {!path.reachedSite ? (
        <div className="flex items-start gap-2 rounded-[14px] border border-status-amber/30 bg-status-amber-soft px-3 py-2 text-[0.78rem] leading-snug text-status-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {path.truncated
              ? `Caminho muito longo — mostrando os primeiros ${path.hops.length} saltos.`
              : 'A caminhada não chegou a uma Estação — cadeia incompleta na origem.'}
          </span>
        </div>
      ) : null}

      <ol className="grid gap-0.5">
        {path.hops.map((hop) => {
          const statusText = hopStatusLabel(hop);
          return (
            <li key={`${hop.index}:${hop.node.id}`} className="relative">
              {hop.index < path.hops.length ? (
                <span
                  aria-hidden="true"
                  data-testid="schematic-hop-connector"
                  className="absolute bottom-0 left-[18px] top-8 w-0.5 bg-app-muted"
                />
              ) : null}
              <button
                type="button"
                onClick={() => onPreview(hop.node)}
                className="relative flex w-full min-w-0 items-start gap-2.5 rounded-[10px] px-2 py-2 text-left transition hover:bg-app-accent-soft"
              >
                <span className="relative z-10 flex w-5 shrink-0 justify-center bg-app-panel pt-0.5 text-center text-[0.78rem] font-semibold tabular-nums text-app-muted">
                  {hop.index}
                </span>
                <span className="mt-0.5 shrink-0">
                  <NodeIcon node={hop.node} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[0.85rem] font-medium leading-snug">
                    {hop.node.label}
                  </span>
                  <span className="block break-words text-[0.72rem] leading-snug text-app-muted">
                    {hopTypeLabel(hop, resourceTypeName)}
                    {hop.role === 'site' && hop.node.status
                      ? ` · ${statusBadgeMeta(hop.node.status).label}`
                      : null}
                    {hop.role === 'site' && statusText ? ` (${statusText})` : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
