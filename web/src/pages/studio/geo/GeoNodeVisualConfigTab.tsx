import { useEffect, useState } from 'react';
import { RotateCcw, Eye, EyeOff } from 'lucide-react';
import type {
  StudioGeoEntityNode,
  StudioGeoPointVisualConfig,
  StudioGeoLineVisualConfig,
  StudioGeoPolygonVisualConfig,
  StudioGeoScaleBandKey,
  StudioGeoVisualConfig,
} from '../../../services/studioGeoApi';
import {
  SCALE_BANDS,
  defaultVisualConfigForEntity,
  defaultVisualConfigForGeometry,
} from '../../../utils/studioGeoDefaults';
import { resourceIconDataUrl, resourceIconFor } from '../../../utils/resourceIcon';
import { siteIconDataUrl, siteIconFor } from '../../../utils/siteIcon';
import { nativeMapIconDataUrl, nativeMapIconForCode } from '../../../utils/nativeMapIcons';
import { getStudioSvgAssetDataUrl } from '../../../services/studioAssetApi';

type SiteIconCode = 'CO' | 'POP' | 'CTO' | 'PI';

const SITE_ICON_CODES = new Set<SiteIconCode>(['CO', 'POP', 'CTO', 'PI']);

const resourceTypeForIconCode = (iconCode: string): string => {
  const code = iconCode.toLowerCase();
  if (code === 'cdoe' || code === 'cdoi') return 'CTO';
  if (code === 'ceo') return 'SpliceClosure';
  if (code === 'dio') return 'DIO';
  if (code === 'pole') return 'Pole';
  if (code === 'tower') return 'Tower';
  if (code === 'olt') return 'OLT';
  if (code === 'splitter') return 'Splitter';
  return iconCode;
};

/** A pré-visualização reutiliza o mesmo SVG que o mapa desenha para o ponto. */
export function canonicalPointIconPreviewUrl(
  node: StudioGeoEntityNode,
  iconCode: string,
  size: number,
): string {
  const nativeIcon = nativeMapIconForCode(iconCode);
  if (nativeIcon) {
    return nativeMapIconDataUrl(nativeIcon, {
      size,
      shape: node.entity.category === 'LOCAL' ? 'squircle' : 'circle',
    });
  }

  if (node.entity.category === 'LOCAL') {
    const code = iconCode.toUpperCase();
    const kind: SiteIconCode = SITE_ICON_CODES.has(code as SiteIconCode)
      ? (code as SiteIconCode)
      : 'CO';
    return siteIconDataUrl(siteIconFor(kind), { size });
  }

  const normalizedCode = resourceTypeForIconCode(iconCode);
  return resourceIconDataUrl(
    resourceIconFor({
      resourceType: normalizedCode,
      name: iconCode.toLowerCase() === 'cdoi' ? 'CDOI' : undefined,
    }),
    { size },
  );
}

export function useStudioPointIconPreviewUrl(
  node: StudioGeoEntityNode | null,
  pointConfig: StudioGeoPointVisualConfig | null,
  size: number,
): string | undefined {
  const [assetUrl, setAssetUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    setAssetUrl(undefined);
    if (!pointConfig?.assetId) {
      return () => {
        active = false;
      };
    }
    void getStudioSvgAssetDataUrl(pointConfig.assetId).then((url) => {
      if (active) setAssetUrl(url);
    });
    return () => {
      active = false;
    };
  }, [pointConfig?.assetId]);

  return (
    assetUrl ??
    (node && pointConfig
      ? canonicalPointIconPreviewUrl(node, pointConfig.iconCode ?? 'CO', size)
      : undefined)
  );
}

export type GeoNodeVisualConfigTabProps = {
  node: StudioGeoEntityNode;
  canEdit: boolean;
  onChange: (updatedVisualConfig: StudioGeoVisualConfig) => void;
};

