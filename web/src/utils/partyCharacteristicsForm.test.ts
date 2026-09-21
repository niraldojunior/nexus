import { describe, expect, it } from 'vitest';
import {
  emptyPartyRoleCharacteristicRow,
  partyRoleCharacteristicRowsFrom,
  buildPartyRoleCharacteristicPayload,
  parseAllowedValues,
} from './partyCharacteristicsForm';
import type { PartyRoleTypeCharacteristic } from '../services/partyRoleTypeCharacteristicApi';

describe('partyCharacteristicsForm', () => {
  it('creates an empty characteristic row with defaults', () => {
    const row = emptyPartyRoleCharacteristicRow();
    expect(row.name).toBe('');
    expect(row.valueType).toBe('string');
    expect(row.hasDefaultValue).toBe(false);
    expect(row.mandatory).toBe(false);
    expect(row.active).toBe(true);
  });

  it('transforms canonical characteristics to row models and back', () => {
    const chars: PartyRoleTypeCharacteristic[] = [
      {
        id: 'c1',
        tenantId: 'tenant-1',
        roleName: 'supplier',
        name: 'cnpj',
        group: 'Fiscal',
        description: 'CNPJ da empresa',
        valueType: 'string',
        allowedValues: null,
        referenceDataSetKey: null,
        sortOrder: 10,
        mandatory: true,
        defaultValue: '00.000.000/0001-00',
        active: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'c2',
        tenantId: 'tenant-1',
        roleName: 'supplier',
        name: 'categoria',
        group: 'Geral',
        description: null,
        valueType: 'list',
        allowedValues: ['Tier 1', 'Tier 2'],
        referenceDataSetKey: null,
        sortOrder: 20,
        mandatory: false,
        defaultValue: null,
        active: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const rows = partyRoleCharacteristicRowsFrom(chars);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe('cnpj');
    expect(rows[0]?.mandatory).toBe(true);
    expect(rows[0]?.hasDefaultValue).toBe(true);
    expect(rows[0]?.valueText).toBe('00.000.000/0001-00');

    expect(rows[1]?.name).toBe('categoria');
    expect(rows[1]?.valueType).toBe('list');
    expect(rows[1]?.allowedValues).toEqual(['Tier 1', 'Tier 2']);

    const payload = buildPartyRoleCharacteristicPayload(rows);
    expect(payload).toHaveLength(2);
    expect(payload[0]?.name).toBe('cnpj');
    expect(payload[0]?.mandatory).toBe(true);
    expect(payload[0]?.defaultValue).toBe('00.000.000/0001-00');
    expect(payload[1]?.name).toBe('categoria');
    expect(payload[1]?.allowedValues).toEqual(['Tier 1', 'Tier 2']);
  });

  it('parses comma-separated allowed values', () => {
    expect(parseAllowedValues('A, B, C')).toEqual(['A', 'B', 'C']);
    expect(parseAllowedValues('')).toBeUndefined();
    expect(parseAllowedValues('   ')).toBeUndefined();
  });
});
