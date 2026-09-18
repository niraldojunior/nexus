// Aba "Cor" do nó selecionado no Studio GEO. Edita apenas a aparência contextual — regras de
// cor, opacidade e estilo de traço. Tamanho, espessura e visibilidade por escala ficam na aba
// "Tamanho" (ver GeoNodeSizeTab), e o "Restaurar padrão" daqui preserva o que aquela aba edita.
// Identidade visual (ícone / glifo / SVG) é governada exclusivamente por ResourceType e GeographicSiteSpecification.

import { RotateCcw } from 'lucide-react';
import type {
  StudioGeoEntityNode,
  StudioGeoLineVisualConfig,
  StudioGeoPointVisualConfig,
  StudioGeoPolygonVisualConfig,
  StudioGeoVisualConfig,
} from '../../../services/studioGeoApi';
import { defaultVisualConfigForGeometry } from '../../../utils/studioGeoDefaults';
import { resolveStudioGeoColor } from '../../../utils/studioGeoVisual';
import { useStudioPointIconPreviewUrl } from '../../../hooks/useStudioPointIconPreviewUrl';
import {
  ColorRuleEditor,
  OpacityField,
  STROKE_STYLE_OPTIONS,
  StrokeStyleField,
} from './VisualStyleControls';

export type GeoNodeColorTabProps = {
  node: StudioGeoEntityNode;
  visualConfig: StudioGeoVisualConfig;
  canEdit: boolean;
  onChange: (visualConfig: StudioGeoVisualConfig) => void;
};

/** Traçado do preview de linha/polígono para o estilo de traço configurado, ou `undefined` (sólido). */
function previewStrokeDashArray(
  strokeStyle: StudioGeoLineVisualConfig['strokeStyle'],
): string | undefined {
  if (strokeStyle === 'dashed') {
    return STROKE_STYLE_OPTIONS.find((option) => option.value === 'dashed')?.dashArray;
  }
  if (strokeStyle === 'dotted' || strokeStyle === 'animated-dotted') {
    return STROKE_STYLE_OPTIONS.find((option) => option.value === 'dotted')?.dashArray;
  }
  return undefined;
}

/**
 * Defaults só da aparência: as faixas de escala do config atual são preservadas, de modo que
 * restaurar aqui não apaga os tamanhos ajustados na outra aba.
 */
export function appearanceDefaults(
  current: StudioGeoVisualConfig,
  node: StudioGeoEntityNode,
): StudioGeoVisualConfig {
  const defaults = defaultVisualConfigForGeometry(current.geometryKind, node.entity, node.label);
  if (defaults.geometryKind === 'POINT' && current.geometryKind === 'POINT') {
    return { ...defaults, scaleBands: current.scaleBands };
  }
  if (defaults.geometryKind === 'LINE' && current.geometryKind === 'LINE') {
    return { ...defaults, scaleBands: current.scaleBands };
  }
  if (defaults.geometryKind === 'POLYGON' && current.geometryKind === 'POLYGON') {
    return { ...defaults, scaleBands: current.scaleBands };
  }
  return defaults;
}

function TabHeader({
  title,
  description,
  canEdit,
  onReset,
}: {
  title: string;
  description: string;
  canEdit: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-app-border/60 pb-3">
      <div>
        <h4 className="text-[0.88rem] font-semibold text-app-text">{title}</h4>
        <p className="text-[0.78rem] text-app-muted">{description}</p>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onReset}
          className="flex shrink-0 items-center gap-1.5 rounded-[8px] border border-app-border bg-white px-2.5 py-1.5 text-[0.76rem] font-semibold text-app-text shadow-sm transition hover:border-app-accent-border hover:bg-app-accent-soft active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5 text-app-muted" />
          Restaurar padrão
        </button>
      )}
    </div>
  );
}

