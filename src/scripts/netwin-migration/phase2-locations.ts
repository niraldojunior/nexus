import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { deterministicUuid, netwinLocationId, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import { bulkMergeRows, netwinOriginCharacteristics } from '../netwin-migration-kit.js';
import { loadNativeCheckpoint, saveNativeCheckpoint } from './checkpoint.js';
import { MigrationProgress } from './progress.js';
import {
  chunksOf,
  namedInBinds,
  scopedInfranodeIdQuery,
  selectFullTableIds,
  selectScopedInfranodeIds,
  structuredInfranodePredicates,
} from './source-batches.js';
import type { PhaseStats } from './types.js';

// Parser de endereço brasileiro do Netwin
// Ex: "RUA ATAULPHO COUTINHO, 80, BLOCO 1, BARRA DA TIJUCA, RIO DE JANEIRO - RJ 22793520"
export function parseAddressString(raw: string | null | undefined) {
  if (!raw || !raw.trim()) return null;
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const tail = parts[parts.length - 1] ?? '';
  const postcodeMatch = tail.match(/(\d{8})\s*$/);
  const [cityRaw, ufRaw] = tail
    .replace(/\d{8}\s*$/, '')
    .trim()
    .split(/\s*-\s*/);
  return {
    street: parts[0] ?? '',
    streetNr:
      parts.length > 1 ? (parts[1] === 'SN' || parts[1] === 'S/N' ? 'S/N' : parts[1]) : null,
    locality: parts.length > 3 ? (parts[parts.length - 2] ?? null) : null,
    city: cityRaw?.trim() || null,
    stateOrProvince: ufRaw?.trim().toUpperCase() || null,
    postcode: postcodeMatch?.[1] ?? null,
  };
}

type NetwinLocationRow = {
  ID: number;
  NAME: string | null;
  LATITUDE: number | null;
  LONGITUDE: number | null;
  ID_CAT_ENTITY: number | null;
  STATE_LIFECYCLE: string | null;
  CAT_NAME: string | null;
  CAT_DESC: string | null;
  ADDRESS_TEXT: string | null;
};

type BatchTiming = {
  scopeSelectionMs: number;
  locationHydrationMs: number;
  addressHydrationMs: number;
  associationHydrationMs: number;
  transformMs: number;
  locationMergeMs: number;
  addressMergeMs: number;
  siteMergeMs: number;
  hierarchyUpdateMs: number;
  commitMs: number;
};

const elapsed = (startedAt: number) => Date.now() - startedAt;
const formatTiming = (timing: BatchTiming) =>
  Object.entries(timing)
    .map(([stage, milliseconds]) => `${stage}=${milliseconds}ms`)
    .join('; ');

/** @deprecated Use scopedInfranodeIdQuery from source-batches.ts for all structured scopes. */
export const neighborhoodLocationIdQuery = (predicates: string[]): string =>
  scopedInfranodeIdQuery(predicates);

async function hydrateLocations(
  source: Awaited<ReturnType<MigrationContext['getSourceConnection']>>,
  ids: number[],
): Promise<NetwinLocationRow[]> {
  const locations = new Map<number, NetwinLocationRow>();
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'location');
    const result = await source.execute<Omit<NetwinLocationRow, 'ADDRESS_TEXT'>>(
      `SELECT l.ID, l.NAME, l.LATITUDE, l.LONGITUDE, l.ID_CAT_ENTITY, l.STATE_LIFECYCLE,
              ce.NAME AS CAT_NAME, ce.DESCRIPTION AS CAT_DESC
         FROM NETWIN.LOCATION l
         LEFT JOIN NETWIN.CAT_ENTITY ce ON ce.ID = l.ID_CAT_ENTITY
        WHERE l.ID IN (${clause})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: chunk.length },
    );
    for (const row of result.rows ?? []) locations.set(row.ID, { ...row, ADDRESS_TEXT: null });
  }
  return ids.flatMap((id) => (locations.has(id) ? [locations.get(id)!] : []));
}

async function hydrateAddresses(
  source: Awaited<ReturnType<MigrationContext['getSourceConnection']>>,
  ids: number[],
): Promise<Map<number, string>> {
  const addresses = new Map<number, string>();
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'location');
    const result = await source.execute<{ ID_LOCATION: number; ADDRESS_TEXT: string | null }>(
      `SELECT laa.ID_LOCATION, MAX(a.NAME) AS ADDRESS_TEXT
         FROM NETWIN.LOCATION_ADDRESS_ASSOC laa
         JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
        WHERE laa.ID_LOCATION IN (${clause})
        GROUP BY laa.ID_LOCATION`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: chunk.length },
    );
    for (const row of result.rows ?? []) {
      if (row.ADDRESS_TEXT) addresses.set(row.ID_LOCATION, row.ADDRESS_TEXT);
    }
  }
  return addresses;
}

async function hydrateAssociations(
  source: Awaited<ReturnType<MigrationContext['getSourceConnection']>>,
  ids: number[],
): Promise<Array<{ ID_PARENT: number; ID_CHILD: number }>> {
  const associations: Array<{ ID_PARENT: number; ID_CHILD: number }> = [];
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'child');
    const result = await source.execute<{ ID_PARENT: number; ID_CHILD: number }>(
      `SELECT ID_PARENT, ID_CHILD FROM NETWIN.LOCATION_ASSOC WHERE ID_CHILD IN (${clause})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    associations.push(...(result.rows ?? []));
  }
  return associations;
}

