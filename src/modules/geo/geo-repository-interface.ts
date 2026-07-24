import type {
  GeographicAddress,
  GeoEvent,
  GeographicLocation,
  GeographicSite,
  GeographicSiteRelationship,
  GeographicSiteSpecification,
} from './domain.js';

export interface IGeoRepository {
  transaction<T>(fn: () => T): T;

  upsertLocation(location: GeographicLocation): GeographicLocation;
  getLocation(id: string): GeographicLocation | undefined;
  listLocations(query?: { limit?: number; offset?: number }): GeographicLocation[];

  upsertAddress(address: GeographicAddress): GeographicAddress;
  getAddress(id: string): GeographicAddress | undefined;
  listAddresses(query?: { name?: string; limit?: number; offset?: number }): GeographicAddress[];

  upsertSpec(spec: GeographicSiteSpecification): GeographicSiteSpecification;
  getSpec(id: string): GeographicSiteSpecification | undefined;
  listSpecs(): GeographicSiteSpecification[];

  upsertSite(site: GeographicSite): GeographicSite;
  getSite(id: string): GeographicSite | undefined;
  listSites(query?: { name?: string; limit?: number; offset?: number }): GeographicSite[];
  countSites(): number;

  upsertSiteRelationship(siteId: string, relationship: GeographicSiteRelationship): GeographicSiteRelationship;
  deleteSiteRelationship(siteId: string, relatedSiteId: string, relationshipType: string): boolean;
  listSiteRelationships(siteId: string): GeographicSiteRelationship[];

  appendEvent(event: GeoEvent): GeoEvent;
  listEventsForEntity(entityId: string): GeoEvent[];
}