function PointColor({
  node,
  config,
  canEdit,
  onChange,
}: {
  node: StudioGeoEntityNode;
  config: StudioGeoPointVisualConfig;
  canEdit: boolean;
  onChange: (visualConfig: StudioGeoVisualConfig) => void;
}) {
  // A prévia usa a cor efetiva do modo atual: no modo por status, a cor padrão representa o
  // fallback de quem não tem status próprio.
  const previewColor = resolveStudioGeoColor(config.color, node.entity.category, null);
  const previewUrl = useStudioPointIconPreviewUrl(node, 64, {
    color: previewColor,
    opacity: config.opacity,
  });

  return (
    <>
      <div className="flex items-center gap-4 rounded-[12px] border border-app-border bg-white p-3.5 shadow-sm">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] border border-app-border/80 bg-black/[0.02]">
          {previewUrl && (
            <img src={previewUrl} alt="Pré-visualização do ícone do ponto" className="h-12 w-12" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h5 className="text-[0.84rem] font-semibold text-app-text">Identidade visual</h5>
          <p className="text-[0.76rem] text-app-muted">
            O glifo/ícone é governado pelo modelo canônico de Recursos e Locais.
          </p>
        </div>
      </div>

      <ColorRuleEditor
        title="Cor de fundo"
        description="A borda e o glifo permanecem brancos; escolha um fundo com contraste suficiente."
        rule={config.color}
        category={node.entity.category}
        canEdit={canEdit}
        onChange={(color) => onChange({ ...config, color })}
      />

      <div className="rounded-[12px] border border-app-border bg-white p-3.5 shadow-sm">
        <OpacityField
          label="Transparência do ponto"
          value={config.opacity}
          canEdit={canEdit}
          onChange={(opacity) => onChange({ ...config, opacity })}
        />
      </div>
    </>
  );
}

function LineColor({
  node,
  config,
  canEdit,
  onChange,
}: {
  node: StudioGeoEntityNode;
  config: StudioGeoLineVisualConfig;
  canEdit: boolean;
  onChange: (visualConfig: StudioGeoVisualConfig) => void;
}) {
  const previewColor = resolveStudioGeoColor(config.stroke, node.entity.category, null);

  return (
    <>
      <ColorRuleEditor
        title="Cor do traço"
        rule={config.stroke}
        category={node.entity.category}
        canEdit={canEdit}
        onChange={(stroke) => onChange({ ...config, stroke })}
      />

      <div className="space-y-4 rounded-[12px] border border-app-border bg-white p-3.5 shadow-sm">
        <StrokeStyleField
          label="Estilo da linha"
          value={config.strokeStyle}
          color={previewColor}
          canEdit={canEdit}
          onChange={(strokeStyle) => onChange({ ...config, strokeStyle })}
        />
        <OpacityField
          label="Transparência da linha"
          value={config.opacity}
          canEdit={canEdit}
          onChange={(opacity) => onChange({ ...config, opacity })}
        />
        <div className="rounded-[10px] border border-app-border/80 bg-black/[0.02] p-4 text-center">
          <span className="mb-2 block text-[0.72rem] text-app-muted">
            Pré-visualização do traço
          </span>
          <svg width="220" height="10" aria-hidden="true">
            <line
              x1="0"
              y1="5"
              x2="220"
              y2="5"
              stroke={previewColor}
              strokeOpacity={config.opacity}
              strokeWidth={3}
              strokeDasharray={previewStrokeDashArray(config.strokeStyle)}
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </>
  );
}

function PolygonColor({
  node,
  config,
  canEdit,
  onChange,
}: {
  node: StudioGeoEntityNode;
  config: StudioGeoPolygonVisualConfig;
  canEdit: boolean;
  onChange: (visualConfig: StudioGeoVisualConfig) => void;
}) {
  const previewStrokeColor = resolveStudioGeoColor(config.stroke, node.entity.category, null);
  const previewFillColor = resolveStudioGeoColor(config.fill, node.entity.category, null);

  return (
    <>
      <ColorRuleEditor
        title="Cor da borda"
        rule={config.stroke}
        category={node.entity.category}
        canEdit={canEdit}
        onChange={(stroke) => onChange({ ...config, stroke })}
      />

      <div className="space-y-4 rounded-[12px] border border-app-border bg-white p-3.5 shadow-sm">
        <StrokeStyleField
          label="Estilo da borda"
          value={config.strokeStyle}
          color={previewStrokeColor}
          canEdit={canEdit}
          onChange={(strokeStyle) => onChange({ ...config, strokeStyle })}
        />
        <OpacityField
          label="Transparência da borda"
          value={config.strokeOpacity}
          canEdit={canEdit}
          onChange={(strokeOpacity) => onChange({ ...config, strokeOpacity })}
        />
      </div>

      <ColorRuleEditor
        title="Cor do preenchimento"
        rule={config.fill}
        category={node.entity.category}
        canEdit={canEdit}
        onChange={(fill) => onChange({ ...config, fill })}
      />

      <div className="rounded-[12px] border border-app-border bg-white p-3.5 shadow-sm">
        <OpacityField
          label="Transparência do preenchimento"
          value={config.fillOpacity}
          canEdit={canEdit}
          onChange={(fillOpacity) => onChange({ ...config, fillOpacity })}
        />
      </div>

      <div className="rounded-[10px] border border-app-border/80 bg-black/[0.02] p-4 text-center">
        <span className="mb-2 block text-[0.72rem] text-app-muted">
          Pré-visualização do polígono
        </span>
        <svg width="220" height="48" aria-hidden="true" className="mx-auto">
          <polygon
            points="10,38 60,10 160,10 210,38 110,44"
            fill={previewFillColor}
            fillOpacity={config.fillOpacity}
            stroke={previewStrokeColor}
            strokeOpacity={config.strokeOpacity}
            strokeWidth={2}
            strokeDasharray={previewStrokeDashArray(config.strokeStyle)}
          />
        </svg>
      </div>
    </>
  );
}

export function GeoNodeColorTab({
  node,
  visualConfig,
  canEdit,
  onChange,
}: GeoNodeColorTabProps) {
  const handleReset = () => onChange(appearanceDefaults(visualConfig, node));

  return (
    <div className="space-y-4">
      <TabHeader
        title="Cores e estilo"
        description="Configure as cores contextuais, transparência e estilo de traço desta camada no mapa."
        canEdit={canEdit}
        onReset={handleReset}
      />

      {visualConfig.geometryKind === 'POINT' && (
        <PointColor
          node={node}
          config={visualConfig}
          canEdit={canEdit}
          onChange={onChange}
        />
      )}

      {visualConfig.geometryKind === 'LINE' && (
        <LineColor
          node={node}
          config={visualConfig}
          canEdit={canEdit}
          onChange={onChange}
        />
      )}

      {visualConfig.geometryKind === 'POLYGON' && (
        <PolygonColor
          node={node}
          config={visualConfig}
          canEdit={canEdit}
          onChange={onChange}
        />
      )}
    </div>
  );
}

// Manter alias retrocompatível para imports legados
export const GeoNodeIconColorTab = GeoNodeColorTab;
