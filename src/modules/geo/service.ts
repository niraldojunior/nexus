import { AppError } from '../../shared/errors/app-error.js';
import { createCanonicalId } from './ids.js';
import type {
  GeographicAddress,
  GeographicLocation,
  GeographicSite,
  GeographicSiteSpecification,
  GeoJSONGeometry,
} from './domain.js';
import { GeoRepository } from './repository.js';

export class GeoService {
  public constructor(private readonly repository: GeoRepository) {}

  public createLocation(input: {
    geometryType: 'Point' | 'LineString' | 'Polygon';
    geometry: GeoJSONGeometry;
    spatialRef?: string;
    accuracy?: string;
    referencePoint?: string;
    validFor?: { startDateTime?: string; endDateTime?: string };
  }): GeographicLocation {
    validateGeometry(input.geometryType, input.geometry);
    const id = createCanonicalId();
    return this.repository.upsertLocation({
      '@type': 'GeographicLocation',
      id,
      href: `/v1/geo/locations/${id}`,
      geometryType: input.geometryType,
      geometry: input.geometry,
      spatialRef: input.spatialRef ?? 'EPSG:4326',
      ...(input.accuracy ? { accuracy: input.accuracy } : {}),
      ...(input.referencePoint ? { referencePoint: input.referencePoint } : {}),
      ...(input.validFor ? { validFor: input.validFor } : {}),
      characteristic: [],
    });
  }

  public createAddress(input: {
    street: string;
    streetNr?: string;
    city?: string;
    stateOrProvince?: string;
    postcode?: string;
    country?: string;
    geographicLocationId?: string;
  }): GeographicAddress {
    const id = createCanonicalId();
    const location = input.geographicLocationId ? this.repository.getLocation(input.geographicLocationId) : undefined;
    return this.repository.upsertAddress({
      '@type': 'GeographicAddress',
      id,
      href: `/v1/geo/addresses/${id}`,
      street: input.street,
      ...(input.streetNr ? { streetNr: input.streetNr } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.stateOrProvince ? { stateOrProvince: input.stateOrProvince } : {}),
      ...(input.postcode ? { postcode: input.postcode } : {}),
      ...(input.country ? { country: input.country } : {}),
      ...(location ? { geographicLocationId: location.id } : {}),
      ...(location ? { place: { id: location.id, '@referredType': 'GeographicLocation' as const } } : {}),
      characteristic: [],
    });
  }

  public createSpec(input: {
    name: string;
    category: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
    allowedParentSpecIds?: string[];
    allowedChildSpecIds?: string[];
  }): GeographicSiteSpecification {
    const id = createCanonicalId();
    return this.repository.upsertSpec({
      '@type': 'GeographicSiteSpecification',
      id,
      href: `/v1/geo/site-specifications/${id}`,
      name: input.name,
      category: input.category,
      allowedParentSpecIds: input.allowedParentSpecIds ?? [],
      allowedChildSpecIds: input.allowedChildSpecIds ?? [],
      specCharacteristic: [],
    });
  }

  public createSite(input: {
    name: string;
    siteSpecificationId: string;
    placeId?: string;
    addressId?: string;
    parentSiteId?: string;
    relatedParty?: Array<{ id: string; role?: string }>;
  }): GeographicSite {
    const spec = this.repository.getSpec(input.siteSpecificationId);
    if (!spec) throw new AppError('site specification not found', { code: 'GEO_SPEC_NOT_FOUND', statusCode: 404 });
    if (input.parentSiteId) {
      const parentSite = this.repository.getSite(input.parentSiteId);
      if (!parentSite) {
        throw new AppError('parent site not found', { code: 'GEO_PARENT_NOT_FOUND', statusCode: 404 });
      }
      const parentSpec = this.repository.getSpec(parentSite.siteSpecificationId);
      if (!parentSpec || (spec.allowedParentSpecIds.length > 0 && !spec.allowedParentSpecIds.includes(parentSpec.id))) {
        throw new AppError('parent specification not allowed', {
          code: 'GEO_PARENT_SPEC_NOT_ALLOWED',
          statusCode: 409,
        });
      }
    }
    const id = createCanonicalId();
    const place = input.placeId ? this.repository.getLocation(input.placeId) : undefined;
    const address = input.addressId ? this.repository.getAddress(input.addressId) : undefined;
    const parentSite = input.parentSiteId ? this.repository.getSite(input.parentSiteId) : undefined;
    return this.repository.upsertSite({
      '@type': 'GeographicSite',
      id,
      href: `/v1/geo/sites/${id}`,
      name: input.name,
      status: 'planned',
      siteSpecificationId: spec.id,
      siteSpecification: { id: spec.id, '@referredType': 'GeographicSiteSpecification' },
      ...(place ? { place: { id: place.id, '@referredType': 'GeographicLocation' as const } } : {}),
      ...(address ? { address: { id: address.id, '@referredType': 'GeographicAddress' as const } } : {}),
      ...(parentSite ? { parentSite: { id: parentSite.id, '@referredType': 'GeographicSite' as const } } : {}),
      relatedSite: [],
      relatedParty: (input.relatedParty ?? []).map((party) => ({ ...party, '@referredType': 'Party' as const })),
      characteristic: [],
    });
  }

  public listLocations(): GeographicLocation[] { return this.repository.listLocations(); }
  public listAddresses(): GeographicAddress[] { return this.repository.listAddresses(); }
  public listSites(): GeographicSite[] { return this.repository.listSites(); }
  public listSpecs(): GeographicSiteSpecification[] { return this.repository.listSpecs(); }
}

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
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new AppError('coordinate out of range', { code: 'GEO_COORDINATE_INVALID', statusCode: 400 });
  }
};
