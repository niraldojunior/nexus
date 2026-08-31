// Estado de formulário e regras de conversão para ResourceSpecification (catálogo de Recursos).
// Extraído de ResourcePage para ser reutilizado também pelo editor de catálogo em Configurações
// (ver web/src/pages/config-tabs/ResourceCatalogTab.tsx) — uma única implementação do payload e
// da leitura de características, usada pelas duas telas.
import {
  Cable,
  Cpu,
  FileText,
  Globe2,
  Home,
  Link2,
  Network,
  Package,
  Server,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { Party } from '../services/partyApi';
import type {
  ResourceSpecification,
  ResourceSpecificationPayload,
  ResourceType,
} from '../services/resourceApi';
import {
  characteristicBooleanValue,
  readResourceSpecificationCharacteristicBooleanState,
  readResourceSpecificationCharacteristicString,
  readResourceSpecificationStatusLabel,
  type ResourceSpecificationCharacteristic,
} from './resourceSpecificationCharacteristics';

// Categoria que representa obra civil pura (dutos, postes, caixas de passagem) — o único ramo
// do catálogo de Recursos sem noção de "tipo de rede" (GPON, P2P…), já que não é equipamento
// nem meio de transmissão. Todo o resto do catálogo é considerado "Infraestrutura de Rede".
export const CIVIL_INFRASTRUCTURE_CATEGORY_CODE = 'Infrastructure.CivilWorks';

export function isCivilInfrastructureCategory(categoryCode: string): boolean {
  return categoryCode === CIVIL_INFRASTRUCTURE_CATEGORY_CODE;
}

export type ResourceSpecFormState = {
  name: string;
  category: string;
  resourceType: string;
  description: string;
  equipmentCode: string;
  equipmentFunction: string;
  manufacturerPartyId: string;
  model: string;
  skuId: string;
  stockable: '' | 'true' | 'false';
  discontinued: '' | 'true' | 'false';
  supportsSdWan: '' | 'true' | 'false';
  supportsVoice: '' | 'true' | 'false';
  homologationDate: string;
  endOfLifeDate: string;
  endOfSupportLifeDate: string;
  lifecycleStatus: string;
  resourceLayerId: string;
};

export function emptyResourceSpecFormState(defaultCategory = ''): ResourceSpecFormState {
  return {
    name: '',
    category: defaultCategory,
    resourceType: '',
    description: '',
    equipmentCode: '',
    equipmentFunction: '',
    manufacturerPartyId: '',
    model: '',
    skuId: '',
    stockable: '',
    discontinued: '',
    supportsSdWan: '',
    supportsVoice: '',
    homologationDate: '',
    endOfLifeDate: '',
    endOfSupportLifeDate: '',
    lifecycleStatus: '',
    resourceLayerId: '',
  };
}

export function resourceSpecFormStateFrom(
  entity: ResourceSpecification | null,
  defaultCategory: string,
  manufacturerOptions: Party[],
): ResourceSpecFormState {
  const characteristics = entity?.resourceSpecificationCharacteristic ?? [];
  const manufacturerParty = entity?.relatedParty?.find((party) => party.role === 'manufacturer');
  const resolvedManufacturer = manufacturerParty
    ? (manufacturerOptions.find((party) => party.id === manufacturerParty.id) ?? manufacturerParty)
    : null;

  return {
    ...emptyResourceSpecFormState(),
    name: entity?.name ?? '',
    category: entity?.category ?? defaultCategory,
    resourceType: entity?.resourceType ?? '',
    description: entity?.description ?? '',
    equipmentCode: readResourceSpecificationCharacteristicString(characteristics, 'equipmentCode'),
    equipmentFunction: readResourceSpecificationCharacteristicString(
      characteristics,
      'equipmentFunction',
    ),
    model: readSpecificationModel(entity),
    manufacturerPartyId: resolvedManufacturer?.id ?? '',
    skuId: readResourceSpecificationCharacteristicString(characteristics, 'skuId'),
    stockable: readResourceSpecificationCharacteristicBooleanState(characteristics, 'stockable'),
    discontinued: readResourceSpecificationCharacteristicBooleanState(
      characteristics,
      'discontinued',
    ),
    supportsSdWan: readResourceSpecificationCharacteristicBooleanState(
      characteristics,
      'supportsSdWan',
    ),
    supportsVoice: readResourceSpecificationCharacteristicBooleanState(
      characteristics,
      'supportsVoice',
    ),
    homologationDate: readResourceSpecificationCharacteristicString(
      characteristics,
      'homologationDate',
    ),
    endOfLifeDate: readResourceSpecificationCharacteristicString(characteristics, 'endOfLifeDate'),
    endOfSupportLifeDate: readResourceSpecificationCharacteristicString(
      characteristics,
      'endOfSupportLifeDate',
    ),
    lifecycleStatus: readResourceSpecificationCharacteristicString(
      characteristics,
      'lifecycleStatus',
    ),
    resourceLayerId: entity?.resourceLayerId ?? '',
  };
}

type SpecificationCharacteristicDefinition = {
  name: string;
  field: keyof ResourceSpecFormState;
  valueType: 'string' | 'boolean' | 'date';
  group: string;
};

export const SPECIFICATION_CHARACTERISTIC_DEFINITIONS: SpecificationCharacteristicDefinition[] = [
  { name: 'equipmentCode', field: 'equipmentCode', valueType: 'string', group: 'identification' },
  {
    name: 'equipmentFunction',
    field: 'equipmentFunction',
    valueType: 'string',
    group: 'identification',
  },
  { name: 'model', field: 'model', valueType: 'string', group: 'commercial' },
  { name: 'skuId', field: 'skuId', valueType: 'string', group: 'commercial' },
  { name: 'stockable', field: 'stockable', valueType: 'boolean', group: 'capability' },
  { name: 'discontinued', field: 'discontinued', valueType: 'boolean', group: 'lifecycle' },
  { name: 'supportsSdWan', field: 'supportsSdWan', valueType: 'boolean', group: 'capability' },
  { name: 'supportsVoice', field: 'supportsVoice', valueType: 'boolean', group: 'capability' },
  { name: 'homologationDate', field: 'homologationDate', valueType: 'date', group: 'commercial' },
  { name: 'endOfLifeDate', field: 'endOfLifeDate', valueType: 'date', group: 'lifecycle' },
  {
    name: 'endOfSupportLifeDate',
    field: 'endOfSupportLifeDate',
    valueType: 'date',
    group: 'lifecycle',
  },
  { name: 'lifecycleStatus', field: 'lifecycleStatus', valueType: 'string', group: 'lifecycle' },
];

export function normalizeCatalogText(value: string): string {
  return value.trim().replace(/^[-\s]+/, '');
}

export function mergeSpecificationCharacteristics(
  existing: ResourceSpecificationCharacteristic[],
  state: ResourceSpecFormState,
): ResourceSpecificationCharacteristic[] {
  const merged = new Map(existing.map((item) => [item.name, { ...item }] as const));

  for (const definition of SPECIFICATION_CHARACTERISTIC_DEFINITIONS) {
    const value = state[definition.field];
    if (definition.valueType === 'boolean') {
      const normalized = characteristicBooleanValue(value as '' | 'true' | 'false');
      if (normalized === undefined) merged.delete(definition.name);
      else {
        merged.set(definition.name, {
          name: definition.name,
          value: normalized,
          valueType: 'boolean',
          group: definition.group,
        });
      }
      continue;
    }

    const text =
      definition.name === 'model'
        ? normalizeCatalogText(String(value ?? ''))
        : String(value ?? '').trim();
    if (!text) {
      merged.delete(definition.name);
      continue;
    }

    merged.set(definition.name, {
      name: definition.name,
      value: text,
      valueType: definition.valueType,
      group: definition.group,
    });
  }

  return [...merged.values()];
}

export function resolveManufacturerParty(
  state: ResourceSpecFormState,
  options: Party[],
): Party | undefined {
  if (state.manufacturerPartyId) {
    const selected = options.find((party) => party.id === state.manufacturerPartyId);
    if (selected) return selected;
  }
  return undefined;
}

export function buildResourceSpecificationPayload(
  state: ResourceSpecFormState,
  existing: ResourceSpecification | null | undefined,
  manufacturerOptions: Party[] = [],
): ResourceSpecificationPayload {
  const existingManufacturerParty = existing?.relatedParty?.find(
    (party) => party.role === 'manufacturer',
  );
  const manufacturerParty =
    resolveManufacturerParty(state, manufacturerOptions) ?? existingManufacturerParty;
  const relatedParty = (existing?.relatedParty ?? []).filter(
    (party) => party.role !== 'manufacturer',
  );
  if (manufacturerParty) {
    relatedParty.push({
      id: manufacturerParty.id,
      '@referredType':
        'partyType' in manufacturerParty
          ? manufacturerParty.partyType
          : manufacturerParty['@referredType'],
      role: 'manufacturer',
      name: manufacturerParty.name,
    });
  }

  const resourceSpecificationCharacteristic = mergeSpecificationCharacteristics(
    (existing?.resourceSpecificationCharacteristic ?? []).filter(
      (item) => item.name !== 'manufacturer' && item.name !== 'networkType',
    ),
    state,
  );
  // No catálogo de Infraestrutura Civil, Modelo é opcional (ver CivilResourceSpecificationFields) —
  // sem fallback, o backend rejeitaria a especificação por `name` vazio (assertName em
  // src/modules/resource/service.ts). Equipamento e o código do Tipo cobrem esse caso na ordem.
  const modelName =
    normalizeCatalogText(state.model) ||
    normalizeCatalogText(state.equipmentFunction) ||
    normalizeCatalogText(state.name) ||
    state.resourceType.trim();
  if (manufacturerParty) {
    const filtered = resourceSpecificationCharacteristic.filter(
      (item) => item.name !== 'manufacturer',
    );
    return {
      name: modelName,
      category: state.category.trim(),
      resourceType: state.resourceType.trim(),
      description: state.description.trim(),
      resourceLayerId: state.resourceLayerId.trim() || undefined,
      relatedParty,
      resourceSpecificationCharacteristic: filtered,
    };
  }

  return {
    name: modelName,
    category: state.category.trim(),
    resourceType: state.resourceType.trim(),
    description: state.description.trim(),
    resourceLayerId: state.resourceLayerId.trim() || undefined,
    relatedParty,
    resourceSpecificationCharacteristic,
  };
}

export type CatalogOption = {
  code: string;
  label: string;
  active: boolean;
  icon: LucideIcon;
};

function categoryIconForCode(categoryCode: string): LucideIcon {
  switch (categoryCode) {
    case 'Equipment':
      return Server;
    case 'Equipment.Access':
      return Cpu;
    case 'Equipment.Transport':
      return Network;
    case 'Equipment.CustomerPremises':
      return Home;
    case 'Infrastructure':
      return Package;
    case 'Infrastructure.Passive':
      return Cable;
    case 'Infrastructure.Delivery':
      return Package;
    case 'Cable':
      return Cable;
    case 'Cable.OutsidePlant':
      return Cable;
    case 'Cable.InsidePlant':
      return Cable;
    case 'Logical':
      return Globe2;
    case 'Logical.IPAM':
      return Globe2;
    case 'Logical.L2':
      return Link2;
    case 'Logical.L3':
      return Shield;
    default:
      return FileText;
  }
}

// Mantido para simetria com resourceTypeIconForCode — hoje sem consumidor direto, mas cobre a
// categoria caso um seletor de categoria (Configurações) queira ícone junto ao rótulo.
export { categoryIconForCode };

function resourceTypeIconForCode(typeCode: string): LucideIcon {
  switch (typeCode) {
    case 'OLT':
      return Server;
    case 'ONT':
      return Home;
    case 'CPE':
      return Home;
    case 'Router':
      return Network;
    case 'Switch':
      return Network;
    case 'Rack':
      return Package;
    case 'Card':
      return Cpu;
    case 'Port':
      return Link2;
    case 'PowerSupply':
      return Shield;
    case 'Splitter':
      return Cable;
    case 'CTO':
      return Package;
    case 'DIO':
      return Cable;
    case 'Duct':
      return Cable;
    case 'Pole':
      return FileText;
    case 'Manhole':
      return Package;
    case 'Fiber':
      return Cable;
    case 'DropCable':
      return Cable;
    case 'DistributionCable':
      return Cable;
    case 'BackboneCable':
      return Cable;
    case 'PatchCord':
      return Cable;
    case 'Jumper':
      return Cable;
    case 'IPAddress':
      return Globe2;
    case 'Prefix':
      return Globe2;
    case 'VLAN':
      return Link2;
    case 'VLANGroup':
      return Link2;
    case 'VRF':
      return Shield;
    case 'ASN':
      return Shield;
    case 'RouteTarget':
      return Shield;
    default:
      return FileText;
  }
}

// Rótulo pt-BR do tipo de recurso para combos de filtro: "SIGLA - Nome" quando o código é uma
// sigla conhecida (diferente do nome), ex. "OLT - Optical Line Terminal"; só o nome quando
// código e nome coincidem (ex. "Router"), pra não duplicar.
export function resourceTypeOptionLabel(type: Pick<ResourceType, 'code' | 'name'>): string {
  return type.code && type.code !== type.name ? `${type.code} - ${type.name}` : type.name;
}

export function buildTypeOptions(types: ResourceType[], categoryCode: string): CatalogOption[] {
  return types
    .filter((type) => type.categoryCode === categoryCode)
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((type) => ({
      code: type.code,
      label: `${type.name} · ${type.code}`,
      active: type.status === 'active',
      icon: resourceTypeIconForCode(type.code),
    }));
}

export function isPhysicalCategoryCode(categoryCode: string): boolean {
  return !categoryCode.startsWith('Logical');
}

export function buildPhysicalModelOptions(
  resourceSpecifications: ResourceSpecification[],
  categoryCode: string,
  resourceTypeCode: string,
): ResourceSpecification[] {
  return resourceSpecifications
    .filter((spec) => isPhysicalCategoryCode(spec.category))
    .filter((spec) => !categoryCode || spec.category === categoryCode)
    .filter((spec) => !resourceTypeCode || spec.resourceType === resourceTypeCode)
    .sort((left, right) => {
      const categoryOrder = left.category.localeCompare(right.category);
      if (categoryOrder !== 0) return categoryOrder;
      const typeOrder = left.resourceType.localeCompare(right.resourceType);
      if (typeOrder !== 0) return typeOrder;
      return left.name.localeCompare(right.name);
    });
}

export function readSpecCharacteristic(
  characteristics: ResourceSpecificationCharacteristic[] | undefined,
  name: string,
): string {
  const item = characteristics?.find((characteristic) => characteristic.name === name);
  if (!item || item.value === undefined || item.value === null) return '-';
  return typeof item.value === 'string' ? item.value : String(item.value);
}

export function readSpecificationManufacturer(
  spec: ResourceSpecification | null | undefined,
): string {
  if (!spec) return '-';
  const manufacturerParty = spec.relatedParty?.find((party) => party.role === 'manufacturer');
  return manufacturerParty?.name ?? manufacturerParty?.id ?? '-';
}

export function readSpecificationModel(spec: ResourceSpecification | null | undefined): string {
  if (!spec) return '-';
  const model = readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'model');
  if (model !== '-') return model;
  return spec.name || '-';
}

