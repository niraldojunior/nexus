// Estado de formulário e regras de conversão para `ResourceSpecification.resourceSpecificationCharacteristic`
// — espelha `serviceSpecificationForm.ts`, mas para o array TMF `Characteristic` (que carrega um
// `value` de tipo livre, `unknown`) em vez do `ServiceSpecCharacteristic` (que já é tipado como
// texto). Usado pela aba "Características" em `ResourceNodeDetail`.
import type { ResourceCharacteristic } from '../services/resourceApi';

export type CharacteristicValueType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'list'
  | 'json';

/**
 * Linha editável de característica — `key` só existe no cliente (identidade de lista no React);
 * `valueText` é a representação textual editável do `value` (de tipo livre no TMF), convertida de
 * volta ao tipo declarado em `valueType` só na hora de montar o payload (`buildCharacteristicPayload`).
 */
export type ResourceCharacteristicRow = {
  key: string;
  name: string;
  group?: string;
  description?: string;
  valueType: CharacteristicValueType;
  valueText: string;
  /** Valores permitidos da lista (quando `valueType === 'list'`). */
  allowedValues?: string[];
  /** Texto livre separado por vírgula para edição dos valores da lista. */
  allowedValuesText?: string;
};

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `res-char-${rowKeySeq}`;
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

export function emptyResourceCharacteristicRow(): ResourceCharacteristicRow {
  return { key: nextRowKey(), name: '', valueType: 'string', valueText: '' };
}

export function resourceCharacteristicRowsFrom(
  characteristics: ResourceCharacteristic[] | undefined,
): ResourceCharacteristicRow[] {
  return (characteristics ?? []).map((characteristic) => {
    const valueType =
      (characteristic.valueType as CharacteristicValueType) || inferValueType(characteristic.value);
    const allowedValues = characteristic.allowedValues;
    return {
      key: nextRowKey(),
      name: characteristic.name,
      group: characteristic.group,
      description: characteristic.description,
      valueType,
      valueText: valueToText(characteristic.value, valueType),
      allowedValues,
      allowedValuesText: allowedValues ? allowedValues.join(', ') : '',
    };
  });
}

/**
 * Monta as linhas de característica de uma ResourceSpecification a partir do conjunto definido no
 * ResourceType (issue #216) — usada tanto para criar (spec ainda sem características, tudo vem do
 * valor padrão do tipo) quanto para editar (mescla o que já foi salvo com o que o tipo ganhou depois).
 *
 * Para cada característica do tipo (na ordem declarada), usa o valor já salvo na spec se existir uma
 * com o mesmo `name`; senão usa o valor padrão do tipo. Características da spec sem correspondência
 * no tipo (órfãs — ex.: removidas do tipo depois de criadas na spec) são preservadas e anexadas ao
 * final, nunca descartadas silenciosamente.
 */
export function specCharacteristicRowsFromType(
  typeCharacteristics: ResourceCharacteristic[] | undefined,
  specCharacteristics: ResourceCharacteristic[] | undefined,
): ResourceCharacteristicRow[] {
  const specByName = new Map((specCharacteristics ?? []).map((c) => [c.name, c]));
  const matchedNames = new Set<string>();

  const rows = (typeCharacteristics ?? []).map((typeChar) => {
    const specChar = specByName.get(typeChar.name);
    if (specChar) matchedNames.add(typeChar.name);
    const source = specChar ?? typeChar;
    const valueType =
      (source.valueType as CharacteristicValueType) ||
      (typeChar.valueType as CharacteristicValueType) ||
      inferValueType(source.value);
    const allowedValues = typeChar.allowedValues ?? source.allowedValues;
    return {
      key: nextRowKey(),
      name: typeChar.name,
      group: source.group ?? typeChar.group,
      description: typeChar.description ?? source.description,
      valueType,
      valueText: valueToText(source.value, valueType),
      allowedValues,
      allowedValuesText: allowedValues ? allowedValues.join(', ') : '',
    };
  });

  const orphaned = (specCharacteristics ?? [])
    .filter((c) => !matchedNames.has(c.name))
    .map((c) => {
      const valueType = (c.valueType as CharacteristicValueType) || inferValueType(c.value);
      return {
        key: nextRowKey(),
        name: c.name,
        group: c.group,
        description: c.description,
        valueType,
        valueText: valueToText(c.value, valueType),
        allowedValues: c.allowedValues,
        allowedValuesText: c.allowedValues ? c.allowedValues.join(', ') : '',
      };
    });

  return [...rows, ...orphaned];
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

export function buildCharacteristicPayload(rows: ResourceCharacteristicRow[]): ResourceCharacteristic[] {
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
        value: coerceValue(row.valueText, row.valueType),
        ...(row.description?.trim() ? { description: row.description.trim() } : {}),
        ...(row.group?.trim() ? { group: row.group.trim() } : {}),
        ...(allowedValues && allowedValues.length > 0 ? { allowedValues } : {}),
      };
    });
}

export function characteristicRowsValid(rows: ResourceCharacteristicRow[]): boolean {
  return rows.every((row) => row.name.trim().length > 0);
}
