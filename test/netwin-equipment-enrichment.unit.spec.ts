import { describe, expect, it } from 'vitest';
import {
  buildEquipmentEnrichment,
  dynamicAttributeTarget,
  ENRICHMENT_CHARACTERISTICS,
  enrichmentInstanceDefinitions,
  mergeOwnedCharacteristics,
  mergeOwnedRelatedParties,
  normalizeSerial,
  parseNetwinDate,
  resolveSerials,
  toNetwinBoolean,
} from '../src/scripts/netwin-migration/equipment-enrichment.js';

describe('equipment-enrichment: normalização', () => {
  it('converte booleanos 0/1 sem transformar nulo em false', () => {
    expect(toNetwinBoolean(1)).toBe(true);
    expect(toNetwinBoolean('0')).toBe(false);
    expect(toNetwinBoolean(null)).toBeNull();
    expect(toNetwinBoolean('talvez')).toBeNull();
  });

  it('normaliza datas para ISO e rejeita inválidas', () => {
    expect(parseNetwinDate('31-12-2020')).toBe('2020-12-31');
    expect(parseNetwinDate('2021-03-04T10:00:00')).toBe('2021-03-04');
    expect(parseNetwinDate('31-02-2020')).toBeNull();
    expect(parseNetwinDate('Desconhecido')).toBeNull();
    expect(parseNetwinDate(new Date('invalid'))).toBeNull();
  });

  it('descarta placeholders de série', () => {
    expect(normalizeSerial(' ABC123 ')).toBe('ABC123');
    expect(normalizeSerial('0000')).toBeNull();
    expect(normalizeSerial('N/A')).toBeNull();
    expect(normalizeSerial('Desconhecido')).toBeNull();
  });

  it('só aceita atributos dinâmicos da allowlist', () => {
    expect(dynamicAttributeTarget('Comprimento')).toBe('length');
    expect(dynamicAttributeTarget('GRUPO_CONTROLE')).toBe('controlGroup');
    expect(dynamicAttributeTarget('Orçamento')).toBeNull();
  });

  it('nunca declara nomes proibidos nem campos canônicos como characteristic', () => {
    const names = enrichmentInstanceDefinitions().map((d) => d.name);
    for (const banned of ['manufacturer', 'networkType', 'serialNumber', 'label']) {
      expect(names).not.toContain(banned);
    }
    expect(new Set(names).size).toBe(names.length);
    // As de rádio (célula 2G/3G/4G) vivem à parte e só entram nos tipos de célula.
    expect(ENRICHMENT_CHARACTERISTICS.length).toBeGreaterThan(names.length);
    expect(enrichmentInstanceDefinitions().every((d) => d.characteristicLevel === 'instance')).toBe(
      true,
    );
  });
});

describe('equipment-enrichment: CDOI-2649PS', () => {
  const build = () =>
    buildEquipmentEnrichment({
      name: 'CDOI-2649PS',
      label: 'CDOI-2649PS',
      observations: 'SICOM 123 no texto livre',
      sapMaterialCode: '319910',
      modelSapMaterialCode: '319910',
      projectName: 'A1-04495-2017-FTTH-ICI-RJ',
      cellName: '26 (ICI) Secundária',
      servingSiteId: 'site-icarai',
      dynamic: new Map<string, unknown>([
        ['length', '475'],
        ['width', 304],
        ['depth', '151'],
        ['accessNetwork', 'Óptica GPON'],
        ['topology', 'C'],
        ['free', 0],
        ['controlGroup', 'GRUPO_CONTROLE'],
      ]),
    });

  it('mapeia os campos comprovados', () => {
    const out = build();
    const byName = new Map(out.characteristics.map((c) => [c.name, c.value]));
    expect(byName.get('length')).toBe(475);
    expect(byName.get('accessNetwork')).toBe('Óptica GPON');
    expect(byName.get('free')).toBe(false);
    expect(byName.get('implementationProject')).toBe('A1-04495-2017-FTTH-ICI-RJ');
    expect(byName.get('networkCell')).toBe('26 (ICI) Secundária');
    expect(byName.get('notes')).toBe('SICOM 123 no texto livre');
    expect(out.servingSiteId).toBe('site-icarai');
  });

  it('omite label redundante, SAP igual ao modelo e SICOM inferido', () => {
    const out = build();
    const names = out.characteristics.map((c) => c.name);
    expect(out.label).toBeNull();
    expect(names).not.toContain('sapMaterialCodeOverride');
    expect(names).not.toContain('sicomId');
  });

  it('é idempotente', () => {
    expect(build()).toEqual(build());
  });
});

describe('equipment-enrichment: merge por ownership', () => {
  it('preserva characteristics alheias e remove administradas ausentes', () => {
    const current = JSON.stringify([
      { name: 'userNote', value: 'x' },
      { name: 'length', value: 1 },
      { name: 'serialNumber', value: 'old' },
      { group: '_origin', name: 'system', value: 'NETWIN' },
    ]);
    const merged = mergeOwnedCharacteristics(current, [{ name: 'width', value: 2 }]);
    expect(merged.map((c) => c.name)).toEqual(['userNote', 'width']);
    const again = mergeOwnedCharacteristics(JSON.stringify(merged), [{ name: 'width', value: 2 }]);
    expect(again).toEqual(merged);
  });

  it('troca só o owner e preserva vendor', () => {
    const current = JSON.stringify([
      { id: 'a', '@referredType': 'Organization', role: 'vendor' },
      { id: 'old', '@referredType': 'Organization', role: 'infrastructure_owner' },
      { id: 'legacy', '@referredType': 'Organization' },
    ]);
    const merged = mergeOwnedRelatedParties(current, {
      id: 'oi',
      '@referredType': 'Organization',
      role: 'infrastructure_owner',
    });
    expect(merged.map((p) => p.id)).toEqual(['oi', 'a']);
    expect(mergeOwnedRelatedParties(current, null).map((p) => p.id)).toEqual(['a']);
  });
});

describe('equipment-enrichment: série', () => {
  it('resolve duplicata na página e colisão no destino sem abortar', () => {
    const out = resolveSerials(
      [
        { resourceId: 'r1', sourceId: 2, rawSerial: 'S1' },
        { resourceId: 'r2', sourceId: 1, rawSerial: 'S1' },
        { resourceId: 'r3', sourceId: 3, rawSerial: 'S2' },
        { resourceId: 'r4', sourceId: 4, rawSerial: '0000' },
        { resourceId: 'r5', sourceId: 5, rawSerial: 'S3' },
      ],
      new Map([
        ['S2', 'other'],
        ['S3', 'r5'],
      ]),
    );
    expect(out.get('r2')?.serialNumber).toBe('S1');
    expect(out.get('r1')).toMatchObject({ serialNumber: null, conflict: 'duplicate-in-page' });
    expect(out.get('r3')).toMatchObject({
      serialNumber: null,
      reportedSerialNumber: 'S2',
      conflict: 'taken-in-target',
    });
    expect(out.get('r4')?.serialNumber).toBeNull();
    expect(out.get('r5')?.serialNumber).toBe('S3');
  });
});
