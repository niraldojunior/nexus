import type {
  StudioGeoColorRule,
  StudioGeoEntityCategory,
  StudioGeoEntityReference,
  StudioGeoLineVisualConfig,
  StudioGeoPointVisualConfig,
  StudioGeoPolygonVisualConfig,
  StudioGeoScaleBandKey,
  StudioGeoVisualConfig,
} from '../services/studioGeoApi';
import { familyColor, CABLE_STROKE_WEIGHT } from './resourceIcon';

export type ScaleBandOption = {
  key: StudioGeoScaleBandKey;
  label: string;
  maxMeters: number | null;
  description: string;
};

export const STUDIO_GEO_COLOR_PALETTE = [
  '#047857',
  '#10b981',
  '#2563eb',
  '#3b82f6',
  '#7c3aed',
  '#8b5cf6',
  '#b45309',
  '#f59e0b',
  '#dc2626',
  '#ef4444',
  '#334155',
  '#64748b',
] as const;

/**
 * Cor do glifo quando o ícone é exibido sem badge — no catálogo do modal de escolha, onde o
 * fundo colorido ainda não foi decidido e atrapalharia a leitura do desenho.
 */
export const STUDIO_GEO_NEUTRAL_ICON_COLOR = '#334155';

export type StudioGeoStatusOption = { value: string; label: string };

export const RESOURCE_STATUS_OPTIONS: readonly StudioGeoStatusOption[] = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'terminated', label: 'Terminado' },
];

export const LOCAL_STATUS_OPTIONS: readonly StudioGeoStatusOption[] = [
  { value: 'Planned', label: 'Planejado' },
  { value: 'InConstruction', label: 'Em Construção' },
  { value: 'Active', label: 'Ativo' },
  { value: 'InDeactivation', label: 'Em Desativação' },
  { value: 'Retired', label: 'Aposentado' },
];

export function studioGeoStatusOptions(
  category: StudioGeoEntityCategory,
): readonly StudioGeoStatusOption[] {
  return category === 'RESOURCE' ? RESOURCE_STATUS_OPTIONS : LOCAL_STATUS_OPTIONS;
}

export const DEFAULT_STATUS_COLORS: Record<StudioGeoEntityCategory, Record<string, string>> = {
  RESOURCE: {
    active: '#047857',
    inactive: '#64748b',
    suspended: '#ef4444',
    terminated: '#334155',
  },
  LOCAL: {
    Planned: '#f59e0b',
    InConstruction: '#2563eb',
    Active: '#047857',
    InDeactivation: '#ef4444',
    Retired: '#64748b',
  },
  COVERAGE: {
    Planned: '#f59e0b',
    InConstruction: '#2563eb',
    Active: '#047857',
    InDeactivation: '#ef4444',
    Retired: '#64748b',
  },
};

export function defaultColorRule(
  category: StudioGeoEntityCategory,
  defaultColor: string,
): StudioGeoColorRule {
  return {
    mode: 'fixed',
    defaultColor,
    statusColors: { ...DEFAULT_STATUS_COLORS[category] },
  };
}

export const SCALE_BANDS: ScaleBandOption[] = [
  { key: 'le5m', label: 'Até 5 m', maxMeters: 5, description: 'Zoom máximo de campo' },
  { key: 'le10m', label: 'Até 10 m', maxMeters: 10, description: 'Zoom de detalhe da infra' },
  { key: 'le20m', label: 'Até 20 m', maxMeters: 20, description: 'Escala padrão de postes' },
  { key: 'le50m', label: 'Até 50 m', maxMeters: 50, description: 'Escala de quarteirão' },
  { key: 'le100m', label: 'Até 100 m', maxMeters: 100, description: 'Escala de bairro detalhado' },
  { key: 'le500m', label: 'Até 500 m', maxMeters: 500, description: 'Escala de bairro' },
  {
    key: 'le1km',
    label: 'Até 1 km',
    maxMeters: 1000,
    description: 'Escala de distrito / município',
  },
  {
    key: 'gt1km',
    label: 'Acima de 1 km',
    maxMeters: null,
    description: 'Escala estadual e nacional',
  },
];

/**
 * Converte a escala em metros calculada pelo mapa (Google Maps)
 * na chave de faixa de escala configurada no Studio GEO.
 */
