import { randomUUID } from 'node:crypto';
import oracledb, { type Connection } from 'oracledb';
import type { MigrationContext } from './context.js';
import { normalizeScopeName } from './scope.js';

export const NATIVE_MAPPING_VERSION = 'netwin-native-phase2-v1';

export type NativeCheckpoint = {
  lastSourceId: number;
  processedCount: number;
};

type NativeJobRow = {
  ID: string;
  TENANT_ID: string;
  SCOPE_KEY: string;
  MAPPING_VERSION: string;
};

type NativeCheckpointRow = {
  LAST_SOURCE_ID: number | null;
  PROCESSED_COUNT: number | null;
};

export function nativeScopeKey(ctx: Pick<MigrationContext, 'options'>): string {
  const { scope } = ctx.options;
  if (scope.full) return 'full';
  return [
    scope.uf ? `uf:${normalizeScopeName(scope.uf)}` : undefined,
    scope.municipio ? `municipio:${normalizeScopeName(scope.municipio)}` : undefined,
    scope.bairro ? `bairro:${normalizeScopeName(scope.bairro)}` : undefined,
  ]
    .filter(Boolean)
    .join('|');
}

export async function ensureNativeCheckpointTables(
  target: Connection,
  ctx: Pick<MigrationContext, 't'>,
): Promise<void> {
  const ddls = [
    `CREATE TABLE ${ctx.t('netwin_mig_native_job')} (
       id VARCHAR2(36 CHAR) PRIMARY KEY,
       tenant_id VARCHAR2(255 CHAR) NOT NULL,
       scope_key VARCHAR2(512 CHAR) NOT NULL,
       mapping_version VARCHAR2(64 CHAR) NOT NULL,
       source_scn VARCHAR2(32 CHAR) NOT NULL,
       state VARCHAR2(32 CHAR) NOT NULL,
       created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
       updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
       completed_at TIMESTAMP(6) WITH TIME ZONE
     )`,
    `CREATE TABLE ${ctx.t('netwin_mig_native_checkpoint')} (
       job_id VARCHAR2(36 CHAR) NOT NULL,
       stage VARCHAR2(32 CHAR) NOT NULL,
       last_source_id NUMBER DEFAULT 0 NOT NULL,
       processed_count NUMBER DEFAULT 0 NOT NULL,
       state VARCHAR2(32 CHAR) NOT NULL,
       updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
       completed_at TIMESTAMP(6) WITH TIME ZONE,
       PRIMARY KEY(job_id, stage)
     )`,
    `CREATE TABLE ${ctx.t('netwin_mig_native_relationship')} (
       job_id VARCHAR2(36 CHAR) NOT NULL,
       resource_from_id VARCHAR2(36 CHAR) NOT NULL,
       resource_to_id VARCHAR2(36 CHAR) NOT NULL,
       relationship_type VARCHAR2(64 CHAR) NOT NULL,
       created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
       PRIMARY KEY(job_id, resource_from_id, resource_to_id, relationship_type)
     )`,
  ];

  for (const ddl of ddls) {
    try {
      await target.execute(ddl);
    } catch (error) {
      if (!/ORA-00955/u.test(String(error))) throw error;
    }
  }
}

