/**
 * Rótulos em pt-BR dos três eixos SID/X.731 de PhysicalResource (issue #171).
 * Extraído de `ResourceOverviewTab.tsx`/`ResourceHistoryTab.tsx` — as duas abas
 * mantinham cópias divergentes (`shuttingDown` como "Em Desativação" numa e
 * "Desativando" na outra); a aba Portas seria uma terceira cópia, ponto de não
 * retorno para manter em sincronia. Fonte única a partir daqui.
 */

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
