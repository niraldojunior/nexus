/**
 * Carga em ondas do extrato NETWINOI.DL_INFRANODE para o Oracle do Nexus.
 *
 * A origem nunca e copiada integralmente: lemos por keyset (UF_ID/MUNICIPIO_ID + PI_ID),
 * transformamos apenas o lote corrente e gravamos o checkpoint na mesma transacao. Isso torna
 * --resume seguro mesmo depois de uma queda no meio da carga. `--max-records` limita uma onda,
 * sem alterar o filtro indexado nem o checkpoint persistido. Sem privilégio de Flashback,
 * usa a visão corrente com reconciliação por hash.
 */
import { createHash, randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import oracledb, { type Connection } from 'oracledb';
import { lngLatToTile, MAP_TILE_ZOOM } from '../modules/geo/map-tile.js';
import {
  configureOracleClient,
  cut,
  ensureControlTables,
  ensureMapEntityIndex,
  ensureResourceType as ensureResourceTypeShared,
  ensureCategory as ensureCategoryShared,
  ensureSiteSpec as ensureSiteSpecShared,
  identity as identityShared,
  identityState as identityStateShared,
  makeTablePrefixer,
  merge as mergeShared,
  numberOf,
  oracleConnectDescriptor,
  recordParent as recordParentShared,
  recordTouches as recordTouchesShared,
  reject as rejectShared,
  defer as deferShared,
  required,
  requiredAny,
  resourceSpecId as resourceSpecIdShared,
  siteSpecId as siteSpecIdShared,
  updateIdentityHash as updateIdentityHashShared,
  type TablePrefixer,
} from './netwin-migration-kit.js';

// A carga é operada por arquivo .env do projeto; esse arquivo deve prevalecer sobre
// valores antigos deixados no processo/shell por tentativas anteriores.
loadEnv({ override: true });
oracledb.fetchAsString = [oracledb.CLOB];
configureOracleClient();

type Args = {
  apply: boolean;
  resume: boolean;
  finalizeOnly: boolean;
  refreshMap: boolean;
  jobId?: string;
  ufId?: number;
  municipioId?: number;
  batchSize: number;
  maxRecords?: number;
  sourceScn?: string;
  tenantId: string;
  ownerPartyId: string;
};
type SourceRow = Record<string, unknown>;
type Kind = 'survey' | 'site' | 'resource' | 'deferred';
type Mapping = { kind: Kind; spec?: string; resourceType?: string };

const MAPPING_VERSION = 'dl-infranode-v1';
const SOURCE_ENTITY = 'DL_INFRANODE';
const TABLE = '"NETWINOI"."DL_INFRANODE"';

const args = parseArgs(process.argv.slice(2));
const targetPrefix = process.env.TARGET_ORACLE_OBJECT_PREFIX ?? process.env.ORACLE_OBJECT_PREFIX;
const t: TablePrefixer = makeTablePrefixer(targetPrefix);
const netwinTnsAdmin = process.env.NETWIN_DR_TNS_ADMIN ?? process.env.TNS_ADMIN;

const sourcePool = await oracledb.createPool({
  connectString: oracleConnectDescriptor(required('NETWIN_DR_ORACLE_CONNECT_STRING')),
  user: required('NETWIN_DR_ORACLE_USER'),
  password: required('NETWIN_DR_ORACLE_PASSWORD'),
  ...(netwinTnsAdmin ? { configDir: netwinTnsAdmin } : {}),
  poolMin: 1,
  poolMax: 1,
});
const targetPool = args.apply
  ? await oracledb.createPool({
      connectString: requiredAny('TARGET_ORACLE_CONNECT_STRING', 'ORACLE_CONNECTION_STRING'),
      user: requiredAny('TARGET_ORACLE_USER', 'ORACLE_USER'),
      password: requiredAny('TARGET_ORACLE_PASSWORD', 'ORACLE_PASSWORD'),
      poolMin: 1,
      poolMax: 1,
    })
  : null;

try {
  const source = await sourcePool.getConnection();
  const target = targetPool ? await targetPool.getConnection() : null;
  try {
    // Defesa em profundidade: além de o usuário da origem dever ter somente SELECT,
    // esta sessão não aceita DML/DDL nem por engano em alterações futuras do script.
    await source.execute('SET TRANSACTION READ ONLY');
    if (!args.apply) {
      if (args.resume) throw new Error('--resume exige --apply.');
      // Simulação não grava checkpoint nem altera destino: pode consultar a visão
      // corrente sem privilégio de flashback.
      const scn = args.sourceScn;
      await runLoad(source, null, 'dry-run', scn, 0, args);
      console.log(JSON.stringify({ state: 'validated', scn: scn ?? 'current' }));
    } else {
      if (!target) throw new Error('Conexão Oracle de destino indisponível.');
      await ensureControlTablesAndMapIndex(target);
      const job = await openJob(source, target, args);
      await ensureCatalog(target);
      if (!args.finalizeOnly) {
        await runLoad(source, target, job.id, job.scn, job.lastPiId, job);
      }
      await resolveParents(target, job.id);
      const mapFeatures = await refreshMapFeatures(target, job.id);
      await target.execute(
        `UPDATE ${t('netwin_mig_job')} SET state='loaded', completed_at=SYSTIMESTAMP WHERE id=:1`,
        [job.id],
        { autoCommit: true },
      );
      console.log(JSON.stringify({ jobId: job.id, state: 'loaded', mapFeatures }));
    }
  } finally {
    await source.close();
    await target?.close();
  }
} finally {
  await sourcePool.close(10);
  await targetPool?.close(10);
}

async function runLoad(
  source: Connection,
  target: Connection | null,
  jobId: string,
  scn: string | undefined,
  initialPiId: number,
  scope: Pick<Args, 'ufId' | 'municipioId'>,
) {
  let lastPiId = initialPiId;
  let total = 0;
  for (;;) {
    const remaining = args.maxRecords === undefined ? args.batchSize : args.maxRecords - total;
    if (remaining <= 0) return;
    const rows = await readBatch(source, scn, lastPiId, scope, Math.min(args.batchSize, remaining));
    if (rows.length === 0) return;
    const nextPiId = numberOf(rows.at(-1)?.PI_ID);
    if (!nextPiId) throw new Error('PI_ID invalido na pagina de origem.');
    const prepared = rows.map((row) => prepare(row));
    const summary = summarize(prepared);
    if (!args.apply) {
      total += rows.length;
      lastPiId = nextPiId;
      console.log(JSON.stringify({ dryRun: true, lastPiId, rows: rows.length, ...summary }));
      continue;
    }
    if (!target) throw new Error('Conexão Oracle de destino indisponível.');

    try {
      await persistBatch(target, jobId, prepared);
      await target.execute(
        `UPDATE ${t('netwin_mig_job')}
            SET last_pi_id=:1, loaded_count=loaded_count+:2, rejected_count=rejected_count+:3,
                deferred_count=deferred_count+:4, updated_at=SYSTIMESTAMP
          WHERE id=:5`,
        [nextPiId, summary.loaded, summary.rejected, summary.deferred, jobId],
      );
      await target.execute('COMMIT');
    } catch (error) {
      await target.execute('ROLLBACK');
      throw error;
    }
    total += rows.length;
    lastPiId = nextPiId;
    console.log(JSON.stringify({ jobId, lastPiId, rows: rows.length, total, ...summary }));
  }
}

async function readBatch(
  source: Connection,
  scn: string | undefined,
  lastPiId: number,
  scope: Pick<Args, 'ufId' | 'municipioId'>,
  pageSize: number,
): Promise<SourceRow[]> {
  const where = ['PI_ID > :lastPiId'];
  const binds: Record<string, number | string> = { lastPiId, limit: pageSize };
  const usesFlashback = Boolean(scn && scn !== 'CURRENT');
  if (usesFlashback && scn) binds.scn = scn;
  if (scope.ufId !== undefined) {
    where.push('UF_ID = :ufId');
    binds.ufId = scope.ufId;
  }
  if (scope.municipioId !== undefined) {
    where.push('MUNICIPIO_ID = :municipioId');
    binds.municipioId = scope.municipioId;
  }
  const result = await source.execute<SourceRow>(
    `SELECT * FROM (
       SELECT source_row.*, ROW_NUMBER() OVER (ORDER BY PI_ID) AS migration_row_number
       FROM ${TABLE}${usesFlashback ? ' AS OF SCN :scn' : ''} source_row
       WHERE ${where.join(' AND ')}
     ) WHERE migration_row_number <= :limit
     ORDER BY PI_ID`,
    binds,
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: pageSize,
      prefetchRows: pageSize,
    },
  );
  return result.rows ?? [];
}

