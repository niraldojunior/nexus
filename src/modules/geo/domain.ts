export type GeoGeometryType = 'Point' | 'LineString' | 'Polygon';

export type GeoJSONPoint = {
  type: 'Point';
  coordinates: [number, number];
};

export type GeoJSONLineString = {
  type: 'LineString';
  coordinates: Array<[number, number]>;
};

export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: Array<Array<[number, number]>>;
};

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString | GeoJSONPolygon;

export type TimePeriod = {
  startDateTime?: string;
  endDateTime?: string;
};

export type Characteristic = {
  group?: string;
  name: string;
  value: string | number | boolean | Record<string, unknown> | null;
  valueType?: 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'json';
};

export type GeoSiteStatus = 'planned' | 'active' | 'suspended' | 'terminated';

export type GeographicSiteRelationship = {
  id: string;
  relationshipType: string;
  '@referredType': 'GeographicSite';
  validFor?: TimePeriod;
};

export type GeoEvent = {
  '@type': 'Event';
  id: string;
  eventType: string;
  eventTime: string;
  source: string;
  eventData: Record<string, unknown>;
  correlationId?: string;
};

export type GeographicLocation = {
  '@type': 'GeographicLocation';
  id: string;
  href: string;
  geometryType: GeoGeometryType;
  geometry: GeoJSONGeometry;
  spatialRef: string;
  accuracy?: string;
  referencePoint?: string;
  validFor?: TimePeriod;
  characteristic: Characteristic[];
};

export type GeographicAddress = {
  '@type': 'GeographicAddress';
  id: string;
  href: string;
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  geographicLocationId?: string;
  place?: { id: string; '@referredType': 'GeographicLocation' };
  characteristic: Characteristic[];
};

export type GeographicSiteSpecification = {
  '@type': 'GeographicSiteSpecification';
  id: string;
  href: string;
  name: string;
  category: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
  allowedParentSpecIds: string[];
  allowedChildSpecIds: string[];
  specCharacteristic: Characteristic[];
};

export type GeographicSite = {
  '@type': 'GeographicSite';
  id: string;
  href: string;
  name: string;
  status: GeoSiteStatus;
  siteSpecificationId: string;
  siteSpecification: { id: string; '@referredType': 'GeographicSiteSpecification' };
  place?: { id: string; '@referredType': 'GeographicLocation' };
  address?: { id: string; '@referredType': 'GeographicAddress' };
  parentSite?: { id: string; '@referredType': 'GeographicSite' };
  relatedSite: GeographicSiteRelationship[];
  relatedParty: Array<{ id: string; role?: string; '@referredType': 'Party' }>;
  characteristic: Characteristic[];
};