export function readSpecLifecycleStatus(
  characteristics: ResourceSpecificationCharacteristic[] | undefined,
): string {
  const value = readSpecCharacteristic(characteristics, 'lifecycleStatus');
  if (value === '-') return value;
  return readResourceSpecificationStatusLabel(value);
}

export function readResourceTypeCode(types: ResourceType[], resourceTypeCode: string): string {
  return types.find((type) => type.code === resourceTypeCode)?.code ?? resourceTypeCode;
}

// Validação do formulário de catálogo (categoria/tipo ativos do catálogo + modelo preenchido) —
// usada tanto pelo modal embutido em ResourcePage quanto pelo editor de Configurações.
export function resourceSpecSelectionValid(
  state: ResourceSpecFormState,
  resourceTypes: ResourceType[],
  resourceCategoryActive: (categoryCode: string) => boolean,
): boolean {
  const visibleTypeOptions = buildTypeOptions(resourceTypes, state.category);
  const selectedResourceType = resourceTypes.find((type) => type.code === state.resourceType);
  const categorySelectionInvalid = Boolean(state.category && !resourceCategoryActive(state.category));
  const resourceTypeSelectionInvalid = Boolean(
    state.resourceType &&
      (!selectedResourceType ||
        selectedResourceType.status !== 'active' ||
        selectedResourceType.categoryCode !== state.category),
  );
  return !(
    categorySelectionInvalid ||
    resourceTypeSelectionInvalid ||
    (Boolean(state.category) &&
      Boolean(state.resourceType) &&
      !visibleTypeOptions.some((option) => option.code === state.resourceType))
  );
}

export function resourceSpecRequiredFieldsValid(state: ResourceSpecFormState): boolean {
  return (
    state.category.trim().length > 0 &&
    state.resourceType.trim().length > 0 &&
    state.model.trim().length > 0
  );
}

// Obra civil não exige Modelo (ver CivilResourceSpecificationFields) — só Tipo é obrigatório,
// já que a Categoria vem fixa da aba Civil do catálogo.
export function civilResourceSpecRequiredFieldsValid(state: ResourceSpecFormState): boolean {
  return state.category.trim().length > 0 && state.resourceType.trim().length > 0;
}
