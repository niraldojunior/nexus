// Aba "Tamanho" do nó selecionado no Studio GEO. Só mexe nas oito faixas de escala: visibilidade
// e `sizePx` (POINT) ou `strokeWidth` (LINE/POLYGON). Cor, opacidade e estilo ficam na aba
// "Ícone & Cor" (ver GeoNodeIconColorTab), e o "Restaurar padrão" daqui preserva aquela aparência.

import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import type {
  StudioGeoEntityNode,
  StudioGeoScaleBandKey,
  StudioGeoVisualConfig,
} from '../../../services/studioGeoApi';
import { SCALE_BANDS, defaultVisualConfigForGeometry } from '../../../utils/studioGeoDefaults';
import { resolveStudioGeoColor } from '../../../utils/studioGeoVisual';
import { STROKE_STYLE_OPTIONS } from './VisualStyleControls';
import { useStudioPointIconPreviewUrl } from '../../../hooks/useStudioPointIconPreviewUrl';

export type GeoNodeSizeTabProps = {
  node: StudioGeoEntityNode;
  visualConfig: StudioGeoVisualConfig;
  canEdit: boolean;
  onChange: (visualConfig: StudioGeoVisualConfig) => void;
};

/** Defaults só das faixas: a aparência configurada na outra aba é preservada. */
export function scaleBandDefaults(
  current: StudioGeoVisualConfig,
  node: StudioGeoEntityNode,
): StudioGeoVisualConfig {
  const defaults = defaultVisualConfigForGeometry(current.geometryKind, node.entity, node.label);
  if (defaults.geometryKind === 'POINT' && current.geometryKind === 'POINT') {
    return { ...current, scaleBands: defaults.scaleBands };
  }
  if (defaults.geometryKind === 'LINE' && current.geometryKind === 'LINE') {
    return { ...current, scaleBands: defaults.scaleBands };
  }
  if (defaults.geometryKind === 'POLYGON' && current.geometryKind === 'POLYGON') {
    return { ...current, scaleBands: defaults.scaleBands };
  }
  return defaults;
}

function VisibilityToggle({
  visible,
  canEdit,
  onToggle,
}: {
  visible: boolean;
  canEdit: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!canEdit}
      aria-pressed={visible}
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[0.74rem] font-semibold transition ${
        visible ? 'bg-status-green-soft text-status-green' : 'bg-black/[0.05] text-app-muted'
      }`}
    >
      {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {visible ? 'Visível' : 'Oculto'}
    </button>
  );
}

function BandCard({
  bandKey,
  label,
  description,
  visible,
  canEdit,
  valueLabel,
  onToggle,
  children,
}: {
  bandKey: StudioGeoScaleBandKey;
  label: string;
  description: string;
  visible: boolean;
  canEdit: boolean;
  valueLabel: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      key={bandKey}
      className={`rounded-[12px] border p-3 transition ${
        visible
          ? 'border-app-border bg-white shadow-sm'
          : 'border-app-border/60 bg-black/[0.02] opacity-75'
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <VisibilityToggle visible={visible} canEdit={canEdit} onToggle={onToggle} />
          <div>
            <span className="text-[0.82rem] font-semibold text-app-text">{label}</span>
            <span className="ml-2 text-[0.72rem] text-app-muted">{description}</span>
          </div>
        </div>
        <span className="font-mono text-[0.78rem] font-semibold text-app-text">{valueLabel}</span>
      </div>
      {visible && children}
    </div>
  );
}

