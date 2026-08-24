import { describe, expect, it } from 'vitest';
import { parseServiceSpecCharacteristicBlock } from '../src/shared/utils/service-spec-characteristic-block.js';

describe('parseServiceSpecCharacteristicBlock', () => {
  it('parses an enum domain into characteristicValueSpecification', () => {
    const [characteristic] = parseServiceSpecCharacteristicBlock(
      '- sla_class (enum): Classe de SLA. Domínio: {BestEffort, Standard}',
      'business',
    );
    expect(characteristic).toMatchObject({
      name: 'sla_class',
      group: 'business',
      valueType: 'string',
      required: true,
      description: 'Classe de SLA',
      valueDomain: '{BestEffort, Standard}',
      characteristicValueSpecification: [{ value: 'BestEffort' }, { value: 'Standard' }],
    });
  });

  it('marks attributes as optional when the type carries "(opcional)"', () => {
    const [characteristic] = parseServiceSpecCharacteristicBlock(
      '- service_vlan_voip (int (opcional)): VLAN de serviço VoIP quando aplicável. Domínio: 1-4094',
      'technical',
    );
    expect(characteristic).toMatchObject({
      name: 'service_vlan_voip',
      sourceType: 'int (opcional)',
      valueType: 'integer',
      required: false,
      valueDomain: '1-4094',
    });
    expect(characteristic?.characteristicValueSpecification).toBeUndefined();
  });

  it('maps list<> and map<> types to json', () => {
    const [characteristic] = parseServiceSpecCharacteristicBlock(
      '- timeslots (list<int>): Timeslots ocupados (quando TDM). Domínio: 1-31',
      'technical',
    );
    expect(characteristic?.valueType).toBe('json');
    expect(characteristic?.description).toBe('Timeslots ocupados (quando TDM)');
  });

  it('handles a free-text domain with no braces', () => {
    const [characteristic] = parseServiceSpecCharacteristicBlock(
      '- route_a_to_b (string): Descritivo da rota A-B. Domínio: texto livre',
      'business',
    );
    expect(characteristic).toMatchObject({
      name: 'route_a_to_b',
      valueType: 'string',
      valueDomain: 'texto livre',
    });
  });

  it('skips malformed lines without a valid "- name (type): description" shape', () => {
    const characteristics = parseServiceSpecCharacteristicBlock(
      '- sla_class enum sem parênteses\n- valid_field (int): Campo válido. Domínio: 1-10',
      'business',
    );
    expect(characteristics).toHaveLength(1);
    expect(characteristics[0]?.name).toBe('valid_field');
  });

  it('returns an empty array for an undefined or blank block', () => {
    expect(parseServiceSpecCharacteristicBlock(undefined, 'business')).toEqual([]);
    expect(parseServiceSpecCharacteristicBlock('   \n  ', 'business')).toEqual([]);
  });

  it('parses multiple lines and preserves order', () => {
    const characteristics = parseServiceSpecCharacteristicBlock(
      '- fiber_pairs (int): Quantidade de pares de fibra. Domínio: 1-144\n' +
        '- distance_km (float): Distância aproximada em km. Domínio: 0.1-5000',
      'technical',
    );
    expect(characteristics.map((c) => c.name)).toEqual(['fiber_pairs', 'distance_km']);
    expect(characteristics[1]?.valueType).toBe('decimal');
  });
});
