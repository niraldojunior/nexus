import type {
  GeoAccuracyLevel,
  GeoBulkItemStatus,
  GeoBulkJobStatus,
  GeoBulkMode,
  GeoBulkTarget,
  GeoGeometryType,
  GeoSiteStatus,
  GeoSourceSystem,
  GeographicRelationshipType,
  GeographicSiteSpecificationCategory,
  GeographicSiteSpecificationLifecycleStatus,
} from './domain.js';

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
  tenant_id: string | null;
  geometry_type: GeoGeometryType;
  geometry: string;
  spatial_ref: string;
  accuracy: string | null;
  reference_point: string | null;
  source_system: GeoSourceSystem | null;
  source_ref: string | null;
  accuracy_level: GeoAccuracyLevel | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
  characteristics: string | null;
};

export type GeographicAddressRow = {
  id: string;
  href: string;
  tenant_id: string | null;
  street_type: string | null;
  street_name: string;
  street_nr: string | null;
  city: string | null;
  state_or_province: string | null;
  postcode: string | null;
  country: string;
  geographic_location_id: string | null;
  source_system: GeoSourceSystem | null;
  source_ref: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
  characteristics: string | null;
};

export type GeographicSiteSpecificationRow = {
  id: string;
  href: string;
  name: string;
  code: string;
  category: GeographicSiteSpecificationCategory;
  lifecycle_status: GeographicSiteSpecificationLifecycleStatus;
  description: string | null;
  allowed_parent_spec_ids: string | null;
  allowed_child_spec_ids: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
  characteristics: string | null;
  is_bootstrap: number | null;
};

export type GeographicSiteSpecificationContainmentRuleRow = {
  parent_spec_id: string;
  child_spec_id: string;
  valid_for_start: string | null;
  valid_for_end: string | null;
  is_protected: number | null;
};

export type GeographicSiteRow = {
  id: string;
  href: string;
  tenant_id: string | null;
  name: string;
  status: GeoSiteStatus;
  status_date: string | null;
  status_reason: string | null;
  site_specification_id: string;
  geographic_location_id: string | null;
  geographic_address_id: string | null;
  parent_site_id: string | null;
  related_party: string | null;
  site_addresses: string | null;
  note: string | null;
  characteristics: string | null;
};

export type GeographicSiteRelationshipRow = {
  site_from_id: string;
  site_to_id: string;
  relationship_type: string;
  valid_for_start: string | null;
  valid_for_end: string | null;
};

export type GeographicRelationshipTypeRow = {
  id: string;
  href: string;
  code: string;
  name: string;
  inverse_code: string;
  is_symmetric: number | null;
  allowed_source_categories: string | null;
  allowed_target_categories: string | null;
  cardinality: string | null;
  lifecycle_status: GeographicRelationshipType['lifecycleStatus'];
  is_bootstrap: number | null;
};

export type GeographicSiteStatusHistoryRow = {
  id: string;
  site_id: string;
  tenant_id: string;
  from_status: GeoSiteStatus | null;
  to_status: GeoSiteStatus;
  status_date: string;
  status_reason: string | null;
  actor_sub: string;
  trace_id: string;
};

export type GeoAuditLogRow = {
  id: string;
  tenant_id: string;
  actor_sub: string;
  action: string;
  entity_type: string;
  entity_id: string;
  event_time: string;
  before_state: string | null;
  after_state: string | null;
  trace_id: string;
  source_ip: string | null;
};

export type EventRow = {
  id: string;
  event_type: string;
  event_time: string;
  source: string;
  event_data: string;
  correlation_id: string | null;
};

export type GeoOutboxRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  topic: string;
  payload: string;
  status: 'pending' | 'published' | 'failed';
  created_at: string;
  published_at: string | null;
};

export type GeoBulkJobRow = {
  id: string;
  tenant_id: string;
  target: GeoBulkTarget;
  mode: GeoBulkMode;
  idempotency_key: string;
  status: GeoBulkJobStatus;
  submitted_at: string;
  started_at: string;
  completed_at: string | null;
  total: number;
  success_count: number;
  error_count: number;
  warning_count: number;
  actor_sub: string;
  trace_id: string;
};

export type GeoBulkJobResultRow = {
  id: string;
  job_id: string;
  tenant_id: string;
  item_index: number;
  status: GeoBulkItemStatus;
  entity_id: string | null;
  legacy_system: string | null;
  legacy_entity: string | null;
  legacy_id: string | null;
  error_code: string | null;
  message: string | null;
  warnings: string | null;
};
