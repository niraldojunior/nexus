import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Layers, X } from 'lucide-react';
import type { StudioGeoCatalog, StudioGeoEntityNode } from '../../services/studioGeoApi';
import {
  groupVisibility,
  MAP_LAYER_CATALOG_FALLBACK,
  mapLayerTree,
  readStoredExpandedGroups,
  readStoredLayerControlOpen,
  writeStoredExpandedGroups,
  writeStoredLayerControlOpen,
  type MapLayerGroupId,
  type MapLayerId,
  type MapLayerTreeNode,
  type MapLayerVisibility,
} from '../../utils/mapLayers';
import { resolveScaleBandKey, visualGeometryKindOf } from '../../utils/studioGeoDefaults';
import { normalizeStudioGeoVisualConfig, resolveStudioGeoColor } from '../../utils/studioGeoVisual';
import { useStudioPointIconPreviewUrl } from '../../hooks/useStudioPointIconPreviewUrl';
import { STROKE_STYLE_OPTIONS } from '../studio/geo/VisualStyleControls';

export type MapLayerControlProps = {
  catalog?: StudioGeoCatalog;
  layers: MapLayerVisibility;
  onToggleLayer: (id: MapLayerId) => void;
  onToggleGroup: (groupId: MapLayerGroupId) => void;
  onReset: () => void;
  allVisible: boolean;
  scaleMeters?: number | null;
};

// Genérico: qualquer geometria pode ter faixas de escala ocultas no Studio GEO. Quando a
// faixa correspondente está marcada `visible: false` no catálogo publicado, o switch fica
// inibido — sem regra fixa por tipo, origem ou forma.
function disabledHint(node: MapLayerTreeNode, scaleMeters: number | null | undefined): string | null {
  if (node.kind !== 'ENTITY') return null;
  const config = node.visualConfig;
  if (!config) return null;
  if (scaleMeters === undefined || scaleMeters === null) return null;
  const band = config.scaleBands[resolveScaleBandKey(scaleMeters)];
  if (band?.visible !== false) return null;
  return 'Oculto nesta escala — configurado no Studio GEO';
}

// Amostra do visual publicado no Studio GEO para a entidade — substitui os ícones genéricos de
// Local/Recurso/Região por algo que já mostra o que o usuário configurou (ícone/cor do ponto,
// estilo/cor do traço, preenchimento+borda do polígono). O seletor não representa uma instância
// nem um status específico: usa sempre `defaultColor` e a faixa "le20m" como referência de traço.
function LayerEntitySample({ node }: { node: StudioGeoEntityNode }) {
  // O catálogo publicado normalmente já vem íntegro, mas catálogos legados/fallback podem
  // carregar um `visualConfig` parcial (sem `color`/`opacity`) — normalizar aqui evita que o
  // seletor quebre lendo um contrato antigo.
  const config = normalizeStudioGeoVisualConfig(
    node.visualConfig,
    node.entity,
    node.label,
    visualGeometryKindOf(node.visualConfig, node.entity, node.label),
  );
  const pointConfig = config.geometryKind === 'POINT' ? config : null;
  const pointColor = pointConfig
    ? resolveStudioGeoColor(pointConfig.color, node.entity.category, null)
    : undefined;
  // O hook precisa rodar incondicionalmente; para LINE/POLYGON ele devolve `undefined`.
  const previewUrl = useStudioPointIconPreviewUrl(node, pointConfig, 20, {
    ...(pointColor ? { color: pointColor } : {}),
    ...(pointConfig ? { opacity: pointConfig.opacity } : {}),
  });

  if (pointConfig) {
    const color = pointColor as string;
    return previewUrl ? (
      <img src={previewUrl} alt="" className="h-4 w-4 shrink-0" />
    ) : (
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} />
    );
  }

  if (config.geometryKind === 'LINE') {
    const strokeColor = resolveStudioGeoColor(config.stroke, node.entity.category, null);
    const dashArray =
      STROKE_STYLE_OPTIONS.find((option) => option.value === config.strokeStyle)?.dashArray ??
      'none';
    return (
      <svg width="16" height="14" className="shrink-0" aria-hidden="true">
        <line
          x1="1"
          y1="7"
          x2="15"
          y2="7"
          stroke={strokeColor}
          strokeWidth={2}
          strokeOpacity={config.opacity}
          strokeLinecap="round"
          strokeDasharray={dashArray}
        />
      </svg>
    );
  }

  if (config.geometryKind !== 'POLYGON') return null;
  const fillColor = resolveStudioGeoColor(config.fill, node.entity.category, null);
  const strokeColor = resolveStudioGeoColor(config.stroke, node.entity.category, null);
  return (
    <svg width="16" height="16" className="shrink-0" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="3"
        fill={fillColor}
        fillOpacity={config.fillOpacity}
        stroke={strokeColor}
        strokeOpacity={config.strokeOpacity}
        strokeWidth={1.5}
      />
    </svg>
  );
}

