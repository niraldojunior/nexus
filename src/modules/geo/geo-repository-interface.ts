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

export interface IGeoRepository {
  transaction<T>(fn: () => T): T;

  upsertLocation(location: GeographicLocation): GeographicLocation;
  getLocation(id: string, scope?: GeoTenantScope): GeographicLocation | undefined;
  listLocations(query?: GeoTenantScope & { limit?: number; offset?: number }): GeographicLocation[];

  upsertAddress(address: GeographicAddress): GeographicAddress;
  getAddress(id: string, scope?: GeoTenantScope): GeographicAddress | undefined;
  listAddresses(
    query?: GeoTenantScope & { name?: string; limit?: number; offset?: number },
  ): GeographicAddress[];

  upsertSpec(spec: GeographicSiteSpecification): GeographicSiteSpecification;
  getSpec(id: string): GeographicSiteSpecification | undefined;
  getSpecByCode(code: string): GeographicSiteSpecification | undefined;
  listSpecs(query?: {
    name?: string;
    code?: string;
    category?: GeographicSiteSpecification['category'];
    lifecycleStatus?: GeographicSiteSpecification['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): GeographicSiteSpecification[];
  syncSpecContainmentRules(
    specId: string,
    input: {
      allowedParentSpecIds: string[];
      allowedChildSpecIds: string[];
      protectedParentSpecIds?: string[];
      protectedChildSpecIds?: string[];
    },
  ): void;

  upsertSite(site: GeographicSite): GeographicSite;
  getSite(id: string, scope?: GeoTenantScope): GeographicSite | undefined;
  listSites(
    query?: GeoTenantScope & {
      name?: string;
      status?: GeographicSite['status'];
      siteSpecificationId?: string;
      parentSiteId?: string | null;
      descendantOfSiteId?: string;
      characteristicName?: string;
      characteristicValue?: string;
      limit?: number;
      offset?: number;
    },
  ): GeographicSite[];
  countSites(scope?: GeoTenantScope): number;
  countSitesBySpecificationId(specificationId: string, scope?: GeoTenantScope): number;

  upsertSiteRelationship(
    siteId: string,
    relationship: GeographicSiteRelationship,
  ): GeographicSiteRelationship;
  endSiteRelationship(
    siteId: string,
    relatedSiteId: string,
    relationshipType: string,
    endedAt: string,
  ): boolean;
  listSiteRelationships(siteId: string): GeographicSiteRelationship[];

  upsertRelationshipType(relationshipType: GeographicRelationshipType): GeographicRelationshipType;
  getRelationshipType(code: string): GeographicRelationshipType | undefined;
  listRelationshipTypes(query?: {
    code?: string;
    lifecycleStatus?: GeographicRelationshipType['lifecycleStatus'];
    limit?: number;
    offset?: number;
  }): GeographicRelationshipType[];

  appendSiteStatusHistory(
    entry: GeographicSiteStatusHistoryEntry,
  ): GeographicSiteStatusHistoryEntry;
  listSiteStatusHistory(siteId: string, scope?: GeoTenantScope): GeographicSiteStatusHistoryEntry[];
  getSiteReferences(siteId: string, scope?: GeoTenantScope): GeographicSiteReferences;
  countSiteDescendants(siteId: string, scope?: GeoTenantScope): number;

  appendAudit(audit: GeoAuditLog): GeoAuditLog;
  listAuditForEntity(entityId: string, scope?: GeoTenantScope): GeoAuditLog[];
  appendEvent(event: GeoEvent): GeoEvent;
  appendOutbox(message: GeoOutboxMessage): GeoOutboxMessage;
  listEventsForEntity(entityId: string): GeoEvent[];

  upsertBulkJob(job: GeoBulkJob): GeoBulkJob;
  getBulkJob(id: string, scope?: GeoTenantScope): GeoBulkJob | undefined;
  getBulkJobByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    target?: GeoBulkJob['target'],
  ): GeoBulkJob | undefined;
  appendBulkJobResult(result: GeoBulkJobResult): GeoBulkJobResult;
  listBulkJobResults(
    jobId: string,
    scope?: GeoTenantScope & { limit?: number; offset?: number },
  ): GeoBulkJobResult[];
}
