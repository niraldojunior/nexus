// Estado de formulário e regras de conversão para ServiceSpecification (catálogo de Serviços).
// Extraído de ServicePage para ser reutilizado também pelo editor de catálogo em Configurações
// (ver web/src/pages/config-tabs/ServiceCatalogTab.tsx).
import type {
  ServiceSpecCharacteristic,
  ServiceSpecification,
  ServiceSpecificationPayload,
  ServiceSpecificationType,
} from '../services/serviceApi';

/** Linha editável de atributo — `key` só existe no cliente, para identidade de lista no React. */
export type ServiceSpecCharacteristicRow = ServiceSpecCharacteristic & { key: string };

export type ServiceSpecFormState = {
  name: string;
  category: string;
  serviceType: ServiceSpecificationType | '';
  description: string;
  observation: string;
  characteristics: ServiceSpecCharacteristicRow[];
};

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `spec-char-${rowKeySeq}`;
}

export function emptyServiceSpecCharacteristicRow(
  group: 'business' | 'technical',
): ServiceSpecCharacteristicRow {
  return { key: nextRowKey(), name: '', group, valueType: 'string', required: false };
}

export function emptyServiceSpecFormState(defaultCategory = ''): ServiceSpecFormState {
  // serviceType começa em 'CFS', não '': o select de Camada não tem opção em branco (só
  // CFS/RFS), então com '' o navegador exibe a primeira opção sem que o React saiba — o campo
  // parece preenchido mas o estado interno nunca vira 'CFS' a menos que o usuário reselecione,
  // deixando "Criar" desabilitado mesmo com o formulário aparentemente completo.
  return {
    name: '',
    category: defaultCategory,
    serviceType: 'CFS',
    description: '',
    observation: '',
    characteristics: [],
  };
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
    observation: entity?.observation ?? '',
    characteristics: (entity?.serviceSpecificationCharacteristic ?? []).map((characteristic) => ({
      ...characteristic,
      key: nextRowKey(),
    })),
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
    observation: state.observation.trim(),
    serviceSpecificationCharacteristic: state.characteristics
      .filter((row) => row.name.trim().length > 0)
      .map(({ key: _key, ...characteristic }) => ({
        ...characteristic,
        name: characteristic.name.trim(),
      })),
  };
}

export function serviceSpecSubmitValid(state: ServiceSpecFormState): boolean {
  const namesValid = state.characteristics.every((row) => row.name.trim().length > 0);
  return (
    state.name.trim().length > 0 &&
    state.category.trim().length > 0 &&
    state.serviceType !== '' &&
    namesValid
  );
}