function LayerSwitch({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${
        disabled
          ? 'cursor-not-allowed border-app-border bg-app-sidebar opacity-50'
          : checked
            ? 'border-app-accent-border bg-app-accent'
            : 'border-app-border bg-app-sidebar'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

export function MapLayerControl({
  catalog = MAP_LAYER_CATALOG_FALLBACK,
  layers,
  onToggleLayer,
  onToggleGroup,
  onReset,
  allVisible,
  scaleMeters,
}: MapLayerControlProps) {
  const [open, setOpen] = useState(() => readStoredLayerControlOpen(catalog.environmentId, false));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() =>
    readStoredExpandedGroups(catalog),
  );

  const panelId = useId();
  const tree = mapLayerTree(catalog, { pruneEmptyGroups: true });

  const handleSetOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    writeStoredLayerControlOpen(nextOpen, catalog.environmentId);
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleSetOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      writeStoredExpandedGroups(next, catalog.environmentId);
      return next;
    });
  };

  const renderNode = (node: MapLayerTreeNode, depth: number) => {
    if (node.kind === 'ENTITY') {
      const hint = disabledHint(node, scaleMeters);

      return (
        <div
          key={node.id}
          className="flex items-center gap-2 py-1 pl-1"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          title={hint ?? node.hint ?? undefined}
        >
          <LayerEntitySample node={node} />
          <span
            className={`min-w-0 flex-1 truncate text-[0.78rem] ${hint ? 'text-app-muted' : 'text-app-text'}`}
          >
            {node.label}
          </span>
          <LayerSwitch
            checked={layers[node.id] ?? node.defaultVisible}
            label={node.label}
            onChange={() => onToggleLayer(node.id)}
            disabled={hint !== null}
          />
        </div>
      );
    }

    const state = groupVisibility(layers, node.id, catalog);
    const hasMultipleChildren = node.children.length > 1;
    const isExpanded = expandedGroups.has(node.id);

    return (
      <div
        key={node.id}
        className="rounded-[10px] border border-app-border/70 p-2 mb-2 last:mb-0"
        style={{ marginLeft: `${depth * 6}px` }}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleGroupExpand(node.id)}
            aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${node.label}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-app-muted hover:text-app-text"
          >
            {node.children.length > 0 ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4 inline-block" />
            )}
          </button>

          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-app-muted" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-app-muted" />
          )}

          <span
            className="flex-1 truncate text-[0.82rem] font-semibold text-app-text cursor-pointer select-none"
            title={node.hint}
            onClick={() => toggleGroupExpand(node.id)}
          >
            {node.label}
          </span>

          {hasMultipleChildren ? (
            <LayerSwitch
              checked={state !== 'none'}
              label={`Alternar grupo ${node.label}`}
              onChange={() => onToggleGroup(node.id)}
            />
          ) : null}
        </div>

        {isExpanded && node.children.length > 0 && (
          <div
            className={`mt-1.5 flex flex-col gap-1 border-t border-app-border/60 pt-1.5 ${
              !hasMultipleChildren ? 'justify-end' : ''
            }`}
          >
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="absolute right-3 top-[72px] z-30 md:top-3"
      data-testid="map-layer-control"
    >
      {/* Botão Launcher (oculto quando a janela está aberta) */}
      {!open && (
        <button
          type="button"
          aria-label="Camadas do mapa"
          aria-haspopup="dialog"
          aria-expanded={false}
          title="Camadas do mapa"
          onClick={() => handleSetOpen(true)}
          className="relative flex h-10 w-10 items-center justify-center rounded-[10px] border border-app-border bg-white text-app-text shadow-map-control transition-all duration-200 ease-out hover:border-app-accent-border hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent active:scale-95"
        >
          <Layers className="h-5 w-5" aria-hidden="true" />
          {!allVisible ? (
            <span
              aria-hidden="true"
              title="Uma ou mais camadas estão desligadas"
              className="absolute right-1 top-1 h-2 w-2 rounded-full border border-white bg-app-accent"
            />
          ) : null}
        </button>
      )}

      {/* Janela de Camadas (posicionada na altura do botão, persistente, com animação de expansão/fechamento) */}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Camadas do mapa"
          className="relative right-0 top-0 max-h-[calc(100vh-96px)] w-[260px] overflow-y-auto rounded-[14px] border border-app-border bg-white p-2.5 shadow-map-control-lg animate-in fade-in zoom-in-95 duration-200 ease-out"
        >
          <div className="flex items-center justify-between px-1 pb-2 pt-0.5 border-b border-app-border/50 mb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-app-muted" />
              <span className="text-[0.82rem] font-bold text-app-text">Camadas do Mapa</span>
            </div>
            <button
              type="button"
              aria-label="Fechar camadas do mapa"
              onClick={() => handleSetOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-[8px] text-app-muted transition hover:bg-app-accent-soft hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">{tree.map((node) => renderNode(node, 0))}</div>

          {!allVisible ? (
            <button
              type="button"
              onClick={onReset}
              className="mt-2.5 w-full rounded-[10px] border border-app-border/60 bg-black/[0.02] px-2 py-1.5 text-center text-[0.76rem] font-semibold text-app-text transition hover:bg-app-accent-soft hover:border-app-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            >
              Restaurar padrão
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