export function resolveScaleBandKey(scaleMeters: number | null | undefined): StudioGeoScaleBandKey {
  if (scaleMeters === null || scaleMeters === undefined || scaleMeters <= 5) return 'le5m';
  if (scaleMeters <= 10) return 'le10m';
  if (scaleMeters <= 20) return 'le20m';
  if (scaleMeters <= 50) return 'le50m';
  if (scaleMeters <= 100) return 'le100m';
  if (scaleMeters <= 500) return 'le500m';
  if (scaleMeters <= 1000) return 'le1km';
  return 'gt1km';
}

/**
 * Cria uma configuração padrão para pontos de acordo com a entidade de origem.
 */
export function defaultPointVisualConfig(
  reference: StudioGeoEntityReference,
  label?: string,
): StudioGeoPointVisualConfig {
  const isStation =
    reference.sourceId === 'legacy-stations' ||
    reference.sourceId.toUpperCase() === 'CO' ||
    (label?.toLowerCase().includes('estaç') ?? false);

  const isPole =
    reference.sourceId === 'legacy-pole' ||
    reference.sourceId.toLowerCase().includes('pole') ||
    (label?.toLowerCase().includes('poste') ?? false);

  const isTower =
    reference.sourceId === 'legacy-tower' ||
    reference.sourceId.toLowerCase().includes('tower') ||
    (label?.toLowerCase().includes('torre') ?? false);

  const pointAppearance = {
    color: defaultColorRule(
      reference.category,
      reference.category === 'LOCAL' ? '#8b5cf6' : '#10b981',
    ),
    opacity: 1,
  };

  if (isStation) {
    // Estação: sempre visível em todas as escalas com tamanhos decrescentes
    return {
      geometryKind: 'POINT',
      ...pointAppearance,
      scaleBands: {
        le5m: { visible: true, sizePx: 32 },
        le10m: { visible: true, sizePx: 30 },
        le20m: { visible: true, sizePx: 28 },
        le50m: { visible: true, sizePx: 25 },
        le100m: { visible: true, sizePx: 25 },
        le500m: { visible: true, sizePx: 22 },
        le1km: { visible: true, sizePx: 20 },
        gt1km: { visible: true, sizePx: 16 },
      },
    };
  }

  if (isPole) {
    // Postes: visíveis apenas até 20 m (detalhe)
    return {
      geometryKind: 'POINT',
      ...pointAppearance,
      scaleBands: {
        le5m: { visible: true, sizePx: 22 },
        le10m: { visible: true, sizePx: 20 },
        le20m: { visible: true, sizePx: 18 },
        le50m: { visible: false, sizePx: 16 },
        le100m: { visible: false, sizePx: 14 },
        le500m: { visible: false, sizePx: 12 },
        le1km: { visible: false, sizePx: 10 },
        gt1km: { visible: false, sizePx: 8 },
      },
    };
  }

  if (isTower) {
    // Torres: visíveis até 500 m
    return {
      geometryKind: 'POINT',
      ...pointAppearance,
      scaleBands: {
        le5m: { visible: true, sizePx: 30 },
        le10m: { visible: true, sizePx: 28 },
        le20m: { visible: true, sizePx: 25 },
        le50m: { visible: true, sizePx: 22 },
        le100m: { visible: true, sizePx: 20 },
        le500m: { visible: true, sizePx: 16 },
        le1km: { visible: false, sizePx: 14 },
        gt1km: { visible: false, sizePx: 10 },
      },
    };
  }

  // Padrão de caixas e recursos ópticos pontuais (CDOE, CDOI, CEO, DIO): visíveis até 100m / 500m
  return {
    geometryKind: 'POINT',
    ...pointAppearance,
    scaleBands: {
      le5m: { visible: true, sizePx: 32 },
      le10m: { visible: true, sizePx: 30 },
      le20m: { visible: true, sizePx: 25 },
      le50m: { visible: true, sizePx: 20 },
      le100m: { visible: true, sizePx: 15 },
      le500m: { visible: true, sizePx: 10 },
      le1km: { visible: false, sizePx: 10 },
      gt1km: { visible: false, sizePx: 8 },
    },
  };
}

/**
 * Cria uma configuração padrão para linhas (cabos, dutos).
 */
