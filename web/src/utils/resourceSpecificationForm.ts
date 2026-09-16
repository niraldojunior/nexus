// Estado de formulário e leitura de características para ResourceSpecification (catálogo de
// Recursos), consumido por ResourcePage, ResourceOverviewTab/ResourceDefinitionModal e o Studio
// (ResourceSpecificationFormModal). O caminho de escrita legado (buildResourceSpecificationPayload
// e afins, payload `category`/`resourceType` string) foi removido na issue #251 — o backend
// rejeita esses campos com 400 RESOURCE_SPEC_FIELD_REMOVED desde o cutover da #188.
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
import type { ResourceSpecification, ResourceType } from '../services/resourceApi';
import {
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

// ---------------------------------------------------------------------------------------------
// Combo em cascata para editar a Especificação de um recurso já cadastrado (ResourceOverviewTab,
// issue #186 — extensão; reduzida de 4 para 2 níveis na issue #247). Diferente de
// buildTypeOptions/buildPhysicalModelOptions acima (que partem de category/resourceType
// escolhidos num formulário de catálogo em branco), aqui o ponto de partida é a Specification já
// vinculada ao recurso, e cada nível filtra estritamente pelas specs restantes do nível anterior —
// não pelo catálogo completo de tipos, que inclui tipos sem nenhuma spec cadastrada. Os 2 níveis
// são: Tipo de Recurso (resourceTypeId) → Especificação (a própria ResourceSpecification). O
// terceiro nível de contexto, "Path" (posição do Tipo na árvore de catálogo), não é construído
// aqui — vem de getResourceTypeCatalogContext (resourceApi.ts), consumido direto pelo chamador.
//
// Nível 1 — Topologia (resourceLayerId) e nível "Fornecedor" (relatedParty role=manufacturer) que
// existiam aqui foram removidos: ResourceLayer foi removido fisicamente do backend na Fase B do
// cutover da issue #188, e o agrupamento por fabricante não faz parte do desenho de 3 campos
// (Path/Tipo de Recurso/Especificação) definido para esta cascata.
export type ModelCascadeOption = { id: string; label: string };

// Nível 1 — Tipo de Recurso: só os tipos que de fato têm alguma spec apontando para eles (não o
// catálogo de ResourceType inteiro, que pode ter tipos sem nenhuma spec cadastrada).
export function buildModelTypeOptions(
  specs: ResourceSpecification[],
  types: ResourceType[],
): ModelCascadeOption[] {
  const usedTypeIds = new Set(
    specs.map((spec) => spec.resourceTypeId).filter((id): id is string => Boolean(id)),
  );
  return types
    .filter((type) => usedTypeIds.has(type.id))
    .map((type) => ({ id: type.id, label: resourceTypeOptionLabel(type) }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

// Nível 2 — Especificação: as specs restantes depois do filtro por Tipo de Recurso são, elas
// mesmas, as opções.
export function buildModelSpecificationOptions(
  specs: ResourceSpecification[],
  resourceTypeId: string,
): ResourceSpecification[] {
  return specs
    .filter((spec) => spec.resourceTypeId === resourceTypeId)
    .sort((left, right) => readSpecificationModel(left).localeCompare(readSpecificationModel(right)));
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
