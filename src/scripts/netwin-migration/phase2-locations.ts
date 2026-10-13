import oracledb from 'oracledb';
import { sourceHydrationConcurrency, type MigrationContext } from './context.js';
import { deterministicUuid, netwinLocationId, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import {
  bulkMergeRows,
  netwinOriginCharacteristics,
  resolveAdministrativeCityIds,
  resolveNetwinSiteStatus,
} from '../netwin-migration-kit.js';
import {
  administrativeCityNaturalKey,
  normalizeAdministrativeCity,
  normalizeStateCode,
  type AdministrativeCityTuple,
} from '../../modules/geo/administrative-city.js';
import { reconcileAdministrativeCitySiteCounts } from './administrative-city-site-count.js';
import { composeNetwinSiteName } from './site-name.js';
import { loadNativeCheckpoint, saveNativeCheckpoint } from './checkpoint.js';
import { MigrationProgress } from './progress.js';
import { createScopedInfranodePager } from './scoped-infranode-ids.js';
import { resolveMunicipalityScopePrefilter } from './scope-resolution.js';
import {
  chunksOf,
  namedInBinds,
  scopedInfranodeIdQuery,
  selectFullTableIds,
  structuredInfranodePredicates,
} from './source-batches.js';
import type { PhaseStats } from './types.js';

/**
 * Normaliza a UF vinda do texto do Netwin para a sigla de 2 letras. O sufixo do endereço pode
 * trazer lixo colado à sigla ("ES 7585677", "PR 0 FOZ DO IGUACU"); só a sigla inicial válida
 * é aceita. Qualquer outra coisa vira `null` em vez de poluir a árvore de Locais.
 */
export const normalizeUf = normalizeStateCode;

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
    stateOrProvince: normalizeUf(ufRaw),
    postcode: postcodeMatch?.[1] ?? null,
  };
}

type NetwinLocationRow = {
  ID: number;
  NAME: string | null;
  DESCRIPTION: string | null;
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

type SourceConnection = Awaited<ReturnType<MigrationContext['getSourceConnection']>>;
type CatalogEntry = { CAT_NAME: string | null; CAT_DESC: string | null };

/** Catálogo pequeno de categorias: lido uma vez por execução, recomposto em memória (LEFT JOIN). */
async function loadCategoryCatalog(source: SourceConnection): Promise<Map<number, CatalogEntry>> {
  const result = await source.execute<{
    ID: number;
    NAME: string | null;
    DESCRIPTION: string | null;
  }>(
    'SELECT ID, NAME, DESCRIPTION FROM NETWIN.CAT_ENTITY',
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: 2000, prefetchRows: 2001 },
  );
  return new Map(
    (result.rows ?? []).map((row) => [row.ID, { CAT_NAME: row.NAME, CAT_DESC: row.DESCRIPTION }]),
  );
}

async function hydrateLocations(
  source: SourceConnection,
  ids: number[],
  catalog: Map<number, CatalogEntry>,
): Promise<NetwinLocationRow[]> {
  const locations = new Map<number, NetwinLocationRow>();
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'location');
    const result = await source.execute<
      Omit<NetwinLocationRow, 'ADDRESS_TEXT' | 'CAT_NAME' | 'CAT_DESC'>
    >(
      `SELECT l.ID, l.NAME, l.DESCRIPTION, l.LATITUDE, l.LONGITUDE, l.ID_CAT_ENTITY, l.STATE_LIFECYCLE
         FROM NETWIN.LOCATION l
        WHERE l.ID IN (${clause})`,
      binds,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: chunk.length,
        prefetchRows: chunk.length + 1,
      },
    );
    for (const row of result.rows ?? []) {
      const category = (row.ID_CAT_ENTITY !== null
        ? catalog.get(row.ID_CAT_ENTITY)
        : undefined) ?? {
        CAT_NAME: null,
        CAT_DESC: null,
      };
      locations.set(row.ID, { ...row, ...category, ADDRESS_TEXT: null });
    }
  }
  return ids.flatMap((id) => (locations.has(id) ? [locations.get(id)!] : []));
}

async function hydrateAddresses(
  source: SourceConnection,
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
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: chunk.length,
        prefetchRows: chunk.length + 1,
      },
    );
    for (const row of result.rows ?? []) {
      if (row.ADDRESS_TEXT) addresses.set(row.ID_LOCATION, row.ADDRESS_TEXT);
    }
  }
  return addresses;
}

