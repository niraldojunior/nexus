// Formato cru das linhas do Postgres para o modulo Service.
// Mesmas convencoes do modulo Geo: colunas snake_case, JSON serializado em texto,
// null (nao undefined) nas colunas opcionais e booleanos persistidos como 0/1.

export type ServiceSpecificationRow = {
  id: string;
  name: string;
  category: string;
  service_type: 'CFS' | 'RFS' | 'Other';
  description: string | null;
  observation: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
  characteristics: string | null;
  tenant_id: string;
};

export type ServiceCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  parent_category_id: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
  characteristics: string | null;
  tenant_id: string;
};

export type ServiceCandidateRow = {
  id: string;
  name: string;
  description: string | null;
  service_specification_id: string;
  service_category_id: string | null;
  status: 'active' | 'terminated' | 'inactive';
  valid_for_start: string | null;
  valid_for_end: string | null;
  characteristics: string | null;
  tenant_id: string;
};

// Colunas comuns a CFS e RFS.
type ServiceRowBase = {
  id: string;
  name: string;
  service_specification_id: string;
  status: string | null;
  state: string | null;
  service_type: string | null;
  category: string | null;
  service_date: string | null;
  start_date: string | null;
  end_date: string | null;
  is_service_enabled: number | null;
  has_started: number | null;
  place: string | null;
  related_party: string | null;
  supporting_services: string | null;
  service_relationships: string | null;
  characteristics: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
  tenant_id: string;
};

export type CustomerFacingServiceRow = ServiceRowBase & {
  subscriber_id: string;
  supporting_resource_facing_service_id: string | null;
};

export type ResourceFacingServiceRow = ServiceRowBase & {
  supporting_resource_id: string | null;
  supporting_resources: string | null;
};