function prepare(row: SourceRow) {
  const piId = String(numberOf(row.PI_ID));
  const mapping = classify(String(row.PI_TYPE ?? ''));
  const longitude = numberOf(row.LONGITUDE);
  const latitude = numberOf(row.LATITUDE);
  const hasPoint =
    longitude !== null &&
    latitude !== null &&
    longitude >= -74 &&
    longitude <= -34 &&
    latitude >= -35 &&
    latitude <= 6;
  const name = displayName(row, piId);
  const raw = JSON.stringify(row);
  const sourceHash = createHash('sha256').update(raw).digest('hex');
  if (mapping.kind === 'deferred')
    return { row, piId, mapping, name, raw, sourceHash, state: 'deferred' as const, hasPoint };
  if (!hasPoint && mapping.kind !== 'site')
    return { row, piId, mapping, name, raw, sourceHash, state: 'rejected' as const, hasPoint };
  return { row, piId, mapping, name, raw, sourceHash, state: 'loaded' as const, hasPoint };
}

async function persistBatch(
  target: Connection,
  jobId: string,
  items: ReturnType<typeof prepare>[],
) {
  const mapSourceIds: string[] = [];
  for (const item of items) {
    if (item.state === 'rejected') {
      await reject(target, jobId, item, 'INVALID_COORDINATE');
      continue;
    }
    if (item.state === 'deferred') {
      await defer(target, jobId, item, 'DERIVED_TOPOLOGY_NODE');
      continue;
    }
    const primaryType =
      item.mapping.kind === 'site'
        ? 'GeographicSite'
        : item.mapping.kind === 'resource'
          ? 'PhysicalResource'
          : 'GeographicLocation';
    const primaryId = await identity(target, item.piId, 'primary', primaryType, item);
    const previous = await identityState(target, item.piId, 'primary');
    const locationId =
      item.mapping.kind === 'survey'
        ? primaryId
        : item.hasPoint
          ? await identity(target, item.piId, 'location', 'GeographicLocation')
          : null;
    // A identidade é a âncora de reconciliação. Hash igual significa que esta linha
    // já está refletida no Nexus: não reescrevemos registro, audit ou relações manuais.
    if (previous?.sourceHash !== item.sourceHash) {
      if (locationId) await upsertLocation(target, locationId, item);
      if (item.mapping.kind === 'site') await upsertSite(target, primaryId, locationId, item);
      if (item.mapping.kind === 'resource')
        await upsertResource(target, primaryId, locationId, item);
      await updateIdentityHash(target, item.piId, 'primary', item.sourceHash);
      const parentId = numberOf(item.row.PI_PARENT_ID);
      if (parentId !== null) await recordParent(target, jobId, item.piId, String(parentId));
      mapSourceIds.push(item.piId);
    } else if (args.refreshMap) {
      // Reindexação explícita: mantém a reconciliação idempotente, mas inclui no
      // índice os registros já iguais para corrigir a camada visual sem regravar
      // Resource/Site/Location.
      mapSourceIds.push(item.piId);
    }
  }
  await recordTouches(target, jobId, mapSourceIds);
}

