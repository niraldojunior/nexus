import { describe, it, expect } from 'vitest';
import {
  specCharacteristicRowsFromType,
  buildCharacteristicPayload,
  characteristicRowsValid,
  emptyResourceCharacteristicRow,
  imageReferenceError,
  partitionCharacteristicRowsByLevel,
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

describe('imageReferenceError & buildCharacteristicPayload', () => {
  it('aceita referência de catálogo e preserva a imagem aparada no round-trip do payload', () => {
    const reference = '  resource-icons/cto.svg  ';

    expect(imageReferenceError(reference)).toBeNull();

    const [payload] = buildCharacteristicPayload([
      {
        key: 'image-1',
        name: 'icon',
        valueType: 'image',
        valueText: reference,
        characteristicLevel: 'specification',
      },
    ]);

    expect(payload).toEqual({
      name: 'icon',
      valueType: 'image',
      value: 'resource-icons/cto.svg',
    });
  });

  it('aceita imagem codificada em base64', () => {
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect(imageReferenceError(base64Image)).toBeNull();
  });

  it('rejeita URL explícita de imagem malformada', () => {
    expect(imageReferenceError('https://')).toBe(
      'Informe uma imagem válida (upload/base64), URL http(s) ou referência do catálogo.',
    );
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
        characteristicLevel: 'specification',
      },
      {
        key: '2',
        name: 'attenuation',
        valueType: 'decimal',
        valueText: '1.5',
        characteristicLevel: 'specification',
      },
      {
        key: '3',
        name: 'isSplitter',
        valueType: 'boolean',
        valueText: 'true',
        characteristicLevel: 'specification',
      },
      {
        key: '4',
        name: 'connectorType',
        description: 'Tipo de conector óptico',
        valueType: 'list',
        allowedValuesText: 'SC/APC, LC/APC, FC/UPC',
        valueText: 'SC/APC',
        characteristicLevel: 'specification',
      },
      {
        key: '5',
        name: 'tag',
        valueType: 'string',
        valueText: 'gpon',
        characteristicLevel: 'instance',
      },
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
      { name: 'tag', valueType: 'string', value: 'gpon', characteristicLevel: 'instance' },
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

describe('characteristicLevel — especificação x instância (issue #273)', () => {
  it('emptyResourceCharacteristicRow nasce em nível de especificação', () => {
    expect(emptyResourceCharacteristicRow().characteristicLevel).toBe('specification');
  });

  it('resourceCharacteristicRowsFrom: ausência do campo, valor de instância e lixo', () => {
    const rows = resourceCharacteristicRowsFrom([
      { name: 'legado', value: 'v', valueType: 'string' },
      { name: 'porInstancia', value: 'v', valueType: 'string', characteristicLevel: 'instance' },
      // @ts-expect-error valor inválido só para exercitar o fallback defensivo
      { name: 'lixo', value: 'v', valueType: 'string', characteristicLevel: 'qualquer-coisa' },
    ]);
    expect(rows.map((r) => r.characteristicLevel)).toEqual([
      'specification',
      'instance',
      'specification',
    ]);
  });

  it('buildCharacteristicPayload omite o campo para specification e emite para instance (round-trip estável)', () => {
    const payload = buildCharacteristicPayload([
      { key: '1', name: 'a', valueType: 'string', valueText: 'x', characteristicLevel: 'specification' },
      { key: '2', name: 'b', valueType: 'string', valueText: 'y', characteristicLevel: 'instance' },
    ]);
    expect(payload[0]).not.toHaveProperty('characteristicLevel');
    expect(payload[1]?.characteristicLevel).toBe('instance');

    // Round-trip: reconvertendo o payload para rows preserva o nível original.
    const rows = resourceCharacteristicRowsFrom(payload);
    expect(rows.map((r) => r.characteristicLevel)).toEqual(['specification', 'instance']);
  });

  it('specCharacteristicRowsFromType tira o nível do tipo, não da spec, e órfãs caem em specification', () => {
    const typeChars = [
      {
        name: 'macAddress',
        value: '',
        valueType: 'string',
        characteristicLevel: 'instance' as const,
      },
      { name: 'firmwareBase', value: 'v1', valueType: 'string' },
    ];
    // specChar divergente de propósito: se o nível fosse lido daqui, o teste falharia.
    const specChars = [
      { name: 'macAddress', value: 'AA:BB', valueType: 'string' },
      { name: 'orfaAntiga', value: 'dado', valueType: 'string' },
    ];

    const rows = specCharacteristicRowsFromType(typeChars, specChars);

    expect(rows.map((r) => r.name)).toEqual(['macAddress', 'firmwareBase', 'orfaAntiga']);
    expect(rows.map((r) => r.characteristicLevel)).toEqual([
      'instance',
      'specification',
      'specification',
    ]);
  });

  it('partitionCharacteristicRowsByLevel separa nos dois agrupamentos preservando a ordem', () => {
    const rows: ResourceCharacteristicRow[] = [
      { key: '1', name: 'a', valueType: 'string', valueText: '', characteristicLevel: 'specification' },
      { key: '2', name: 'b', valueType: 'string', valueText: '', characteristicLevel: 'instance' },
      { key: '3', name: 'c', valueType: 'string', valueText: '', characteristicLevel: 'specification' },
      { key: '4', name: 'd', valueType: 'string', valueText: '', characteristicLevel: 'instance' },
    ];

    const { specification, instance } = partitionCharacteristicRowsByLevel(rows);

    expect(specification.map((r) => r.name)).toEqual(['a', 'c']);
    expect(instance.map((r) => r.name)).toEqual(['b', 'd']);
  });
});
