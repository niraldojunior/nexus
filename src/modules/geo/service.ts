import { AppError } from '../../shared/errors/app-error.js';
import { createCanonicalId } from './ids.js';
import type {
  Characteristic,
  GeographicAddress,
  GeoEvent,
  GeographicLocation,
  GeographicSite,
  GeographicSiteRelationship,
  GeographicSiteSpecification,
  GeoJSONGeometry,
  GeoSiteStatus,
} from './domain.js';
import type { IGeoRepository } from './geo-repository-interface.js';

type LocationInput = {
  geometryType: 'Point' | 'LineString' | 'Polygon';
  geometry: GeoJSONGeometry;
  spatialRef?: string;
  accuracy?: string;
  referencePoint?: string;
  validFor?: { startDateTime?: string; endDateTime?: string };
  characteristic?: Characteristic[];
};

type AddressInput = {
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  geographicLocationId?: string;
  characteristic?: Characteristic[];
};

type SpecInput = {
  name: string;
  category: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
  allowedParentSpecIds?: string[];
  allowedChildSpecIds?: string[];
  specCharacteristic?: Characteristic[];
};

type SiteInput = {
  name: string;
  status?: GeoSiteStatus;
  siteSpecificationId: string;
  placeId?: string;
  addressId?: string;
  parentSiteId?: string;
  relatedParty?: Array<{ id: string; role?: string }>;
  characteristic?: Characteristic[];
  relatedSite?: Array<{ id: string; relationshipType: string; validFor?: { startDateTime?: string; endDateTime?: string } }>;
};

type SiteAtAddressInput = {
  location: LocationInput;
  address: AddressInput;
  site: Omit<SiteInput, 'placeId' | 'addressId'>;
  fedBySiteId?: string;
  fedByRelationshipType?: string;
};

export class GeoService {
  public constructor(private readonly repository: IGeoRepository) {}