async function identity(
  target: Connection,
  sourceId: string,
  role: string,
  entityType: string,
  item?: ReturnType<typeof prepare>,
): Promise<string> {
  return identityShared(target, t, SOURCE_ENTITY, sourceId, role, entityType, item?.sourceHash, () =>
    item ? findExistingNexusEntity(target, entityType, item) : Promise.resolve(null),
  );
}

async function identityState(target: Connection, sourceId: string, role: string) {
  return identityStateShared(target, t, SOURCE_ENTITY, sourceId, role);
}

async function updateIdentityHash(
  target: Connection,
  sourceId: string,
  role: string,
  sourceHash: string,
) {
  return updateIdentityHashShared(target, t, SOURCE_ENTITY, sourceId, role, sourceHash);
}

// A carga prévia de estações/salas não conhece PI_ID. Para não duplicá-la,
// adotamos exclusivamente uma correspondência única por nome e classe, sem alterar
// a entidade já existente; o PI_ID passa a ficar na tabela de identidade do Nexus.
async function findExistingNexusEntity(
  target: Connection,
  entityType: string,
  item: ReturnType<typeof prepare>,
): Promise<string | null> {
  if (entityType !== 'GeographicSite') return null;
  const result = await target.execute<{ ID: string }>(
    `SELECT id AS "ID" FROM ${t('tmf_geographic_site')}
      WHERE LOWER(name)=LOWER(:1) FETCH FIRST 2 ROWS ONLY`,
    [item.name],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return result.rows?.length === 1 ? (result.rows[0]?.ID ?? null) : null;
}

async function upsertLocation(target: Connection, id: string, item: ReturnType<typeof prepare>) {
  const geometry = JSON.stringify({
    type: 'Point',
    coordinates: [numberOf(item.row.LONGITUDE), numberOf(item.row.LATITUDE)],
  });
  await merge(target, 'tmf_geographic_location', ['id'], {
    id,
    tenant_id: args.tenantId,
    geometry_type: 'Point',
    geometry,
    spatial_ref: 'EPSG:4326',
    reference_point: cut(item.name, 255),
    source_system: 'NETWIN',
    source_ref: item.piId,
    characteristics: origin(item),
  });
}

async function upsertSite(
  target: Connection,
  id: string,
  locationId: string | null,
  item: ReturnType<typeof prepare>,
) {
  const specId = await siteSpecId(target, item.mapping.spec!);
  await merge(target, 'tmf_geographic_site', ['id'], {
    id,
    tenant_id: args.tenantId,
    name: cut(item.name, 255),
    site_specification_id: specId,
    status: 'Active',
    geographic_location_id: locationId,
    related_party: JSON.stringify([{ id: args.ownerPartyId, '@referredType': 'Organization' }]),
    characteristics: origin(item),
  });
}

async function upsertResource(
  target: Connection,
  id: string,
  locationId: string | null,
  item: ReturnType<typeof prepare>,
) {
  const specId = await resourceSpecId(target, item.mapping.spec!, item.mapping.resourceType!);
  await merge(target, 'tmf_physical_resource', ['id'], {
    id,
    name: cut(item.name, 255),
    resource_specification_id: specId,
    resource_type: item.mapping.resourceType!,
    status: 'active',
    geographic_location_id: locationId,
    place_id: locationId,
    place_type: locationId ? 'GeographicLocation' : null,
    administrative_state: 'unlocked',
    operational_state: 'enabled',
    usage_state: 'idle',
    related_party: JSON.stringify([{ id: args.ownerPartyId, '@referredType': 'Organization' }]),
    characteristics: origin(item),
  });
}

async function merge(
  target: Connection,
  table: string,
  keys: string[],
  record: Record<string, unknown>,
) {
  return mergeShared(target, t, table, keys, record);
}

async function ensureCatalog(target: Connection) {
  await ensureCategoryShared(target, t, 'Infrastructure.Passive', 'Infraestrutura Passiva');
  for (const [code, name] of [
    ['Tower', 'Torre'],
    ['RisingTube', 'Tubo de subida'],
    ['SpliceClosure', 'Caixa de emenda'],
    ['Pedestal', 'Pedestal'],
    ['SupportBracket', 'Suporte'],
    ['CableTunnel', 'Túnel de cabos'],
    ['IronPipe', 'Tubo de ferro'],
  ] as const)
    await ensureResourceTypeShared(target, t, code, name);
  for (const [code, name] of [
    ['Pole', 'Poste'],
    ['Manhole', 'Caixa subterrânea'],
    ['CTO', 'Caixa de terminação óptica'],
    ['DIO', 'Distribuidor interno óptico'],
  ] as const)
    await ensureResourceTypeShared(target, t, code, name);
  for (const [code, category, siteRole] of [
    ['BUILDING', 'Site', 'property'],
    ['CENTRAL_POP_LEGACY', 'Site', 'network'],
    ['ROOM', 'SubSite', 'network'],
    ['TECHNICAL_ROOM', 'SubSite', 'network'],
    ['CABINET', 'Site', 'network'],
    ['CUSTOMER_SITE', 'Site', 'service'],
    ['REMOTE_UNIT', 'Site', 'network'],
    ['ADVANCED_REMOTE_UNIT', 'Site', 'network'],
    ['TECHNICAL_CONTAINER', 'Site', 'network'],
  ] as const)
    await ensureSiteSpecShared(target, t, code, category, siteRole);
}

async function siteSpecId(target: Connection, code: string) {
  return siteSpecIdShared(target, t, code);
}
async function resourceSpecId(target: Connection, name: string, resourceType: string) {
  return resourceSpecIdShared(target, t, name, resourceType);
}

async function reject(
  target: Connection,
  jobId: string,
  item: ReturnType<typeof prepare>,
  code: string,
) {
  return rejectShared(target, t, jobId, item.piId, code, item.raw);
}
async function defer(
  target: Connection,
  jobId: string,
  item: ReturnType<typeof prepare>,
  reason: string,
) {
  return deferShared(target, t, jobId, item.piId, reason, item.raw);
}
async function recordParent(
  target: Connection,
  jobId: string,
  sourceId: string,
  parentSourceId: string,
) {
  return recordParentShared(target, t, jobId, sourceId, parentSourceId);
}

async function recordTouches(target: Connection, jobId: string, sourceIds: string[]) {
  return recordTouchesShared(target, t, jobId, sourceIds);
}

// Resolve depois da carga principal: assim uma onda pode conter filhos cujo pai aparece somente
// em lote posterior, e tambem pode ser reexecutada quando a onda do pai terminar.
async function resolveParents(target: Connection, jobId: string) {
  const parents = t('netwin_mig_parent');
  const identities = t('netwin_mig_identity');
  await target.execute(
    `MERGE INTO ${t('tmf_geographic_site')} child
     USING (SELECT child_i.nexus_id child_id, parent_i.nexus_id parent_id
              FROM ${parents} link JOIN ${identities} child_i
                ON child_i.source_entity='${SOURCE_ENTITY}' AND child_i.source_id=link.source_id AND child_i.target_role='primary'
              JOIN ${identities} parent_i
                ON parent_i.source_entity='${SOURCE_ENTITY}' AND parent_i.source_id=link.parent_source_id AND parent_i.target_role='primary'
             WHERE link.job_id=:1 AND child_i.nexus_entity_type='GeographicSite' AND parent_i.nexus_entity_type='GeographicSite') source
     ON (child.id=source.child_id) WHEN MATCHED THEN UPDATE SET child.parent_site_id=source.parent_id`,
    [jobId],
  );
  await target.execute(
    `MERGE INTO ${t('tmf_physical_resource')} child
     USING (SELECT child_i.nexus_id child_id, parent_i.nexus_id parent_id
              FROM ${parents} link JOIN ${identities} child_i
                ON child_i.source_entity='${SOURCE_ENTITY}' AND child_i.source_id=link.source_id AND child_i.target_role='primary'
              JOIN ${identities} parent_i
                ON parent_i.source_entity='${SOURCE_ENTITY}' AND parent_i.source_id=link.parent_source_id AND parent_i.target_role='primary'
             WHERE link.job_id=:1 AND child_i.nexus_entity_type='PhysicalResource' AND parent_i.nexus_entity_type='GeographicSite') source
     ON (child.id=source.child_id) WHEN MATCHED THEN UPDATE SET child.serving_site_id=source.parent_id`,
    [jobId],
  );
  await target.execute(
    `MERGE INTO ${t('tmf_resource_relationship')} relationship
     USING (SELECT parent_i.nexus_id parent_id, child_i.nexus_id child_id
              FROM ${parents} link JOIN ${identities} child_i
                ON child_i.source_entity='${SOURCE_ENTITY}' AND child_i.source_id=link.source_id AND child_i.target_role='primary'
              JOIN ${identities} parent_i
                ON parent_i.source_entity='${SOURCE_ENTITY}' AND parent_i.source_id=link.parent_source_id AND parent_i.target_role='primary'
             WHERE link.job_id=:1 AND child_i.nexus_entity_type='PhysicalResource' AND parent_i.nexus_entity_type='PhysicalResource') source
     ON (relationship.resource_from_id=source.child_id AND relationship.resource_to_id=source.parent_id AND relationship.relationship_type='supportedBy')
     WHEN NOT MATCHED THEN INSERT (resource_from_id,resource_to_id,relationship_type) VALUES (source.child_id,source.parent_id,'supportedBy')`,
    [jobId],
  );
}

// Atualiza somente as entidades tocadas pela onda. O índice de mapa passa a fazer parte
// da conclusão do job: se esta etapa falhar, o job não recebe state=loaded.
async function refreshMapFeatures(target: Connection, jobId: string): Promise<number> {
  const touch = t('netwin_mig_touch');
  const identities = t('netwin_mig_identity');
  console.log(JSON.stringify({ jobId, stage: 'map-index', action: 'delete' }));
  // Uma única exclusão relacional substitui N DELETEs (um por feature). O índice
  // auxiliar tenant/entity evita varredura da PK por tile quando a base crescer.
  await target.execute(
    `DELETE FROM ${t('geo_map_feature')} feature
      WHERE feature.tenant_id=:1
        AND EXISTS (
          SELECT 1 FROM ${touch} touch JOIN ${identities} identity
            ON identity.source_entity='${SOURCE_ENTITY}'
           AND identity.source_id=touch.source_id AND identity.target_role='primary'
           WHERE touch.job_id=:2 AND identity.nexus_id=feature.entity_id
        )`,
    [args.tenantId, jobId],
  );
  console.log(JSON.stringify({ jobId, stage: 'map-index', action: 'insert' }));
  // Algumas versões antigas do Oracle encerram a sessão ao aplicar JSON_VALUE sobre CLOB.
  // Lemos somente os candidatos da onda e gravamos em blocos: evita o protocolo incompatível
  // e ainda preserva poucos round-trips (um executeMany para cada mil features).
  const candidates = await target.execute<{
    ID: string;
    ENTITY_TYPE: 'PhysicalResource' | 'GeographicSite';
    RESOURCE_TYPE: string | null;
    SITE_CATEGORY: string | null;
    STATUS: string | null;
    NAME: string;
    SUBLABEL: string | null;
    GEOMETRY: string;
  }>(
    `SELECT r.id AS "ID", 'PhysicalResource' AS "ENTITY_TYPE", r.resource_type AS "RESOURCE_TYPE",
            NULL AS "SITE_CATEGORY", r.status AS "STATUS", r.name AS "NAME", NULL AS "SUBLABEL",
            l.geometry AS "GEOMETRY"
       FROM ${touch} touch
       JOIN ${identities} identity ON identity.source_entity='${SOURCE_ENTITY}'
        AND identity.source_id=touch.source_id AND identity.target_role='primary'
       JOIN ${t('tmf_physical_resource')} r ON r.id=identity.nexus_id
       JOIN ${t('tmf_geographic_location')} l ON l.id=r.place_id
      WHERE touch.job_id=:jobId AND r.status <> 'terminated'
        AND r.resource_type <> 'Splitter' AND l.geometry_type='Point'
     UNION ALL
     SELECT s.id AS "ID", 'GeographicSite' AS "ENTITY_TYPE", NULL AS "RESOURCE_TYPE",
            spec.category AS "SITE_CATEGORY", s.status AS "STATUS", s.name AS "NAME", spec.code AS "SUBLABEL",
            l.geometry AS "GEOMETRY"
       FROM ${touch} touch
       JOIN ${identities} identity ON identity.source_entity='${SOURCE_ENTITY}'
        AND identity.source_id=touch.source_id AND identity.target_role='primary'
       JOIN ${t('tmf_geographic_site')} s ON s.id=identity.nexus_id
       JOIN ${t('tmf_geographic_site_specification')} spec ON spec.id=s.site_specification_id
       JOIN ${t('tmf_geographic_location')} l ON l.id=s.geographic_location_id
      WHERE touch.job_id=:jobId AND spec.category IN ('Site','SubSite')
        AND s.status NOT IN ('Retired','terminated') AND l.geometry_type='Point'`,
    { jobId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const features: unknown[][] = [];
  for (const candidate of candidates.rows ?? []) {
    try {
      const coordinates = JSON.parse(candidate.GEOMETRY).coordinates;
      const [lng, lat] = coordinates as [unknown, unknown];
      if (
        typeof lng !== 'number' ||
        typeof lat !== 'number' ||
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < -180 ||
        lng > 180 ||
        lat < -85 ||
        lat > 85
      ) {
        continue;
      }
      const tile = lngLatToTile(lng, lat, MAP_TILE_ZOOM);
      features.push([
        args.tenantId,
        tile.z,
        tile.x,
        tile.y,
        candidate.ID,
        'point',
        candidate.ENTITY_TYPE === 'GeographicSite' ? 'site' : 'resource',
        candidate.ENTITY_TYPE,
        candidate.RESOURCE_TYPE,
        candidate.SITE_CATEGORY,
        candidate.STATUS,
        candidate.NAME,
        candidate.SUBLABEL,
        lng,
        lat,
      ]);
    } catch {
      // Geometria inválida não gera feature; o recurso continua preservado no inventário.
    }
  }

  const insertSql = `INSERT INTO ${t('geo_map_feature')}
    (tenant_id,tile_z,tile_x,tile_y,entity_id,shape,feature_kind,entity_type,
     type_code,site_category,status,label,sublabel,lng,lat,geometry,rank,generated_at)
    VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,NULL,0,SYSTIMESTAMP)`;
  const batchSize = 1000;
  for (let offset = 0; offset < features.length; offset += batchSize) {
    const batch = features.slice(offset, offset + batchSize);
    await target.executeMany(insertSql, batch);
    console.log(
      JSON.stringify({
        jobId,
        stage: 'map-index',
        inserted: Math.min(offset + batch.length, features.length),
        total: features.length,
      }),
    );
  }
  return features.length;
}

async function openJob(source: Connection, target: Connection, input: Args) {
  if (input.resume) {
    if (!input.jobId) throw new Error('--resume exige --job-id.');
    const row = await target.execute<{
      ID: string;
      SOURCE_SCN: string;
      LAST_PI_ID: number;
      UF_ID: number | null;
      MUNICIPIO_ID: number | null;
      MAPPING_VERSION: string;
    }>(
      `SELECT id AS "ID",source_scn AS "SOURCE_SCN",last_pi_id AS "LAST_PI_ID",uf_id AS "UF_ID",municipio_id AS "MUNICIPIO_ID",mapping_version AS "MAPPING_VERSION" FROM ${t('netwin_mig_job')} WHERE id=:1`,
      [input.jobId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const job = row.rows?.[0];
    if (!job) throw new Error('Job nao encontrado.');
    if (
      (input.ufId !== undefined && Number(job.UF_ID) !== input.ufId) ||
      (input.municipioId !== undefined && Number(job.MUNICIPIO_ID) !== input.municipioId) ||
      job.MAPPING_VERSION !== MAPPING_VERSION
    ) {
      throw new Error(
        'O escopo informado nao confere com o job existente ou a versao do mapeamento mudou.',
      );
    }
    return {
      id: job.ID,
      scn: job.SOURCE_SCN,
      lastPiId: Number(job.LAST_PI_ID ?? 0),
      ...(job.UF_ID !== null ? { ufId: Number(job.UF_ID) } : {}),
      ...(job.MUNICIPIO_ID !== null ? { municipioId: Number(job.MUNICIPIO_ID) } : {}),
    };
  }
  const scn = input.sourceScn ?? (await currentScn(source)) ?? 'CURRENT';
  const id = randomUUID();
  await target.execute(
    `INSERT INTO ${t('netwin_mig_job')} (id,source_scn,uf_id,municipio_id,mapping_version,last_pi_id,state,loaded_count,rejected_count,deferred_count,created_at,updated_at) VALUES (:1,:2,:3,:4,:5,0,'running',0,0,0,SYSTIMESTAMP,SYSTIMESTAMP)`,
    [id, scn, input.ufId ?? null, input.municipioId ?? null, MAPPING_VERSION],
    { autoCommit: true },
  );
  return {
    id,
    scn,
    lastPiId: 0,
    ...(input.ufId !== undefined ? { ufId: input.ufId } : {}),
    ...(input.municipioId !== undefined ? { municipioId: input.municipioId } : {}),
  };
}
async function currentScn(source: Connection) {
  // V$DATABASE exige privilégio de catálogo, normalmente ausente na conta DR de
  // leitura. DBMS_FLASHBACK entrega o mesmo SCN sem expor views administrativas.
  try {
    const result = await source.execute<{ CURRENT_SCN: string }>(
      'SELECT DBMS_FLASHBACK.GET_SYSTEM_CHANGE_NUMBER() AS "CURRENT_SCN" FROM DUAL',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const scn = result.rows?.[0]?.CURRENT_SCN;
    if (scn) return String(scn);
  } catch (flashbackError) {
    if (!/ORA-00904|ORA-01031|ORA-00942/.test(String(flashbackError))) throw flashbackError;
  }
  return undefined;
}

async function ensureControlTablesAndMapIndex(target: Connection) {
  await ensureControlTables(target, t);
  await ensureMapEntityIndex(target, t, targetPrefix);
}

function classify(type: string): Mapping {
  if (type.endsWith('.SURVEY.SURVEY')) return { kind: 'survey' };
  if (type.includes('.FICTNODE.') || type.endsWith('.WITHOUTINFRA')) return { kind: 'deferred' };
  if (type.endsWith('.BUILDING.BUILDING')) return { kind: 'site', spec: 'BUILDING' };
  if (type.endsWith('.BUILDING.CENTRAL')) return { kind: 'site', spec: 'CENTRAL_POP_LEGACY' };
  if (type.endsWith('.ROOM.ROOM')) return { kind: 'site', spec: 'ROOM' };
  if (type.endsWith('.ROOM.TECROOM')) return { kind: 'site', spec: 'TECHNICAL_ROOM' };
  if (type.includes('.CABINET.') && !type.endsWith('.OPTICALFRAME'))
    return { kind: 'site', spec: 'CABINET' };
  if (type.endsWith('.SITE.CLIENTE.SC')) return { kind: 'site', spec: 'CUSTOMER_SITE' };
  if (type.endsWith('.REMOTE_UNIT.UR')) return { kind: 'site', spec: 'REMOTE_UNIT' };
  if (type.endsWith('.REMOTE_UNIT.URA')) return { kind: 'site', spec: 'ADVANCED_REMOTE_UNIT' };
  if (type.endsWith('.CONTAINER.CONTAINER')) return { kind: 'site', spec: 'TECHNICAL_CONTAINER' };
  if (type.endsWith('.MANHOLE.MS'))
    return { kind: 'resource', spec: 'Netwin Manhole MS', resourceType: 'Manhole' };
  if (type.endsWith('.MANHOLE.MQ'))
    return { kind: 'resource', spec: 'Netwin Manhole MQ', resourceType: 'Manhole' };
  if (type.endsWith('.MANHOLE.MX'))
    return { kind: 'resource', spec: 'Netwin Manhole MX', resourceType: 'Manhole' };
  if (type.endsWith('.OPTDISTRIBUTIONBOX.CDOI'))
    return { kind: 'resource', spec: 'Netwin CDOI', resourceType: 'CTO' };
  if (type.endsWith('.OPTDISTRIBUTIONBOX.CDOE'))
    return { kind: 'resource', spec: 'Netwin CDOE', resourceType: 'CTO' };
  const physical: Array<[string, string, string]> = [
    ['.POLE.POLE', 'Netwin Pole', 'Pole'],
    ['.MANHOLE.', 'Netwin Manhole', 'Manhole'],
    ['.TOWER.TOWER', 'Netwin Tower', 'Tower'],
    ['.OPTDISTRIBUTIONBOX.', 'Netwin CTO', 'CTO'],
    ['.CABINET.OPTICALFRAME', 'Netwin Optical Frame', 'DIO'],
    ['.RISING_TUBE.', 'Netwin Rising Tube', 'RisingTube'],
    ['.SPLICEBOX.', 'Netwin Splice Closure', 'SpliceClosure'],
    ['.PEDESTAL.', 'Netwin Pedestal', 'Pedestal'],
    ['.SPECIAL.ARM', 'Netwin Support Bracket', 'SupportBracket'],
    ['.CON_TUNNEL.', 'Netwin Cable Tunnel', 'CableTunnel'],
    ['.IRON_PIPE.', 'Netwin Iron Pipe', 'IronPipe'],
  ];
  const hit = physical.find(([needle]) => type.includes(needle));
  return hit ? { kind: 'resource', spec: hit[1], resourceType: hit[2] } : { kind: 'deferred' };
}
function origin(item: ReturnType<typeof prepare>) {
  return JSON.stringify([
    { group: '_origin', name: 'system', value: 'NETWIN', valueType: 'string' },
    { group: '_origin', name: 'id', value: item.piId, valueType: 'string' },
    { group: '_origin', name: 'entity', value: SOURCE_ENTITY, valueType: 'string' },
    { group: '_origin', name: 'extra', value: item.row, valueType: 'json' },
    { group: '_migration', name: 'statusAssumed', value: true, valueType: 'boolean' },
  ]);
}
function displayName(row: SourceRow, id: string) {
  return cut(
    String(row.PI_ABRV ?? row.PI_DSC ?? `Infraestrutura ${id}`).trim() || `Infraestrutura ${id}`,
    255,
  );
}
function summarize(items: ReturnType<typeof prepare>[]) {
  return {
    loaded: items.filter((x) => x.state === 'loaded').length,
    rejected: items.filter((x) => x.state === 'rejected').length,
    deferred: items.filter((x) => x.state === 'deferred').length,
  };
}
function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const integer = (flag: string) => {
    const value = get(flag);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${flag} deve ser inteiro.`);
    return parsed;
  };
  const batchSize = integer('--batch-size') ?? 500;
  if (batchSize < 1 || batchSize > 5000) throw new Error('--batch-size deve estar entre 1 e 5000.');
  const ufId = integer('--uf-id');
  const municipioId = integer('--municipio-id');
  const maxRecords = integer('--max-records');
  if (maxRecords !== undefined && maxRecords < 1)
    throw new Error('--max-records deve ser maior que zero.');
  if (!argv.includes('--resume') && ufId === undefined && municipioId === undefined)
    throw new Error(
      'Informe --uf-id e/ou --municipio-id; carga nacional exige implementacao explicita.',
    );
  const jobId = get('--job-id');
  const sourceScn = get('--source-scn');
  const finalizeOnly = argv.includes('--finalize-only');
  if (finalizeOnly && !argv.includes('--resume'))
    throw new Error('--finalize-only exige --resume --job-id.');
  return {
    apply: argv.includes('--apply'),
    resume: argv.includes('--resume'),
    finalizeOnly,
    refreshMap: argv.includes('--refresh-map'),
    batchSize,
    tenantId: get('--tenant-id') ?? 'default',
    ownerPartyId: get('--owner-party-id') ?? 'vtal',
    ...(jobId ? { jobId } : {}),
    ...(ufId !== undefined ? { ufId } : {}),
    ...(municipioId !== undefined ? { municipioId } : {}),
    ...(sourceScn ? { sourceScn } : {}),
    ...(maxRecords !== undefined ? { maxRecords } : {}),
  };
}
