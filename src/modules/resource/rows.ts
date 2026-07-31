import type {
  AdministrativeState,
  OperationalState,
  ResourceStatus,
  UsageState,
} from './domain.js';

// Formato cru das linhas do Postgres para o modulo Resource.
// Mesmas convencoes dos demais modulos: colunas snake_case, JSON serializado em
// texto e null (nao undefined) nas colunas opcionais.

type ResourceRowBase = {
  id: string;
  href: string;
  name: string;
  resource_specification_id: string;
  resource_type: string;
  status: ResourceStatus;
  place_id: string | null;
  place_type: string | null;
  administrative_state: AdministrativeState;
  operational_state: OperationalState;
  usage_state: UsageState;
  related_party: string | null;
  characteristics: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
};

export type PhysicalResourceRow = ResourceRowBase & {
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  part_number: string | null;
};

export type LogicalResourceRow = ResourceRowBase & {
  supporting_physical_resource_id: string | null;
};