async function hydrateAssociations(
  source: SourceConnection,
  ids: number[],
): Promise<Array<{ ID_PARENT: number; ID_CHILD: number }>> {
  const associations: Array<{ ID_PARENT: number; ID_CHILD: number }> = [];
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'child');
    const result = await source.execute<{ ID_PARENT: number; ID_CHILD: number }>(
      `SELECT ID_PARENT, ID_CHILD FROM NETWIN.LOCATION_ASSOC WHERE ID_CHILD IN (${clause})`,
      binds,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: 2000,
        prefetchRows: 2001,
      },
    );
    for (const row of result.rows ?? []) associations.push(row);
  }
  return associations;
}

/** `PI_PISO` das salas: o Netwin não tem LOCATION de pavimento, só este atributo de agrupamento. */
async function hydrateFloors(
  source: SourceConnection,
  ids: number[],
): Promise<Array<{ PI_ID: number; PI_PISO: string; PI_PARENT_ID: number | null }>> {
  const rows: Array<{ PI_ID: number; PI_PISO: string; PI_PARENT_ID: number | null }> = [];
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'pi');
    const result = await source.execute<{
      PI_ID: number;
      PI_PISO: string;
      PI_PARENT_ID: number | null;
    }>(
      `SELECT PI_ID, PI_PISO, PI_PARENT_ID
         FROM NETWINOI.DL_INFRANODE
        WHERE PI_ID IN (${clause}) AND PI_PISO IS NOT NULL`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of result.rows ?? []) rows.push(row);
  }
  return rows;
}

export type NetwinSiteMunicipality = {
  tuple: AdministrativeCityTuple;
  sourceRef: string | null;
};

type InfranodeMunicipalityRow = {
  PI_ID: number;
  MUNICIPIO_ID: number | string | null;
  MUNICIPIO: string | null;
  UF_ABRV: string | null;
};

/**
 * Município estruturado do `DL_INFRANODE` (BADDR_* com fallback para as colunas base). Alimenta a
 * projeção Site→município de Sites sem endereço postal; nunca fabrica endereço.
 */
export function municipalityFromInfranodeRow(
  row: InfranodeMunicipalityRow,
): NetwinSiteMunicipality | null {
  const tuple = normalizeAdministrativeCity({
    country: 'BR',
    stateOrProvince: normalizeUf(row.UF_ABRV),
    city: row.MUNICIPIO,
  });
  if (!tuple) return null;
  const sourceRef =
    row.MUNICIPIO_ID === null || row.MUNICIPIO_ID === undefined ? null : String(row.MUNICIPIO_ID);
  return { tuple, sourceRef };
}

