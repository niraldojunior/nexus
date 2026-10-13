import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import {
  DEFAULT_NETWIN_UF_SYNC_LEASE_SECONDS,
  DEFAULT_NETWIN_UF_SYNC_OVERLAP_SECONDS,
  normalizeUfCode,
  type AcquireNetwinUfSyncLeaseInput,
  type NetwinUfSyncControl,
  type NetwinUfSyncState,
  type UpsertNetwinUfSyncControlInput,
} from './netwin-uf-sync-control-domain.js';

/** Persistência do dado mestre de controle por UF — implementação real em Oracle. */
export interface INetwinUfSyncControlRepository {
  list(tenantId: string): Promise<NetwinUfSyncControl[]>;
  listEnabled(tenantId: string): Promise<NetwinUfSyncControl[]>;
  get(tenantId: string, ufCode: string): Promise<NetwinUfSyncControl | null>;
  /** Cadastra/habilita/desabilita a UF. Nunca toca watermark, lease ou estado de execução. */
  upsertConfiguration(
    tenantId: string,
    input: UpsertNetwinUfSyncControlInput,
  ): Promise<NetwinUfSyncControl>;
  /** Aquisição atômica da lease; retorna null quando outra execução detém a UF. */
  acquireLease(
    tenantId: string,
    ufCode: string,
    input: AcquireNetwinUfSyncLeaseInput,
  ): Promise<NetwinUfSyncControl | null>;
  renewLease(
    tenantId: string,
    ufCode: string,
    runId: string,
    patch?: { stage?: string; checkpoint?: Record<string, unknown> },
    leaseSeconds?: number,
  ): Promise<boolean>;
  setWindow(
    tenantId: string,
    ufCode: string,
    runId: string,
    window: { from: string; to: string },
  ): Promise<boolean>;
  /** Inventário aplicado; aguarda a derivação (mapa/densidade/cobertura). */
  markDerivedPending(
    tenantId: string,
    ufCode: string,
    runId: string,
    results: Record<string, unknown>,
  ): Promise<boolean>;
  /** Conclui a execução e avança o watermark para o fim da janela, de forma atômica. */
  complete(
    tenantId: string,
    ufCode: string,
    runId: string,
    outcome: { sourceAt: string; scn?: string | null; results?: Record<string, unknown> },
  ): Promise<boolean>;
  /** Registra falha sem avançar o watermark. */
  fail(tenantId: string, ufCode: string, runId: string, error: string): Promise<boolean>;
  /** Marco do Dia D: ativa a UF e inicializa o watermark. */
  finalizeRollout(
    tenantId: string,
    ufCode: string,
    marker: { sourceAt: string; scn?: string | null; completedAt?: string },
  ): Promise<NetwinUfSyncControl>;
}

type Row = Record<string, unknown>;

const SELECT = `
  SELECT id, tenant_id AS tenantId, uf_code AS ufCode, enabled, overlap_seconds AS overlapSeconds,
         rollout_completed_at AS rolloutCompletedAt, last_success_source_at AS lastSuccessSourceAt,
         last_success_scn AS lastSuccessScn, last_success_at AS lastSuccessAt, state,
         run_id AS runId, window_from AS windowFrom, window_to AS windowTo, stage,
         metadata, lease_owner AS leaseOwner, lease_expires_at AS leaseExpiresAt,
         heartbeat_at AS heartbeatAt, started_at AS startedAt, finished_at AS finishedAt,
         last_error AS lastError, results, created_at AS createdAt, updated_at AS updatedAt
    FROM environment_netwin_uf_sync_control`;

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
};

const parseJson = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toControl = (row: Row): NetwinUfSyncControl => ({
  id: String(row.id),
  tenantId: String(row.tenantId),
  ufCode: String(row.ufCode),
  enabled: Number(row.enabled) === 1,
  overlapSeconds: Number(row.overlapSeconds),
  rolloutCompletedAt: iso(row.rolloutCompletedAt),
  lastSuccessSourceAt: iso(row.lastSuccessSourceAt),
  lastSuccessScn: row.lastSuccessScn === null ? null : String(row.lastSuccessScn ?? '') || null,
  lastSuccessAt: iso(row.lastSuccessAt),
  state: String(row.state) as NetwinUfSyncState,
  runId: row.runId ? String(row.runId) : null,
  windowFrom: iso(row.windowFrom),
  windowTo: iso(row.windowTo),
  stage: row.stage ? String(row.stage) : null,
  checkpoint: parseJson(row.metadata),
  leaseOwner: row.leaseOwner ? String(row.leaseOwner) : null,
  leaseExpiresAt: iso(row.leaseExpiresAt),
  heartbeatAt: iso(row.heartbeatAt),
  startedAt: iso(row.startedAt),
  finishedAt: iso(row.finishedAt),
  lastError: row.lastError ? String(row.lastError) : null,
  results: parseJson(row.results),
  createdAt: iso(row.createdAt)!,
  updatedAt: iso(row.updatedAt)!,
});

