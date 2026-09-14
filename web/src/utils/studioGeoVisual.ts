import type {
  StudioGeoColorRule,
  StudioGeoEntityCategory,
  StudioGeoEntityReference,
  StudioGeoLineVisualConfig,
  StudioGeoPointVisualConfig,
  StudioGeoPolygonVisualConfig,
  StudioGeoScaleBandKey,
  StudioGeoStrokeStyle,
  StudioGeoVisualConfig,
} from '../services/studioGeoApi';
import {
  defaultVisualConfigForGeometry,
  resolveScaleBandKey,
  studioGeoStatusOptions,
} from './studioGeoDefaults';

type LegacyColorConfig = {
  strokeColor?: unknown;
  strokeWidth?: unknown;
  fillColor?: unknown;
};

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const opacity = (value: unknown, fallback: number): number =>
  Math.min(1, Math.max(0, finiteNumber(value, fallback)));

const colorRule = (value: unknown, fallback: StudioGeoColorRule): StudioGeoColorRule => {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<StudioGeoColorRule>;
  const statusColors =
    candidate.statusColors && typeof candidate.statusColors === 'object'
      ? Object.fromEntries(
          Object.entries(candidate.statusColors).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : fallback.statusColors;
  return {
    mode: candidate.mode === 'status' ? 'status' : 'fixed',
    defaultColor:
      typeof candidate.defaultColor === 'string' ? candidate.defaultColor : fallback.defaultColor,
    statusColors: { ...fallback.statusColors, ...statusColors },
  };
};

const strokeStyle = (
  value: unknown,
  fallback: StudioGeoStrokeStyle,
): StudioGeoStrokeStyle =>
  value === 'solid' ||
  value === 'dashed' ||
  value === 'dotted' ||
  value === 'animated-dotted'
    ? value
    : fallback;

export function normalizeStudioGeoVisualConfig(
  value: unknown,
  reference: StudioGeoEntityReference,
  label?: string,
  geometryKind?: StudioGeoVisualConfig['geometryKind'],
): StudioGeoVisualConfig {
  const candidate = (value && typeof value === 'object' ? value : {}) as LegacyColorConfig & {
    geometryKind?: unknown;
    assetId?: unknown;
    iconCode?: unknown;
    color?: unknown;
    stroke?: unknown;
    strokeStyle?: unknown;
    strokeOpacity?: unknown;
    opacity?: unknown;
    fill?: unknown;
    fillOpacity?: unknown;
    scaleBands?: Record<string, Record<string, unknown>>;
  };
  const kind =
    candidate.geometryKind === 'POINT' ||
    candidate.geometryKind === 'LINE' ||
    candidate.geometryKind === 'POLYGON'
      ? candidate.geometryKind
      : (geometryKind ?? 'POINT');
  const defaults = defaultVisualConfigForGeometry(kind, reference, label);

  if (kind === 'POINT' && defaults.geometryKind === 'POINT') {
    const scaleBands = Object.fromEntries(
      Object.entries(defaults.scaleBands).map(([key, fallback]) => {
        const band = candidate.scaleBands?.[key];
        return [
          key,
          {
            visible: typeof band?.visible === 'boolean' ? band.visible : fallback.visible,
            sizePx: finiteNumber(band?.sizePx, fallback.sizePx),
          },
        ];
      }),
    ) as StudioGeoPointVisualConfig['scaleBands'];
    return {
      geometryKind: 'POINT',
      ...(typeof candidate.assetId === 'string' ? { assetId: candidate.assetId } : {}),
      ...(typeof candidate.iconCode === 'string'
        ? { iconCode: candidate.iconCode }
        : defaults.iconCode
          ? { iconCode: defaults.iconCode }
          : {}),
      color: colorRule(candidate.color, defaults.color),
      opacity: opacity(candidate.opacity, defaults.opacity),
      scaleBands,
    };
  }

  if (kind === 'LINE' && defaults.geometryKind === 'LINE') {
    const legacyWidth = finiteNumber(candidate.strokeWidth, defaults.scaleBands.le5m.strokeWidth);
    const scaleBands = Object.fromEntries(
      Object.entries(defaults.scaleBands).map(([key, fallback]) => {
        const band = candidate.scaleBands?.[key];
        return [
          key,
          {
            visible: typeof band?.visible === 'boolean' ? band.visible : fallback.visible,
            strokeWidth: finiteNumber(band?.strokeWidth, legacyWidth),
          },
        ];
      }),
    ) as StudioGeoLineVisualConfig['scaleBands'];
    const legacyColor =
      typeof candidate.strokeColor === 'string'
        ? { ...defaults.stroke, defaultColor: candidate.strokeColor }
        : defaults.stroke;
    return {
      geometryKind: 'LINE',
      stroke: colorRule(candidate.stroke, legacyColor),
      strokeStyle: strokeStyle(candidate.strokeStyle, defaults.strokeStyle),
      opacity: opacity(candidate.opacity, defaults.opacity),
      scaleBands,
    };
  }

  const polygonDefaults = defaults as StudioGeoPolygonVisualConfig;
  const legacyWidth = finiteNumber(
    candidate.strokeWidth,
    polygonDefaults.scaleBands.le5m.strokeWidth,
  );
  const scaleBands = Object.fromEntries(
    Object.entries(polygonDefaults.scaleBands).map(([key, fallback]) => {
      const band = candidate.scaleBands?.[key];
      return [
        key,
        {
          visible: typeof band?.visible === 'boolean' ? band.visible : fallback.visible,
          strokeWidth: finiteNumber(band?.strokeWidth, legacyWidth),
        },
      ];
    }),
  ) as StudioGeoPolygonVisualConfig['scaleBands'];
  const legacyStroke =
    typeof candidate.strokeColor === 'string'
      ? { ...polygonDefaults.stroke, defaultColor: candidate.strokeColor }
      : polygonDefaults.stroke;
  const legacyFill =
    typeof candidate.fillColor === 'string'
      ? { ...polygonDefaults.fill, defaultColor: candidate.fillColor }
      : polygonDefaults.fill;
  return {
    geometryKind: 'POLYGON',
    stroke: colorRule(candidate.stroke, legacyStroke),
    strokeStyle: strokeStyle(candidate.strokeStyle, polygonDefaults.strokeStyle),
    strokeOpacity: opacity(candidate.strokeOpacity, polygonDefaults.strokeOpacity),
    fill: colorRule(candidate.fill, legacyFill),
    fillOpacity: opacity(candidate.fillOpacity, polygonDefaults.fillOpacity),
    scaleBands,
  };
}

export function resolveStudioGeoStatus(
  category: StudioGeoEntityCategory,
  status: string | null | undefined,
): string | undefined {
  if (!status) return undefined;
  const options = studioGeoStatusOptions(category);
  return options.find((option) => option.value.toLowerCase() === status.toLowerCase())?.value;
}

export function resolveStudioGeoColor(
  rule: StudioGeoColorRule,
  category: StudioGeoEntityCategory,
  status?: string | null,
): string {
  if (rule.mode !== 'status') return rule.defaultColor;
  const canonicalStatus = resolveStudioGeoStatus(category, status);
  return (canonicalStatus && rule.statusColors[canonicalStatus]) || rule.defaultColor;
}

export type ResolvedStudioGeoPointStyle = {
  geometryKind: 'POINT';
  visible: boolean;
  sizePx: number;
  color: string;
  opacity: number;
  iconCode?: string;
  assetId?: string;
};

export type ResolvedStudioGeoLineStyle = {
  geometryKind: 'LINE';
  visible: boolean;
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: StudioGeoStrokeStyle;
  opacity: number;
};

export type ResolvedStudioGeoPolygonStyle = {
  geometryKind: 'POLYGON';
  visible: boolean;
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: StudioGeoStrokeStyle;
  strokeOpacity: number;
  fillColor: string;
  fillOpacity: number;
};

export type ResolvedStudioGeoStyle =
  | ResolvedStudioGeoPointStyle
  | ResolvedStudioGeoLineStyle
  | ResolvedStudioGeoPolygonStyle;

export function resolveStudioGeoVisualStyle(
  config: StudioGeoVisualConfig,
  category: StudioGeoEntityCategory,
  status: string | null | undefined,
  scaleMeters: number | null | undefined,
): ResolvedStudioGeoStyle {
  const scaleBand: StudioGeoScaleBandKey = resolveScaleBandKey(scaleMeters);
  if (config.geometryKind === 'POINT') {
    const band = config.scaleBands[scaleBand];
    return {
      geometryKind: 'POINT',
      visible: band.visible,
      sizePx: band.sizePx,
      color: resolveStudioGeoColor(config.color, category, status),
      opacity: config.opacity,
      ...(config.iconCode ? { iconCode: config.iconCode } : {}),
      ...(config.assetId ? { assetId: config.assetId } : {}),
    };
  }
  if (config.geometryKind === 'LINE') {
    const band = config.scaleBands[scaleBand];
    return {
      geometryKind: 'LINE',
      visible: band.visible,
      strokeWidth: band.strokeWidth,
      strokeColor: resolveStudioGeoColor(config.stroke, category, status),
      strokeStyle: config.strokeStyle,
      opacity: config.opacity,
    };
  }
  const band = config.scaleBands[scaleBand];
  return {
    geometryKind: 'POLYGON',
    visible: band.visible,
    strokeWidth: band.strokeWidth,
    strokeColor: resolveStudioGeoColor(config.stroke, category, status),
    strokeStyle: config.strokeStyle,
    strokeOpacity: config.strokeOpacity,
    fillColor: resolveStudioGeoColor(config.fill, category, status),
    fillOpacity: config.fillOpacity,
  };
}
