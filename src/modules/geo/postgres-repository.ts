import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { dialectFor } from '../../shared/persistence/sql-dialect.js';
import type {
  GeographicAddress,
  GeoAuditLog,
  GeoBulkJob,
  GeoBulkJobResult,
  GeoEvent,
  GeographicLocation,
  GeographicRelationshipType,
  GeographicSite,
  GeographicSiteReferences,
  GeographicSiteRelationship,
  GeographicSiteSpecification,
  GeographicSiteSpecificationRef,
  GeographicSiteStatusHistoryEntry,
  GeoOutboxMessage,
} from './domain.js';
import { defaultSiteRoleFor } from './domain.js';
import type {
  GeographicAddressQuery,
  GeoTenantScope,
  IGeoRepository,
} from './geo-repository-interface.js';
import {
  addressStreetLikePattern,
  normalizeAddressText,
  normalizeCountrySearch,
  normalizePostcodeSearch,
  normalizeStreetNumberSearch,
  normalizeStreetSearch,
} from './address-normalization.js';
import type {
  EventRow,
  GeoAuditLogRow,
  GeoBulkJobResultRow,
  GeoBulkJobRow,
  GeographicAddressRow,
  GeographicLocationRow,
  GeographicRelationshipTypeRow,
  GeographicSiteRelationshipRow,
  GeographicSiteRow,
  GeographicSiteSpecificationContainmentRuleRow,
  GeographicSiteSpecificationRow,
  GeographicSiteStatusHistoryRow,
} from './rows.js';

// Tamanho de bloco para listBlockedSiteIds/bulkTransitionSites (issue #58): grande o bastante
// para poucas idas ao banco, longe do teto de binds do protocolo Postgres (~65 mil parâmetros)
// mesmo somando os demais binds da consulta.
const BULK_SITE_CHUNK_SIZE = 5000;

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

export class PostgresGeoRepository implements IGeoRepository {
  constructor(private db: DatabaseClient) {}