export function GeoNodeVisualConfigTab({ node, canEdit, onChange }: GeoNodeVisualConfigTabProps) {
  // Catálogos históricos ainda podem não ter `visualConfig`; a inferência só cobre essa leitura.
  const visualConfig: StudioGeoVisualConfig =
    node.visualConfig ?? defaultVisualConfigForEntity(node.entity, node.label);
  const pointPreviewUrl = useStudioPointIconPreviewUrl(
    node,
    visualConfig.geometryKind === 'POINT' ? visualConfig : null,
    64,
  );

  const handleResetToDefault = () => {
    onChange(defaultVisualConfigForGeometry(visualConfig.geometryKind, node.entity, node.label));
  };

  // Renderizadores específicos de geometria
  if (visualConfig.geometryKind === 'POINT') {
    const pointConfig = visualConfig as StudioGeoPointVisualConfig;

    const handleUpdateScaleBand = (
      bandKey: StudioGeoScaleBandKey,
      partial: Partial<{ visible: boolean; sizePx: number }>,
    ) => {
      const current = pointConfig.scaleBands[bandKey] ?? { visible: true, sizePx: 25 };
      const updated: StudioGeoPointVisualConfig = {
        ...pointConfig,
        scaleBands: {
          ...pointConfig.scaleBands,
          [bandKey]: {
            ...current,
            ...partial,
          },
        },
      };
      onChange(updated);
    };

    const currentIconCode = pointConfig.iconCode || 'CO';

    return (
      <div className="space-y-6">
        {/* Cabeçalho da aba com Reset */}
        <div className="flex items-center justify-between border-b border-app-border/60 pb-3">
          <div>
            <h4 className="text-[0.88rem] font-semibold text-app-text">Escalas do Ponto</h4>
            <p className="text-[0.78rem] text-app-muted">
              Configure a visibilidade e o tamanho do ícone por faixa de zoom.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center gap-1.5 rounded-[8px] border border-app-border bg-white px-2.5 py-1.5 text-[0.76rem] font-semibold text-app-text shadow-sm transition hover:bg-app-accent-soft hover:border-app-accent-border active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5 text-app-muted" />
              Restaurar padrão
            </button>
          )}
        </div>

        {/* Faixas de Escala do Mapa */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-[0.82rem] font-semibold text-app-text">
              Comportamento por Escala do Mapa
            </label>
            <span className="text-[0.72rem] text-app-muted">
              Ajuste o tamanho (px) e visibilidade para cada nível de aproximação
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {SCALE_BANDS.map((band) => {
              const bandConfig = pointConfig.scaleBands[band.key] ?? {
                visible: true,
                sizePx: 25,
              };
              const iconPreviewUrl =
                pointPreviewUrl ??
                canonicalPointIconPreviewUrl(node, currentIconCode, bandConfig.sizePx);

              return (
                <div
                  key={band.key}
                  className={`rounded-[12px] border p-3 transition ${
                    bandConfig.visible
                      ? 'border-app-border bg-white shadow-sm'
                      : 'border-app-border/60 bg-black/[0.02] opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          handleUpdateScaleBand(band.key, { visible: !bandConfig.visible })
                        }
                        className={`flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[0.74rem] font-semibold transition ${
                          bandConfig.visible
                            ? 'bg-status-green-soft text-status-green'
                            : 'bg-black/[0.05] text-app-muted'
                        }`}
                      >
                        {bandConfig.visible ? (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Visível
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            Oculto
                          </>
                        )}
                      </button>
                      <div>
                        <span className="text-[0.82rem] font-semibold text-app-text">
                          {band.label}
                        </span>
                        <span className="ml-2 text-[0.72rem] text-app-muted">
                          {band.description}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[0.78rem] font-mono font-semibold text-app-text">
                        {bandConfig.sizePx} px
                      </span>
                    </div>
                  </div>

                  {bandConfig.visible && (
                    <div className="flex items-center gap-4 pt-1">
                      <input
                        type="range"
                        min={8}
                        max={64}
                        step={1}
                        disabled={!canEdit}
                        value={bandConfig.sizePx}
                        onChange={(e) =>
                          handleUpdateScaleBand(band.key, { sizePx: Number(e.target.value) })
                        }
                        className="flex-1 accent-app-accent cursor-pointer"
                      />

                      {/* Preview em tamanho real */}
                      <div
                        className="flex items-center justify-center rounded-[8px] border border-app-border/80 bg-black/[0.02] p-1 shrink-0"
                        style={{
                          width: `${Math.max(36, bandConfig.sizePx + 8)}px`,
                          height: `${Math.max(36, bandConfig.sizePx + 8)}px`,
                        }}
                      >
                        <img
                          src={iconPreviewUrl}
                          alt={`Pré-visualização de ${currentIconCode}`}
                          width={bandConfig.sizePx}
                          height={bandConfig.sizePx}
                          className="block max-w-none"
                          title={`${bandConfig.sizePx}px preview`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (visualConfig.geometryKind === 'LINE') {
    const lineConfig = visualConfig as StudioGeoLineVisualConfig;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-app-border/60 pb-3">
          <div>
            <h4 className="text-[0.88rem] font-semibold text-app-text">
              Estilo da Geometria Linear
            </h4>
            <p className="text-[0.78rem] text-app-muted">
              Configure cor de traço, espessura e estilo da linha (cabos e dutos).
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center gap-1.5 rounded-[8px] border border-app-border bg-white px-2.5 py-1.5 text-[0.76rem] font-semibold text-app-text shadow-sm transition hover:bg-app-accent-soft hover:border-app-accent-border active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5 text-app-muted" />
              Restaurar padrão
            </button>
          )}
        </div>

        <div className="rounded-[12px] border border-app-border bg-white p-4 space-y-4 shadow-sm">
          {/* Cor do Traço */}
          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Cor do Traço
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                disabled={!canEdit}
                value={lineConfig.strokeColor}
                onChange={(e) => onChange({ ...lineConfig, strokeColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-[8px] border border-app-border p-0.5"
              />
              <input
                type="text"
                disabled={!canEdit}
                value={lineConfig.strokeColor}
                onChange={(e) => onChange({ ...lineConfig, strokeColor: e.target.value })}
                className="w-32 rounded-[8px] border border-app-border px-3 py-1.5 text-[0.84rem] font-mono text-app-text"
              />
            </div>
          </div>

          {/* Espessura */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[0.8rem] font-semibold text-app-text">
                Espessura da Linha (px)
              </label>
              <span className="text-[0.78rem] font-mono font-semibold text-app-text">
                {lineConfig.strokeWidth} px
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              disabled={!canEdit}
              value={lineConfig.strokeWidth}
              onChange={(e) => onChange({ ...lineConfig, strokeWidth: Number(e.target.value) })}
              className="w-full accent-app-accent cursor-pointer"
            />
          </div>

          {/* Estilo do Traço */}
          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Estilo da Linha
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onChange({ ...lineConfig, strokeStyle: style })}
                  className={`flex items-center justify-center rounded-[8px] border p-2 text-[0.8rem] font-medium transition ${
                    lineConfig.strokeStyle === style
                      ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                      : 'border-app-border hover:bg-black/[0.02] text-app-muted'
                  }`}
                >
                  {style === 'solid' ? 'Sólida' : style === 'dashed' ? 'Tracejada' : 'Pontilhada'}
                </button>
              ))}
            </div>
          </div>

          {/* Preview da Linha */}
          <div className="rounded-[10px] border border-app-border/80 bg-black/[0.02] p-4 text-center">
            <span className="block text-[0.72rem] text-app-muted mb-2">
              Pré-visualização do Traço
            </span>
            <div className="flex items-center justify-center h-8">
              <svg width="200" height="12">
                <line
                  x1="0"
                  y1="6"
                  x2="200"
                  y2="6"
                  stroke={lineConfig.strokeColor}
                  strokeWidth={lineConfig.strokeWidth}
                  strokeDasharray={
                    lineConfig.strokeStyle === 'dashed'
                      ? '8 4'
                      : lineConfig.strokeStyle === 'dotted'
                        ? '3 3'
                        : 'none'
                  }
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Polígono / Cobertura
  const polygonConfig = visualConfig as StudioGeoPolygonVisualConfig;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-app-border/60 pb-3">
        <div>
          <h4 className="text-[0.88rem] font-semibold text-app-text">
            Estilo do Polígono & Cobertura
          </h4>
          <p className="text-[0.78rem] text-app-muted">
            Configure cores de borda, preenchimento e opacidade.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 rounded-[8px] border border-app-border bg-white px-2.5 py-1.5 text-[0.76rem] font-semibold text-app-text shadow-sm transition hover:bg-app-accent-soft hover:border-app-accent-border active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5 text-app-muted" />
            Restaurar padrão
          </button>
        )}
      </div>

      <div className="rounded-[12px] border border-app-border bg-white p-4 space-y-4 shadow-sm">
        {/* Cor da Borda */}
        <div>
          <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
            Cor da Borda
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              disabled={!canEdit}
              value={polygonConfig.strokeColor}
              onChange={(e) => onChange({ ...polygonConfig, strokeColor: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-[8px] border border-app-border p-0.5"
            />
            <input
              type="text"
              disabled={!canEdit}
              value={polygonConfig.strokeColor}
              onChange={(e) => onChange({ ...polygonConfig, strokeColor: e.target.value })}
              className="w-32 rounded-[8px] border border-app-border px-3 py-1.5 text-[0.84rem] font-mono text-app-text"
            />
          </div>
        </div>

        {/* Cor de Preenchimento */}
        <div>
          <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
            Cor de Preenchimento
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              disabled={!canEdit}
              value={polygonConfig.fillColor}
              onChange={(e) => onChange({ ...polygonConfig, fillColor: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-[8px] border border-app-border p-0.5"
            />
            <input
              type="text"
              disabled={!canEdit}
              value={polygonConfig.fillColor}
              onChange={(e) => onChange({ ...polygonConfig, fillColor: e.target.value })}
              className="w-32 rounded-[8px] border border-app-border px-3 py-1.5 text-[0.84rem] font-mono text-app-text"
            />
          </div>
        </div>

        {/* Opacidade */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[0.8rem] font-semibold text-app-text">
              Opacidade de Preenchimento
            </label>
            <span className="text-[0.78rem] font-mono font-semibold text-app-text">
              {Math.round(polygonConfig.fillOpacity * 100)} %
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            disabled={!canEdit}
            value={polygonConfig.fillOpacity}
            onChange={(e) => onChange({ ...polygonConfig, fillOpacity: Number(e.target.value) })}
            className="w-full accent-app-accent cursor-pointer"
          />
        </div>

        {/* Preview do Polígono */}
        <div className="rounded-[10px] border border-app-border/80 bg-black/[0.02] p-4 text-center">
          <span className="block text-[0.72rem] text-app-muted mb-2">
            Pré-visualização da Cobertura
          </span>
          <div className="flex items-center justify-center">
            <div
              className="h-16 w-32 rounded-[8px]"
              style={{
                borderColor: polygonConfig.strokeColor,
                borderWidth: `${polygonConfig.strokeWidth}px`,
                borderStyle: polygonConfig.strokeStyle,
                backgroundColor: polygonConfig.fillColor,
                opacity: polygonConfig.fillOpacity,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
