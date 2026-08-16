type Awaitable<T> = T | Promise<T>;

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
  GeographicSiteStatusHistoryEntry,
  GeoOutboxMessage,
} from './domain.js';

export type GeoTenantScope = {
  tenantId?: string;
};

export type GeographicAddressQuery = GeoTenantScope & {
  id?: string;
  /** Compatibilidade com a busca historica por nome do logradouro. */
  name?: string;
  street?: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  geographicLocationId?: string;
  includeCharacteristics?: boolean;
  limit?: number;
  offset?: number;
};

export interface IGeoRepository {
  transaction<T>(fn: () => Awaitable<T>): Awaitable<T>;

  upsertLocation(location: GeographicLocation): Awaitable<GeographicLocation>;
  getLocation(id: string, scope?: GeoTenantScope): Awaitable<GeographicLocation | undefined>;
  listLocations(
    query?: GeoTenantScope & { limit?: number; offset?: number },
  ): Awaitable<GeographicLocation[]>;

  upsertAddress(address: GeographicAddress): Awaitable<GeographicAddress>;
  getAddress(id: string, scope?: GeoTenantScope): Awaitable<GeographicAddress | undefined>;
  listAddresses(query?: GeographicAddressQuery): Awaitable<GeographicAddress[]>;

  upsertSpec(spec: GeographicSiteSpecification): Awaitable<GeographicSiteSpecification>;
  getSpec(id: string): Awaitable<GeographicSiteSpecification | undefined>;
  getSpecByCode(code: string): Awaitable<GeographicSiteSpecification | undefined>;
  listSpecs(query?: {
    name?: string;
    code?: string;
    category?: GeographicSiteSpecification['category'];
    lifecycleStatus?: GeographicSiteSpecification['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): Awaitable<GeographicSiteSpecification[]>;
  syncSpecContainmentRules(
    specId: string,
    input: {
      allowedParentSpecIds: string[];
      allowedChildSpecIds: string[];
      protectedParentSpecIds?: string[];
      protectedChildSpecIds?: string[];
    },
  ): Awaitable<void>;

  upsertSite(site: GeographicSite): Awaitable<GeographicSite>;
  getSite(id: string, scope?: GeoTenantScope): Awaitable<GeographicSite | undefined>;
  listSites(
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
  ): Awaitable<GeographicSite[]>;
  countSites(scope?: GeoTenantScope): Awaitable<number>;
  countSitesBySpecificationId(specificationId: string, scope?: GeoTenantScope): Awaitable<number>;

  upsertSiteRelationship(
    siteId: string,
    relationship: GeographicSiteRelationship,
  ): Awaitable<GeographicSiteRelationship>;
  endSiteRelationship(
    siteId: string,
    relatedSiteId: string,
    relationshipType: string,
    endedAt: string,
  ): Awaitable<boolean>;
  listSiteRelationships(siteId: string): Awaitable<GeographicSiteRelationship[]>;

  upsertRelationshipType(
    relationshipType: GeographicRelationshipType,
  ): Awaitable<GeographicRelationshipType>;
  getRelationshipType(code: string): Awaitable<GeographicRelationshipType | undefined>;
  listRelationshipTypes(query?: {
    code?: string;
    lifecycleStatus?: GeographicRelationshipType['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): Awaitable<GeographicRelationshipType[]>;

  appendSiteStatusHistory(
    entry: GeographicSiteStatusHistoryEntry,
  ): Awaitable<GeographicSiteStatusHistoryEntry>;
  listSiteStatusHistory(
    siteId: string,
    scope?: GeoTenantScope,
  ): Awaitable<GeographicSiteStatusHistoryEntry[]>;
  getSiteReferences(siteId: string, scope?: GeoTenantScope): Awaitable<GeographicSiteReferences>;
  countSiteDescendants(siteId: string, scope?: GeoTenantScope): Awaitable<number>;

  appendAudit(audit: GeoAuditLog): Awaitable<GeoAuditLog>;
  listAuditForEntity(entityId: string, scope?: GeoTenantScope): Awaitable<GeoAuditLog[]>;
  appendEvent(event: GeoEvent): Awaitable<GeoEvent>;
  appendOutbox(message: GeoOutboxMessage): Awaitable<GeoOutboxMessage>;
  listEventsForEntity(entityId: string): Awaitable<GeoEvent[]>;

  upsertBulkJob(job: GeoBulkJob): Awaitable<GeoBulkJob>;
  getBulkJob(id: string, scope?: GeoTenantScope): Awaitable<GeoBulkJob | undefined>;
  getBulkJobByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    target?: GeoBulkJob['target'],
  ): Awaitable<GeoBulkJob | undefined>;
  appendBulkJobResult(result: GeoBulkJobResult): Awaitable<GeoBulkJobResult>;
  listBulkJobResults(
    jobId: string,
    scope?: GeoTenantScope & { limit?: number; offset?: number },
  ): Awaitable<GeoBulkJobResult[]>;
}
