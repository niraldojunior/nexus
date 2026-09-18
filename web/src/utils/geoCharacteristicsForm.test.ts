import { describe, expect, it } from 'vitest';
import {
  buildGeoCharacteristicPayload,
  emptyGeoCharacteristicRow,
  geoCharacteristicRowsFrom,
  type GeoCharacteristicRow,
} from './geoCharacteristicsForm';

const rowWith = (patch: Partial<GeoCharacteristicRow>): GeoCharacteristicRow => ({
  ...emptyGeoCharacteristicRow(),
  name: 'capacidade',
  ...patch,
});

describe('geoCharacteristicsForm', () => {
  it('omits defaultValue unless the operator declared one', () => {
    // Sem intenção explícita, o payload não pode inventar um default — é isso que distingue
    // "sem valor padrão" de um default legítimo, e o domínio recusa a migração sem ele.
    const [payload] = buildGeoCharacteristicPayload([
      rowWith({ valueType: 'integer', valueText: '12', hasDefaultValue: false, mandatory: true }),
    ]);

    expect(payload).toBeDefined();
    expect('defaultValue' in payload!).toBe(false);
    expect(payload!.mandatory).toBe(true);
  });

  it('preserves falsy defaults that were explicitly declared', () => {
    const payload = buildGeoCharacteristicPayload([
      rowWith({ name: 'ativo', valueType: 'boolean', valueText: 'false', hasDefaultValue: true }),
      rowWith({ name: 'portas', valueType: 'integer', valueText: '0', hasDefaultValue: true }),
      rowWith({ name: 'nota', valueType: 'string', valueText: '', hasDefaultValue: true }),
    ]);

    expect(payload[0]?.defaultValue).toBe(false);
    expect(payload[1]?.defaultValue).toBe(0);
    expect(payload[2]?.defaultValue).toBe('');
  });

  it('rejects text that does not convert to the declared type', () => {
    expect(() =>
      buildGeoCharacteristicPayload([
        rowWith({ valueType: 'integer', valueText: 'doze', hasDefaultValue: true }),
      ]),
    ).toThrow(/número inteiro/);

    expect(() =>
      buildGeoCharacteristicPayload([
        rowWith({ valueType: 'json', valueText: '{nao-json', hasDefaultValue: true }),
      ]),
    ).toThrow(/JSON válido/);

    expect(() =>
      buildGeoCharacteristicPayload([
        rowWith({ valueType: 'boolean', valueText: 'talvez', hasDefaultValue: true }),
      ]),
    ).toThrow(/Sim ou Não/);
  });

  it('round-trips the declared/undeclared default state from the canonical spec', () => {
    const rows = geoCharacteristicRowsFrom([
      { name: 'capacidade', valueType: 'integer', mandatory: true, defaultValue: 0 },
      { name: 'observacao', valueType: 'string', mandatory: false },
    ]);

    expect(rows[0]?.hasDefaultValue).toBe(true);
    expect(rows[0]?.valueText).toBe('0');
    expect(rows[1]?.hasDefaultValue).toBe(false);
  });
});