export function GeoNodeSizeTab({ node, visualConfig, canEdit, onChange }: GeoNodeSizeTabProps) {
  const pointConfig = visualConfig.geometryKind === 'POINT' ? visualConfig : null;
  // LINE e POLYGON compartilham exatamente o mesmo editor de faixa (visível + strokeWidth).
  const strokeConfig = visualConfig.geometryKind === 'POINT' ? null : visualConfig;
  const pointColor = pointConfig
    ? resolveStudioGeoColor(pointConfig.color, node.entity.category, null)
    : undefined;
  // O hook precisa rodar incondicionalmente; para LINE/POLYGON ele devolve `undefined`.
  const pointPreviewUrl = useStudioPointIconPreviewUrl(pointConfig ? node : null, 64, {
    ...(pointColor ? { color: pointColor } : {}),
    ...(pointConfig ? { opacity: pointConfig.opacity } : {}),
  });

  const strokeDashArray =
    visualConfig.geometryKind === 'POINT'
      ? 'none'
      : (STROKE_STYLE_OPTIONS.find((option) => option.value === visualConfig.strokeStyle)
          ?.dashArray ?? 'none');
  const strokeColor =
    visualConfig.geometryKind === 'POINT'
      ? undefined
      : resolveStudioGeoColor(visualConfig.stroke, node.entity.category, null);

  const isPolygon = visualConfig.geometryKind === 'POLYGON';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-app-border/60 pb-3">
        <div>
          <h4 className="text-[0.88rem] font-semibold text-app-text">
            {pointConfig
              ? 'Tamanho por escala'
              : isPolygon
                ? 'Espessura da borda por escala'
                : 'Espessura da linha por escala'}
          </h4>
          <p className="text-[0.78rem] text-app-muted">
            {pointConfig
              ? 'Ajuste o tamanho do ícone e a visibilidade em cada faixa de zoom.'
              : 'Ajuste a espessura do traço e a visibilidade em cada faixa de zoom.'}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => onChange(scaleBandDefaults(visualConfig, node))}
            className="flex shrink-0 items-center gap-1.5 rounded-[8px] border border-app-border bg-white px-2.5 py-1.5 text-[0.76rem] font-semibold text-app-text shadow-sm transition hover:border-app-accent-border hover:bg-app-accent-soft active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5 text-app-muted" />
            Restaurar padrão
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {SCALE_BANDS.map((band) => {
          if (pointConfig) {
            const bandConfig = pointConfig.scaleBands[band.key];
            const update = (partial: Partial<typeof bandConfig>) =>
              onChange({
                ...pointConfig,
                scaleBands: {
                  ...pointConfig.scaleBands,
                  [band.key]: { ...bandConfig, ...partial },
                },
              });
            return (
              <BandCard
                key={band.key}
                bandKey={band.key}
                label={band.label}
                description={band.description}
                visible={bandConfig.visible}
                canEdit={canEdit}
                valueLabel={`${bandConfig.sizePx} px`}
                onToggle={() => update({ visible: !bandConfig.visible })}
              >
                <div className="flex items-center gap-4 pt-1">
                  <input
                    type="range"
                    aria-label={`Tamanho em ${band.label}`}
                    min={8}
                    max={64}
                    step={1}
                    disabled={!canEdit}
                    value={bandConfig.sizePx}
                    onChange={(event) => update({ sizePx: Number(event.target.value) })}
                    className="flex-1 cursor-pointer accent-app-accent"
                  />
                  <div
                    className="flex shrink-0 items-center justify-center rounded-[8px] border border-app-border/80 bg-black/[0.02] p-1"
                    style={{
                      width: `${Math.max(36, bandConfig.sizePx + 8)}px`,
                      height: `${Math.max(36, bandConfig.sizePx + 8)}px`,
                    }}
                  >
                    {pointPreviewUrl && (
                      <img
                        src={pointPreviewUrl}
                        alt=""
                        width={bandConfig.sizePx}
                        height={bandConfig.sizePx}
                        className="block max-w-none"
                      />
                    )}
                  </div>
                </div>
              </BandCard>
            );
          }

          if (!strokeConfig) return null;
          const bandConfig = strokeConfig.scaleBands[band.key];
          const update = (partial: Partial<typeof bandConfig>) =>
            onChange({
              ...strokeConfig,
              scaleBands: {
                ...strokeConfig.scaleBands,
                [band.key]: { ...bandConfig, ...partial },
              },
            } as StudioGeoVisualConfig);
          return (
            <BandCard
              key={band.key}
              bandKey={band.key}
              label={band.label}
              description={band.description}
              visible={bandConfig.visible}
              canEdit={canEdit}
              valueLabel={`${bandConfig.strokeWidth} px`}
              onToggle={() => update({ visible: !bandConfig.visible })}
            >
              <div className="flex items-center gap-4 pt-1">
                <input
                  type="range"
                  aria-label={`Espessura em ${band.label}`}
                  min={0.5}
                  max={12}
                  step={0.5}
                  disabled={!canEdit}
                  value={bandConfig.strokeWidth}
                  onChange={(event) => update({ strokeWidth: Number(event.target.value) })}
                  className="flex-1 cursor-pointer accent-app-accent"
                />
                <svg width="72" height="16" className="shrink-0" aria-hidden="true">
                  <line
                    x1="2"
                    y1="8"
                    x2="70"
                    y2="8"
                    stroke={strokeColor}
                    strokeWidth={bandConfig.strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={strokeDashArray}
                  />
                </svg>
              </div>
            </BandCard>
          );
        })}
      </div>
    </div>
  );
}
