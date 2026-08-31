import { useEffect, useRef, useState } from 'react';
import {
  Boxes,
  ChevronLeft,
  History as HistoryIcon,
  Info as InfoIcon,
  Layers3,
  Loader2,
  Waypoints,
  X,
} from 'lucide-react';
import { useResourceDetail } from '../../hooks/useResourceDetail';
import { useResourceChildren } from '../../hooks/useResourceChildren';
import { usePortDetail } from '../../hooks/usePortDetail';
import { usePortService } from '../../hooks/usePortService';
import { fetchTreeNode, treeNodeRoute, type GeoTreeNode } from '../../services/geoTreeApi';
import type { PortDropPreview } from '../../utils/dropSimulation';
import { resourceIconFor } from '../../utils/resourceIcon';
import { ResourceIcon } from '../../components/ResourceIcon';
import { streetViewTargetsForGeometry } from '../../utils/streetViewTargets';
import { resourceStreetViewMarker } from '../../utils/streetViewMarker';
import type { StreetViewMarker } from '../../utils/streetViewPanorama';
import {
  BottomSheet,
  useSheetSnapCommand,
  type BottomSheetSnapState,
} from '../../components/BottomSheet';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import { StreetViewHero } from '../../components/StreetViewHero';
import { DOCK_WIDTH_CLASS, DOCK_ELEVATION_CLASS } from './dock';
import { PanelBarButton } from './PanelBarButton';
import { CoordinateStreetView } from './CoordinateStreetView';
import { SchematicTab } from './SchematicTab';
import { ResourceOverviewTab } from './ResourceOverviewTab';
import { ResourceHistoryTab } from './ResourceHistoryTab';
import { ResourcePortsTab } from './ResourcePortsTab';
import { ResourceCoverageTab } from './ResourceCoverageTab';
import { PortOverviewTab } from './PortOverviewTab';
import { PortServiceTab } from './PortServiceTab';
import type { DropSimulation } from './ViabilityTab';

export type ResourcePanelProps = {
  isMobile: boolean;
  node: GeoTreeNode;
  onOpenResource: (resourceId: string) => void;
  // Abre uma Porta no painel empilhado ao lado da CTO (issue #171 Fase 3) — só chamado
  // pela aba "Portas". Sem isto, a aba não é exibida (ver `isCto` abaixo).
  onOpenPort?: (node: GeoTreeNode) => void;
  onBack: () => void;
  onClose: () => void;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  minimizeSignal?: number;
  onDropSimulation: (simulation: DropSimulation | null) => void;
  onPreview: (node: GeoTreeNode | null) => void;
  // Trajeto do drop físico da Porta, desenhado a partir da CTO até o site do cliente
  // (homologação CDOE-02-ICARAI). Canal isolado de `onDropSimulation` — ver dropSimulation.ts.
  onPortDropPreview: (preview: PortDropPreview | null) => void;
};