export class OracleNetwinUfSyncControlRepository implements INetwinUfSyncControlRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public async list(tenantId: string): Promise<NetwinUfSyncControl[]> {
    const rows = await this.db.all<Row>(`${SELECT} WHERE tenant_id = ? ORDER BY uf_code`, [
      tenantId,
    ]);
    return rows.map(toControl);
  }

  public async listEnabled(tenantId: string): Promise<NetwinUfSyncControl[]> {
    const rows = await this.db.all<Row>(
      `${SELECT} WHERE tenant_id = ? AND enabled = 1 ORDER BY uf_code`,
      [tenantId],
    );
    return rows.map(toControl);
  }

  public async get(tenantId: string, ufCode: string): Promise<NetwinUfSyncControl | null> {
    const row = await this.db.get<Row>(`${SELECT} WHERE tenant_id = ? AND uf_code = ?`, [
      tenantId,
      normalizeUfCode(ufCode),
    ]);
    return row ? toControl(row) : null;
  }

  public async upsertConfiguration(
    tenantId: string,
    input: UpsertNetwinUfSyncControlInput,
  ): Promise<NetwinUfSyncControl> {
    const uf = normalizeUfCode(input.ufCode);
    const now = new Date().toISOString();
    const current = await this.get(tenantId, uf);
    if (!current) {
      await this.db.run(
        `INSERT INTO environment_netwin_uf_sync_control
           (id, tenant_id, uf_code, enabled, overlap_seconds, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createCanonicalId(),
          tenantId,
          uf,
          0,
          input.overlapSeconds ?? DEFAULT_NETWIN_UF_SYNC_OVERLAP_SECONDS,
          'disabled',
          now,
          now,
        ],
      );
    }
    const base = current ?? (await this.get(tenantId, uf))!;
    const enabled = input.enabled ?? base.enabled;
    if (enabled && !base.rolloutCompletedAt) {
      throw new Error(
        `UF ${uf} sem rollout concluído: habilite somente após a carga integral (Dia D).`,
      );
    }
    // O estado de execução só é tocado nas transições disabled <-> idle; uma execução em curso
    // (running/derived_pending/failed) mantém o seu estado.
    const nextState: NetwinUfSyncState =
      !enabled && base.state === 'idle'
        ? 'disabled'
        : enabled && base.state === 'disabled'
          ? 'idle'
          : base.state;
    await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET enabled = ?, overlap_seconds = ?, state = ?, updated_at = ?
        WHERE tenant_id = ? AND uf_code = ?`,
      [enabled ? 1 : 0, input.overlapSeconds ?? base.overlapSeconds, nextState, now, tenantId, uf],
    );
    return (await this.get(tenantId, uf))!;
  }

  public async acquireLease(
    tenantId: string,
    ufCode: string,
    input: AcquireNetwinUfSyncLeaseInput,
  ): Promise<NetwinUfSyncControl | null> {
    const now = input.now ?? new Date();
    const expires = new Date(
      now.getTime() + (input.leaseSeconds ?? DEFAULT_NETWIN_UF_SYNC_LEASE_SECONDS) * 1000,
    );
    // Retomada: derived_pending mantém o run_id (e a janela) para só refazer a derivação.
    const result = await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET state = CASE WHEN state = 'derived_pending' THEN state ELSE 'running' END,
              run_id = CASE WHEN state = 'derived_pending' THEN run_id ELSE ? END,
              lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?,
              started_at = CASE WHEN state = 'derived_pending' THEN started_at ELSE ? END,
              finished_at = NULL, last_error = NULL, updated_at = ?
        WHERE tenant_id = ? AND uf_code = ? AND enabled = 1
          AND state IN ('idle', 'failed', 'running', 'derived_pending')
          AND (lease_expires_at IS NULL OR lease_expires_at < ? OR lease_owner = ?)`,
      [
        input.runId,
        input.owner,
        expires.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        tenantId,
        normalizeUfCode(ufCode),
        now.toISOString(),
        input.owner,
      ],
    );
    return result.changes > 0 ? this.get(tenantId, ufCode) : null;
  }

  public async renewLease(
    tenantId: string,
    ufCode: string,
    runId: string,
    patch?: { stage?: string; checkpoint?: Record<string, unknown> },
    leaseSeconds = DEFAULT_NETWIN_UF_SYNC_LEASE_SECONDS,
  ): Promise<boolean> {
    const now = new Date();
    const result = await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET lease_expires_at = ?, heartbeat_at = ?, stage = COALESCE(?, stage),
              metadata = COALESCE(?, metadata), updated_at = ?
        WHERE tenant_id = ? AND uf_code = ? AND run_id = ? AND state IN ('running', 'derived_pending')`,
      [
        new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
        now.toISOString(),
        patch?.stage ?? null,
        patch?.checkpoint ? JSON.stringify(patch.checkpoint) : null,
        now.toISOString(),
        tenantId,
        normalizeUfCode(ufCode),
        runId,
      ],
    );
    return result.changes > 0;
  }

  public async setWindow(
    tenantId: string,
    ufCode: string,
    runId: string,
    window: { from: string; to: string },
  ): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET window_from = ?, window_to = ?, updated_at = ?
        WHERE tenant_id = ? AND uf_code = ? AND run_id = ? AND state = 'running'`,
      [window.from, window.to, new Date().toISOString(), tenantId, normalizeUfCode(ufCode), runId],
    );
    return result.changes > 0;
  }

  public async markDerivedPending(
    tenantId: string,
    ufCode: string,
    runId: string,
    results: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET state = 'derived_pending', stage = 'derived', results = ?, updated_at = ?
        WHERE tenant_id = ? AND uf_code = ? AND run_id = ? AND state = 'running'`,
      [JSON.stringify(results), new Date().toISOString(), tenantId, normalizeUfCode(ufCode), runId],
    );
    return result.changes > 0;
  }

  public async complete(
    tenantId: string,
    ufCode: string,
    runId: string,
    outcome: { sourceAt: string; scn?: string | null; results?: Record<string, unknown> },
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET state = 'idle', last_success_source_at = ?, last_success_scn = ?, last_success_at = ?,
              results = COALESCE(?, results), stage = NULL, metadata = NULL,
              lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, last_error = NULL,
              updated_at = ?
        WHERE tenant_id = ? AND uf_code = ? AND run_id = ?
          AND state IN ('running', 'derived_pending')`,
      [
        outcome.sourceAt,
        outcome.scn ?? null,
        now,
        outcome.results ? JSON.stringify(outcome.results) : null,
        now,
        now,
        tenantId,
        normalizeUfCode(ufCode),
        runId,
      ],
    );
    return result.changes > 0;
  }

  public async fail(
    tenantId: string,
    ufCode: string,
    runId: string,
    error: string,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET state = CASE WHEN state = 'derived_pending' THEN state ELSE 'failed' END,
              last_error = ?, lease_owner = NULL, lease_expires_at = NULL, finished_at = ?,
              updated_at = ?
        WHERE tenant_id = ? AND uf_code = ? AND run_id = ?
          AND state IN ('running', 'derived_pending')`,
      [error.slice(0, 3900), now, now, tenantId, normalizeUfCode(ufCode), runId],
    );
    return result.changes > 0;
  }

  public async finalizeRollout(
    tenantId: string,
    ufCode: string,
    marker: { sourceAt: string; scn?: string | null; completedAt?: string },
  ): Promise<NetwinUfSyncControl> {
    const uf = normalizeUfCode(ufCode);
    if (!(await this.get(tenantId, uf))) {
      await this.upsertConfiguration(tenantId, { ufCode: uf });
    }
    const now = new Date().toISOString();
    const result = await this.db.run(
      `UPDATE environment_netwin_uf_sync_control
          SET enabled = 1, state = 'idle', rollout_completed_at = ?, last_success_source_at = ?,
              last_success_scn = ?, run_id = NULL, stage = NULL, metadata = NULL,
              lease_owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = ?
        WHERE tenant_id = ? AND uf_code = ? AND state IN ('disabled', 'idle', 'failed')`,
      [marker.completedAt ?? now, marker.sourceAt, marker.scn ?? null, now, tenantId, uf],
    );
    if (result.changes === 0) {
      throw new Error(`UF ${uf} com sincronização em andamento: rollout não pode ser finalizado.`);
    }
    return (await this.get(tenantId, uf))!;
  }
}
