/**
 * Utilitários compartilhados pelas cargas do Netwin (`migrate-netwin-infranode.ts` e
 * `migrate-netwin-osp.ts`): tabelas de controle (job/identidade/rejeitados/adiados), MERGE
 * idempotente, resolução de catálogo (categoria/tipo/spec) e as pequenas funções de parsing/
 * formatação usadas nos dois. Extraído para não deixar as duas cargas divergirem no que é, na
 * prática, o mesmo protocolo de reconciliação por hash.
 */
import { randomUUID } from 'node:crypto';
import oracledb, { type Connection } from 'oracledb';
import { createCanonicalId } from '../shared/utils/canonical-id.js';
import { prefixed } from '../shared/persistence/oracle-object-names.js';

export function quote(value: string): string {
  return `"${value.toUpperCase()}"`;
}

export function cut(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

export function numberOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} obrigatorio.`);
  return value;
}

export function requiredAny(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`${names.join(' ou ')} obrigatorio.`);
}

export function oracleConnectDescriptor(value: string): string {
  if (value.startsWith('(')) return value;
  const easyConnect = /^([A-Za-z0-9._-]+):(\d+)\/([A-Za-z0-9._-]+)$/u.exec(value);
  if (!easyConnect) return value;
  const [, host, port, serviceName] = easyConnect;
  return (
    `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))` +
    `(CONNECT_DATA=(SERVICE_NAME=${serviceName})))`
  );
}

// O DR do Netwin pode estar em versão Oracle anterior ao mínimo aceito pelo driver em Thin
// mode. Quando o Instant Client estiver instalado, o modo Thick atende essa versão sem mudar
// nenhuma operação da origem (continua em transação READ ONLY).
export function configureOracleClient(): void {
  const libDir = process.env.NETWIN_ORACLE_CLIENT_LIB_DIR ?? process.env.ORACLE_CLIENT_LIB_DIR;
  if (!libDir) return;
  try {
    oracledb.initOracleClient({ libDir });
  } catch (error) {
    throw new Error(
      `Não foi possível inicializar o Oracle Instant Client em ${libDir}: ${String(error)}`,
    );
  }
}

// ---- ciclo de vida (NI_CAT_STATE.DESIGNATION -> status canônico) ----
//
// Único ponto de resolução de designation → status para as cargas Netwin que consultam
// NI_CAT_STATE (hoje só migrate-netwin-osp.ts; migrate-netwin-infranode.ts não tem essa
// tabela na origem e assume 'active' com `_migration.statusAssumed`). A regra anterior
// vivia só em migrate-netwin-osp.ts, sem normalização de acento e com o ramo "ativo"
// ancorado em `^SERVI` — "Em Serviço" (o valor real mais comum na origem) e "Disponível"
// nunca batiam, e caíam no default 'suspended'. Foi assim que uma CDOE ativa e disponível
// (e toda a cadeia até a estação) veio Suspensa numa carga real (ver AGENTS.md/issue de
// origem: CDOE-7539 / INFRANODE 472107).
export type LifecycleStatus = 'active' | 'suspended' | 'terminated';

export type LifecycleResolution = {
  status: LifecycleStatus;
  substatus: string;
  // true quando a designation está vazia ou o estado não foi encontrado no lookup — o
  // chamador trata como o irmão infranode trata ausência de dado: assume 'active' e marca
  // `_migration.statusAssumed`, em vez de gravar 'suspended' silencioso (o default anterior
  // suspendia por falta de informação, não por evidência).
  assumed: boolean;
};

function normalizeDesignation(designation: string | undefined): string {
  return (designation ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

const TERMINATED_PATTERN = /TERMINAD|ABORT|RETIRA|CANCELAD/;
const SUSPENDED_PATTERN = /FORA DE SERVI|DISABLED|BLOQUEAD|SUSPENS/;
const ACTIVE_PATTERN =
  /^(EM )?SERVICO$|^ATIVO$|^ACTIVE$|^OPERACIONAL$|^EM USO$|INSTALADO|DISPONIVEL/;

export function resolveLifecycleStatus(designation: string | undefined): LifecycleResolution {
  const normalized = normalizeDesignation(designation);
  if (!normalized) return { status: 'active', substatus: '', assumed: true };
  if (TERMINATED_PATTERN.test(normalized)) {
    return { status: 'terminated', substatus: designation ?? '', assumed: false };
  }
  if (SUSPENDED_PATTERN.test(normalized)) {
    return { status: 'suspended', substatus: designation ?? '', assumed: false };
  }
  if (ACTIVE_PATTERN.test(normalized)) return { status: 'active', substatus: '', assumed: false };
  // Designation reconhecida (não vazia) mas fora do vocabulário mapeado: suspende com o
  // valor cru como substatus, para o painel do Geo mostrar o motivo e a operação decidir se
  // é caso de estender o vocabulário acima.
  return { status: 'suspended', substatus: designation ?? '', assumed: false };
}

export type TablePrefixer = (name: string) => string;

export function makeTablePrefixer(targetPrefix?: string): TablePrefixer {
  const prefix = targetPrefix ?? required('TARGET_ORACLE_OBJECT_PREFIX');
  return (name: string) => quote(prefixed(name, prefix));
}

export async function merge(
  target: Connection,
  t: TablePrefixer,
  table: string,
  keys: string[],
  record: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(record);
  const source = columns.map((column, i) => `:${i + 1} ${quote(column)}`).join(', ');
  const on = keys.map((key) => `target.${quote(key)}=source.${quote(key)}`).join(' AND ');
  const mutable = columns.filter((column) => !keys.includes(column));
  const sql = `MERGE INTO ${t(table)} target USING (SELECT ${source} FROM DUAL) source ON (${on})
    WHEN MATCHED THEN UPDATE SET ${mutable.map((column) => `target.${quote(column)}=source.${quote(column)}`).join(', ')}
    WHEN NOT MATCHED THEN INSERT (${columns.map(quote).join(',')}) VALUES (${columns.map((column) => `source.${quote(column)}`).join(',')})`;
  await target.execute(sql, Object.values(record));
}

// ---- catálogo (Category / ResourceType / ResourceSpecification / SiteSpecification) ----

export async function ensureResourceType(
  target: Connection,
  t: TablePrefixer,
  code: string,
  name: string,
  tenantId = 'vtal',
): Promise<string> {
  const existing = await target.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('tmf_resource_type')} WHERE tenant_id=:1 AND code=:2 FETCH FIRST 1 ROWS ONLY`,
    [tenantId, code],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (existing.rows?.[0]?.ID) return existing.rows[0].ID;
  const id = `rt-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  await merge(target, t, 'tmf_resource_type', ['tenant_id', 'code'], {
    id,
    tenant_id: tenantId,
    code,
    name,
    status: 'active',
  });
  return id;
}

export async function ensureSiteSpec(
  target: Connection,
  t: TablePrefixer,
  code: string,
  category: string,
  siteRole: string,
): Promise<void> {
  const exists = await target.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('tmf_geographic_site_specification')} WHERE code=:1`,
    [code],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (exists.rows?.[0]) return;
  const id = createCanonicalId();
  await target.execute(
    `INSERT INTO ${t('tmf_geographic_site_specification')} (id,name,code,category,site_role,lifecycle_status,characteristics,is_bootstrap) VALUES (:1,:2,:3,:4,:5,'Active','[]',0)`,
    [id, code, code, category, siteRole],
  );
}

