/**
 * Rótulos em pt-BR dos três eixos SID/X.731 de PhysicalResource (issue #171).
 * Extraído de `ResourceOverviewTab.tsx`/`ResourceHistoryTab.tsx` — as duas abas
 * mantinham cópias divergentes (`shuttingDown` como "Em Desativação" numa e
 * "Desativando" na outra); a aba Portas seria uma terceira cópia, ponto de não
 * retorno para manter em sincronia. Fonte única a partir daqui.
 */

import type { StatusTone } from './geoLabels';

export const ADMIN_STATE_LABELS: Record<string, string> = {
  unlocked: 'Desbloqueado',
  locked: 'Bloqueado',
  shuttingDown: 'Em Desativação',
};

export const OP_STATE_LABELS: Record<string, string> = {
  enabled: 'Habilitado',
  disabled: 'Desabilitado',
};

export const USAGE_STATE_LABELS: Record<string, string> = {
  idle: 'Ocioso',
  active: 'Em Uso',
  busy: 'Ocupado',
  unknown: 'Desconhecido',
};

// Tom de cor dos mesmos eixos, para o badge colorido do painel de recurso
// (ResourceOverviewTab) — `locked`/`disabled` são os únicos estados realmente
// bloqueantes; `shuttingDown` é transição (âmbar); os demais ficam verdes.
export const ADMIN_STATE_TONE: Record<string, StatusTone> = {
  unlocked: 'green',
  locked: 'red',
  shuttingDown: 'amber',
};

export const OP_STATE_TONE: Record<string, StatusTone> = {
  enabled: 'green',
  disabled: 'red',
};

export const USAGE_STATE_TONE: Record<string, StatusTone> = {
  active: 'green',
  busy: 'amber',
  idle: 'neutral',
  unknown: 'neutral',
};

// Tom de cor a partir do `behavior` do catálogo de status de recurso
// (src/modules/resource/status-catalog.ts) — a projeção que a UI usa para
// colorir sem conhecer cada `code` individualmente.
export const STATUS_BEHAVIOR_TONE: Record<string, StatusTone> = {
  active: 'green',
  planned: 'amber',
  blocked: 'red',
  inactive: 'neutral',
  terminated: 'neutral',
};
