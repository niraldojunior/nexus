import type { ResourceOrderState, ServiceOrderState, ServiceQualificationState } from './domain.js';

// Formato cru das linhas do Postgres para o modulo Order.
// Mesmas convencoes dos modulos Geo e Service: colunas snake_case, JSON serializado
// em texto e null (nao undefined) nas colunas opcionais.

export type ServiceQualificationRow = {
  id: string;
  href: string;
  state: ServiceQualificationState;
  place: string | null;
  related_party: string | null;
  service_characteristic: string | null;
  service_qualification_item: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
};

export type ServiceOrderRow = {
  id: string;
  href: string;
  state: ServiceOrderState;
  description: string | null;
  related_party: string | null;
  service_order_item: string | null;
  note: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
};

export type ResourceOrderRow = {
  id: string;
  href: string;
  state: ResourceOrderState;
  description: string | null;
  related_party: string | null;
  resource_order_item: string | null;
  note: string | null;
  valid_for_start: string | null;
  valid_for_end: string | null;
};
