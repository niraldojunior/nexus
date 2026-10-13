/**
 * Dado mestre de controle da sincronização incremental Netwin por onda de UF (issue #348).
 * Uma linha por (tenant, UF): configuração da onda + watermark concluído + estado da execução.
 */
export const NETWIN_UF_SYNC_STATES = [
  'disabled',
  'idle',
  'running',
  'derived_pending',
  'failed',
] as const;

export type NetwinUfSyncState = (typeof NETWIN_UF_SYNC_STATES)[number];

export const DEFAULT_NETWIN_UF_SYNC_OVERLAP_SECONDS = 900;
export const DEFAULT_NETWIN_UF_SYNC_LEASE_SECONDS = 300;

export interface NetwinUfSyncControl {
  id: string;
  tenantId: string;
  ufCode: string;
  enabled: boolean;
  overlapSeconds: number;
  rolloutCompletedAt: string | null;
  /** Relógio do Oracle de origem no fechamento da última janela concluída. */
  lastSuccessSourceAt: string | null;
  lastSuccessScn: string | null;
  lastSuccessAt: string | null;
  state: NetwinUfSyncState;
  runId: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  stage: string | null;
  checkpoint: Record<string, unknown> | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  results: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos editáveis administrativamente — nunca watermark, lease ou estado de execução. */
export interface UpsertNetwinUfSyncControlInput {
  ufCode: string;
  enabled?: boolean;
  overlapSeconds?: number;
}

export interface AcquireNetwinUfSyncLeaseInput {
  runId: string;
  owner: string;
  leaseSeconds?: number;
  now?: Date;
}

export interface NetwinUfSyncWindow {
  /** Exclusivo: `(from, to]` já descontada a sobreposição. */
  from: string;
  to: string;
}

export const normalizeUfCode = (value: string): string => {
  const uf = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error(`UF inválida: "${value}".`);
  return uf;
};

/**
 * Janela fechada pelo relógio da origem: `(lastSuccess - overlap, windowEnd]`. A sobreposição
 * recupera linhas commitadas tardiamente; o reprocessamento é idempotente por diff.
 */
export const computeNetwinUfSyncWindow = (
  control: Pick<NetwinUfSyncControl, 'lastSuccessSourceAt' | 'overlapSeconds'>,
  windowEnd: Date,
): NetwinUfSyncWindow => {
  if (!control.lastSuccessSourceAt) {
    throw new Error('UF sem marco inicial: finalize o rollout (Dia D) antes de sincronizar.');
  }
  const last = new Date(control.lastSuccessSourceAt).getTime();
  if (windowEnd.getTime() < last) {
    throw new Error('Relógio da origem retrocedeu abaixo do último watermark.');
  }
  return {
    from: new Date(last - control.overlapSeconds * 1000).toISOString(),
    to: windowEnd.toISOString(),
  };
};
