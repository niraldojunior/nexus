// Estado de formulário e regras de conversão para `GeographicSiteSpecification.specCharacteristic`
// — espelha `resourceCharacteristicsForm.ts`, mas para `GeoSpecCharacteristic` (que usa
// `defaultValue` em vez de `value`, e carrega `mandatory` como flag própria em vez de inferida).
// Usado pela aba "Características" em `LocationSpecDetail`.
import type { GeoSpecCharacteristic } from '../services/geoApi';

export type CharacteristicValueType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'list'
  | 'json';

/**
 * Linha editável de característica de local — `key` só existe no cliente (identidade de lista no
 * React); `valueText` é a representação textual editável de `defaultValue`, convertida de volta ao
 * tipo declarado em `valueType` só na hora de montar o payload (`buildGeoCharacteristicPayload`).
 */
export type GeoCharacteristicRow = {
  key: string;
  name: string;
  group?: string;
  description?: string;
  valueType: CharacteristicValueType;
  valueText: string;
  mandatory: boolean;
  /** Valores permitidos da lista (quando `valueType === 'list'`). */
  allowedValues?: string[];
  /** Texto livre separado por vírgula para edição dos valores da lista. */
  allowedValuesText?: string;
};

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `geo-char-${rowKeySeq}`;
}

function inferValueType(value: unknown): CharacteristicValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'decimal';
  if (value !== null && typeof value === 'object') return 'json';
  return 'string';
}

function valueToText(value: unknown, valueType: CharacteristicValueType): string {
  if (value === null || value === undefined) return '';
  if (valueType === 'json') return JSON.stringify(value);
  return String(value);
}

export function emptyGeoCharacteristicRow(): GeoCharacteristicRow {
  return { key: nextRowKey(), name: '', valueType: 'string', valueText: '', mandatory: false };
}

export function geoCharacteristicRowsFrom(
  characteristics: GeoSpecCharacteristic[] | undefined,
): GeoCharacteristicRow[] {
  return (characteristics ?? []).map((characteristic) => {
    const valueType =
      (characteristic.valueType as CharacteristicValueType) || inferValueType(characteristic.defaultValue);
    const allowedValues = (characteristic as { allowedValues?: string[] }).allowedValues;
    return {
      key: nextRowKey(),
      name: characteristic.name,
      group: characteristic.group,
      description: characteristic.description,
      valueType,
      valueText: valueToText(characteristic.defaultValue, valueType),
      mandatory: Boolean(characteristic.mandatory),
      allowedValues,
      allowedValuesText: allowedValues ? allowedValues.join(', ') : '',
    };
  });
}

/** Converte o texto editado de volta ao tipo declarado — usado só ao salvar. */
function coerceValue(valueText: string, valueType: CharacteristicValueType): unknown {
  switch (valueType) {
    case 'boolean':
      return valueText === 'true';
    case 'integer':
      return Number.parseInt(valueText, 10) || 0;
    case 'decimal':
      return Number.parseFloat(valueText) || 0;
    case 'json':
      try {
        return JSON.parse(valueText);
      } catch {
        return valueText;
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

export function buildGeoCharacteristicPayload(rows: GeoCharacteristicRow[]): GeoSpecCharacteristic[] {
  return rows
    .filter((row) => row.name.trim().length > 0)
    .map((row) => {
      const allowedValues =
        row.valueType === 'list'
          ? parseAllowedValues(row.allowedValuesText) ?? row.allowedValues
          : undefined;
      return {
        name: row.name.trim(),
        valueType: row.valueType,
        defaultValue: coerceValue(row.valueText, row.valueType),
        mandatory: row.mandatory,
        ...(row.description?.trim() ? { description: row.description.trim() } : {}),
        ...(row.group?.trim() ? { group: row.group.trim() } : {}),
        ...(allowedValues && allowedValues.length > 0 ? { allowedValues } : {}),
      };
    });
}

export function geoCharacteristicRowsValid(rows: GeoCharacteristicRow[]): boolean {
  return rows.every((row) => row.name.trim().length > 0);
}