  public createLocation(input: LocationInput): GeographicLocation {
    validateGeometry(input.geometryType, input.geometry);
    const id = createCanonicalId();
    const location = this.repository.upsertLocation({
      '@type': 'GeographicLocation',
      id,
      href: `/tmf-api/geographicLocationManagement/v4/geographicLocation/${id}`,
      geometryType: input.geometryType,
      geometry: input.geometry,
      spatialRef: input.spatialRef ?? 'EPSG:4326',
      ...(input.accuracy ? { accuracy: input.accuracy } : {}),
      ...(input.referencePoint ? { referencePoint: input.referencePoint } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
      characteristic: input.characteristic ?? [],
    });
    this.emitEvent('GeographicLocationCreateEvent', location.id, 'GeographicLocation', location);
    return location;
  }

  public updateLocation(id: string, input: Partial<LocationInput>): GeographicLocation {
    const current = this.getLocationOrThrow(id);
    const geometryType = input.geometryType ?? current.geometryType;
    const geometry = input.geometry ?? current.geometry;
    validateGeometry(geometryType, geometry);

    const updated = this.repository.upsertLocation({
      ...current,
      geometryType,
      geometry,
      spatialRef: input.spatialRef ?? current.spatialRef,
      ...(input.accuracy !== undefined ? optional('accuracy', input.accuracy) : optional('accuracy', current.accuracy)),
      ...(input.referencePoint !== undefined
        ? optional('referencePoint', input.referencePoint)
        : optional('referencePoint', current.referencePoint)),
      ...(input.validFor !== undefined ? optional('validFor', input.validFor) : optional('validFor', current.validFor)),
      characteristic: input.characteristic ?? current.characteristic,
    });
    this.emitEvent('GeographicLocationAttributeValueChangeEvent', updated.id, 'GeographicLocation', updated);
    return updated;
  }

  public createAddress(input: AddressInput): GeographicAddress {
    assertRequiredString(input.street, 'street');
    const id = createCanonicalId();
    const location = input.geographicLocationId ? this.getLocationOrThrow(input.geographicLocationId) : undefined;
    const address = this.repository.upsertAddress({
      '@type': 'GeographicAddress',
      id,
      href: `/tmf-api/geographicAddressManagement/v4/geographicAddress/${id}`,
      street: input.street,
      ...(input.streetNr ? { streetNr: input.streetNr } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.stateOrProvince ? { stateOrProvince: input.stateOrProvince } : {}),
      ...(input.postcode ? { postcode: input.postcode } : {}),
      ...(input.country ? { country: input.country } : {}),
      ...(location ? { geographicLocationId: location.id } : {}),
      ...(location ? { place: { id: location.id, '@referredType': 'GeographicLocation' as const } } : {}),
      characteristic: input.characteristic ?? [],
    });
    this.emitEvent('GeographicAddressCreateEvent', address.id, 'GeographicAddress', address);
    return address;
  }

  public updateAddress(id: string, input: Partial<AddressInput>): GeographicAddress {
    const current = this.getAddressOrThrow(id);
    const locationId = input.geographicLocationId ?? current.geographicLocationId;
    const location = locationId ? this.getLocationOrThrow(locationId) : undefined;

    if (input.street !== undefined) assertRequiredString(input.street, 'street');

    const updated = this.repository.upsertAddress({
      ...current,
      street: input.street ?? current.street,
      ...(input.streetNr !== undefined ? optional('streetNr', input.streetNr) : optional('streetNr', current.streetNr)),
      ...(input.city !== undefined ? optional('city', input.city) : optional('city', current.city)),
      ...(input.stateOrProvince !== undefined
        ? optional('stateOrProvince', input.stateOrProvince)
        : optional('stateOrProvince', current.stateOrProvince)),
      ...(input.postcode !== undefined ? optional('postcode', input.postcode) : optional('postcode', current.postcode)),
      ...(input.country !== undefined ? optional('country', input.country) : optional('country', current.country)),
      ...(location ? { geographicLocationId: location.id, place: { id: location.id, '@referredType': 'GeographicLocation' as const } } : {}),
      characteristic: input.characteristic ?? current.characteristic,
    });
    this.emitEvent('GeographicAddressAttributeValueChangeEvent', updated.id, 'GeographicAddress', updated);
    return updated;
  }

  public createSpec(input: SpecInput): GeographicSiteSpecification {
    assertRequiredString(input.name, 'name');
    validateSpecCategory(input.category);
    const id = createCanonicalId();
    const spec = this.repository.upsertSpec({
      '@type': 'GeographicSiteSpecification',
      id,
      href: `/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/${id}`,
      name: input.name,
      category: input.category,
      allowedParentSpecIds: input.allowedParentSpecIds ?? [],
      allowedChildSpecIds: input.allowedChildSpecIds ?? [],
      specCharacteristic: input.specCharacteristic ?? [],
    });
    this.emitEvent('GeographicSiteSpecificationCreateEvent', spec.id, 'GeographicSiteSpecification', spec);
    return spec;
  }

  public updateSpec(id: string, input: Partial<SpecInput>): GeographicSiteSpecification {
    const current = this.getSpecOrThrow(id);
    if (input.name !== undefined) assertRequiredString(input.name, 'name');
    if (input.category !== undefined) validateSpecCategory(input.category);

    const updated = this.repository.upsertSpec({
      ...current,
      name: input.name ?? current.name,
      category: input.category ?? current.category,
      allowedParentSpecIds: input.allowedParentSpecIds ?? current.allowedParentSpecIds,
      allowedChildSpecIds: input.allowedChildSpecIds ?? current.allowedChildSpecIds,
      specCharacteristic: input.specCharacteristic ?? current.specCharacteristic,
    });
    this.emitEvent('GeographicSiteSpecificationAttributeValueChangeEvent', updated.id, 'GeographicSiteSpecification', updated);
    return updated;
  }

  public createSite(input: SiteInput): GeographicSite {
    assertRequiredString(input.name, 'name');
    const status = input.status ?? 'planned';
    validateStatus(status);
    const spec = this.getSpecOrThrow(input.siteSpecificationId);
    const parentSite = input.parentSiteId ? this.getSiteOrThrow(input.parentSiteId) : undefined;
    if (parentSite) this.validateContainment(spec, parentSite);

    const place = input.placeId ? this.getLocationOrThrow(input.placeId) : undefined;
    const address = input.addressId ? this.getAddressOrThrow(input.addressId) : undefined;
    const id = createCanonicalId();
    const site = this.repository.upsertSite({
      '@type': 'GeographicSite',
      id,
      href: `/tmf-api/geographicSiteManagement/v4/geographicSite/${id}`,
      name: input.name,
      status,
      siteSpecificationId: spec.id,
      siteSpecification: { id: spec.id, '@referredType': 'GeographicSiteSpecification' },
      ...(place ? { place: { id: place.id, '@referredType': 'GeographicLocation' as const } } : {}),
      ...(address ? { address: { id: address.id, '@referredType': 'GeographicAddress' as const } } : {}),
      ...(parentSite ? { parentSite: { id: parentSite.id, '@referredType': 'GeographicSite' as const } } : {}),
      relatedSite: [],
      relatedParty: (input.relatedParty ?? []).map((party) => ({ ...party, '@referredType': 'Party' as const })),
      characteristic: input.characteristic ?? [],
    });

    for (const relationship of input.relatedSite ?? []) {
      this.addSiteRelationship(site.id, relationship.id, relationship.relationshipType, relationship.validFor);
    }

    const stored = this.getSiteOrThrow(site.id);
    this.emitEvent('GeographicSiteCreateEvent', stored.id, 'GeographicSite', stored);
    return stored;
  }

  public updateSite(id: string, input: Partial<SiteInput>): GeographicSite {
    const current = this.getSiteOrThrow(id);
    if (input.name !== undefined) assertRequiredString(input.name, 'name');
    const status = input.status ?? current.status;
    validateStatus(status);

    const spec = input.siteSpecificationId ? this.getSpecOrThrow(input.siteSpecificationId) : this.getSpecOrThrow(current.siteSpecificationId);
    const parentSiteId = input.parentSiteId ?? current.parentSite?.id;
    const parentSite = parentSiteId ? this.getSiteOrThrow(parentSiteId) : undefined;
    if (parentSite && parentSite.id === id) {
      throw new AppError('site cannot be its own parent', { code: 'GEO_PARENT_SELF_REFERENCE', statusCode: 409 });
    }
    if (parentSite) this.validateContainment(spec, parentSite);

    const placeId = input.placeId ?? current.place?.id;
    const place = placeId ? this.getLocationOrThrow(placeId) : undefined;
    const addressId = input.addressId ?? current.address?.id;
    const address = addressId ? this.getAddressOrThrow(addressId) : undefined;

    const updated = this.repository.upsertSite({
      ...current,
      name: input.name ?? current.name,
      status,
      siteSpecificationId: spec.id,
      siteSpecification: { id: spec.id, '@referredType': 'GeographicSiteSpecification' },
      ...(place ? { place: { id: place.id, '@referredType': 'GeographicLocation' as const } } : {}),
      ...(address ? { address: { id: address.id, '@referredType': 'GeographicAddress' as const } } : {}),
      ...(parentSite ? { parentSite: { id: parentSite.id, '@referredType': 'GeographicSite' as const } } : {}),
      relatedParty: input.relatedParty
        ? input.relatedParty.map((party) => ({ ...party, '@referredType': 'Party' as const }))
        : current.relatedParty,
      characteristic: input.characteristic ?? current.characteristic,
      relatedSite: current.relatedSite,
    });

    this.emitEvent(
      current.status !== updated.status ? 'GeographicSiteStatusChangeEvent' : 'GeographicSiteAttributeValueChangeEvent',
      updated.id,
      'GeographicSite',
      updated,
    );
    return updated;
  }

  public createSiteAtAddress(input: SiteAtAddressInput): { location: GeographicLocation; address: GeographicAddress; site: GeographicSite } {
    return this.repository.transaction(() => {
      const location = this.createLocation(input.location);
      const address = this.createAddress({
        ...input.address,
        geographicLocationId: location.id,
      });
      const site = this.createSite({
        ...input.site,
        placeId: location.id,
        addressId: address.id,
      });

      if (input.fedBySiteId) {
        this.addSiteRelationship(site.id, input.fedBySiteId, input.fedByRelationshipType ?? 'fedBy');
      }

      return {
        location,
        address,
        site: this.getSiteOrThrow(site.id),
      };
    });
  }

  public addSiteRelationship(
    siteId: string,
    relatedSiteId: string,
    relationshipType: string,
    validFor?: { startDateTime?: string; endDateTime?: string },
  ): GeographicSiteRelationship {
    assertRequiredString(relationshipType, 'relationshipType');
    this.getSiteOrThrow(siteId);
    this.getSiteOrThrow(relatedSiteId);
    const relationship = this.repository.upsertSiteRelationship(siteId, {
      id: relatedSiteId,
      relationshipType,
      '@referredType': 'GeographicSite',
      ...(validFor ? { validFor } : {}),
    });
    this.emitEvent('GeographicSiteRelationshipCreateEvent', siteId, 'GeographicSite', {
      siteId,
      relationship,
    });
    return relationship;
  }

  public removeSiteRelationship(siteId: string, relatedSiteId: string, relationshipType: string): boolean {
    this.getSiteOrThrow(siteId);
    this.getSiteOrThrow(relatedSiteId);
    const removed = this.repository.deleteSiteRelationship(siteId, relatedSiteId, relationshipType);
    if (removed) {
      this.emitEvent('GeographicSiteRelationshipDeleteEvent', siteId, 'GeographicSite', {
        siteId,
        relatedSiteId,
        relationshipType,
      });
    }
    return removed;
  }

  public getLocation(id: string): GeographicLocation | undefined { return this.repository.getLocation(id); }
  public getAddress(id: string): GeographicAddress | undefined { return this.repository.getAddress(id); }
  public getSite(id: string): GeographicSite | undefined { return this.repository.getSite(id); }
  public getSpec(id: string): GeographicSiteSpecification | undefined { return this.repository.getSpec(id); }
  public listLocations(query?: { limit?: number; offset?: number }): GeographicLocation[] { return this.repository.listLocations(query); }
  public listAddresses(query?: { name?: string; limit?: number; offset?: number }): GeographicAddress[] { return this.repository.listAddresses(query); }
  public listSites(query?: { name?: string; limit?: number; offset?: number }): GeographicSite[] { return this.repository.listSites(query); }
  public countSites(): number { return this.repository.countSites(); }
  public listSpecs(): GeographicSiteSpecification[] { return this.repository.listSpecs(); }
  public listSiteEvents(siteId: string): GeoEvent[] {
    this.getSiteOrThrow(siteId);
    return this.repository.listEventsForEntity(siteId);
  }

  private getLocationOrThrow(id: string): GeographicLocation {
    const location = this.repository.getLocation(id);
    if (!location) throw new AppError('geographic location not found', { code: 'GEO_LOCATION_NOT_FOUND', statusCode: 404 });
    return location;
  }

  private getAddressOrThrow(id: string): GeographicAddress {
    const address = this.repository.getAddress(id);
    if (!address) throw new AppError('geographic address not found', { code: 'GEO_ADDRESS_NOT_FOUND', statusCode: 404 });
    return address;
  }

  private getSpecOrThrow(id: string): GeographicSiteSpecification {
    const spec = this.repository.getSpec(id);
    if (!spec) throw new AppError('site specification not found', { code: 'GEO_SPEC_NOT_FOUND', statusCode: 404 });
    return spec;
  }

  private getSiteOrThrow(id: string): GeographicSite {
    const site = this.repository.getSite(id);
    if (!site) throw new AppError('geographic site not found', { code: 'GEO_SITE_NOT_FOUND', statusCode: 404 });
    return site;
  }

  private validateContainment(spec: GeographicSiteSpecification, parentSite: GeographicSite): void {
    const parentSpec = this.getSpecOrThrow(parentSite.siteSpecificationId);
    if (spec.allowedParentSpecIds.length > 0 && !spec.allowedParentSpecIds.includes(parentSpec.id)) {
      throw new AppError('parent specification not allowed', {
        code: 'GEO_PARENT_SPEC_NOT_ALLOWED',
        statusCode: 409,
      });
    }
    if (parentSpec.allowedChildSpecIds.length > 0 && !parentSpec.allowedChildSpecIds.includes(spec.id)) {
      throw new AppError('child specification not allowed for parent', {
        code: 'GEO_CHILD_SPEC_NOT_ALLOWED',
        statusCode: 409,
      });
    }
  }

  private emitEvent(eventType: string, entityId: string, entityType: string, payload: unknown): GeoEvent {
    return this.repository.appendEvent({
      '@type': 'Event',
      id: createCanonicalId(),
      eventType,
      eventTime: new Date().toISOString(),
      source: `geo.${entityType}`,
      eventData: {
        entityId,
        entityType,
        payload: payload as Record<string, unknown>,
      },
    });
  }
}

const optional = <K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<string, never> =>
  value === undefined ? {} : { [key]: value } as Record<K, V>;

const validateGeometry = (geometryType: string, geometry: GeoJSONGeometry): void => {
  if (geometry.type !== geometryType) {
    throw new AppError('geometry type mismatch', { code: 'GEO_GEOMETRY_TYPE_MISMATCH', statusCode: 400 });
  }
  if (geometry.type === 'Point') validatePoint(geometry.coordinates);
  if (geometry.type === 'LineString') validateLineString(geometry.coordinates);
  if (geometry.type === 'Polygon') validatePolygon(geometry.coordinates);
};

const validatePoint = (coordinates: [number, number]): void => {
  validateCoordinate(coordinates[0], coordinates[1]);
};

const validateLineString = (coordinates: Array<[number, number]>): void => {
  if (coordinates.length < 2) throw new AppError('linestring needs at least 2 points', { code: 'GEO_LINESTRING_INVALID', statusCode: 400 });
  coordinates.forEach(([lng, lat]) => validateCoordinate(lng, lat));
};

const validatePolygon = (coordinates: Array<Array<[number, number]>>): void => {
  const ring = coordinates[0];
  if (!ring || ring.length < 4) throw new AppError('polygon needs a closed ring', { code: 'GEO_POLYGON_INVALID', statusCode: 400 });
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    throw new AppError('polygon ring must be closed', { code: 'GEO_POLYGON_NOT_CLOSED', statusCode: 400 });
  }
  ring.forEach(([lng, lat]) => validateCoordinate(lng, lat));
};

const validateCoordinate = (lng: number, lat: number): void => {
  if (typeof lng !== 'number' || typeof lat !== 'number' || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new AppError('coordinate out of range', { code: 'GEO_COORDINATE_INVALID', statusCode: 400 });
  }
};

const validateStatus: (status: string) => asserts status is GeoSiteStatus = (status: string): asserts status is GeoSiteStatus => {
  if (!['planned', 'active', 'suspended', 'terminated'].includes(status)) {
    throw new AppError('invalid site status', { code: 'GEO_SITE_STATUS_INVALID', statusCode: 400 });
  }
};

const validateSpecCategory: (category: string) => asserts category is SpecInput['category'] = (
  category: string,
): asserts category is SpecInput['category'] => {
  if (!['Region', 'FunctionalGroup', 'Site', 'SubSite'].includes(category)) {
    throw new AppError('invalid site specification category', { code: 'GEO_SPEC_CATEGORY_INVALID', statusCode: 400 });
  }
};

const assertRequiredString = (value: unknown, field: string): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(`${field} is required`, { code: 'GEO_REQUIRED_FIELD', statusCode: 400 });
  }
};
