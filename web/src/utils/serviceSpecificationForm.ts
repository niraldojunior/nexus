// Estado de formulário e regras de conversão para ServiceSpecification (catálogo de Serviços).
// Extraído de ServicePage para ser reutilizado também pelo editor de catálogo em Configurações
// (ver web/src/pages/config-tabs/ServiceCatalogTab.tsx).
import type {
  ServiceSpecification,
  ServiceSpecificationPayload,
  ServiceSpecificationType,
} from '../services/serviceApi';

export type ServiceSpecFormState = {
  name: string;
  category: string;
  serviceType: ServiceSpecificationType | '';
  description: string;
};

export function emptyServiceSpecFormState(defaultCategory = ''): ServiceSpecFormState {
  return { name: '', category: defaultCategory, serviceType: '', description: '' };
}

export function serviceSpecFormStateFrom(
  entity: ServiceSpecification | null,
  defaultCategory: string,
): ServiceSpecFormState {
  return {
    name: entity?.name ?? '',
    // A categoria é fixada pela página ativa; specs novas a herdam, edições mantêm a sua.
    category: entity?.category ?? defaultCategory,
    serviceType: entity?.serviceType ?? 'CFS',
    description: entity?.description ?? '',
  };
}

export function buildServiceSpecificationPayload(
  state: ServiceSpecFormState,
): ServiceSpecificationPayload {
  return {
    name: state.name.trim(),
    category: state.category.trim(),
    serviceType: (state.serviceType || 'CFS') as ServiceSpecificationType,
    description: state.description.trim(),
  };
}

export function serviceSpecSubmitValid(state: ServiceSpecFormState): boolean {
  return (
    state.name.trim().length > 0 && state.category.trim().length > 0 && state.serviceType !== ''
  );
}