async function hydrateMunicipalities(
  source: SourceConnection,
  ids: number[],
): Promise<Map<number, NetwinSiteMunicipality>> {
  const municipalities = new Map<number, NetwinSiteMunicipality>();
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'pi');
    const result = await source.execute<InfranodeMunicipalityRow>(
      `SELECT PI_ID,
              COALESCE(BADDR_MUNICIPIO_ID, MUNICIPIO_ID) AS MUNICIPIO_ID,
              COALESCE(BADDR_MUNICIPIO, MUNICIPIO) AS MUNICIPIO,
              COALESCE(BADDR_UF_ABRV, UF_ABRV) AS UF_ABRV
         FROM NETWINOI.DL_INFRANODE
        WHERE PI_ID IN (${clause})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of result.rows ?? []) {
      const municipality = municipalityFromInfranodeRow(row);
      if (municipality) municipalities.set(row.PI_ID, municipality);
    }
  }
  return municipalities;
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
  const auxSources: SourceConnection[] = [];
  const target = await ctx.getTargetConnection();
  try {
    // Conexões auxiliares para hidratação concorrente (default 3 no total, teto 4).
    for (let index = 1; index < Math.min(sourceHydrationConcurrency(), 3); index += 1) {
      auxSources.push(await ctx.getSourceConnection());
    }
    const categoryCatalog = await loadCategoryCatalog(source);
    const structuredScope = Boolean(
      ctx.options.scope.bairro || ctx.options.scope.municipio || ctx.options.scope.uf,
    );
    const municipalityPrefilter = structuredScope
      ? await resolveMunicipalityScopePrefilter(source, ctx.options.scope)
      : undefined;
    const predicates = structuredInfranodePredicates(
      ctx.options.scope,
      'infranode',
      municipalityPrefilter,
    );
    const pager = structuredScope
      ? await createScopedInfranodePager(source, ctx.options.scope, municipalityPrefilter, {
          cacheOwner: ctx,
        })
      : undefined;
    const scopeStrategy = pager?.strategy ?? 'location-nacional';
    console.log(
      `[Escopo] Fase 2.A: ${structuredScope ? `DL_INFRANODE estruturado (${predicates.length} predicado(s); estratégia=${scopeStrategy})` : 'LOCATION nacional por ID'}.`,
    );
    if (municipalityPrefilter) {
      console.log(
        `[Escopo] Município resolvido para BADDR_MUNICIPIO_ID=${municipalityPrefilter.municipalityIds.join(',')}; resolução=${municipalityPrefilter.resolutionMs}ms.`,
      );
    }
    const checkpoint = await loadNativeCheckpoint(target, ctx, '2A');
    let lastId = checkpoint.lastSourceId;
    let totalProcessed = checkpoint.processedCount;
    let processedThisRun = 0;
    if (ctx.options.resume) {
      console.log(`[Resume] Fase 2.A: cursor ${lastId}; processados=${totalProcessed}.`);
    }
    const trace = (message: string) => {
      if (process.env.NETWIN_TRACE) console.log(`[Trace ${new Date().toISOString()}] ${message}`);
    };
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
      const ids = pager
        ? await pager.next(lastId, limit)
        : await selectFullTableIds(source, 'NETWIN.LOCATION', lastId, limit);
      timing.scopeSelectionMs = elapsed(startedAt);
      const configuredSlowSelectionMs = Number(process.env.NETWIN_SCOPE_SLOW_MS);
      const slowSelectionMs =
        Number.isFinite(configuredSlowSelectionMs) && configuredSlowSelectionMs > 0
          ? configuredSlowSelectionMs
          : 5_000;
      if (timing.scopeSelectionMs > slowSelectionMs) {
        console.warn(
          `[Escopo] Seleção lenta na Fase 2.A: ${timing.scopeSelectionMs}ms; estratégia=${scopeStrategy}; cursor=${lastId}; selecionados=${ids.length}.`,
        );
      }
      if (ids.length === 0) break;
      lastId = ids[ids.length - 1] ?? lastId;

      // Três famílias independentes, cada uma na própria conexão (o driver serializa por
      // conexão). Com NETWIN_SOURCE_CONCURRENCY=1 volta ao modo sequencial na conexão principal.
      const timed = async <T>(
        connection: SourceConnection,
        key: 'locationHydrationMs' | 'addressHydrationMs' | 'associationHydrationMs',
        run: (connection: SourceConnection) => Promise<T>,
      ): Promise<T> => {
        const hydrationStartedAt = Date.now();
        try {
          return await run(connection);
        } finally {
          timing[key] = elapsed(hydrationStartedAt);
        }
      };
      const runLocations = (c: SourceConnection) =>
        timed(c, 'locationHydrationMs', (conn) => hydrateLocations(conn, ids, categoryCatalog));
      const runAddresses = (c: SourceConnection) =>
        timed(c, 'addressHydrationMs', (conn) => hydrateAddresses(conn, ids));
      const runAssociations = (c: SourceConnection) =>
        timed(c, 'associationHydrationMs', (conn) => hydrateAssociations(conn, ids));
      let rows: NetwinLocationRow[];
      let addressByLocation: Map<number, string>;
      let associations: Array<{ ID_PARENT: number; ID_CHILD: number }>;
      if (auxSources.length === 0) {
        rows = await runLocations(source);
        addressByLocation = await runAddresses(source);
        associations = await runAssociations(source);
      } else {
        [rows, addressByLocation, associations] = await Promise.all([
          runLocations(source),
          runAddresses(auxSources[0] ?? source),
          runAssociations(auxSources[1] ?? auxSources[0] ?? source),
        ]);
      }

      trace(`hidratou locais/endereços/associações ids=${ids.length}`);
      const floorRows = await hydrateFloors(source, ids);
      trace('hidratou pisos');
      const municipalityByLocation = await hydrateMunicipalities(source, ids);

      trace('hidratou municípios');
      startedAt = Date.now();
      const locations: Array<Record<string, unknown>> = [];
      const addresses: Array<Record<string, unknown>> = [];
      const addressCityTuples = new Map<string, AdministrativeCityTuple>();
      const sites: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        const lat = row.LATITUDE === null ? null : Number(row.LATITUDE);
        const lng = row.LONGITUDE === null ? null : Number(row.LONGITUDE);
        const hasPoint =
          lat !== null && lng !== null && lng >= -75 && lng <= -32 && lat >= -35 && lat <= 6;
        const siteId = netwinLocationId(row.ID);
        const locationId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `LOCATION:GEO:${row.ID}`);
        const siteName = composeNetwinSiteName(row.ID, row.NAME, row.DESCRIPTION);
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
        const cityTuple = parsed
          ? normalizeAdministrativeCity({
              country: 'BR',
              stateOrProvince: parsed.stateOrProvince,
              city: parsed.city,
            })
          : null;
        if (parsed && addressId) {
          if (cityTuple) addressCityTuples.set(addressId, cityTuple);
          addresses.push({
            id: addressId,
            tenant_id: ctx.options.tenantId,
            street_name: parsed.street.slice(0, 255),
            street_nr: parsed.streetNr?.slice(0, 50) ?? null,
            locality: parsed.locality?.slice(0, 100) ?? null,
            city: (cityTuple?.cityName ?? parsed.city)?.slice(0, 100) ?? null,
            state_or_province: parsed.stateOrProvince?.slice(0, 50) ?? null,
            country: 'BR',
            postcode: parsed.postcode,
            geographic_location_id: hasPoint ? locationId : null,
            characteristics: '[]',
          });
        }
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
          status: resolveNetwinSiteStatus(row.STATE_LIFECYCLE),
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
      // Pavimento sintético: um Floor por (prédio, piso); a sala passa a ser filha do Floor.
      const floorHierarchy: Array<{ parentId: string; childId: string }> = [];
      const floorSpecId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, 'SITE_SPEC:FLOOR');
      const seenFloors = new Set<string>();
      for (const floorRow of floorRows) {
        const piso = floorRow.PI_PISO.trim();
        const buildingSource =
          associations.find((a) => a.ID_CHILD === floorRow.PI_ID)?.ID_PARENT ??
          floorRow.PI_PARENT_ID;
        if (!piso || buildingSource === null || buildingSource === undefined) continue;
        const buildingId = netwinLocationId(buildingSource);
        const floorId = deterministicUuid(
          NEXUS_NETWIN_NAMESPACE,
          `NETWIN:FLOOR:${buildingSource}:${piso.toUpperCase()}`,
        );
        if (!seenFloors.has(floorId)) {
          seenFloors.add(floorId);
          sites.push({
            id: floorId,
            tenant_id: ctx.options.tenantId,
            name: piso.slice(0, 255),
            site_specification_id: floorSpecId,
            status: 'Active',
            geographic_location_id: null,
            geographic_address_id: null,
            parent_site_id: null,
            related_party: JSON.stringify([
              { id: ctx.options.ownerPartyId, '@referredType': 'Organization' },
            ]),
            characteristics: JSON.stringify([
              ...netwinOriginCharacteristics('DL_INFRANODE.PI_PISO', `${buildingSource}:${piso}`),
            ]),
          });
          floorHierarchy.push({ parentId: buildingId, childId: floorId });
        }
        floorHierarchy.push({ parentId: floorId, childId: netwinLocationId(floorRow.PI_ID) });
      }
      timing.transformMs = elapsed(startedAt);

      trace('transformou');
      const nextTotalProcessed = totalProcessed + ids.length;
      if (target) {
        try {
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'geographic_location',
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
          trace('merge location ok');
          startedAt = Date.now();
          // Diretório geográfico (issue #329): resolve os municípios do lote antes do merge.
          trace('resolvendo cidades');
          const cityIds = await resolveAdministrativeCityIds(target, ctx.t, [
            ...addressCityTuples.values(),
            ...[...municipalityByLocation.values()].map((municipality) => municipality.tuple),
          ]);
          await bulkMergeRows(
            target,
            ctx.t,
            'geographic_address',
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
          trace('merge address ok');
          startedAt = Date.now();
          await bulkMergeRows(
            target,
            ctx.t,
            'geographic_site',
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
          // Município direto do Site (issue #339): endereço postal tem precedência; sem endereço,
          // a Location com município estruturado. Só preenche município nulo — edições da modal
          // prevalecem. O pai tenant–município entra antes (FK composta).
          const siteCities = new Map<string, string>();
          let unresolvedMunicipalities = 0;
          for (const row of rows) {
            const siteId = netwinLocationId(row.ID);
            const municipality = municipalityByLocation.get(row.ID);
            if (!municipality) continue;
            const cityId = cityIds.get(administrativeCityNaturalKey(municipality.tuple));
            if (!cityId) {
              unresolvedMunicipalities += 1;
              continue;
            }
            siteCities.set(siteId, cityId);
          }
          for (const site of sites) {
            const tuple = site.geographic_address_id
              ? addressCityTuples.get(String(site.geographic_address_id))
              : undefined;
            const cityId = tuple ? cityIds.get(administrativeCityNaturalKey(tuple)) : undefined;
            if (cityId) siteCities.set(String(site.id), cityId);
          }
          if (unresolvedMunicipalities > 0) {
            console.warn(
              `[Município] ${unresolvedMunicipalities} Site(s) com município não resolvido no diretório; ficam sem município.`,
            );
          }
          trace('merge site ok');
          if (siteCities.size > 0) {
            for (const cityId of new Set(siteCities.values())) {
              await target.execute(
                `MERGE INTO ${ctx.t('geographic_administrative_city_tenant')} k
                 USING (SELECT :tenantId AS tenant_id, :cityId AS city_id FROM DUAL) c
                    ON (k.tenant_id = c.tenant_id AND k.administrative_city_id = c.city_id)
                  WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
                       VALUES (c.tenant_id, c.city_id, 0, SYSTIMESTAMP)`,
                { tenantId: ctx.options.tenantId, cityId },
                { autoCommit: false },
              );
            }
            await target.executeMany(
              `UPDATE ${ctx.t('geographic_site')} SET administrative_city_id=:cityId WHERE id=:siteId AND administrative_city_id IS NULL`,
              [...siteCities].map(([siteId, cityId]) => ({ siteId, cityId })),
              {
                autoCommit: false,
                bindDefs: {
                  siteId: { type: oracledb.STRING, maxSize: 36 },
                  cityId: { type: oracledb.STRING, maxSize: 36 },
                },
              },
            );
          }
          trace('city_tenant/update city ok');
          timing.siteMergeMs = elapsed(startedAt);
          startedAt = Date.now();
          // Binds nomeados, não posicionais: node-oracledb liga binds por ordem de aparição e
          // ignora o número em `:n`, então `:1` repetido consumia um terceiro valor inexistente
          // no array de dois elementos. Com nome, a repetição de :parentId resolve corretamente.
          if (associations.length > 0)
            await target.executeMany(
              `UPDATE ${ctx.t('geographic_site')} child SET child.parent_site_id=:parentId WHERE child.id=:childId AND EXISTS (SELECT 1 FROM ${ctx.t('geographic_site')} parent WHERE parent.id=:parentId)`,
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
          // Depois das associações: sala → Floor → prédio sobrescreve sala → prédio.
          if (floorHierarchy.length > 0)
            await target.executeMany(
              `UPDATE ${ctx.t('geographic_site')} child SET child.parent_site_id=:parentId WHERE child.id=:childId AND EXISTS (SELECT 1 FROM ${ctx.t('geographic_site')} parent WHERE parent.id=:parentId)`,
              floorHierarchy,
              {
                autoCommit: false,
                bindDefs: {
                  parentId: { type: oracledb.STRING, maxSize: 36 },
                  childId: { type: oracledb.STRING, maxSize: 36 },
                },
              },
            );
          trace('hierarquia ok');
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
    if (target) {
      // Concluída ou pausada, a projeção municipal fica coerente com os Sites já gravados.
      try {
        await reconcileAdministrativeCitySiteCounts(ctx, target);
        await target.execute('COMMIT');
      } catch (error) {
        await target.execute('ROLLBACK');
        throw error;
      }
    }
    progress.finish();
    console.log(
      stats.paused
        ? `Fase 2.A pausada após ${processedThisRun} locais neste comando.`
        : `Fase 2.A concluída: ${stats.loaded} locais reconciliados.`,
    );
    return stats;
  } finally {
    await Promise.allSettled(auxSources.map((connection) => connection.close()));
    await source.close();
    if (target) await target.close();
  }
}
