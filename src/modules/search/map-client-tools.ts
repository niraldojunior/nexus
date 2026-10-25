// Ferramentas que o Copilot usa para pilotar o mapa da Planta Externa. Rodam no navegador: o
// backend só valida a entrada, emite um `client_action` para a UI e devolve o resultado ao modelo.
// Não entram no registro MCP (não são operações de inventário) nem no catálogo cacheado de tools;
// são acrescentadas por requisição apenas quando a conversa acontece no painel do mapa.

import type { LLMToolDefinition } from './domain.js';
import { sanitizeUntrustedLabel } from './copilot-client-context.js';

export const MAP_SHOW_POINTS_LIMIT = 50;
const MAP_LAYER_IDS_LIMIT = 120;
const MIN_SPAN_METERS = 20;
const MAX_SPAN_METERS = 5_000_000;

/** Ids das bases cartográficas selecionáveis na UI (web/src/utils/mapLayers.ts). */
export const MAP_BASE_LAYER_IDS = [
  'roadmap',
  'neutral',
  'terrain',
  'satellite',
  'satellite-pure',
  'blank',
] as const;
export type MapBaseLayerId = (typeof MAP_BASE_LAYER_IDS)[number];

export type MapClientPoint = {
  lat: number;
  lng: number;
  label?: string;
  siteId?: string;
  resourceId?: string;
};

export type MapClientAction =
  | { type: 'focus_place'; siteId?: string; resourceId?: string; label?: string }
  | { type: 'fly_to'; lat: number; lng: number; spanMeters?: number }
  | { type: 'show_points'; points: MapClientPoint[]; fit: boolean }
  | { type: 'set_base_layer'; layerId: MapBaseLayerId }
  | {
      type: 'set_layers';
      mode: 'show' | 'hide' | 'only';
      layerIds: string[];
      groupIds: string[];
      all: boolean;
    }
  | { type: 'clear' };

export type MapClientToolResult =
  { ok: true; [key: string]: unknown } | { ok: false; error: string };

const num: Record<string, unknown> = { type: 'number' };
const str: Record<string, unknown> = { type: 'string' };