const visibleAtAllScales = (strokeWidth: number) => ({
  le5m: { visible: true, strokeWidth },
  le10m: { visible: true, strokeWidth },
  le20m: { visible: true, strokeWidth },
  le50m: { visible: true, strokeWidth },
  le100m: { visible: true, strokeWidth },
  le500m: { visible: true, strokeWidth },
  le1km: { visible: true, strokeWidth },
  gt1km: { visible: true, strokeWidth },
});

export function defaultLineVisualConfig(
  reference: StudioGeoEntityReference,
  label?: string,
): StudioGeoLineVisualConfig {
  const isDuct =
    reference.sourceId === 'legacy-duct' ||
    reference.sourceId.toLowerCase().includes('duct') ||
    (label?.toLowerCase().includes('duto') ?? false);

  const isDrop =
    reference.sourceId === 'legacy-drop-cable' ||
    reference.sourceId.toLowerCase().includes('drop') ||
    (label?.toLowerCase().includes('drop') ?? false);

  if (isDuct) {
    return {
      geometryKind: 'LINE',
      stroke: defaultColorRule(reference.category, '#64748b'),
      strokeStyle: 'dashed',
      opacity: 0.85,
      scaleBands: visibleAtAllScales(2),
    };
  }

  if (isDrop) {
    const strokeWidth = CABLE_STROKE_WEIGHT.DropCable ?? 2;
    return {
      geometryKind: 'LINE',
      stroke: defaultColorRule(reference.category, '#475569'),
      strokeStyle: 'solid',
      opacity: 0.9,
      scaleBands: visibleAtAllScales(strokeWidth),
    };
  }

  const strokeWidth = CABLE_STROKE_WEIGHT.DistributionCable ?? 3.5;
  return {
    geometryKind: 'LINE',
    stroke: defaultColorRule(reference.category, familyColor.cableOsp ?? '#334155'),
    strokeStyle: 'solid',
    opacity: 0.95,
    scaleBands: visibleAtAllScales(strokeWidth),
  };
}

/**
 * Cria uma configuração padrão para polígonos (coberturas).
 */
export function defaultPolygonVisualConfig(
  category: StudioGeoEntityCategory = 'COVERAGE',
): StudioGeoPolygonVisualConfig {
  return {
    geometryKind: 'POLYGON',
    stroke: defaultColorRule(category, '#2563eb'),
    strokeStyle: 'solid',
    strokeOpacity: 1,
    fill: defaultColorRule(category, '#3b82f6'),
    fillOpacity: 0.25,
    scaleBands: visibleAtAllScales(1.5),
  };
}

/**
 * Infere a configuração visual padrão apropriada a partir da referência da entidade.
 */
export function defaultVisualConfigForEntity(
  reference: StudioGeoEntityReference,
  label?: string,
): StudioGeoVisualConfig {
  if (
    reference.category === 'COVERAGE' ||
    reference.sourceType === 'SPATIAL_COVERAGE' ||
    reference.sourceType === 'GPON_AGGREGATE'
  ) {
    return defaultPolygonVisualConfig(reference.category);
  }
  if (
    reference.sourceId.includes('cable') ||
    reference.sourceId.includes('duct') ||
    (label && (label.toLowerCase().includes('cabo') || label.toLowerCase().includes('duto')))
  ) {
    return defaultLineVisualConfig(reference, label);
  }
  return defaultPointVisualConfig(reference, label);
}

/**
 * Cria uma configuração íntegra para a geometria escolhida no Studio. A inferência acima
 * continua somente como compatibilidade para catálogos antigos sem `visualConfig`; depois de
 * escolhida, a geometria publicada passa a ser a fonte de verdade do editor e do mapa.
 */
export function defaultVisualConfigForGeometry(
  geometryKind: StudioGeoVisualConfig['geometryKind'],
  reference: StudioGeoEntityReference,
  label?: string,
): StudioGeoVisualConfig {
  if (geometryKind === 'POINT') return defaultPointVisualConfig(reference, label);
  if (geometryKind === 'LINE') return defaultLineVisualConfig(reference, label);
  return defaultPolygonVisualConfig(reference.category);
}

export function visualGeometryKindOf(
  visualConfig: StudioGeoVisualConfig | undefined,
  reference: StudioGeoEntityReference,
  label?: string,
): StudioGeoVisualConfig['geometryKind'] {
  return (visualConfig ?? defaultVisualConfigForEntity(reference, label)).geometryKind;
}