async function currentScn(source: Connection): Promise<string> {
  try {
    const result = await source.execute<{ CURRENT_SCN: string }>(
      'SELECT DBMS_FLASHBACK.GET_SYSTEM_CHANGE_NUMBER() AS CURRENT_SCN FROM DUAL',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows?.[0]?.CURRENT_SCN ? String(result.rows[0].CURRENT_SCN) : 'CURRENT';
  } catch (error) {
    if (/ORA-00904|ORA-01031|ORA-00942/u.test(String(error))) return 'CURRENT';
    throw error;
  }
}

export async function openNativeMigrationJob(ctx: MigrationContext): Promise<string | undefined> {
  if (!ctx.options.apply) return undefined;
  const target = await ctx.getTargetConnection();
  const source = await ctx.getSourceConnection();
  try {
    if (!target) throw new Error('Destino Oracle é obrigatório para abrir job de migração.');
    await ensureNativeCheckpointTables(target, ctx);

    const scopeKey = nativeScopeKey(ctx);
    if (ctx.options.resume) {
      const result = await target.execute<NativeJobRow>(
        `SELECT id AS "ID", tenant_id AS "TENANT_ID", scope_key AS "SCOPE_KEY", mapping_version AS "MAPPING_VERSION"
           FROM ${ctx.t('netwin_mig_native_job')}
          WHERE id = :jobId`,
        { jobId: ctx.options.jobId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const job = result.rows?.[0];
      if (!job) throw new Error(`Job nativo ${ctx.options.jobId} não encontrado.`);
      if (
        job.TENANT_ID !== ctx.options.tenantId ||
        job.SCOPE_KEY !== scopeKey ||
        job.MAPPING_VERSION !== NATIVE_MAPPING_VERSION
      ) {
        throw new Error(
          'O tenant, escopo ou versão de mapeamento não confere com o job existente.',
        );
      }
      await target.execute(
        `UPDATE ${ctx.t('netwin_mig_native_job')}
            SET state = 'running', updated_at = SYSTIMESTAMP
          WHERE id = :jobId`,
        { jobId: job.ID },
      );
      await target.execute('COMMIT');
      return job.ID;
    }

    const id = randomUUID();
    await target.execute(
      `INSERT INTO ${ctx.t('netwin_mig_native_job')}
         (id, tenant_id, scope_key, mapping_version, source_scn, state, created_at, updated_at)
       VALUES (:id, :tenantId, :scopeKey, :mappingVersion, :sourceScn, 'running', SYSTIMESTAMP, SYSTIMESTAMP)`,
      {
        id,
        tenantId: ctx.options.tenantId,
        scopeKey,
        mappingVersion: NATIVE_MAPPING_VERSION,
        sourceScn: ctx.options.sourceScn ?? (await currentScn(source)),
      },
    );
    await target.execute('COMMIT');
    return id;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}

export async function loadNativeCheckpoint(
  target: Connection | null,
  ctx: Pick<MigrationContext, 'options' | 't'>,
  stage: string,
): Promise<NativeCheckpoint> {
  if (!target || !ctx.options.resume || !ctx.options.jobId) {
    return { lastSourceId: 0, processedCount: 0 };
  }
  const result = await target.execute<NativeCheckpointRow>(
    `SELECT last_source_id AS "LAST_SOURCE_ID", processed_count AS "PROCESSED_COUNT"
       FROM ${ctx.t('netwin_mig_native_checkpoint')}
      WHERE job_id = :jobId AND stage = :stage`,
    { jobId: ctx.options.jobId, stage },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const checkpoint = result.rows?.[0];
  return {
    lastSourceId: Number(checkpoint?.LAST_SOURCE_ID ?? 0),
    processedCount: Number(checkpoint?.PROCESSED_COUNT ?? 0),
  };
}

export async function saveNativeCheckpoint(
  target: Connection,
  ctx: Pick<MigrationContext, 'options' | 't'>,
  stage: string,
  checkpoint: NativeCheckpoint,
): Promise<void> {
  if (!ctx.options.jobId) return;
  await target.execute(
    `MERGE INTO ${ctx.t('netwin_mig_native_checkpoint')} target
     USING (SELECT :jobId AS job_id, :stage AS stage, :lastSourceId AS last_source_id,
                   :processedCount AS processed_count FROM dual) source
        ON (target.job_id = source.job_id AND target.stage = source.stage)
     WHEN MATCHED THEN UPDATE SET
       target.last_source_id = source.last_source_id,
       target.processed_count = source.processed_count,
       target.state = 'running',
       target.updated_at = SYSTIMESTAMP,
       target.completed_at = NULL
     WHEN NOT MATCHED THEN INSERT
       (job_id, stage, last_source_id, processed_count, state, updated_at)
     VALUES
       (source.job_id, source.stage, source.last_source_id, source.processed_count, 'running', SYSTIMESTAMP)`,
    { jobId: ctx.options.jobId, stage, ...checkpoint },
  );
}

async function setNativeMigrationJobState(
  ctx: MigrationContext,
  state: 'loaded' | 'paused',
): Promise<void> {
  if (!ctx.options.apply || !ctx.options.jobId) return;
  const target = await ctx.getTargetConnection();
  try {
    if (!target) return;
    await target.execute(
      `UPDATE ${ctx.t('netwin_mig_native_job')}
          SET state = :state,
              updated_at = SYSTIMESTAMP,
              completed_at = CASE WHEN :state = 'loaded' THEN SYSTIMESTAMP ELSE NULL END
        WHERE id = :jobId`,
      { jobId: ctx.options.jobId, state },
    );
    await target.execute('COMMIT');
  } finally {
    if (target) await target.close();
  }
}

export async function pauseNativeMigrationJob(ctx: MigrationContext): Promise<void> {
  await setNativeMigrationJobState(ctx, 'paused');
}

export type NativeRelationship = {
  resource_from_id: string;
  resource_to_id: string;
  relationship_type: string;
};

export type NativeRelationshipSummary = {
  total: number;
  eligible: number;
  missingSource: number;
  missingTarget: number;
  missingBoth: number;
};

type NativeRelationshipSummaryRow = {
  TOTAL: number | null;
  ELIGIBLE: number | null;
  MISSING_SOURCE: number | null;
  MISSING_TARGET: number | null;
  MISSING_BOTH: number | null;
};

export async function enqueueNativeRelationships(
  target: Connection,
  ctx: Pick<MigrationContext, 'options' | 't'>,
  relationships: readonly NativeRelationship[],
  chunkSize: number,
): Promise<number> {
  if (!ctx.options.jobId || relationships.length === 0) return 0;

  const sql = `INSERT INTO ${ctx.t('netwin_mig_native_relationship')}
    (job_id, resource_from_id, resource_to_id, relationship_type, created_at)
    VALUES (:1, :2, :3, :4, :5)`;
  const createdAt = new Date();
  const safeChunkSize = Math.max(1, chunkSize);

  for (let offset = 0; offset < relationships.length; offset += safeChunkSize) {
    const chunk = relationships.slice(offset, offset + safeChunkSize);
    await target.executeMany(
      sql,
      chunk.map((relationship) => [
        ctx.options.jobId,
        relationship.resource_from_id,
        relationship.resource_to_id,
        relationship.relationship_type,
        createdAt,
      ]),
      { autoCommit: false },
    );
  }

  return relationships.length;
}

export async function reconcileNativeRelationships(
  target: Connection,
  ctx: Pick<MigrationContext, 'options' | 't'>,
): Promise<number> {
  if (!ctx.options.jobId) return 0;
  const result = await target.execute(
    `MERGE INTO ${ctx.t('tmf_resource_relationship')} target
     USING (
       SELECT pending.resource_from_id, pending.resource_to_id, pending.relationship_type
       FROM ${ctx.t('netwin_mig_native_relationship')} pending
       JOIN ${ctx.t('tmf_physical_resource')} source_resource
         ON source_resource.id = pending.resource_from_id
       JOIN ${ctx.t('tmf_physical_resource')} target_resource
         ON target_resource.id = pending.resource_to_id
       WHERE pending.job_id = :jobId
         AND source_resource.tenant_id = :tenantId
         AND target_resource.tenant_id = :tenantId
     ) source
        ON (target.resource_from_id = source.resource_from_id
            AND target.resource_to_id = source.resource_to_id
            AND target.relationship_type = source.relationship_type)
     WHEN NOT MATCHED THEN INSERT (resource_from_id, resource_to_id, relationship_type)
     VALUES (source.resource_from_id, source.resource_to_id, source.relationship_type)`,
    { jobId: ctx.options.jobId, tenantId: ctx.options.tenantId },
  );
  return result.rowsAffected ?? 0;
}

export async function summarizeNativeRelationships(
  target: Connection,
  ctx: Pick<MigrationContext, 'options' | 't'>,
): Promise<NativeRelationshipSummary> {
  if (!ctx.options.jobId) {
    return { total: 0, eligible: 0, missingSource: 0, missingTarget: 0, missingBoth: 0 };
  }

  const result = await target.execute<NativeRelationshipSummaryRow>(
    `SELECT COUNT(*) AS "TOTAL",
            SUM(CASE WHEN source_resource.id IS NOT NULL AND target_resource.id IS NOT NULL
                     THEN 1 ELSE 0 END) AS "ELIGIBLE",
            SUM(CASE WHEN source_resource.id IS NULL AND target_resource.id IS NOT NULL
                     THEN 1 ELSE 0 END) AS "MISSING_SOURCE",
            SUM(CASE WHEN source_resource.id IS NOT NULL AND target_resource.id IS NULL
                     THEN 1 ELSE 0 END) AS "MISSING_TARGET",
            SUM(CASE WHEN source_resource.id IS NULL AND target_resource.id IS NULL
                     THEN 1 ELSE 0 END) AS "MISSING_BOTH"
       FROM ${ctx.t('netwin_mig_native_relationship')} pending
       LEFT JOIN ${ctx.t('tmf_physical_resource')} source_resource
         ON source_resource.id = pending.resource_from_id
        AND source_resource.tenant_id = :tenantId
       LEFT JOIN ${ctx.t('tmf_physical_resource')} target_resource
         ON target_resource.id = pending.resource_to_id
        AND target_resource.tenant_id = :tenantId
      WHERE pending.job_id = :jobId`,
    { jobId: ctx.options.jobId, tenantId: ctx.options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const summary = result.rows?.[0];
  return {
    total: Number(summary?.TOTAL ?? 0),
    eligible: Number(summary?.ELIGIBLE ?? 0),
    missingSource: Number(summary?.MISSING_SOURCE ?? 0),
    missingTarget: Number(summary?.MISSING_TARGET ?? 0),
    missingBoth: Number(summary?.MISSING_BOTH ?? 0),
  };
}

export async function completeNativeMigrationJob(ctx: MigrationContext): Promise<void> {
  if (!ctx.options.apply || !ctx.options.jobId) return;
  const target = await ctx.getTargetConnection();
  try {
    if (!target) return;
    const reconciled = await reconcileNativeRelationships(target, ctx);
    const summary = await summarizeNativeRelationships(target, ctx);
    await target.execute('COMMIT');
    console.log(
      `[Topologia] fila=${summary.total}; elegíveis=${summary.eligible}; novas=${reconciled}; pendentesOrigem=${summary.missingSource}; pendentesDestino=${summary.missingTarget}; pendentesAmbos=${summary.missingBoth}.`,
    );
    const pending = summary.missingSource + summary.missingTarget + summary.missingBoth;
    if (pending > 0) {
      console.warn(
        `[Topologia] ${pending} relação(ões) permanecem pendentes porque um ou ambos os extremos físicos não existem no tenant.`,
      );
    }
  } finally {
    if (target) await target.close();
  }
  await setNativeMigrationJobState(ctx, 'loaded');
}