export const MAP_CLIENT_TOOLS: LLMToolDefinition[] = [
  {
    name: 'map_focus_place',
    description:
      'Seleciona no mapa um Site (siteId) ou um recurso (resourceId) do inventário, voa até ele e abre o painel de detalhe. Informe exatamente um dos dois ids.',
    inputSchema: {
      type: 'object',
      properties: { siteId: str, resourceId: str },
      additionalProperties: false,
    },
  },
  {
    name: 'map_fly_to',
    description:
      'Move a câmera do mapa para uma coordenada. spanMeters (opcional) é a largura aproximada da área a enquadrar.',
    inputSchema: {
      type: 'object',
      properties: { lat: num, lng: num, spanMeters: num },
      required: ['lat', 'lng'],
      additionalProperties: false,
    },
  },
  {
    name: 'map_show_points',
    description: `Marca até ${MAP_SHOW_POINTS_LIMIT} pontos no mapa numa única chamada. Com fit=true o mapa enquadra todos. Inclua siteId ou resourceId quando o ponto for um item do inventário.`,
    inputSchema: {
      type: 'object',
      properties: {
        points: {
          type: 'array',
          maxItems: MAP_SHOW_POINTS_LIMIT,
          items: {
            type: 'object',
            properties: { lat: num, lng: num, label: str, siteId: str, resourceId: str },
            required: ['lat', 'lng'],
            additionalProperties: false,
          },
        },
        fit: { type: 'boolean' },
      },
      required: ['points'],
      additionalProperties: false,
    },
  },
  {
    name: 'map_set_base_layer',
    description:
      'Troca o fundo (base cartográfica) do mapa. layerId: roadmap = "Mapa", neutral = "Neutro" (fundo limpo e cinza), terrain = "Relevo", satellite = "Satélite", satellite-pure = "Satélite puro", blank = "Branco". Não altera as camadas de rede.',
    inputSchema: {
      type: 'object',
      properties: { layerId: { type: 'string', enum: [...MAP_BASE_LAYER_IDS] } },
      required: ['layerId'],
      additionalProperties: false,
    },
  },
  {
    name: 'map_set_layers',
    description:
      'Liga ou desliga camadas de rede do mapa. mode: show (mostra), hide (oculta) ou only (mostra só as indicadas e oculta as demais). Informe layerIds e/ou groupIds exatamente como listados no contexto, ou all=true para todas as camadas.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['show', 'hide', 'only'] },
        layerIds: { type: 'array', maxItems: MAP_LAYER_IDS_LIMIT, items: str },
        groupIds: { type: 'array', maxItems: MAP_LAYER_IDS_LIMIT, items: str },
        all: { type: 'boolean' },
      },
      required: ['mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'map_clear',
    description: 'Remove do mapa os pontos marcados pelo Copilot.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const MAP_TOOL_NAMES = new Set(MAP_CLIENT_TOOLS.map((tool) => tool.name));

export const isMapClientTool = (name: string): boolean => MAP_TOOL_NAMES.has(name);

const finiteIn = (value: unknown, min: number, max: number): number | undefined => {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : undefined;
};

const inventoryId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Za-z0-9:_.-]{1,80}$/.test(value.trim())
    ? value.trim()
    : undefined;

type Parsed = { action: MapClientAction; note?: string } | { error: string };

/** Valida a entrada de uma ferramenta `map_*` e a converte em ação para o navegador. */
export const parseMapClientToolInput = (name: string, input: Record<string, unknown>): Parsed => {
  switch (name) {
    case 'map_focus_place': {
      const siteId = inventoryId(input.siteId);
      const resourceId = inventoryId(input.resourceId);
      if (!siteId === !resourceId) {
        return { error: 'informe exatamente um entre siteId e resourceId' };
      }
      return {
        action: siteId
          ? { type: 'focus_place', siteId }
          : { type: 'focus_place', resourceId: resourceId as string },
      };
    }
    case 'map_fly_to': {
      const lat = finiteIn(input.lat, -90, 90);
      const lng = finiteIn(input.lng, -180, 180);
      if (lat === undefined || lng === undefined) {
        return { error: 'lat deve estar em [-90, 90] e lng em [-180, 180]' };
      }
      const spanMeters =
        input.spanMeters === undefined
          ? undefined
          : finiteIn(input.spanMeters, MIN_SPAN_METERS, MAX_SPAN_METERS);
      if (input.spanMeters !== undefined && spanMeters === undefined) {
        return { error: `spanMeters deve estar entre ${MIN_SPAN_METERS} e ${MAX_SPAN_METERS}` };
      }
      return {
        action: { type: 'fly_to', lat, lng, ...(spanMeters !== undefined ? { spanMeters } : {}) },
      };
    }
    case 'map_show_points': {
      if (!Array.isArray(input.points) || input.points.length === 0) {
        return { error: 'points deve ser uma lista não vazia' };
      }
      const points: MapClientPoint[] = [];
      let discarded = 0;
      for (const raw of input.points.slice(0, MAP_SHOW_POINTS_LIMIT)) {
        const record = (raw ?? {}) as Record<string, unknown>;
        const lat = finiteIn(record.lat, -90, 90);
        const lng = finiteIn(record.lng, -180, 180);
        if (lat === undefined || lng === undefined) {
          discarded += 1;
          continue;
        }
        const label = sanitizeUntrustedLabel(record.label, 80);
        const siteId = inventoryId(record.siteId);
        const resourceId = siteId ? undefined : inventoryId(record.resourceId);
        points.push({
          lat,
          lng,
          ...(label ? { label } : {}),
          ...(siteId ? { siteId } : {}),
          ...(resourceId ? { resourceId } : {}),
        });
      }
      if (points.length === 0) return { error: 'nenhum ponto com lat/lng válidos' };
      const truncated = Math.max(0, input.points.length - MAP_SHOW_POINTS_LIMIT);
      const notes = [
        discarded > 0 ? `${discarded} ponto(s) descartado(s) por coordenada inválida` : '',
        truncated > 0 ? `${truncated} ponto(s) acima do limite de ${MAP_SHOW_POINTS_LIMIT}` : '',
      ].filter(Boolean);
      return {
        action: { type: 'show_points', points, fit: input.fit !== false },
        ...(notes.length > 0 ? { note: notes.join('; ') } : {}),
      };
    }
    case 'map_set_base_layer': {
      const layerId = MAP_BASE_LAYER_IDS.find((id) => id === input.layerId);
      if (!layerId) return { error: `layerId deve ser um de: ${MAP_BASE_LAYER_IDS.join(', ')}` };
      return { action: { type: 'set_base_layer', layerId } };
    }
    case 'map_set_layers': {
      const mode = input.mode;
      if (mode !== 'show' && mode !== 'hide' && mode !== 'only') {
        return { error: 'mode deve ser show, hide ou only' };
      }
      const ids = (value: unknown): string[] =>
        Array.isArray(value)
          ? value
              .slice(0, MAP_LAYER_IDS_LIMIT)
              .map(inventoryId)
              .filter((id): id is string => id !== undefined)
          : [];
      const layerIds = ids(input.layerIds);
      const groupIds = ids(input.groupIds);
      const all = input.all === true;
      if (!all && layerIds.length === 0 && groupIds.length === 0) {
        return { error: 'informe all=true, layerIds ou groupIds' };
      }
      if (mode === 'only' && all) return { error: 'mode=only não combina com all=true' };
      return { action: { type: 'set_layers', mode, layerIds, groupIds, all } };
    }
    case 'map_clear':
      return { action: { type: 'clear' } };
    default:
      return { error: `ferramenta de mapa desconhecida: ${name}` };
  }
};

export type MapClientToolDeps = {
  /** Resolve o rótulo de um Site/recurso; `undefined` quando o id não existe para o ator. */
  resolvePlace: (
    target: { siteId: string } | { resourceId: string },
  ) => Promise<string | undefined>;
  /** Entrega a ação ao navegador (evento SSE `client_action`). */
  emit: (action: MapClientAction) => void;
};

/**
 * Executa uma ferramenta `map_*`. Nunca lança: entrada inválida ou item inexistente voltam como
 * `{ ok: false, error }` para o modelo corrigir a chamada ou explicar ao usuário.
 */
export const executeMapClientTool = async (
  name: string,
  input: Record<string, unknown>,
  deps: MapClientToolDeps,
): Promise<MapClientToolResult> => {
  const parsed = parseMapClientToolInput(name, input ?? {});
  if ('error' in parsed) return { ok: false, error: parsed.error };
  let action = parsed.action;

  if (action.type === 'focus_place') {
    const target = action.siteId
      ? { siteId: action.siteId }
      : { resourceId: action.resourceId as string };
    let label: string | undefined;
    try {
      label = await deps.resolvePlace(target);
    } catch {
      label = undefined;
    }
    if (label === undefined) {
      return {
        ok: false,
        error: action.siteId ? 'site não encontrado' : 'recurso não encontrado',
      };
    }
    const safeLabel = sanitizeUntrustedLabel(label);
    action = { ...action, ...(safeLabel ? { label: safeLabel } : {}) };
  }

  deps.emit(action);

  switch (action.type) {
    case 'focus_place':
      return { ok: true, focused: action.label ?? action.siteId ?? action.resourceId };
    case 'set_base_layer':
      return { ok: true, baseLayer: action.layerId };
    case 'set_layers':
      return { ok: true, mode: action.mode };
    case 'show_points':
      return {
        ok: true,
        shown: action.points.length,
        ...(parsed.note ? { note: parsed.note } : {}),
      };
    default:
      return { ok: true };
  }
};
