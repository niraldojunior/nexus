// Estado de formulário e regras de conversão para `PartyRoleTypeCharacteristic`
// — espelha `geoCharacteristicsForm.ts` para características de papel de partes (issue #275).
import type {
  PartyRoleTypeCharacteristic,
  PartyRoleTypeCharacteristicValueType,
} from '../services/partyRoleTypeCharacteristicApi';

export type CharacteristicValueType = PartyRoleTypeCharacteristicValueType;

export type PartyRoleCharacteristicRow = {
  key: string;
  id?: string;
  name: string;
  group?: string;
  description?: string;
  valueType: CharacteristicValueType;
  valueText: string;
  hasDefaultValue: boolean;
  mandatory: boolean;
  sortOrder: number;
  /** Valores permitidos da lista (quando `valueType === 'list'`), digitados inline. */
  allowedValues?: string[];
  /** Texto livre separado por vírgula para edição dos valores da lista. */
  allowedValuesText?: string;
  /**
   * Alternativa a `allowedValues`: chave de um conjunto publicado em Studio -> Dados de
   * Referência. Mutuamente exclusivo com `allowedValues`.
   */
  referenceDataSetKey?: string | null;
  active: boolean;
};

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `party-char-${rowKeySeq}`;
}

function inferValueType(value: unknown): CharacteristicValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'decimal';
  if (value !== null && typeof value === 'object') return 'json';
  return 'string';
}

function valueToText(value: unknown, valueType: CharacteristicValueType): string {
  if (value === null || value === undefined) return '';
  if (valueType === 'json') return typeof value === 'string' ? value : JSON.stringify(value);
  return String(value);
}

export function emptyPartyRoleCharacteristicRow(): PartyRoleCharacteristicRow {
  return {
    key: nextRowKey(),
    name: '',
    valueType: 'string',
    valueText: '',
    hasDefaultValue: false,
    mandatory: false,
    sortOrder: 100,
    active: true,
  };
}

export function partyRoleCharacteristicRowsFrom(
  characteristics: PartyRoleTypeCharacteristic[] | undefined,
): PartyRoleCharacteristicRow[] {
  return (characteristics ?? []).map((characteristic) => {
    const valueType =
      (characteristic.valueType as CharacteristicValueType) ||
      inferValueType(characteristic.defaultValue);
    const allowedValues = characteristic.allowedValues?.map((value) => String(value));
    return {
      key: nextRowKey(),
      id: characteristic.id,
      name: characteristic.name,
      group: characteristic.group ?? undefined,
      description: characteristic.description ?? undefined,
      valueType,
      valueText: valueToText(characteristic.defaultValue, valueType),
      hasDefaultValue:
        characteristic.defaultValue !== null && characteristic.defaultValue !== undefined,
      mandatory: Boolean(characteristic.mandatory),
      sortOrder: characteristic.sortOrder ?? 100,
      allowedValues,
      allowedValuesText: allowedValues ? allowedValues.join(', ') : '',
      referenceDataSetKey: characteristic.referenceDataSetKey ?? null,
      active: characteristic.active !== false,
    };
  });
}

function coerceDefaultValue(valueText: string, valueType: CharacteristicValueType): string {
  switch (valueType) {
    case 'boolean':
      if (valueText !== 'true' && valueText !== 'false') {
        throw new Error('O valor padrão booleano deve ser Sim ou Não.');
      }
      return valueText;
    case 'integer': {
      if (!/^-?\d+$/.test(valueText.trim())) {
        throw new Error('O valor padrão deve ser um número inteiro válido.');
      }
      return valueText.trim();
    }
    case 'decimal': {
      if (valueText.trim() === '' || !Number.isFinite(Number(valueText))) {
        throw new Error('O valor padrão deve ser um número decimal válido.');
      }
      return valueText.trim();
    }
    case 'json':
      try {
        JSON.parse(valueText);
        return valueText;
      } catch {
        throw new Error('O valor padrão deve conter um JSON válido.');
      }
    default:
      return valueText;
  }
}

export function parseAllowedValues(text?: string): string[] | undefined {
  if (!text) return undefined;
  const items = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}

export function buildPartyRoleCharacteristicPayload(
  rows: PartyRoleCharacteristicRow[],
): PartyRoleTypeCharacteristic[] {
  return rows
    .filter((row) => row.name.trim().length > 0)
    .map((row, index) => {
      const referenceDataSetKey =
        row.valueType === 'list' && row.referenceDataSetKey ? row.referenceDataSetKey : null;
      const allowedValues =
        row.valueType === 'list' && !referenceDataSetKey
          ? (parseAllowedValues(row.allowedValuesText) ?? row.allowedValues ?? null)
          : null;
      return {
        id: row.id ?? `temp-${row.key}`,
        tenantId: '',
        roleName: '',
        name: row.name.trim(),
        valueType: row.valueType,
        defaultValue:
          row.hasDefaultValue && row.valueText.trim().length > 0
            ? coerceDefaultValue(row.valueText, row.valueType)
            : null,
        mandatory: row.mandatory,
        description: row.description?.trim() || null,
        group: row.group?.trim() || null,
        sortOrder: row.sortOrder ?? (index + 1) * 10,
        allowedValues,
        referenceDataSetKey,
        active: row.active,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
}

export function partyRoleCharacteristicRowsValid(rows: PartyRoleCharacteristicRow[]): boolean {
  return rows.every((row) => row.name.trim().length > 0);
}
