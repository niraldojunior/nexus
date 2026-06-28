import type {
  GeographicAddress,
  GeographicLocation,
  GeographicSite,
  GeographicSiteSpecification,
} from './domain.js';

export class GeoRepository {
  private readonly locations = new Map<string, GeographicLocation>();
  private readonly addresses = new Map<string, GeographicAddress>();
  private readonly sites = new Map<string, GeographicSite>();
  private readonly specs = new Map<string, GeographicSiteSpecification>();

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
    const stored = cloneSite(site);
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

const cloneSpec = (spec: GeographicSiteSpecification): GeographicSiteSpecification => ({
  ...spec,
  allowedParentSpecIds: [...spec.allowedParentSpecIds],
  allowedChildSpecIds: [...spec.allowedChildSpecIds],
  specCharacteristic: spec.specCharacteristic.map((item) => ({ ...item })),
});
