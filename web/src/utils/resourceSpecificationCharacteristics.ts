export type ResourceSpecificationCharacteristic = {
  name: string;
  value: unknown;
  valueType?: string;
  group?: string;
};

export type ResourceSpecificationCharacteristicName =
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

export const RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'eol', label: 'EOL' },
  { value: 'eosl', label: 'EOSL' },
  { value: 'discontinued', label: 'Descontinuado' },
] as const;

export function findResourceSpecificationCharacteristic(
  characteristics: ResourceSpecificationCharacteristic[] | undefined,
  name: ResourceSpecificationCharacteristicName,
): ResourceSpecificationCharacteristic | undefined {
  return characteristics?.find((characteristic) => characteristic.name === name);
}

export function readResourceSpecificationCharacteristicString(
  characteristics: ResourceSpecificationCharacteristic[] | undefined,
  name: ResourceSpecificationCharacteristicName,
): string {
  const characteristic = findResourceSpecificationCharacteristic(characteristics, name);
  if (!characteristic || characteristic.value === undefined || characteristic.value === null) return '';
  return typeof characteristic.value === 'string' ? characteristic.value : String(characteristic.value);
}

export function readResourceSpecificationCharacteristicBooleanState(
  characteristics: ResourceSpecificationCharacteristic[] | undefined,
  name: ResourceSpecificationCharacteristicName,
): '' | 'true' | 'false' {
  const characteristic = findResourceSpecificationCharacteristic(characteristics, name);
  if (!characteristic || characteristic.value === undefined || characteristic.value === null) return '';
  if (typeof characteristic.value === 'boolean') return characteristic.value ? 'true' : 'false';
  if (typeof characteristic.value === 'string') {
    const normalized = characteristic.value.trim().toLowerCase();
    if (normalized === 'true') return 'true';
    if (normalized === 'false') return 'false';
  }
  return '';
}

export function characteristicBooleanValue(value: '' | 'true' | 'false'): boolean | undefined {
  if (value === '') return undefined;
  return value === 'true';
}

export function readResourceSpecificationStatusLabel(status: string | undefined): string {
  return RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status ?? '-';
}
