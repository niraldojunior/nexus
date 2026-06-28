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
  name: string;
  value: string;
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
  status: 'planned' | 'active' | 'suspended' | 'terminated';
  siteSpecificationId: string;
  siteSpecification: { id: string; '@referredType': 'GeographicSiteSpecification' };
  place?: { id: string; '@referredType': 'GeographicLocation' };
  address?: { id: string; '@referredType': 'GeographicAddress' };
  parentSite?: { id: string; '@referredType': 'GeographicSite' };
  relatedSite: Array<{ id: string; relationshipType: string; '@referredType': 'GeographicSite' }>;
  relatedParty: Array<{ id: string; role?: string; '@referredType': 'Party' }>;
  characteristic: Characteristic[];
};