export function ResourcePanel({
  isMobile,
  node,
  onOpenResource,
  onOpenPort,
  onBack,
  onClose,
  onSnapChange,
  minimizeSignal,
  onDropSimulation,
  onPreview,
  onPortDropPreview,
}: ResourcePanelProps) {
  const { snapCommand } = useSheetSnapCommand(minimizeSignal);
  const resourceId = node.refId ?? node.id.replace(/^resource:/, '');
  const { detail, loading: detailLoading, error: detailError } = useResourceDetail(resourceId);
  const { children, loading: childrenLoading } = useResourceChildren(node);
  const isPort = node.resourceType === 'Port';
  const { detail: portDetail, loading: portDetailLoading, error: portDetailError } = usePortDetail(resourceId, isPort);
  const { service: portService, hasActiveService, loading: portServiceLoading, error: portServiceError } = usePortService(resourceId, isPort);
  const [tab, setTab] = useState<
    'overview' | 'subresources' | 'ports' | 'service' | 'coverage' | 'schematic' | 'history'
  >('overview');
  // CTO ganha aba "Portas" no lugar de "Recursos internos" (issue #171 Fase 3) — quem
  // materializa o splitter/porta contidos é o piloto Niterói/Icaraí; qualquer outro tipo
  // de recurso mantém o comportamento de sempre. Só entra em vigor com `onOpenPort`
  // (o caller decide se sabe empilhar a Porta; sem isso, cai no fallback de sempre).
  const isCto = Boolean(onOpenPort) && node.resourceType === 'CTO';
  const hasPointGeometry = node.geometry?.type === 'Point';
  // ONT alimentada pelo drop ativo — só existe quando a fiação física segue conectada,
  // mesmo em churn (sem RFS/CFS ativos). Entra na lista de "Recursos atendidos" da Porta.
  const activeDropOnt = portDetail?.drops.find((drop) => drop.active)?.ont;

  // Trajeto do drop no mapa (homologação CDOE-02-ICARAI): dispara assim que o detalhe da
  // Porta chega, independente da aba ativa. Mesmo padrão cleanup-safe do SchematicTab
  // (mountedRef + microtask) para sobreviver ao double-mount do StrictMode sem que a
  // limpeza da primeira montagem apague o traçado que a segunda acabou de pedir.
  const onPortDropPreviewRef = useRef(onPortDropPreview);
  onPortDropPreviewRef.current = onPortDropPreview;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onPortDropPreviewRef.current(null);
    };
  }, []);

  useEffect(() => {
    if (!isPort || !portDetail) return;
    const currentDrop = portDetail.drops.find((drop) => drop.active) ?? portDetail.drops[0] ?? null;
    if (!currentDrop) {
      onPortDropPreviewRef.current(null);
      return;
    }
    let cancelled = false;
    void fetchTreeNode(`resource:${currentDrop.resource.id}`)
      .then((dropNode) => {
        if (cancelled) return;
        const path = treeNodeRoute(dropNode);
        void Promise.resolve().then(() => {
          if (!mountedRef.current || cancelled) return;
          onPortDropPreviewRef.current(
            path && path.length >= 2
              ? { path, style: currentDrop.active && hasActiveService ? 'active' : 'muted' }
              : null,
          );
        });
      })
      .catch(() => {
        if (!cancelled) onPortDropPreviewRef.current(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isPort, portDetail, hasActiveService]);

  const eyebrow = resourceIconFor({
    resourceType: node.resourceType ?? detail?.specification.resourceType ?? '',
    name: node.label,
    sublabel: node.sublabel,
  }).label;
  const title = node.label;

  const resourcePoint = streetViewTargetsForGeometry(node.geometry)[0]?.point;
  const heroMarker: StreetViewMarker | null = resourcePoint
    ? resourceStreetViewMarker(node, resourcePoint)
    : null;

  const header = (
    <div className="flex items-start gap-2 border-y border-app-border px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Voltar para a hierarquia"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted [overflow-wrap:anywhere]">
          {eyebrow}
        </div>
        <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text [overflow-wrap:anywhere]">
          {title}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Fechar painel de recurso"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const streetViewTargets = streetViewTargetsForGeometry(node.geometry);

  const body = (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1 border-b border-app-border pb-3">
        <PanelBarButton
          icon={InfoIcon}
          label="Visão geral"
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
        />
        {isCto ? (
          <PanelBarButton
            icon={Waypoints}
            label="Portas"
            active={tab === 'ports'}
            onClick={() => setTab('ports')}
          />
        ) : (
          <PanelBarButton
            icon={Boxes}
            label={isPort ? 'Recursos atendidos' : 'Recursos internos'}
            badge={isPort ? (portDetail?.drops.length ?? 0) + (activeDropOnt ? 1 : 0) : children.length}
            active={tab === 'subresources'}
            onClick={() => setTab('subresources')}
          />
        )}
        {isPort && hasActiveService ? (
          <PanelBarButton
            icon={Layers3}
            label="Serviço"
            active={tab === 'service'}
            onClick={() => setTab('service')}
          />
        ) : null}
        {!isPort && hasPointGeometry ? (
          <PanelBarButton
            icon={Layers3}
            label="Cobertura"
            active={tab === 'coverage'}
            onClick={() => setTab('coverage')}
          />
        ) : null}
        {!isPort ? (
          <PanelBarButton
            icon={Waypoints}
            label="Esquemático"
            active={tab === 'schematic'}
            onClick={() => setTab('schematic')}
          />
        ) : null}
        <PanelBarButton
          icon={HistoryIcon}
          label="Histórico"
          active={tab === 'history'}
          onClick={() => setTab('history')}
        />
      </div>

      {tab === 'overview' ? (
        isPort ? (
          portDetail ? (
            <PortOverviewTab detail={portDetail} onOpenResource={onOpenResource} />
          ) : portDetailLoading ? (
            <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Carregando detalhes da porta…
            </div>
          ) : portDetailError ? (
            <div className="rounded-[18px] border border-dashed border-status-red/30 bg-status-red-soft p-4 text-[0.84rem] text-status-red">
              {portDetailError}
            </div>
          ) : null
        ) : detail ? (
          <div className="grid gap-2">
            <ResourceOverviewTab detail={detail} onOpenResource={onOpenResource} />
            {streetViewTargets.length > 0 ? (
              <div className="border-t border-app-border pt-2">
                {streetViewTargets.map((target) => (
                  <div key={`${target.label ?? 'ponto'}:${target.point.join(',')}`} className="py-1">
                    <CoordinateStreetView marker={resourceStreetViewMarker(node, target.point)} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : detailLoading ? (
          <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            Carregando detalhes do recurso…
          </div>
        ) : detailError ? (
          <div className="rounded-[18px] border border-dashed border-status-red/30 bg-status-red-soft p-4 text-[0.84rem] text-status-red">
            {detailError}
          </div>
        ) : null
      ) : null}

      {tab === 'subresources' && isPort ? (
        <div>
          {portDetailLoading ? (
            <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Carregando drops conectados…
            </div>
          ) : portDetail?.drops.length || activeDropOnt ? (
            <div className="grid gap-2">
              {portDetail?.drops.map((drop) => (
                <button
                  key={drop.resource.id}
                  type="button"
                  onClick={() => onOpenResource(drop.resource.id)}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon resource={{ resourceType: drop.resource.resourceType, name: drop.resource.name }} variant="badge" size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">{drop.resource.name}</span>
                    <span className="mt-0.5 block text-[0.75rem] text-app-muted">{drop.active ? 'Conexão atual' : 'Conexão histórica'}</span>
                  </span>
                </button>
              ))}
              {activeDropOnt ? (
                <button
                  key={activeDropOnt.id}
                  type="button"
                  onClick={() => onOpenResource(activeDropOnt.id)}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon resource={{ resourceType: activeDropOnt.resourceType ?? '', name: activeDropOnt.name }} variant="badge" size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">{activeDropOnt.name}</span>
                    <span className="mt-0.5 block text-[0.75rem] text-app-muted">ONT alimentada</span>
                  </span>
                </button>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              Esta porta não possui drops conectados.
            </div>
          )}
        </div>
      ) : null}

      {tab === 'subresources' && !isPort ? (
        <div>
          {childrenLoading ? (
            <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Carregando recursos internos…
            </div>
          ) : children.length ? (
            <div className="grid gap-2">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => (child.refId ? onOpenResource(child.refId) : undefined)}
                  className="flex w-full min-w-0 items-start gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon
                    resource={{
                      resourceType: child.resourceType ?? '',
                      status: child.status,
                      name: child.label,
                      sublabel: child.sublabel,
                    }}
                    variant="badge"
                    size={26}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">
                      {child.label}
                    </span>
                    <span className="mt-0.5 block break-words text-[0.75rem] leading-snug text-app-muted [overflow-wrap:anywhere]">
                      {[
                        resourceIconFor({
                          resourceType: child.resourceType ?? '',
                          status: child.status,
                          name: child.label,
                          sublabel: child.sublabel,
                        }).label,
                        child.detail?.model,
                        child.detail?.serialNumber,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">
                    Abrir
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              Este recurso ainda não possui recursos internos.
            </div>
          )}
        </div>
      ) : null}

      {tab === 'ports' && isCto ? (
        <ResourcePortsTab ctoNode={node} onOpenPort={onOpenPort!} />
      ) : null}

      {tab === 'service' && isPort ? (
        portService ? (
          <PortServiceTab service={portService} />
        ) : portServiceLoading ? (
          <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            Carregando serviço…
          </div>
        ) : portServiceError ? (
          <div className="rounded-[18px] border border-dashed border-status-red/30 bg-status-red-soft p-4 text-[0.84rem] text-status-red">{portServiceError}</div>
        ) : null
      ) : null}

      {tab === 'coverage' && !isPort && hasPointGeometry ? (
        <ResourceCoverageTab resourceId={resourceId} />
      ) : null}

      {tab === 'schematic' ? (
        <SchematicTab nodeId={node.id} onSimulate={onDropSimulation} onPreview={onPreview} />
      ) : null}

      {tab === 'history' ? <ResourceHistoryTab resourceId={resourceId} /> : null}
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} onSnapChange={onSnapChange} snapCommand={snapCommand}>
        {!isPort ? <StreetViewHero marker={heroMarker} /> : null}
        {header}
        <div className="min-w-0 overflow-hidden px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    <div
      className={`${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock`}
    >
      <OverlayScrollArea className="overflow-x-hidden">
        {!isPort ? <StreetViewHero marker={heroMarker} /> : null}
        {header}
        <div className="px-3 py-3">{body}</div>
      </OverlayScrollArea>
    </div>
  );
}