  public transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.db.transaction(async () => await fn());
  }

  public async upsertLocation(location: GeographicLocation): Promise<GeographicLocation> {
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO tmf_geographic_location
       (id, href, tenant_id, geometry_type, geometry, spatial_ref, accuracy, reference_point,
        source_system, source_ref, accuracy_level,
        valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       tenant_id = excluded.tenant_id,
       geometry_type = excluded.geometry_type,
       geometry = excluded.geometry,
       spatial_ref = excluded.spatial_ref,
       accuracy = excluded.accuracy,
       reference_point = excluded.reference_point,
       source_system = excluded.source_system,
       source_ref = excluded.source_ref,
       accuracy_level = excluded.accuracy_level,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        location.id,
        location.href,
        location.tenantId ?? 'default',
        location.geometryType,
        JSON.stringify(location.geometry),
        location.spatialRef,
        location.accuracy || null,
        location.referencePoint || null,
        location.sourceSystem || null,
        location.sourceRef || null,
        location.accuracyLevel || null,
        location.validFor?.startDateTime || null,
        location.validFor?.endDateTime || null,
        JSON.stringify(location.characteristic),
        now,
        now,
      ],
    );

    return (await this.getLocation(location.id))!;
  }

  public async getLocation(
    id: string,
    scope?: GeoTenantScope,
  ): Promise<GeographicLocation | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<GeographicLocationRow>(
      `SELECT id, href, tenant_id, geometry_type, geometry, spatial_ref, accuracy, reference_point,
              source_system, source_ref, accuracy_level,
              valid_for_start, valid_for_end, characteristics
       FROM tmf_geographic_location WHERE ${conditions.join(' AND ')}`,
      params,
    );

    if (!row) return undefined;

    return this.mapLocationRow(row);
  }

  public async listLocations(
    query?: GeoTenantScope & { limit?: number; offset?: number },
  ): Promise<GeographicLocation[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }
    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT id, href, tenant_id, geometry_type, geometry, spatial_ref, accuracy, reference_point,
              source_system, source_ref, accuracy_level,
              valid_for_start, valid_for_end, characteristics
       FROM tmf_geographic_location`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    return (await this.db.all<GeographicLocationRow>(sql, params)).map((row) =>
      this.mapLocationRow(row),
    );
  }

  public async upsertAddress(address: GeographicAddress): Promise<GeographicAddress> {
    const now = new Date().toISOString();

    if (this.db.provider === 'oracle') {
      await this.upsertAddressWithoutSearchColumns(address, now);
      return (await this.getAddress(address.id))!;
    }

    await this.db.run(
      `INSERT INTO tmf_geographic_address
       (id, href, tenant_id, street_type, street_name, street_search, street_nr, street_nr_search,
        city, city_search, state_or_province, postcode, postcode_search, country,
        geographic_location_id, sub_address, source_system, source_ref,
        valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       tenant_id = excluded.tenant_id,
       street_type = excluded.street_type,
       street_name = excluded.street_name,
       street_search = excluded.street_search,
       street_nr = excluded.street_nr,
       street_nr_search = excluded.street_nr_search,
       city = excluded.city,
       city_search = excluded.city_search,
       state_or_province = excluded.state_or_province,
       postcode = excluded.postcode,
       postcode_search = excluded.postcode_search,
       country = excluded.country,
       geographic_location_id = excluded.geographic_location_id,
       sub_address = excluded.sub_address,
       source_system = excluded.source_system,
       source_ref = excluded.source_ref,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        address.id,
        address.href,
        address.tenantId ?? 'default',
        null,
        address.street,
        normalizeStreetSearch(address.street),
        address.streetNr || null,
        normalizeStreetNumberSearch(address.streetNr) || null,
        address.city || null,
        normalizeAddressText(address.city) || null,
        address.stateOrProvince || null,
        address.postcode || null,
        normalizePostcodeSearch(address.postcode) || null,
        address.country || null,
        address.geographicLocationId || null,
        address.subAddress ? JSON.stringify(address.subAddress) : null,
        address.sourceSystem || null,
        address.sourceRef || null,
        address.validFor?.startDateTime || null,
        address.validFor?.endDateTime || null,
        JSON.stringify(address.characteristic),
        now,
        now,
      ],
    );

    return (await this.getAddress(address.id))!;
  }

  private async upsertAddressWithoutSearchColumns(
    address: GeographicAddress,
    now: string,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO tmf_geographic_address
       (id, href, tenant_id, street_type, street_name, street_nr, city, state_or_province, postcode,
        country, geographic_location_id, sub_address, source_system, source_ref,
        valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       tenant_id = excluded.tenant_id,
       street_type = excluded.street_type,
       street_name = excluded.street_name,
       street_nr = excluded.street_nr,
       city = excluded.city,
       state_or_province = excluded.state_or_province,
       postcode = excluded.postcode,
       country = excluded.country,
       geographic_location_id = excluded.geographic_location_id,
       sub_address = excluded.sub_address,
       source_system = excluded.source_system,
       source_ref = excluded.source_ref,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        address.id,
        address.href,
        address.tenantId ?? 'default',
        null,
        address.street,
        address.streetNr || null,
        address.city || null,
        address.stateOrProvince || null,
        address.postcode || null,
        address.country || null,
        address.geographicLocationId || null,
        address.subAddress ? JSON.stringify(address.subAddress) : null,
        address.sourceSystem || null,
        address.sourceRef || null,
        address.validFor?.startDateTime || null,
        address.validFor?.endDateTime || null,
        JSON.stringify(address.characteristic),
        now,
        now,
      ],
    );
  }

  public async getAddress(
    id: string,
    scope?: GeoTenantScope,
  ): Promise<GeographicAddress | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<GeographicAddressRow>(
      `SELECT id, href, tenant_id, street_type, street_name, street_nr, city, state_or_province, postcode, country,
              geographic_location_id, sub_address, source_system, source_ref, valid_for_start, valid_for_end, characteristics
       FROM tmf_geographic_address WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return row ? this.mapAddressRow(row) : undefined;
  }

  public async listAddresses(query?: GeographicAddressQuery): Promise<GeographicAddress[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }
    if (query?.id) {
      conditions.push('id = ?');
      params.push(query.id);
    }
    const street = normalizeStreetSearch(query?.street ?? query?.name);
    if (street) {
      const streetSearch =
        this.db.provider === 'oracle'
          ? `LOWER(TRANSLATE(street_name,
              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
              'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))`
          : 'street_search';
      conditions.push(`(${streetSearch} = ? OR ${streetSearch} LIKE ?)`);
      params.push(street, addressStreetLikePattern(street));
    }
    const streetNr = normalizeStreetNumberSearch(query?.streetNr);
    if (streetNr) {
      conditions.push(
        this.db.provider === 'oracle'
          ? "LOWER(REPLACE(REPLACE(COALESCE(street_nr, ''), ' ', ''), '-', '')) = ?"
          : 'street_nr_search = ?',
      );
      params.push(streetNr);
    }
    const city = normalizeAddressText(query?.city);
    if (city) {
      conditions.push(
        this.db.provider === 'oracle'
          ? `LOWER(TRANSLATE(COALESCE(city, ''),
              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
              'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) = ?`
          : 'city_search = ?',
      );
      params.push(city);
    }
    const state = normalizeAddressText(query?.stateOrProvince);
    if (state) {
      conditions.push('LOWER(state_or_province) = LOWER(?)');
      params.push(state);
    }
    const postcode = normalizePostcodeSearch(query?.postcode);
    if (postcode) {
      conditions.push(
        this.db.provider === 'oracle'
          ? "REPLACE(REPLACE(COALESCE(postcode, ''), ' ', ''), '-', '') = ?"
          : 'postcode_search = ?',
      );
      params.push(postcode);
    }
    const country = normalizeCountrySearch(query?.country);
    if (country) {
      if (country === 'BR') {
        conditions.push("UPPER(country) IN ('BR', 'BRA', 'BRASIL', 'BRAZIL')");
      } else {
        conditions.push('UPPER(country) = ?');
        params.push(country);
      }
    }
    if (query?.geographicLocationId) {
      conditions.push('geographic_location_id = ?');
      params.push(query.geographicLocationId);
    }
    const freeText = normalizeAddressText(query?.q);
    if (freeText) {
      const foldedColumn = (column: string, coalesce = false): string =>
        this.db.provider === 'oracle'
          ? `LOWER(TRANSLATE(${coalesce ? `COALESCE(${column}, '')` : column},
              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
              'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))`
          : column === 'street_name'
            ? 'street_search'
            : 'city_search';
      const likePattern = `%${freeText.split(' ').filter(Boolean).join('%')}%`;
      const postcodeDigits = normalizePostcodeSearch(query!.q);
      if (postcodeDigits) {
        conditions.push(
          `(${foldedColumn('street_name')} LIKE ? OR ${foldedColumn('city', true)} LIKE ? OR postcode LIKE ?)`,
        );
        params.push(likePattern, likePattern, `%${postcodeDigits}%`);
      } else {
        conditions.push(`(${foldedColumn('street_name')} LIKE ? OR ${foldedColumn('city', true)} LIKE ?)`);
        params.push(likePattern, likePattern);
      }
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT id, href, tenant_id, street_type, street_name, street_nr, city, state_or_province, postcode, country,
              geographic_location_id, sub_address, source_system, source_ref, valid_for_start, valid_for_end,
              ${query?.includeCharacteristics === false ? 'NULL' : 'characteristics'} AS characteristics
       FROM tmf_geographic_address`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY street_name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    return (await this.db.all<GeographicAddressRow>(sql, params)).map((row) =>
      this.mapAddressRow(row),
    );
  }

  public async upsertSpec(spec: GeographicSiteSpecification): Promise<GeographicSiteSpecification> {
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO tmf_geographic_site_specification
       (id, href, name, code, category, site_role, lifecycle_status, description, allowed_parent_spec_ids, allowed_child_spec_ids,
        valid_for_start, valid_for_end, characteristics, is_bootstrap, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       code = excluded.code,
       category = excluded.category,
       site_role = excluded.site_role,
       lifecycle_status = excluded.lifecycle_status,
       description = excluded.description,
       allowed_parent_spec_ids = excluded.allowed_parent_spec_ids,
       allowed_child_spec_ids = excluded.allowed_child_spec_ids,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       is_bootstrap = excluded.is_bootstrap,
       updated_at = excluded.updated_at`,
      [
        spec.id,
        spec.href,
        spec.name,
        spec.code,
        spec.category,
        spec.siteRole ?? defaultSiteRoleFor(spec.category),
        spec.lifecycleStatus,
        spec.description || null,
        JSON.stringify(spec.allowedParentSpecIds),
        JSON.stringify(spec.allowedChildSpecIds),
        spec.validFor?.startDateTime || null,
        spec.validFor?.endDateTime || null,
        JSON.stringify(spec.specCharacteristic),
        spec._bootstrapProtected ? 1 : 0,
        now,
        now,
      ],
    );

    return (await this.getSpec(spec.id))!;
  }

  public async getSpec(id: string): Promise<GeographicSiteSpecification | undefined> {
    const row = await this.db.get<GeographicSiteSpecificationRow>(
      `SELECT id, href, name, code, category, site_role, lifecycle_status, description,
              allowed_parent_spec_ids, allowed_child_spec_ids, valid_for_start, valid_for_end,
              characteristics, is_bootstrap
       FROM tmf_geographic_site_specification
       WHERE id = ?`,
      [id],
    );

    if (!row) return undefined;
    return (await this.hydrateSpecs([row])).get(row.id);
  }

  public async getSpecByCode(code: string): Promise<GeographicSiteSpecification | undefined> {
    const row = await this.db.get<GeographicSiteSpecificationRow>(
      `SELECT id, href, name, code, category, site_role, lifecycle_status, description,
              allowed_parent_spec_ids, allowed_child_spec_ids, valid_for_start, valid_for_end,
              characteristics, is_bootstrap
       FROM tmf_geographic_site_specification
       WHERE LOWER(code) = LOWER(?)`,
      [code.trim()],
    );

    if (!row) return undefined;
    return (await this.hydrateSpecs([row])).get(row.id);
  }

  public async listSpecs(query?: {
    name?: string;
    code?: string;
    category?: GeographicSiteSpecification['category'];
    lifecycleStatus?: GeographicSiteSpecification['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): Promise<GeographicSiteSpecification[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.code) {
      conditions.push('LOWER(code) LIKE LOWER(?)');
      params.push(`%${query.code}%`);
    }
    if (query?.category) {
      conditions.push('category = ?');
      params.push(query.category);
    }
    if (query?.lifecycleStatus) {
      conditions.push('lifecycle_status = ?');
      params.push(query.lifecycleStatus);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT id, href, name, code, category, site_role, lifecycle_status, description,
              allowed_parent_spec_ids, allowed_child_spec_ids, valid_for_start, valid_for_end,
              characteristics, is_bootstrap
       FROM tmf_geographic_site_specification`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    const rows = await this.db.all<GeographicSiteSpecificationRow>(sql, params);
    return [...(await this.hydrateSpecs(rows)).values()];
  }

  public async syncSpecContainmentRules(
    specId: string,
    input: {
      allowedParentSpecIds: string[];
      allowedChildSpecIds: string[];
      protectedParentSpecIds?: string[];
      protectedChildSpecIds?: string[];
    },
  ): Promise<void> {
    if (input.allowedParentSpecIds.length === 0) {
      await this.db.run(
        `DELETE FROM tmf_geographic_site_spec_containment_rule WHERE child_spec_id = ?`,
        [specId],
      );
    } else {
      await this.db.run(
        `DELETE FROM tmf_geographic_site_spec_containment_rule
         WHERE child_spec_id = ? AND parent_spec_id NOT IN (${input.allowedParentSpecIds.map(() => '?').join(', ')})`,
        [specId, ...input.allowedParentSpecIds],
      );
    }
    if (input.allowedChildSpecIds.length === 0) {
      await this.db.run(
        `DELETE FROM tmf_geographic_site_spec_containment_rule WHERE parent_spec_id = ?`,
        [specId],
      );
    } else {
      await this.db.run(
        `DELETE FROM tmf_geographic_site_spec_containment_rule
         WHERE parent_spec_id = ? AND child_spec_id NOT IN (${input.allowedChildSpecIds.map(() => '?').join(', ')})`,
        [specId, ...input.allowedChildSpecIds],
      );
    }

    for (const parentSpecId of input.allowedParentSpecIds) {
      await this.db.run(
        `INSERT INTO tmf_geographic_site_spec_containment_rule
         (parent_spec_id, child_spec_id, valid_for_start, valid_for_end, is_protected)
         VALUES (?, ?, NULL, NULL, ?)
         ON CONFLICT(parent_spec_id, child_spec_id) DO UPDATE SET
         is_protected = excluded.is_protected`,
        [parentSpecId, specId, (input.protectedParentSpecIds ?? []).includes(parentSpecId) ? 1 : 0],
      );
    }

    for (const childSpecId of input.allowedChildSpecIds) {
      await this.db.run(
        `INSERT INTO tmf_geographic_site_spec_containment_rule
         (parent_spec_id, child_spec_id, valid_for_start, valid_for_end, is_protected)
         VALUES (?, ?, NULL, NULL, ?)
         ON CONFLICT(parent_spec_id, child_spec_id) DO UPDATE SET
         is_protected = excluded.is_protected`,
        [specId, childSpecId, (input.protectedChildSpecIds ?? []).includes(childSpecId) ? 1 : 0],
      );
    }
  }

  public async upsertSite(site: GeographicSite): Promise<GeographicSite> {
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO tmf_geographic_site
       (id, href, tenant_id, name, status, status_date, status_reason, site_specification_id, geographic_location_id,
        geographic_address_id, parent_site_id, related_party, site_addresses,
        note, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       tenant_id = excluded.tenant_id,
       name = excluded.name,
       status = excluded.status,
       status_date = excluded.status_date,
       status_reason = excluded.status_reason,
       site_specification_id = excluded.site_specification_id,
       geographic_location_id = excluded.geographic_location_id,
       geographic_address_id = excluded.geographic_address_id,
       parent_site_id = excluded.parent_site_id,
       related_party = excluded.related_party,
       site_addresses = excluded.site_addresses,
       note = excluded.note,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        site.id,
        site.href,
        site.tenantId ?? 'default',
        site.name,
        site.status,
        site.statusDate || null,
        site.statusReason || null,
        site.siteSpecificationId,
        site.place?.id || null,
        site.address?.id || null,
        site.parentSite?.id || null,
        JSON.stringify(site.relatedParty),
        JSON.stringify(site.siteAddress ?? []),
        site.note || null,
        JSON.stringify(site.characteristic),
        now,
        now,
      ],
    );

    return (await this.getSite(site.id))!;
  }

  public async getSite(id: string, scope?: GeoTenantScope): Promise<GeographicSite | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<GeographicSiteRow>(
      `SELECT id, href, tenant_id, name, status, status_date, status_reason, site_specification_id, geographic_location_id,
              geographic_address_id, parent_site_id, related_party, site_addresses, note, characteristics
       FROM tmf_geographic_site WHERE ${conditions.join(' AND ')}`,
      params,
    );

    if (!row) return undefined;
    return this.mapSiteRow(row, await this.listSiteRelationships(row.id));
  }

  public async listSites(
    query?: GeoTenantScope & {
      name?: string;
      status?: GeographicSite['status'];
      siteSpecificationId?: string;
      siteSpecificationIds?: string[];
      parentSiteId?: string | null;
      descendantOfSiteId?: string;
      characteristicName?: string;
      characteristicValue?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<GeographicSite[]> {
    const conditions: string[] = [];
    const params: Array<string | number | null> = [];

    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }
    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query?.siteSpecificationId) {
      conditions.push('site_specification_id = ?');
      params.push(query.siteSpecificationId);
    }
    if (query?.siteSpecificationIds && query.siteSpecificationIds.length > 0) {
      conditions.push(
        `site_specification_id IN (${query.siteSpecificationIds.map(() => '?').join(', ')})`,
      );
      params.push(...query.siteSpecificationIds);
    }
    if (query?.descendantOfSiteId) {
      const descendantIds = await this.collectDescendantSiteIds(query.descendantOfSiteId, query);
      if (descendantIds.length === 0) {
        conditions.push('1 = 0');
      } else {
        conditions.push(`id IN (${descendantIds.map(() => '?').join(', ')})`);
        params.push(...descendantIds);
      }
    }
    if (query?.characteristicName) {
      conditions.push(`EXISTS (
        SELECT 1 FROM jsonb_array_elements(characteristics::jsonb) AS c
         WHERE LOWER(c->>'name') = LOWER(?)
           ${query.characteristicValue !== undefined ? "AND c->>'value' = ?" : ''}
      )`);
      params.push(query.characteristicName);
      if (query.characteristicValue !== undefined) params.push(query.characteristicValue);
    }
    if (query?.parentSiteId !== undefined) {
      if (query.parentSiteId === null) {
        conditions.push('parent_site_id IS NULL');
      } else {
        conditions.push('parent_site_id = ?');
        params.push(query.parentSiteId);
      }
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT id, href, tenant_id, name, status, status_date, status_reason, site_specification_id, geographic_location_id,
              geographic_address_id, parent_site_id, related_party, site_addresses, note, characteristics
       FROM tmf_geographic_site`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    const rows = await this.db.all<GeographicSiteRow>(sql, params);
    const relationshipsBySiteId = await this.loadSiteRelationshipsBySiteIds(
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.mapSiteRow(row, relationshipsBySiteId.get(row.id) ?? []));
  }

  public async countSites(scope?: GeoTenantScope): Promise<number> {
    const conditions: string[] = [];
    const params: string[] = [];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM tmf_geographic_site ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}`,
      params,
    );
    return Number(row?.count ?? 0);
  }

  public async countSitesBySpecificationId(
    specificationId: string,
    scope?: GeoTenantScope,
  ): Promise<number> {
    const conditions = ['site_specification_id = ?'];
    const params: string[] = [specificationId];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM tmf_geographic_site WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return Number(row?.count ?? 0);
  }

  public async upsertSiteRelationship(
    siteId: string,
    relationship: GeographicSiteRelationship,
  ): Promise<GeographicSiteRelationship> {
    await this.db.run(
      `INSERT INTO tmf_geographic_site_relationship
       (site_from_id, site_to_id, relationship_type, valid_for_start, valid_for_end)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(site_from_id, site_to_id, relationship_type) DO UPDATE SET
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end`,
      [
        siteId,
        relationship.id,
        relationship.relationshipType,
        relationship.validFor?.startDateTime || null,
        relationship.validFor?.endDateTime || null,
      ],
    );

    return relationship;
  }

  public async endSiteRelationship(
    siteId: string,
    relatedSiteId: string,
    relationshipType: string,
    endedAt: string,
  ): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE tmf_geographic_site_relationship
          SET valid_for_end = ?
        WHERE site_from_id = ?
          AND site_to_id = ?
          AND relationship_type = ?
          AND valid_for_end IS NULL`,
      [endedAt, siteId, relatedSiteId, relationshipType],
    );
    return result.changes > 0;
  }

  public async listSiteRelationships(siteId: string): Promise<GeographicSiteRelationship[]> {
    const rows = await this.db.all<Omit<GeographicSiteRelationshipRow, 'site_from_id'>>(
      `SELECT site_to_id, relationship_type, valid_for_start, valid_for_end
       FROM tmf_geographic_site_relationship
       WHERE site_from_id = ?
       ORDER BY relationship_type, site_to_id`,
      [siteId],
    );

    return rows.map((row) => this.mapRelationshipRow(row));
  }

  public async upsertRelationshipType(
    relationshipType: GeographicRelationshipType,
  ): Promise<GeographicRelationshipType> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_geographic_relationship_type
       (id, href, code, name, inverse_code, is_symmetric, allowed_source_categories, allowed_target_categories,
        cardinality, lifecycle_status, is_bootstrap, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       inverse_code = excluded.inverse_code,
       is_symmetric = excluded.is_symmetric,
       allowed_source_categories = excluded.allowed_source_categories,
       allowed_target_categories = excluded.allowed_target_categories,
       cardinality = excluded.cardinality,
       lifecycle_status = excluded.lifecycle_status,
       is_bootstrap = excluded.is_bootstrap,
       updated_at = excluded.updated_at`,
      [
        relationshipType.id,
        relationshipType.href,
        relationshipType.code,
        relationshipType.name,
        relationshipType.inverseCode,
        relationshipType.symmetric ? 1 : 0,
        JSON.stringify(relationshipType.allowedSourceCategories),
        JSON.stringify(relationshipType.allowedTargetCategories),
        JSON.stringify(relationshipType.cardinality ?? {}),
        relationshipType.lifecycleStatus,
        relationshipType._bootstrapProtected ? 1 : 0,
        now,
        now,
      ],
    );

    return (await this.getRelationshipType(relationshipType.code))!;
  }

  public async getRelationshipType(code: string): Promise<GeographicRelationshipType | undefined> {
    const row = await this.db.get<GeographicRelationshipTypeRow>(
      `SELECT id, href, code, name, inverse_code, is_symmetric, allowed_source_categories, allowed_target_categories,
              cardinality, lifecycle_status, is_bootstrap
       FROM tmf_geographic_relationship_type
       WHERE LOWER(code) = LOWER(?)`,
      [code.trim()],
    );

    return row ? this.mapRelationshipTypeRow(row) : undefined;
  }

  public async listRelationshipTypes(query?: {
    code?: string;
    lifecycleStatus?: GeographicRelationshipType['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): Promise<GeographicRelationshipType[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query?.code) {
      conditions.push('LOWER(code) LIKE LOWER(?)');
      params.push(`%${query.code}%`);
    }
    if (query?.lifecycleStatus) {
      conditions.push('lifecycle_status = ?');
      params.push(query.lifecycleStatus);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT id, href, code, name, inverse_code, is_symmetric, allowed_source_categories, allowed_target_categories,
              cardinality, lifecycle_status, is_bootstrap
       FROM tmf_geographic_relationship_type`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY code',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);
    return (await this.db.all<GeographicRelationshipTypeRow>(sql, params)).map((row) =>
      this.mapRelationshipTypeRow(row),
    );
  }

  public async appendSiteStatusHistory(
    entry: GeographicSiteStatusHistoryEntry,
  ): Promise<GeographicSiteStatusHistoryEntry> {
    await this.db.run(
      `INSERT INTO tmf_geographic_site_status_history
       (id, site_id, tenant_id, from_status, to_status, status_date, status_reason, actor_sub, trace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.siteId,
        entry.tenantId,
        entry.fromStatus ?? null,
        entry.toStatus,
        entry.statusDate,
        entry.statusReason ?? null,
        entry.actorSub,
        entry.traceId,
      ],
    );
    return entry;
  }

  public async listSiteStatusHistory(
    siteId: string,
    scope?: GeoTenantScope,
  ): Promise<GeographicSiteStatusHistoryEntry[]> {
    const conditions = ['site_id = ?'];
    const params: Array<string | number> = [siteId];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const rows = await this.db.all<GeographicSiteStatusHistoryRow>(
      `SELECT id, site_id, tenant_id, from_status, to_status, status_date, status_reason, actor_sub, trace_id
       FROM tmf_geographic_site_status_history
       WHERE ${conditions.join(' AND ')}
       ORDER BY status_date DESC, id DESC`,
      params,
    );
    return rows.map((row) => ({
      '@type': 'GeographicSiteStatusHistoryEntry',
      id: row.id,
      siteId: row.site_id,
      tenantId: row.tenant_id,
      ...(row.from_status ? { fromStatus: row.from_status } : {}),
      toStatus: row.to_status,
      statusDate: row.status_date,
      ...(row.status_reason ? { statusReason: row.status_reason } : {}),
      actorSub: row.actor_sub,
      traceId: row.trace_id,
    }));
  }

  public async getSiteReferences(
    siteId: string,
    scope?: GeoTenantScope,
  ): Promise<GeographicSiteReferences> {
    const tenantFilter = scope?.tenantId ? 'AND tenant_id = ?' : '';
    const tenantParams = scope?.tenantId ? [scope.tenantId] : [];
    const activeChildSiteCount = Number(
      (
        await this.db.get<{ count: number }>(
          `SELECT COUNT(*) AS count FROM tmf_geographic_site
          WHERE parent_site_id = ? AND status <> 'Retired' ${tenantFilter}`,
          [siteId, ...tenantParams],
        )
      )?.count ?? 0,
    );
    const activeRelationshipCount = Number(
      (
        await this.db.get<{ count: number }>(
          `SELECT COUNT(*) AS count FROM tmf_geographic_site_relationship
          WHERE site_from_id = ? AND valid_for_end IS NULL`,
          [siteId],
        )
      )?.count ?? 0,
    );
    // Cada par abaixo somava as duas contagens num só round-trip via `SELECT (subquery) +
    // (subquery) AS count` sem FROM no nível principal — válido em Postgres/SQLite, mas o
    // Oracle exige FROM sempre (ORA-00923). Duas consultas com FROM de verdade, somadas em
    // JS, funcionam nos três bancos sem precisar de tratamento por dialeto.
    const countOf = async (sql: string, params: unknown[]): Promise<number> =>
      Number((await this.db.get<{ count: number }>(sql, params))?.count ?? 0);
    const [activeResourceCount, activeServiceCount, activeOrderCount] = await Promise.all([
      Promise.all([
        countOf(
          `SELECT COUNT(*) AS count FROM tmf_physical_resource WHERE status <> 'terminated' AND (place_id = ? OR serving_site_id = ?)`,
          [siteId, siteId],
        ),
        countOf(
          `SELECT COUNT(*) AS count FROM tmf_logical_resource WHERE status <> 'terminated' AND (place_id = ? OR serving_site_id = ?)`,
          [siteId, siteId],
        ),
      ]).then(([a, b]) => a + b),
      Promise.all([
        countOf(
          `SELECT COUNT(*) AS count FROM tmf_customer_facing_service WHERE COALESCE(state, status) <> 'terminated' AND place LIKE ?`,
          [`%${siteId}%`],
        ),
        countOf(
          `SELECT COUNT(*) AS count FROM tmf_resource_facing_service WHERE COALESCE(state, status) <> 'terminated' AND place LIKE ?`,
          [`%${siteId}%`],
        ),
      ]).then(([a, b]) => a + b),
      Promise.all([
        countOf(
          `SELECT COUNT(*) AS count FROM tmf_service_order WHERE state NOT IN ('completed', 'cancelled', 'failed') AND service_order_item LIKE ?`,
          [`%${siteId}%`],
        ),
        countOf(
          `SELECT COUNT(*) AS count FROM tmf_resource_order WHERE state NOT IN ('completed', 'cancelled', 'failed') AND resource_order_item LIKE ?`,
          [`%${siteId}%`],
        ),
      ]).then(([a, b]) => a + b),
    ]);

    return {
      siteId,
      activeChildSiteCount,
      activeRelationshipCount,
      activeResourceCount,
      activeServiceCount,
      activeOrderCount,
      blocking:
        activeChildSiteCount +
          activeRelationshipCount +
          activeResourceCount +
          activeServiceCount +
          activeOrderCount >
        0,
    };
  }

  public async countSiteDescendants(siteId: string, scope?: GeoTenantScope): Promise<number> {
    return (await this.collectDescendantSiteIds(siteId, scope)).length;
  }

  // Versão em conjunto de getSiteReferences, para não pagar N idas ao banco (6 cada) por site
  // numa operação em massa (issue #58: excluir um Projeto com dezenas de milhares de locais
  // vinculados). `siteIds` é varrido em blocos via SqlDialect.inlineRows — Postgres teria N
  // binds (perto do teto do protocolo em listas muito grandes) e Oracle prefere JSON_TABLE a um
  // IN-list de milhares de posições.
  public async listBlockedSiteIds(siteIds: string[], scope?: GeoTenantScope): Promise<string[]> {
    if (siteIds.length === 0) return [];
    const dialect = dialectFor(this.db.provider);
    const tenantFilter = scope?.tenantId ? 'AND tenant_id = ?' : '';
    const tenantParams = scope?.tenantId ? [scope.tenantId] : [];
    const blocked = new Set<string>();

    for (const idsChunk of chunk(siteIds, BULK_SITE_CHUNK_SIZE)) {
      const childSeed = dialect.inlineRows(idsChunk, 'v', 'id');
      const childRows = await this.db.all<{ id: string }>(
        `SELECT DISTINCT parent_site_id AS id
           FROM tmf_geographic_site
          WHERE parent_site_id IN (SELECT id FROM ${childSeed.sql})
            AND status <> 'Retired' ${tenantFilter}`,
        [...childSeed.binds, ...tenantParams],
      );
      for (const row of childRows) blocked.add(row.id);

      const relSeed = dialect.inlineRows(idsChunk, 'v', 'id');
      const relRows = await this.db.all<{ id: string }>(
        `SELECT DISTINCT site_from_id AS id
           FROM tmf_geographic_site_relationship
          WHERE site_from_id IN (SELECT id FROM ${relSeed.sql})
            AND valid_for_end IS NULL`,
        relSeed.binds,
      );
      for (const row of relRows) blocked.add(row.id);

      for (const table of ['tmf_physical_resource', 'tmf_logical_resource']) {
        const seed = dialect.inlineRows(idsChunk, 'v', 'id');
        const rows = await this.db.all<{ id: string | null }>(
          `SELECT place_id AS id FROM ${table}
            WHERE status <> 'terminated' AND place_id IN (SELECT id FROM ${seed.sql})
           UNION
           SELECT serving_site_id AS id FROM ${table}
            WHERE status <> 'terminated' AND serving_site_id IN (SELECT id FROM ${seed.sql})`,
          [...seed.binds, ...seed.binds],
        );
        for (const row of rows) if (row.id) blocked.add(row.id);
      }
    }

    // Service/Order referenciam o Site por texto solto (`place LIKE '%siteId%'`, sem FK/índice —
    // ver getSiteReferences acima), então não dá para filtrar por siteIds no SQL. Em vez de repetir
    // o LIKE por site (o que a versão de um site já paga), varre cada tabela ativa UMA vez e cruza
    // os ids embutidos no texto contra o conjunto pedido — O(linhas ativas), não O(siteIds).
    const idSet = new Set(siteIds);
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const scanEmbeddedIds = async (sql: string) => {
      const rows = await this.db.all<{ text: string | null }>(sql);
      for (const row of rows) {
        if (!row.text) continue;
        for (const match of row.text.matchAll(uuidPattern)) {
          if (idSet.has(match[0])) blocked.add(match[0]);
        }
      }
    };
    await scanEmbeddedIds(
      `SELECT place AS text FROM tmf_customer_facing_service WHERE COALESCE(state, status) <> 'terminated' AND place IS NOT NULL`,
    );
    await scanEmbeddedIds(
      `SELECT place AS text FROM tmf_resource_facing_service WHERE COALESCE(state, status) <> 'terminated' AND place IS NOT NULL`,
    );
    await scanEmbeddedIds(
      `SELECT service_order_item AS text FROM tmf_service_order WHERE state NOT IN ('completed', 'cancelled', 'failed')`,
    );
    await scanEmbeddedIds(
      `SELECT resource_order_item AS text FROM tmf_resource_order WHERE state NOT IN ('completed', 'cancelled', 'failed')`,
    );

    return [...blocked];
  }

  // Versão em conjunto de transitionSite (upsertSite + appendSiteStatusHistory), para o mesmo
  // cenário de escala. Por bloco: grava o histórico ANTES do UPDATE (para capturar o from_status
  // real, via self-join) e atualiza só quem ainda está num status de origem permitido — quem já
  // chegou ao alvo (ex.: retomada de uma exclusão que morreu na metade) não gera histórico
  // duplicado nem soma em `updated`.
  public async bulkTransitionSites(
    siteIds: string[],
    input: {
      toStatus: GeographicSite['status'];
      allowedFromStatuses: GeographicSite['status'][];
      statusDate: string;
      statusReason?: string;
      tenantId: string;
      actorSub: string;
      traceId: string;
    },
  ): Promise<{ updated: number }> {
    if (siteIds.length === 0 || input.allowedFromStatuses.length === 0) return { updated: 0 };
    const dialect = dialectFor(this.db.provider);
    const fromPlaceholders = input.allowedFromStatuses.map(() => '?').join(', ');
    let updated = 0;

    for (const idsChunk of chunk(siteIds, BULK_SITE_CHUNK_SIZE)) {
      const historySeed = dialect.inlineRows(idsChunk, 'v', 'id');
      await this.db.run(
        `INSERT INTO tmf_geographic_site_status_history
            (id, site_id, tenant_id, from_status, to_status, status_date, status_reason, actor_sub, trace_id)
         SELECT ${dialect.newRowId()}, s.id, s.tenant_id, s.status, ?, ?, ?, ?, ?
           FROM tmf_geographic_site s
          WHERE s.tenant_id = ? AND s.status IN (${fromPlaceholders})
            AND s.id IN (SELECT id FROM ${historySeed.sql})`,
        [
          input.toStatus,
          input.statusDate,
          input.statusReason ?? null,
          input.actorSub,
          input.traceId,
          input.tenantId,
          ...input.allowedFromStatuses,
          ...historySeed.binds,
        ],
      );

      const updateSeed = dialect.inlineRows(idsChunk, 'v', 'id');
      const result = await this.db.run(
        `UPDATE tmf_geographic_site
            SET status = ?, status_date = ?, status_reason = ?, updated_at = ?
          WHERE tenant_id = ? AND status IN (${fromPlaceholders})
            AND id IN (SELECT id FROM ${updateSeed.sql})`,
        [
          input.toStatus,
          input.statusDate,
          input.statusReason ?? null,
          input.statusDate,
          input.tenantId,
          ...input.allowedFromStatuses,
          ...updateSeed.binds,
        ],
      );
      updated += result.changes;
    }

    return { updated };
  }

  public async appendAudit(audit: GeoAuditLog): Promise<GeoAuditLog> {
    await this.db.run(
      `INSERT INTO tmf_audit_log
       (id, tenant_id, actor_sub, action, entity_type, entity_id, event_time, before_state, after_state, trace_id, source_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        audit.id,
        audit.tenantId,
        audit.actorSub,
        audit.action,
        audit.entityType,
        audit.entityId,
        audit.eventTime,
        audit.before ? JSON.stringify(audit.before) : null,
        audit.after ? JSON.stringify(audit.after) : null,
        audit.traceId,
        audit.sourceIp ?? null,
      ],
    );
    return audit;
  }

  public async listAuditForEntity(
    entityId: string,
    scope?: GeoTenantScope,
  ): Promise<GeoAuditLog[]> {
    const conditions = ['entity_id = ?'];
    const params: Array<string | number> = [entityId];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const rows = await this.db.all<GeoAuditLogRow>(
      `SELECT id, tenant_id, actor_sub, action, entity_type, entity_id, event_time,
              before_state, after_state, trace_id, source_ip
       FROM tmf_audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY event_time DESC, id DESC`,
      params,
    );
    return rows.map((row) => ({
      '@type': 'GeoAuditLog',
      id: row.id,
      tenantId: row.tenant_id,
      actorSub: row.actor_sub,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      eventTime: row.event_time,
      before: row.before_state ? JSON.parse(row.before_state) : null,
      after: row.after_state ? JSON.parse(row.after_state) : null,
      traceId: row.trace_id,
      ...(row.source_ip ? { sourceIp: row.source_ip } : {}),
    }));
  }

  public async appendEvent(event: GeoEvent): Promise<GeoEvent> {
    await this.db.run(
      `INSERT INTO tmf_event (id, event_type, event_time, source, event_data, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.eventType,
        event.eventTime,
        event.source,
        JSON.stringify(event.eventData),
        event.correlationId || null,
      ],
    );

    return event;
  }

  public async appendOutbox(message: GeoOutboxMessage): Promise<GeoOutboxMessage> {
    await this.db.run(
      `INSERT INTO tmf_outbox (id, tenant_id, event_id, topic, payload, status, created_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.tenantId,
        message.eventId,
        message.topic,
        JSON.stringify(message.payload),
        message.status,
        message.createdAt,
        message.publishedAt ?? null,
      ],
    );
    return message;
  }

  public async listEventsForEntity(entityId: string): Promise<GeoEvent[]> {
    const rows = await this.db.all<EventRow>(
      `SELECT id, event_type, event_time, source, event_data, correlation_id
       FROM tmf_event
       WHERE json_extract(event_data, '$.entityId') = ?
       ORDER BY event_time DESC`,
      [entityId],
    );

    return rows.map((row) => ({
      '@type': 'Event',
      id: row.id,
      eventType: row.event_type,
      eventTime: row.event_time,
      source: row.source,
      eventData: JSON.parse(row.event_data || '{}'),
      ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    }));
  }

  public async upsertBulkJob(job: GeoBulkJob): Promise<GeoBulkJob> {
    await this.db.run(
      `INSERT INTO tmf_geo_bulk_job
       (id, tenant_id, target, mode, idempotency_key, status, submitted_at, started_at,
        completed_at, total, success_count, error_count, warning_count, actor_sub, trace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       completed_at = excluded.completed_at,
       total = excluded.total,
       success_count = excluded.success_count,
       error_count = excluded.error_count,
       warning_count = excluded.warning_count,
       trace_id = excluded.trace_id`,
      [
        job.id,
        job.tenantId,
        job.target,
        job.mode,
        job.idempotencyKey,
        job.status,
        job.submittedAt,
        job.startedAt,
        job.completedAt ?? null,
        job.total,
        job.successCount,
        job.errorCount,
        job.warningCount,
        job.actorSub,
        job.traceId,
      ],
    );
    return (await this.getBulkJob(job.id))!;
  }

  public async getBulkJob(id: string, scope?: GeoTenantScope): Promise<GeoBulkJob | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<GeoBulkJobRow>(
      `SELECT id, tenant_id, target, mode, idempotency_key, status, submitted_at, started_at,
              completed_at, total, success_count, error_count, warning_count, actor_sub, trace_id
       FROM tmf_geo_bulk_job
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return row ? mapBulkJobRow(row) : undefined;
  }

  public async getBulkJobByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    target?: GeoBulkJob['target'],
  ): Promise<GeoBulkJob | undefined> {
    const conditions = ['tenant_id = ?', 'idempotency_key = ?'];
    const params: Array<string | number> = [tenantId, idempotencyKey];
    if (target) {
      conditions.push('target = ?');
      params.push(target);
    }
    const row = await this.db.get<GeoBulkJobRow>(
      `SELECT id, tenant_id, target, mode, idempotency_key, status, submitted_at, started_at,
              completed_at, total, success_count, error_count, warning_count, actor_sub, trace_id
       FROM tmf_geo_bulk_job
       WHERE ${conditions.join(' AND ')}
       ORDER BY submitted_at DESC
       LIMIT 1`,
      params,
    );
    return row ? mapBulkJobRow(row) : undefined;
  }

  public async appendBulkJobResult(result: GeoBulkJobResult): Promise<GeoBulkJobResult> {
    await this.db.run(
      `INSERT INTO tmf_geo_bulk_job_result
       (id, job_id, tenant_id, item_index, status, entity_id, legacy_system, legacy_entity,
        legacy_id, error_code, message, warnings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(job_id, item_index) DO UPDATE SET
       status = excluded.status,
       entity_id = excluded.entity_id,
       legacy_system = excluded.legacy_system,
       legacy_entity = excluded.legacy_entity,
       legacy_id = excluded.legacy_id,
       error_code = excluded.error_code,
       message = excluded.message,
       warnings = excluded.warnings`,
      [
        result.id,
        result.jobId,
        result.tenantId,
        result.index,
        result.status,
        result.entityId ?? null,
        result.legacySystem ?? null,
        result.legacyEntity ?? null,
        result.legacyId ?? null,
        result.errorCode ?? null,
        result.message ?? null,
        JSON.stringify(result.warnings),
      ],
    );
    return result;
  }

  public async listBulkJobResults(
    jobId: string,
    scope?: GeoTenantScope & { limit?: number; offset?: number },
  ): Promise<GeoBulkJobResult[]> {
    const conditions = ['job_id = ?'];
    const params: Array<string | number> = [jobId];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const hasLimit = scope?.limit !== undefined;
    const hasOffset = scope?.offset !== undefined;
    const sql = [
      `SELECT id, job_id, tenant_id, item_index, status, entity_id, legacy_system,
              legacy_entity, legacy_id, error_code, message, warnings
       FROM tmf_geo_bulk_job_result`,
      `WHERE ${conditions.join(' AND ')}`,
      'ORDER BY item_index, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (hasLimit) params.push(scope!.limit as number);
    if (hasOffset) params.push(scope!.offset as number);
    return (await this.db.all<GeoBulkJobResultRow>(sql, params)).map(mapBulkJobResultRow);
  }

  private async hydrateSpecs(
    rows: GeographicSiteSpecificationRow[],
  ): Promise<Map<string, GeographicSiteSpecification>> {
    if (rows.length === 0) return new Map();

    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(', ');
    const ruleRows = await this.db.all<GeographicSiteSpecificationContainmentRuleRow>(
      `SELECT parent_spec_id, child_spec_id, valid_for_start, valid_for_end, is_protected
       FROM tmf_geographic_site_spec_containment_rule
       WHERE parent_spec_id IN (${placeholders}) OR child_spec_id IN (${placeholders})`,
      [...ids, ...ids],
    );

    const referencedIds = new Set<string>();
    for (const ruleRow of ruleRows) {
      referencedIds.add(ruleRow.parent_spec_id);
      referencedIds.add(ruleRow.child_spec_id);
    }

    const referencedRows =
      referencedIds.size > 0
        ? await this.db.all<GeographicSiteSpecificationRow>(
            `SELECT id, href, name, code, category, site_role, lifecycle_status, description,
                    allowed_parent_spec_ids, allowed_child_spec_ids, valid_for_start, valid_for_end,
                    characteristics, is_bootstrap
             FROM tmf_geographic_site_specification
             WHERE id IN (${[...referencedIds].map(() => '?').join(', ')})`,
            [...referencedIds],
          )
        : [];

    const rowById = new Map<string, GeographicSiteSpecificationRow>();
    for (const row of [...rows, ...referencedRows]) {
      rowById.set(row.id, row);
    }

    const specs = new Map<string, GeographicSiteSpecification>();
    for (const row of rows) {
      const parentRules = ruleRows.filter((ruleRow) => ruleRow.child_spec_id === row.id);
      const childRules = ruleRows.filter((ruleRow) => ruleRow.parent_spec_id === row.id);
      const allowedParentSpec = parentRules
        .map((ruleRow) => rowById.get(ruleRow.parent_spec_id))
        .filter((item): item is GeographicSiteSpecificationRow => item !== undefined)
        .map((item) => this.mapSpecRefRow(item));
      const allowedChildSpec = childRules
        .map((ruleRow) => rowById.get(ruleRow.child_spec_id))
        .filter((item): item is GeographicSiteSpecificationRow => item !== undefined)
        .map((item) => this.mapSpecRefRow(item));

      specs.set(row.id, {
        '@type': 'GeographicSiteSpecification',
        id: row.id,
        href: row.href,
        name: row.name,
        code: row.code,
        category: row.category,
        siteRole: row.site_role ?? defaultSiteRoleFor(row.category),
        lifecycleStatus: row.lifecycle_status,
        ...(row.description ? { description: row.description } : {}),
        ...(row.valid_for_start || row.valid_for_end
          ? {
              validFor: {
                ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
                ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
              },
            }
          : {}),
        specCharacteristic: JSON.parse(row.characteristics || '[]'),
        allowedParentSpec,
        allowedChildSpec,
        allowedParentSpecIds: allowedParentSpec.map((item) => item.id),
        allowedChildSpecIds: allowedChildSpec.map((item) => item.id),
        _bootstrapProtected: Boolean(row.is_bootstrap),
        _protectedAllowedParentSpecIds: parentRules
          .filter((ruleRow) => Boolean(ruleRow.is_protected))
          .map((ruleRow) => ruleRow.parent_spec_id),
        _protectedAllowedChildSpecIds: childRules
          .filter((ruleRow) => Boolean(ruleRow.is_protected))
          .map((ruleRow) => ruleRow.child_spec_id),
      });
    }

    return specs;
  }

  private async loadSiteRelationshipsBySiteIds(
    siteIds: string[],
  ): Promise<Map<string, GeographicSiteRelationship[]>> {
    if (siteIds.length === 0) return new Map();

    const rows = await this.db.all<GeographicSiteRelationshipRow>(
      `SELECT site_from_id, site_to_id, relationship_type, valid_for_start, valid_for_end
       FROM tmf_geographic_site_relationship
       WHERE site_from_id IN (${siteIds.map(() => '?').join(', ')})
       ORDER BY site_from_id, relationship_type, site_to_id`,
      siteIds,
    );

    const relationshipsBySiteId = new Map<string, GeographicSiteRelationship[]>();
    for (const row of rows) {
      const current = relationshipsBySiteId.get(row.site_from_id) ?? [];
      current.push(this.mapRelationshipRow(row));
      relationshipsBySiteId.set(row.site_from_id, current);
    }
    return relationshipsBySiteId;
  }

  private mapLocationRow(row: GeographicLocationRow): GeographicLocation {
    const result: GeographicLocation = {
      '@type': 'GeographicLocation',
      id: row.id,
      href: row.href,
      tenantId: row.tenant_id ?? 'default',
      geometryType: row.geometry_type,
      geometry: JSON.parse(row.geometry),
      spatialRef: row.spatial_ref,
      characteristic: JSON.parse(row.characteristics || '[]'),
    };
    if (row.accuracy) result.accuracy = row.accuracy;
    if (row.reference_point) result.referencePoint = row.reference_point;
    if (row.source_system) result.sourceSystem = row.source_system;
    if (row.source_ref) result.sourceRef = row.source_ref;
    if (row.accuracy_level) result.accuracyLevel = row.accuracy_level;
    if (row.valid_for_start || row.valid_for_end) {
      result.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return result;
  }

  private mapAddressRow(row: GeographicAddressRow): GeographicAddress {
    const result: GeographicAddress = {
      '@type': 'GeographicAddress',
      id: row.id,
      href: row.href,
      tenantId: row.tenant_id ?? 'default',
      street: row.street_name,
      characteristic: JSON.parse(row.characteristics || '[]'),
    };
    if (row.street_nr) result.streetNr = row.street_nr;
    if (row.city) result.city = row.city;
    if (row.state_or_province) result.stateOrProvince = row.state_or_province;
    if (row.postcode) result.postcode = row.postcode;
    if (row.country) result.country = row.country;
    if (row.geographic_location_id) {
      result.geographicLocationId = row.geographic_location_id;
      result.place = { id: row.geographic_location_id, '@referredType': 'GeographicLocation' };
    }
    if (row.sub_address) result.subAddress = JSON.parse(row.sub_address);
    if (row.source_system) result.sourceSystem = row.source_system;
    if (row.source_ref) result.sourceRef = row.source_ref;
    if (row.valid_for_start || row.valid_for_end) {
      result.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return result;
  }

  private mapSiteRow(
    row: GeographicSiteRow,
    relatedSite: GeographicSiteRelationship[],
  ): GeographicSite {
    const result: GeographicSite = {
      '@type': 'GeographicSite',
      id: row.id,
      href: row.href,
      tenantId: row.tenant_id ?? 'default',
      name: row.name,
      status: row.status,
      ...(row.status_date ? { statusDate: row.status_date } : {}),
      ...(row.status_reason ? { statusReason: row.status_reason } : {}),
      siteSpecificationId: row.site_specification_id,
      siteSpecification: {
        id: row.site_specification_id,
        '@referredType': 'GeographicSiteSpecification',
      },
      relatedSite,
      relatedParty: JSON.parse(row.related_party || '[]'),
      siteAddress: JSON.parse(row.site_addresses || '[]'),
      characteristic: JSON.parse(row.characteristics || '[]'),
    };
    if (row.geographic_location_id) {
      result.place = { id: row.geographic_location_id, '@referredType': 'GeographicLocation' };
    }
    if (row.geographic_address_id) {
      result.address = { id: row.geographic_address_id, '@referredType': 'GeographicAddress' };
    }
    if (row.parent_site_id) {
      result.parentSite = { id: row.parent_site_id, '@referredType': 'GeographicSite' };
    }
    if (row.note) result.note = row.note;
    return result;
  }

  private mapRelationshipRow(
    row: Omit<GeographicSiteRelationshipRow, 'site_from_id'> | GeographicSiteRelationshipRow,
  ): GeographicSiteRelationship {
    const relationship: GeographicSiteRelationship = {
      id: row.site_to_id,
      relationshipType: row.relationship_type,
      '@referredType': 'GeographicSite',
    };
    if (row.valid_for_start || row.valid_for_end) {
      relationship.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return relationship;
  }

  private mapRelationshipTypeRow(row: GeographicRelationshipTypeRow): GeographicRelationshipType {
    return {
      '@type': 'GeographicRelationshipType',
      id: row.id,
      href: row.href,
      code: row.code,
      name: row.name,
      inverseCode: row.inverse_code,
      symmetric: Boolean(row.is_symmetric),
      allowedSourceCategories: JSON.parse(row.allowed_source_categories || '[]'),
      allowedTargetCategories: JSON.parse(row.allowed_target_categories || '[]'),
      cardinality: JSON.parse(row.cardinality || '{}'),
      lifecycleStatus: row.lifecycle_status,
      _bootstrapProtected: Boolean(row.is_bootstrap),
    };
  }

  private async collectDescendantSiteIds(
    siteId: string,
    scope?: GeoTenantScope,
  ): Promise<string[]> {
    const result: string[] = [];
    const queue = [siteId];
    while (queue.length > 0) {
      const parentId = queue.shift() as string;
      const conditions = ['parent_site_id = ?'];
      const params: string[] = [parentId];
      if (scope?.tenantId) {
        conditions.push('tenant_id = ?');
        params.push(scope.tenantId);
      }
      const rows = await this.db.all<{ id: string }>(
        `SELECT id FROM tmf_geographic_site WHERE ${conditions.join(' AND ')} ORDER BY id`,
        params,
      );
      for (const row of rows) {
        if (!result.includes(row.id)) {
          result.push(row.id);
          queue.push(row.id);
        }
      }
    }
    return result;
  }

  private mapSpecRefRow(row: GeographicSiteSpecificationRow): GeographicSiteSpecificationRef {
    return {
      id: row.id,
      href: row.href,
      name: row.name,
      code: row.code,
      category: row.category,
      siteRole: row.site_role ?? defaultSiteRoleFor(row.category),
      '@referredType': 'GeographicSiteSpecification',
    };
  }
}

const mapBulkJobRow = (row: GeoBulkJobRow): GeoBulkJob => ({
  '@type': 'GeoBulkJob',
  id: row.id,
  tenantId: row.tenant_id,
  target: row.target,
  mode: row.mode,
  idempotencyKey: row.idempotency_key,
  status: row.status,
  submittedAt: row.submitted_at,
  startedAt: row.started_at,
  ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  total: Number(row.total),
  successCount: Number(row.success_count),
  errorCount: Number(row.error_count),
  warningCount: Number(row.warning_count),
  actorSub: row.actor_sub,
  traceId: row.trace_id,
});

const mapBulkJobResultRow = (row: GeoBulkJobResultRow): GeoBulkJobResult => ({
  '@type': 'GeoBulkJobResult',
  id: row.id,
  jobId: row.job_id,
  tenantId: row.tenant_id,
  index: Number(row.item_index),
  status: row.status,
  ...(row.entity_id ? { entityId: row.entity_id } : {}),
  ...(row.legacy_system ? { legacySystem: row.legacy_system } : {}),
  ...(row.legacy_entity ? { legacyEntity: row.legacy_entity } : {}),
  ...(row.legacy_id ? { legacyId: row.legacy_id } : {}),
  ...(row.error_code ? { errorCode: row.error_code } : {}),
  ...(row.message ? { message: row.message } : {}),
  warnings: JSON.parse(row.warnings || '[]'),
});