export async function siteSpecId(
  target: Connection,
  t: TablePrefixer,
  code: string,
): Promise<string> {
  const row = await target.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('tmf_geographic_site_specification')} WHERE code=:1 FETCH FIRST 1 ROWS ONLY`,
    [code],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = row.rows?.[0]?.ID;
  if (!id) throw new Error(`SiteSpecification ausente: ${code}`);
  return id;
}

export async function resourceSpecId(
  target: Connection,
  t: TablePrefixer,
  name: string,
  resourceTypeCode: string,
  tenantId = 'vtal',
): Promise<string> {
  const resourceTypeId = await ensureResourceType(target, t, resourceTypeCode, resourceTypeCode, tenantId);
  const row = await target.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('tmf_resource_specification')} WHERE tenant_id=:1 AND name=:2 AND resource_type_id=:3 FETCH FIRST 1 ROWS ONLY`,
    [tenantId, name, resourceTypeId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (row.rows?.[0]?.ID) return row.rows[0].ID;
  const id = createCanonicalId();
  await target.execute(
    `INSERT INTO ${t('tmf_resource_specification')} (id,tenant_id,name,resource_type_id,characteristics) VALUES (:1,:2,:3,:4,'[]')`,
    [id, tenantId, name, resourceTypeId],
  );
  return id;
}

// ---- identidade de reconciliação (source_entity/source_id/target_role -> nexus_id) ----