export type PhaseRunStats = PhaseStats & { paused: boolean };

export async function runPhase2Locations(ctx: MigrationContext): Promise<PhaseRunStats> {
  const stats: PhaseRunStats = {
    loaded: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    errors: 0,
    paused: false,
  };
  console.log('\n=== Fase 2.A: Locais, Endereços e Hierarquia (GeographicSite) ===');
  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();
  try {
    const structuredScope = Boolean(
      ctx.options.scope.bairro || ctx.options.scope.municipio || ctx.options.scope.uf,
    );
    const predicates = structuredInfranodePredicates(ctx.options.scope);
    console.log(
      `[Escopo] Fase 2.A: ${structuredScope ? `DL_INFRANODE estruturado (${predicates.length} predicado(s))` : 'LOCATION nacional por ID'}.`,
    );
    const checkpoint = await loadNativeCheckpoint(target, ctx, '2A');
    let lastId = checkpoint.lastSourceId;
    let totalProcessed = checkpoint.processedCount;
    let processedThisRun = 0;
    if (ctx.options.resume) {
      console.log(`[Resume] Fase 2.A: cursor ${lastId}; processados=${totalProcessed}.`);
    }
    const maxRecords = ctx.options.maxRecords ?? Infinity;
    const progress = new MigrationProgress({
      label: 'Fase 2.A — Locais',
      unit: 'locais',
      reportEvery: ctx.options.batchSize,
    });
    progress.start();

    for (;;) {
      const remaining = maxRecords - processedThisRun;
      if (remaining <= 0) break;
      const limit = Math.min(ctx.options.batchSize, remaining);
      const timing: BatchTiming = {
        scopeSelectionMs: 0,
        locationHydrationMs: 0,
        addressHydrationMs: 0,
        associationHydrationMs: 0,
        transformMs: 0,
        locationMergeMs: 0,
        addressMergeMs: 0,
        siteMergeMs: 0,
        hierarchyUpdateMs: 0,
        commitMs: 0,
      };
      let startedAt = Date.now();
      const ids = structuredScope
        ? await selectScopedInfranodeIds(source, ctx.options.scope, lastId, limit)
        : await selectFullTableIds(source, 'NETWIN.LOCATION', lastId, limit);
      timing.scopeSelectionMs = elapsed(startedAt);
      if (ids.length === 0) break;
      lastId = ids[ids.length - 1] ?? lastId;

      startedAt = Date.now();
      const rows = await hydrateLocations(source, ids);
      timing.locationHydrationMs = elapsed(startedAt);
      startedAt = Date.now();
      const addressByLocation = await hydrateAddresses(source, ids);
      timing.addressHydrationMs = elapsed(startedAt);
      startedAt = Date.now();
      const associations = await hydrateAssociations(source, ids);
      timing.associationHydrationMs = elapsed(startedAt);

      startedAt = Date.now();
      const locations: Array<Record<string, unknown>> = [];
      const addresses: Array<Record<string, unknown>> = [];
      const sites: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        const lat = row.LATITUDE === null ? null : Number(row.LATITUDE);
        const lng = row.LONGITUDE === null ? null : Number(row.LONGITUDE);
        const hasPoint =
          lat !== null && lng !== null && lng >= -75 && lng <= -32 && lat >= -35 && lat <= 6;
        const siteId = netwinLocationId(row.ID);
        const locationId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `LOCATION:GEO:${row.ID}`);
        const siteName = (row.NAME ?? `Local ${row.ID}`).trim();
        if (hasPoint)
          locations.push({
            id: locationId,
            tenant_id: ctx.options.tenantId,
            geometry_type: 'Point',
            geometry: JSON.stringify({ type: 'Point', coordinates: [lng, lat] }),
            spatial_ref: 'EPSG:4326',
            reference_point: siteName.slice(0, 255),
            characteristics: '[]',
          });
        const parsed = parseAddressString(addressByLocation.get(row.ID));
        const addressId = parsed
          ? deterministicUuid(NEXUS_NETWIN_NAMESPACE, `LOCATION:ADDR:${row.ID}`)
          : null;
        if (parsed && addressId)
          addresses.push({
            id: addressId,
            tenant_id: ctx.options.tenantId,
            street_name: parsed.street.slice(0, 255),
            street_nr: parsed.streetNr?.slice(0, 50) ?? null,
            locality: parsed.locality?.slice(0, 100) ?? null,
            city: parsed.city?.slice(0, 100) ?? null,
            state_or_province: parsed.stateOrProvince?.slice(0, 50) ?? null,
            country: 'BR',
            postcode: parsed.postcode,
            geographic_location_id: hasPoint ? locationId : null,
            characteristics: '[]',
          });
        const catName = (row.CAT_NAME ?? '').toUpperCase();
        const catDesc = (row.CAT_DESC ?? '').toUpperCase();
        let specCode = 'BUILDING';
        if (catName.includes('POLE') || catDesc.includes('POSTE')) specCode = 'POLE';
        else if (catName.includes('MANHOLE') || catDesc.includes('CAIXA')) specCode = 'MANHOLE';
        else if (
          catName.includes('CENTRAL') ||
          catName.includes('STATION') ||
          catName.includes('CENTRO') ||
          catName.includes('LOCALITY') ||
          catName.includes('CITYAREA')
        )
          specCode = 'CENTRAL_OFFICE';
        else if (catName.includes('ROOM') || catName.includes('SALA') || catDesc.includes('ROOM'))
          specCode = 'ROOM';
        else if (catName.includes('FLOOR') || catName.includes('ANDAR')) specCode = 'FLOOR';
        else if (catName.includes('CABINET') || catName.includes('ARMARIO')) specCode = 'CABINET';
        else if (catName.includes('SURVEY') || catDesc.includes('CLIENT'))
          specCode = 'CUSTOMER_SITE';
        else if (catName.includes('REMOTE_UNIT.UR') || catDesc.includes('UNIDADE REMOTA'))
          specCode = 'REMOTE_UNIT';
        sites.push({
          id: siteId,
          tenant_id: ctx.options.tenantId,
          name: siteName.slice(0, 255),
          site_specification_id: deterministicUuid(NEXUS_NETWIN_NAMESPACE, `SITE_SPEC:${specCode}`),
          status: 'Active',
          geographic_location_id: hasPoint ? locationId : null,
          geographic_address_id: addressId,
          parent_site_id: null,
          related_party: JSON.stringify([
            { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
          ]),
          characteristics: JSON.stringify([
            ...netwinOriginCharacteristics('LOCATION', row.ID),
            ...(row.STATE_LIFECYCLE
              ? [{ name: 'stateLifecycle', value: row.STATE_LIFECYCLE, valueType: 'string' }]
              : []),
          ]),
        });
      }
      timing.transformMs = elapsed(startedAt);

      const nextTotalProcessed = totalProcessed + ids.length;
      if (target) {
        try {
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'tmf_geographic_location',
            ['id'],
            [
              'id',
              'tenant_id',
              'geometry_type',
              'geometry',
              'spatial_ref',
              'reference_point',
              'characteristics',
            ],
            locations,
            ctx.options.batchSize,
          );
          timing.locationMergeMs = elapsed(startedAt);
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'tmf_geographic_address',
            ['id'],
            [
              'id',
              'tenant_id',
              'street_name',
              'street_nr',
              'locality',
              'city',
              'state_or_province',
              'country',
              'postcode',
              'geographic_location_id',
              'characteristics',
            ],
            addresses,
            ctx.options.batchSize,
          );
          timing.addressMergeMs = elapsed(startedAt);
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'tmf_geographic_site',
            ['id'],
            [
              'id',
              'tenant_id',
              'name',
              'site_specification_id',
              'status',
              'geographic_location_id',
              'geographic_address_id',
              'related_party',
              'characteristics',
            ],
            sites,
            ctx.options.batchSize,
          );
          timing.siteMergeMs = elapsed(startedAt);
          startedAt = Date.now();
          // Binds nomeados, não posicionais: node-oracledb liga binds por ordem de aparição e
          // ignora o número em `:n`, então `:1` repetido consumia um terceiro valor inexistente
          // no array de dois elementos. Com nome, a repetição de :parentId resolve corretamente.
          if (associations.length > 0)
            await target.executeMany(
              `UPDATE ${ctx.t('tmf_geographic_site')} child SET child.parent_site_id=:parentId WHERE child.id=:childId AND EXISTS (SELECT 1 FROM ${ctx.t('tmf_geographic_site')} parent WHERE parent.id=:parentId)`,
              associations.map((association) => ({
                parentId: netwinLocationId(association.ID_PARENT),
                childId: netwinLocationId(association.ID_CHILD),
              })),
              {
                autoCommit: false,
                bindDefs: {
                  parentId: { type: oracledb.STRING, maxSize: 36 },
                  childId: { type: oracledb.STRING, maxSize: 36 },
                },
              },
            );
          timing.hierarchyUpdateMs = elapsed(startedAt);
          await saveNativeCheckpoint(target, ctx, '2A', {
            lastSourceId: lastId,
            processedCount: nextTotalProcessed,
          });
          startedAt = Date.now();
          await target.execute('COMMIT');
          timing.commitMs = elapsed(startedAt);
        } catch (error) {
          await target.execute('ROLLBACK');
          throw error;
        }
      }
      totalProcessed = nextTotalProcessed;
      processedThisRun += ids.length;
      stats.loaded += sites.length;
      progress.advance(ids.length);
      console.log(
        `[Progresso] Fase 2.A — cursor ${lastId}; selecionados=${ids.length}; hidratados=${rows.length}; ${formatTiming(timing)}.`,
      );
    }
    stats.paused = Boolean(ctx.options.maxRecords && processedThisRun >= ctx.options.maxRecords);
    progress.finish();
    console.log(
      stats.paused
        ? `Fase 2.A pausada após ${processedThisRun} locais neste comando.`
        : `Fase 2.A concluída: ${stats.loaded} locais reconciliados.`,
    );
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
