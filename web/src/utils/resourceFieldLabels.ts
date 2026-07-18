export type ResourceFieldKey =
  | 'resourceType'
  | 'category'
  | 'name'
  | 'description'
  | 'resourceSpecificationName'
  | 'supportingPhysicalResourceName'
  | 'placeId'
  | 'placeType'
  | 'equipmentCode'
  | 'equipmentFunction'
  | 'manufacturer'
  | 'model'
  | 'skuId'
  | 'stockable'
  | 'discontinued'
  | 'supportsSdWan'
  | 'supportsVoice'
  | 'homologationDate'
  | 'endOfLifeDate'
  | 'endOfSupportLifeDate'
  | 'lifecycleStatus';

export const RESOURCE_FIELD_LABELS: Record<ResourceFieldKey, string> = {
  resourceType: 'Tipo do Recurso',
  category: 'Categoria',
  name: 'Nome',
  description: 'Descrição',
  resourceSpecificationName: 'Nome do Modelo',
  supportingPhysicalResourceName: 'Recurso Físico Associado',
  placeId: 'Local',
  placeType: 'Tipo de Local',
  equipmentCode: 'Cod. Equipamento',
  equipmentFunction: 'Equipamento',
  manufacturer: 'Fabricante',
  model: 'Modelo',
  skuId: 'ID-SKU',
  stockable: 'Estocável?',
  discontinued: 'Equipamento Descontinuado?',
  supportsSdWan: 'Suporta SD-WAN?',
  supportsVoice: 'Suporta Voz?',
  homologationDate: 'Data da Homologação',
  endOfLifeDate: 'EOL',
  endOfSupportLifeDate: 'EOSL',
  lifecycleStatus: 'Status',
};

export function resourceFieldLabel(key: ResourceFieldKey): string {
  return RESOURCE_FIELD_LABELS[key];
}