export async function identity(
  target: Connection,
  t: TablePrefixer,
  sourceEntity: string,
  sourceId: string,
  role: string,
  entityType: string,
  sourceHash?: string,
  adopt?: () => Promise<string | null>,
): Promise<string> {
  const existing = await target.execute<{ NEXUS_ID: string }>(
    `SELECT nexus_id AS "NEXUS_ID" FROM ${t('netwin_mig_identity')}
      WHERE source_entity=:1 AND source_id=:2 AND target_role=:3`,
    [sourceEntity, sourceId, role],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const found = existing.rows?.[0]?.NEXUS_ID;
  if (found) return found;
  const adopted = adopt ? await adopt() : null;
  if (adopted) {
    await target.execute(
      `INSERT INTO ${t('netwin_mig_identity')}
       (source_entity, source_id, target_role, nexus_entity_type, nexus_id, source_hash, created_at)
       VALUES (:1,:2,:3,:4,:5,:6,SYSTIMESTAMP)`,
      [sourceEntity, sourceId, role, entityType, adopted, sourceHash ?? null],
    );
    return adopted;
  }
  const id = createCanonicalId();
  try {
    await target.execute(
      `INSERT INTO ${t('netwin_mig_identity')}
       (source_entity, source_id, target_role, nexus_entity_type, nexus_id, created_at)
       VALUES (:1,:2,:3,:4,:5,SYSTIMESTAMP)`,
      [sourceEntity, sourceId, role, entityType, id],
    );
    return id;
  } catch (error) {
    if (!/ORA-00001/.test(String(error))) throw error;
    return await identity(target, t, sourceEntity, sourceId, role, entityType);
  }
}

export async function identityState(
  target: Connection,
  t: TablePrefixer,
  sourceEntity: string,
  sourceId: string,
  role: string,
): Promise<{ sourceHash: string | null } | null> {
  const result = await target.execute<{ SOURCE_HASH: string | null }>(
    `SELECT source_hash AS "SOURCE_HASH" FROM ${t('netwin_mig_identity')}
      WHERE source_entity=:1 AND source_id=:2 AND target_role=:3`,
    [sourceEntity, sourceId, role],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const sourceHash = result.rows?.[0]?.SOURCE_HASH;
  return sourceHash === undefined ? null : { sourceHash };
}

export async function updateIdentityHash(
  target: Connection,
  t: TablePrefixer,
  sourceEntity: string,
  sourceId: string,
  role: string,
  sourceHash: string,
): Promise<void> {
  await target.execute(
    `UPDATE ${t('netwin_mig_identity')} SET source_hash=:1
      WHERE source_entity=:2 AND source_id=:3 AND target_role=:4`,
    [sourceHash, sourceEntity, sourceId, role],
  );
}

// ---- job bookkeeping (rejeitados / adiados / pais / toques do índice de mapa) ----

export async function reject(
  target: Connection,
  t: TablePrefixer,
  jobId: string,
  sourceId: string,
  code: string,
  payload: string,
): Promise<void> {
  await target.execute(
    `INSERT INTO ${t('netwin_mig_reject')} (id,job_id,source_id,reason,payload,created_at) VALUES (:1,:2,:3,:4,:5,SYSTIMESTAMP)`,
    [randomUUID(), jobId, sourceId, code, payload],
  );
}

export async function defer(
  target: Connection,
  t: TablePrefixer,
  jobId: string,
  sourceId: string,
  reason: string,
  payload: string,
): Promise<void> {
  await target.execute(
    `INSERT INTO ${t('netwin_mig_deferred')} (id,job_id,source_id,reason,payload,created_at) VALUES (:1,:2,:3,:4,:5,SYSTIMESTAMP)`,
    [randomUUID(), jobId, sourceId, reason, payload],
  );
}

export async function recordParent(
  target: Connection,
  t: TablePrefixer,
  jobId: string,
  sourceId: string,
  parentSourceId: string,
): Promise<void> {
  try {
    await target.execute(
      `INSERT INTO ${t('netwin_mig_parent')} (job_id,source_id,parent_source_id,created_at) VALUES (:1,:2,:3,SYSTIMESTAMP)`,
      [jobId, sourceId, parentSourceId],
    );
  } catch (error) {
    if (!/ORA-00001/.test(String(error))) throw error;
  }
}

export async function recordTouches(
  target: Connection,
  t: TablePrefixer,
  jobId: string,
  sourceIds: string[],
): Promise<void> {
  if (sourceIds.length === 0) return;
  await target.executeMany(
    `MERGE INTO ${t('netwin_mig_touch')} target
     USING (SELECT :1 job_id,:2 source_id FROM DUAL) source
     ON (target.job_id=source.job_id AND target.source_id=source.source_id)
     WHEN NOT MATCHED THEN INSERT (job_id,source_id,created_at)
     VALUES (source.job_id,source.source_id,SYSTIMESTAMP)`,
    sourceIds.map((sourceId) => [jobId, sourceId]),
  );
}

// ---- tabelas de controle (comuns a todas as cargas Netwin) ----

export async function ensureControlTables(target: Connection, t: TablePrefixer): Promise<void> {
  const ddls = [
    `CREATE TABLE ${t('netwin_mig_job')} (id VARCHAR2(36 CHAR) PRIMARY KEY,source_scn VARCHAR2(32 CHAR) NOT NULL,uf_id NUMBER,municipio_id NUMBER,mapping_version VARCHAR2(64 CHAR) NOT NULL,last_pi_id NUMBER DEFAULT 0 NOT NULL,state VARCHAR2(32 CHAR) NOT NULL,loaded_count NUMBER DEFAULT 0 NOT NULL,rejected_count NUMBER DEFAULT 0 NOT NULL,deferred_count NUMBER DEFAULT 0 NOT NULL,created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,completed_at TIMESTAMP(6) WITH TIME ZONE)`,
    `CREATE TABLE ${t('netwin_mig_identity')} (source_entity VARCHAR2(64 CHAR) NOT NULL,source_id VARCHAR2(64 CHAR) NOT NULL,target_role VARCHAR2(32 CHAR) NOT NULL,nexus_entity_type VARCHAR2(64 CHAR) NOT NULL,nexus_id VARCHAR2(36 CHAR) NOT NULL,source_hash VARCHAR2(64 CHAR),created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,PRIMARY KEY(source_entity,source_id,target_role))`,
    `CREATE TABLE ${t('netwin_mig_parent')} (job_id VARCHAR2(36 CHAR) NOT NULL,source_id VARCHAR2(64 CHAR) NOT NULL,parent_source_id VARCHAR2(64 CHAR) NOT NULL,created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,PRIMARY KEY(job_id,source_id))`,
    `CREATE TABLE ${t('netwin_mig_touch')} (job_id VARCHAR2(36 CHAR) NOT NULL,source_id VARCHAR2(64 CHAR) NOT NULL,created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,PRIMARY KEY(job_id,source_id))`,
    `CREATE TABLE ${t('netwin_mig_reject')} (id VARCHAR2(36 CHAR) PRIMARY KEY,job_id VARCHAR2(36 CHAR) NOT NULL,source_id VARCHAR2(64 CHAR) NOT NULL,reason VARCHAR2(128 CHAR) NOT NULL,payload CLOB NOT NULL,created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL)`,
    `CREATE TABLE ${t('netwin_mig_deferred')} (id VARCHAR2(36 CHAR) PRIMARY KEY,job_id VARCHAR2(36 CHAR) NOT NULL,source_id VARCHAR2(64 CHAR) NOT NULL,reason VARCHAR2(128 CHAR) NOT NULL,payload CLOB NOT NULL,created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL)`,
  ];
  for (const ddl of ddls)
    try {
      await target.execute(ddl);
    } catch (error) {
      if (!/ORA-00955/.test(String(error))) throw error;
    }
  try {
    await target.execute(
      `ALTER TABLE ${t('netwin_mig_identity')} ADD (source_hash VARCHAR2(64 CHAR))`,
    );
  } catch (error) {
    // ORA-01430: a coluna já existe (nova execução ou base criada pelo script anterior).
    if (!/ORA-01430/.test(String(error))) throw error;
  }
}

export async function ensureMapEntityIndex(
  target: Connection,
  t: TablePrefixer,
  targetPrefix: string | undefined,
): Promise<void> {
  try {
    await target.execute(
      `CREATE INDEX ${quote(prefixed('i_nw_map_entity', targetPrefix ?? required('TARGET_ORACLE_OBJECT_PREFIX')))}
         ON ${t('geo_map_feature')} (tenant_id,entity_id)`,
    );
  } catch (error) {
    // ORA-01031 não inviabiliza ondas pequenas, mas deixa explícito que o DBA precisa criar o
    // índice antes da carga nacional. ORA-00955 = já criado.
    if (/ORA-01031/.test(String(error))) {
      console.warn('Índice de mapa (tenant_id, entity_id) não criado: privilégios insuficientes.');
    } else if (!/ORA-00955/.test(String(error))) {
      throw error;
    }
  }
}
