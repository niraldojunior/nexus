import type {
  GeographicAddress,
  GeoEvent,
  GeographicLocation,
  GeographicSite,
  GeographicSiteRelationship,
  GeographicSiteSpecification,
} from './domain.js';
import type { IGeoRepository } from './geo-repository-interface.js';

export class GeoRepository implements IGeoRepository {
  private readonly locations = new Map<string, GeographicLocation>();
  private readonly addresses = new Map<string, GeographicAddress>();
  private readonly sites = new Map<string, GeographicSite>();
  private readonly specs = new Map<string, GeographicSiteSpecification>();
  private readonly siteRelationships = new Map<string, GeographicSiteRelationship[]>();
  private readonly events: GeoEvent[] = [];

  public transaction<T>(fn: () => T): T {
    return fn();
  }

  public upsertLocation(location: GeographicLocation): GeographicLocation {
    const stored = cloneLocation(location);
    this.locations.set(stored.id, stored);
    return cloneLocation(stored);
  }
  public getLocation(id: string): GeographicLocation | undefined {
    const location = this.locations.get(id);
    return location ? cloneLocation(location) : undefined;
  }
  public listLocations(): GeographicLocation[] {
    return [...this.locations.values()].map(cloneLocation);
  }

  public upsertAddress(address: GeographicAddress): GeographicAddress {
    const stored = cloneAddress(address);
    this.addresses.set(stored.id, stored);
    return cloneAddress(stored);
  }
  public getAddress(id: string): GeographicAddress | undefined {
    const address = this.addresses.get(id);
    return address ? cloneAddress(address) : undefined;
  }
  public listAddresses(): GeographicAddress[] {
    return [...this.addresses.values()].map(cloneAddress);
  }

  public upsertSite(site: GeographicSite): GeographicSite {
    const stored = cloneSite({
      ...site,
      relatedSite: site.relatedSite.length ? site.relatedSite : this.listSiteRelationships(site.id),
    });
    this.sites.set(stored.id, stored);
    return cloneSite(stored);
  }
  public getSite(id: string): GeographicSite | undefined {
    const site = this.sites.get(id);
    return site ? cloneSite(site) : undefined;
  }
  public listSites(): GeographicSite[] {
    return [...this.sites.values()].map(cloneSite);
  }

  public upsertSiteRelationship(siteId: string, relationship: GeographicSiteRelationship): GeographicSiteRelationship {
    const current = this.siteRelationships.get(siteId) ?? [];
    const next = [
      ...current.filter(
        (item) => !(item.id === relationship.id && item.relationshipType === relationship.relationshipType),
      ),
      cloneRelationship(relationship),
    ];
    this.siteRelationships.set(siteId, next);

    const site = this.sites.get(siteId);
    if (site) {
      site.relatedSite = next.map(cloneRelationship);
      this.sites.set(siteId, cloneSite(site));
    }

    return cloneRelationship(relationship);
  }

  public deleteSiteRelationship(siteId: string, relatedSiteId: string, relationshipType: string): boolean {
    const current = this.siteRelationships.get(siteId) ?? [];
    const next = current.filter(
      (item) => !(item.id === relatedSiteId && item.relationshipType === relationshipType),
    );
    this.siteRelationships.set(siteId, next);

    const site = this.sites.get(siteId);
    if (site) {
      site.relatedSite = next.map(cloneRelationship);
      this.sites.set(siteId, cloneSite(site));
    }

    return next.length !== current.length;
  }

  public listSiteRelationships(siteId: string): GeographicSiteRelationship[] {
    return (this.siteRelationships.get(siteId) ?? []).map(cloneRelationship);
  }

  public appendEvent(event: GeoEvent): GeoEvent {
    const stored = cloneEvent(event);
    this.events.push(stored);
    return cloneEvent(stored);
  }

  public listEventsForEntity(entityId: string): GeoEvent[] {
    return this.events
      .filter((event) => event.eventData.entityId === entityId)
      .map(cloneEvent);
  }

  public upsertSpec(spec: GeographicSiteSpecification): GeographicSiteSpecification {
    const stored = cloneSpec(spec);
    this.specs.set(stored.id, stored);
    return cloneSpec(stored);
  }
  public getSpec(id: string): GeographicSiteSpecification | undefined {
    const spec = this.specs.get(id);
    return spec ? cloneSpec(spec) : undefined;
  }
  public listSpecs(): GeographicSiteSpecification[] {
    return [...this.specs.values()].map(cloneSpec);
  }
}

const cloneLocation = (location: GeographicLocation): GeographicLocation => ({
  ...location,
  geometry: structuredClone(location.geometry),
  ...(location.validFor ? { validFor: { ...location.validFor } } : {}),
  characteristic: location.characteristic.map((item) => ({ ...item })),
});

const cloneAddress = (address: GeographicAddress): GeographicAddress => ({
  ...address,
  ...(address.place ? { place: { ...address.place } } : {}),
  characteristic: address.characteristic.map((item) => ({ ...item })),
});

const cloneSite = (site: GeographicSite): GeographicSite => ({
  ...site,
  siteSpecification: { ...site.siteSpecification },
  ...(site.place ? { place: { ...site.place } } : {}),
  ...(site.address ? { address: { ...site.address } } : {}),
  ...(site.parentSite ? { parentSite: { ...site.parentSite } } : {}),
  relatedSite: site.relatedSite.map((item) => ({ ...item })),
  relatedParty: site.relatedParty.map((item) => ({ ...item })),
  characteristic: site.characteristic.map((item) => ({ ...item })),
});

const cloneRelationship = (relationship: GeographicSiteRelationship): GeographicSiteRelationship => ({
  ...relationship,
  ...(relationship.validFor ? { validFor: { ...relationship.validFor } } : {}),
});

const cloneSpec = (spec: GeographicSiteSpecification): GeographicSiteSpecification => ({
  ...spec,
  allowedParentSpecIds: [...spec.allowedParentSpecIds],
  allowedChildSpecIds: [...spec.allowedChildSpecIds],
  specCharacteristic: spec.specCharacteristic.map((item) => ({ ...item })),
});

const cloneEvent = (event: GeoEvent): GeoEvent => ({
  ...event,
  eventData: structuredClone(event.eventData),
});
