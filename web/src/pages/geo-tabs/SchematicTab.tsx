import { useEffect, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useResourceSchematic } from '../../hooks/useResourceSchematic';
import { treeNodeRoute, type GeoSchematicHop, type GeoTreeNode } from '../../services/geoTreeApi';
import { formatDropDistance, pathLengthMeters, stitchSchematicPath } from '../../utils/dropSimulation';
import { statusBadgeMeta, siteSpecNameLabel } from '../../utils/geoLabels';
import { siteKindFromSpec, siteKindLabel } from '../../utils/placeLabel';
import { resourceIconFor } from '../../utils/resourceIcon';
import { shortSubstatus } from '../../utils/substatus';
import { NodeIcon } from './HierarchyTreeView';
import type { DropSimulation } from './ViabilityTab';

export type SchematicTabProps = {
  // Recurso selecionado (id completo `resource:<uuid>` — o mesmo que a API de árvore usa).
  nodeId: string;
  // Mesmo canal visual da simulação de drop da aba Viabilidade (pontilhado preto/amarelo
  // animado + câmera enquadrando o traçado, ver GoogleMapPanel/onDropSimulation em
  // GeoPage) — os dois painéis nunca coexistem, então reusar o mesmo estado é seguro e
  // evita duplicar a animação/desenho no mapa.
  onSimulate: (simulation: DropSimulation | null) => void;
  // Clique num salto: mostra o balão de preview em cima do item no mapa — mesmo canal do
  // hover na árvore de Hierarquia (ver handleHover/onHoverNode em GeoPage). Não navega:
  // quem quiser abrir o painel do salto usa o balão ou a própria árvore.
  onPreview: (node: GeoTreeNode | null) => void;
};

const hopStatusLabel = (hop: GeoSchematicHop): string | undefined =>
  hop.node.detail?.substatus ? shortSubstatus(hop.node.detail.substatus) : undefined;

// Tipo do salto para a linha secundária — recurso usa o rótulo do seu ResourceType
// (mesmo ícone/rótulo do mapa); Estação usa o rótulo de Site (categoria/kind), nunca o
// fallback de recurso ("Outro"), que é o que ela caía antes por não ter `resourceType`.
function hopTypeLabel(hop: GeoSchematicHop): string {
  if (hop.role === 'site') {
    const kind = siteKindFromSpec({ category: hop.node.siteCategory, name: hop.node.sublabel });
    return siteSpecNameLabel(hop.node.sublabel) ?? siteKindLabel[kind];
  }
  return resourceIconFor({
    resourceType: hop.node.resourceType ?? '',
    name: hop.node.label,
    sublabel: hop.node.sublabel,
    status: hop.node.status,
  }).label;
}

// Comprimento do próprio cabo (não a soma dos lances) — calculado da geometria que já
// veio hidratada no nó, sem chamada extra: mesma métrica que `pathLengthMeters` usa para
// o traçado costurado inteiro, aplicada só ao trecho deste salto.
function hopCableLength(hop: GeoSchematicHop): number | null {
  if (hop.role !== 'cable') return null;
  const route = treeNodeRoute(hop.node);
  if (!route || route.length < 2) return null;
  return pathLengthMeters(route);
}

/**
 * Aba "Esquemático" do painel de Recurso: o "traceroute" da fibra do equipamento
 * selecionado até a Estação — cada salto numerado (equipamento, cabo, equipamento…),
 * terminando na Estação. Mesmo grafo que `migrate-netwin-osp.ts` grava
 * (`GeoTreeService.schematicPath`).
 *
 * Mesmo padrão de limpeza on-unmount e disparo por microtask do ViabilityTab: o
 * StrictMode monta duas vezes, e a limpeza da primeira montagem não pode apagar o
 * traçado que a segunda acabou de desenhar.
 */
export function SchematicTab({ nodeId, onSimulate, onPreview }: SchematicTabProps) {
  const { status, path, error } = useResourceSchematic(nodeId);

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
          <span>
            {path.truncated
              ? `Caminho muito longo — mostrando os primeiros ${path.hops.length} saltos.`
              : 'A caminhada não chegou a uma Estação — cadeia incompleta na origem.'}
          </span>
        </div>
      ) : null}

      <ol className="grid gap-0.5">
        {path.hops.map((hop) => {
          const statusText = hopStatusLabel(hop);
          const cableLength = hopCableLength(hop);
          return (
            <li key={`${hop.index}:${hop.node.id}`}>
              <button
                type="button"
                onClick={() => onPreview(hop.node)}
                className="flex w-full min-w-0 items-start gap-2.5 rounded-[10px] px-2 py-2 text-left transition hover:bg-app-accent-soft"
              >
                <span className="w-5 shrink-0 pt-0.5 text-right text-[0.78rem] font-semibold tabular-nums text-app-muted">
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
                    {hopTypeLabel(hop)}
                    {hop.node.status ? ` · ${statusBadgeMeta(hop.node.status).label}` : null}
                    {statusText ? ` (${statusText})` : null}
                    {cableLength !== null ? ` · ${formatDropDistance(cableLength)}` : null}
                    {hop.spans?.count
                      ? ` · ${hop.spans.count} lance${hop.spans.count > 1 ? 's' : ''}` +
                        (hop.spans.types.length ? ` (${hop.spans.types.join(', ')})` : '')
                      : null}
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
