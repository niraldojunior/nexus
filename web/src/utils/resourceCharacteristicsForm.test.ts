import { describe, it, expect } from 'vitest';
import {
  specCharacteristicRowsFromType,
  buildCharacteristicPayload,
  characteristicRowsValid,
  resourceCharacteristicRowsFrom,
  type ResourceCharacteristicRow,
} from './resourceCharacteristicsForm';

describe('specCharacteristicRowsFromType (issue #216)', () => {
  it('preenchem todas as características do tipo com seus valores padrão para spec nova', () => {
    const typeChars = [
      { name: 'portCount', value: 16, valueType: 'integer', group: 'técnico' },
      { name: 'connectorType', value: 'SC/APC', valueType: 'string', group: 'óptico' },
    ];

    const rows = specCharacteristicRowsFromType(typeChars, undefined);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe('portCount');
    expect(rows[0]?.valueType).toBe('integer');
    expect(rows[0]?.valueText).toBe('16');
    expect(rows[0]?.group).toBe('técnico');

    expect(rows[1]?.name).toBe('connectorType');
    expect(rows[1]?.valueType).toBe('string');
    expect(rows[1]?.valueText).toBe('SC/APC');
    expect(rows[1]?.group).toBe('óptico');
  });

  it('requisito 5: spec com 5 características + tipo ganha 6ª -> exibe 5 salvas e a 6ª nova com valor padrão do tipo', () => {
    // Tipo original tinha c1..c5, spec salvou valores customizados neles.
    // Depois tipo ganhou c6.
    const typeChars = [
      { name: 'c1', value: 'default-1', valueType: 'string' },
      { name: 'c2', value: 'default-2', valueType: 'string' },
      { name: 'c3', value: 'default-3', valueType: 'string' },
      { name: 'c4', value: 'default-4', valueType: 'string' },
      { name: 'c5', value: 'default-5', valueType: 'string' },
      { name: 'c6', value: 'default-6-novo', valueType: 'string' },
    ];

    const specChars = [
      { name: 'c1', value: 'custom-1', valueType: 'string' },
      { name: 'c2', value: 'custom-2', valueType: 'string' },
      { name: 'c3', value: 'custom-3', valueType: 'string' },
      { name: 'c4', value: 'custom-4', valueType: 'string' },
      { name: 'c5', value: 'custom-5', valueType: 'string' },
    ];

    const rows = specCharacteristicRowsFromType(typeChars, specChars);

    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.name)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(rows.map((r) => r.valueText)).toEqual([
      'custom-1',
      'custom-2',
      'custom-3',
      'custom-4',
      'custom-5',
      'default-6-novo',
    ]);
  });

  it('preserva características órfãs salvas na spec mesmo se removidas do tipo', () => {
    const typeChars = [{ name: 'ativoNoTipo', value: 'v1', valueType: 'string' }];

    const specChars = [
      { name: 'ativoNoTipo', value: 'custom-ativo', valueType: 'string' },
      { name: 'removidoDoTipo', value: 'dadoAntigo', valueType: 'string', group: 'legado' },
    ];

    const rows = specCharacteristicRowsFromType(typeChars, specChars);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe('ativoNoTipo');
    expect(rows[0]?.valueText).toBe('custom-ativo');
    expect(rows[1]?.name).toBe('removidoDoTipo');
    expect(rows[1]?.valueText).toBe('dadoAntigo');
    expect(rows[1]?.group).toBe('legado');
  });
});

describe('buildCharacteristicPayload & resourceCharacteristicRowsFrom', () => {
  it('converte tipos primitivos e listas de opções corretamente ao salvar', () => {
    const rows: ResourceCharacteristicRow[] = [
      {
        key: '1',
        name: 'portCount',
        description: 'Quantidade de portas PON',
        valueType: 'integer',
        valueText: '16',
      },
      { key: '2', name: 'attenuation', valueType: 'decimal', valueText: '1.5' },
      { key: '3', name: 'isSplitter', valueType: 'boolean', valueText: 'true' },
      {
        key: '4',
        name: 'connectorType',
        description: 'Tipo de conector óptico',
        valueType: 'list',
        allowedValuesText: 'SC/APC, LC/APC, FC/UPC',
        valueText: 'SC/APC',
      },
      { key: '5', name: 'tag', valueType: 'string', valueText: 'gpon' },
    ];

    expect(characteristicRowsValid(rows)).toBe(true);

    const payload = buildCharacteristicPayload(rows);
    expect(payload).toEqual([
      {
        name: 'portCount',
        description: 'Quantidade de portas PON',
        valueType: 'integer',
        value: 16,
      },
      { name: 'attenuation', valueType: 'decimal', value: 1.5 },
      { name: 'isSplitter', valueType: 'boolean', value: true },
      {
        name: 'connectorType',
        description: 'Tipo de conector óptico',
        valueType: 'list',
        allowedValues: ['SC/APC', 'LC/APC', 'FC/UPC'],
        value: 'SC/APC',
      },
      { name: 'tag', valueType: 'string', value: 'gpon' },
    ]);
  });

  it('converte do TMF para linhas editáveis com description e allowedValues', () => {
    const tmf = [
      {
        name: 'ports',
        description: 'Total de portas',
        value: 8,
        valueType: 'integer',
      },
      {
        name: 'connectorType',
        value: 'SC/APC',
        valueType: 'list',
        allowedValues: ['SC/APC', 'LC/APC'],
      },
    ];
    const rows = resourceCharacteristicRowsFrom(tmf);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.valueText).toBe('8');
    expect(rows[0]?.description).toBe('Total de portas');
    expect(rows[1]?.valueText).toBe('SC/APC');
    expect(rows[1]?.allowedValues).toEqual(['SC/APC', 'LC/APC']);
    expect(rows[1]?.allowedValuesText).toBe('SC/APC, LC/APC');
  });
});
