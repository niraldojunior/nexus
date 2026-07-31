import type { GeoGeometryType, GeoSiteStatus } from './domain.js';

// Formato cru das linhas do Postgres para o modulo Geo.
//
// Convencoes:
// - colunas em snake_case, como no schema;
// - estruturas compostas (geometry, characteristics, related_party, listas de ids)
//   sao persistidas como JSON serializado em texto e desserializadas no mapeamento;
// - colunas opcionais chegam como null, nao undefined;
// - colunas de enum sao tipadas com a uniao do dominio porque toda escrita passa
//   por este repositorio, que so grava valores validos.

export type GeographicLocationRow = {
  id: string;
  href: string;
  geometry_type: GeoGeometryType;
  geometry: string;
  spatial_ref: string;
  accuracy: string | null;
  reference_point: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
  characteristics: string | null;
};

export type GeographicAddressRow = {
  id: string;
  href: string;
  street_type: string | null;
  street_name: string;
  street_nr: string | null;
  city: string | null;
  state_or_province: string | null;
  postcode: string | null;
  country: string;
  geographic_location_id: string | null;
  characteristics: string | null;
};

export type GeographicSiteSpecificationRow = {
  id: string;
  href: string;
  name: string;
  category: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
  allowed_parent_spec_ids: string | null;
  allowed_child_spec_ids: string | null;
  characteristics: string | null;
};

export type GeographicSiteRow = {
  id: string;
  href: string;
  name: string;
  status: GeoSiteStatus;
  site_specification_id: string;
  geographic_location_id: string | null;
  geographic_address_id: string | null;
  parent_site_id: string | null;
  related_party: string | null;
  characteristics: string | null;
};

export type GeographicSiteRelationshipRow = {
  site_from_id: string;
  site_to_id: string;
  relationship_type: string;
  valid_for_start: string | null;
  valid_for_end: string | null;
};

export type EventRow = {
  id: string;
  event_type: string;
  event_time: string;
  source: string;
  event_data: string;
  correlation_id: string | null;
};
