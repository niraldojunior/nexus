import { describe, expect, it } from 'vitest';
import {
  compareSourceIds,
  groupEquipmentSpecs,
  groupRackSpecs,
  groupSplitterSpecs,
} from '../src/scripts/netwin-migration/concrete-spec-groups.js';
import { distinctGroupNames } from '../src/scripts/netwin-migration/concrete-spec-sources.js';
import { equipmentModelSpecId } from '../src/scripts/netwin-migration/concrete-specs.js';

const eq = (sourceId: string, model: string, manufacturer: string | null, type = 'netwin-onu') => ({
  sourceId,
  resourceTypeCode: type,
  model,
  manufacturer,
});

describe('concrete-spec-groups', () => {
  it('mantém variantes de equipamento com sigla ou SAP distintos', () => {
    const v = (sourceId: string, modelCode: string | null, sapMaterialCode: string | null) => ({
      ...eq(sourceId, 'FibreGuard 650 Dome', 'Acme'),
      modelCode,
      sapMaterialCode,
    });
    const index = groupEquipmentSpecs([
      v('1:1', '8-48', '100'),
      v('1:2', '8-72', '200'),
      v('1:3', '8-48', '200'),
      v('1:4', '8 48', '100'),
    ]);
    expect(index.groups).toHaveLength(3);
    expect(index.canonicalIdBySourceId.get('1:1')).toBe(index.canonicalIdBySourceId.get('1:4'));
  });

  it('mantém splitters com SAP distinto', () => {
    const sp = (sourceId: number, sapMaterialCode: string | null) => ({
      sourceId,
      model: 'Splitter 1:8',
      modelCode: 'SPL-8',
      manufacturer: 'Acme',
      sapMaterialCode,
      ratio: 8,
    });
    const index = groupSplitterSpecs([sp(1, '10'), sp(2, '20'), sp(3, '10')]);
    expect(index.groups).toHaveLength(2);
  });

  it('colapsa equipamentos por tipo + modelo + fabricante normalizados', () => {
    const index = groupEquipmentSpecs([
      eq('10:20', 'ONT-X1', 'Huawei'),
      eq('2:5', 'ont x1', 'HUAWEI'),
      eq('2:30', 'ONT X1', 'ZTE'),
      eq('3:1', 'ONT X1', 'Huawei', 'netwin-outro'),
    ]);
    expect(index.groups).toHaveLength(3);
    const merged = index.byCanonicalId.get(index.canonicalIdBySourceId.get('10:20')!)!;
    expect(merged.sourceIds).toEqual(['2:5', '10:20']);
    expect(merged.representativeSourceId).toBe('2:5');
    expect(merged.aliasSourceIds).toEqual(['10:20']);
    expect(merged.originAliases).toEqual([
      'ISP_CAT_MODELO_EQUIP:2:5',
      'ISP_CAT_MODELO_EQUIP:10:20',
    ]);
    expect(index.canonicalIdBySourceId.get('2:30')).not.toBe(
      index.canonicalIdBySourceId.get('2:5'),
    );
    expect(index.representativeBySourceId.get('10:20')).toBe('2:5');
  });

  it('é determinístico e independente da ordem de entrada', () => {
    const rows = [eq('1:1', 'A', 'M'), eq('1:2', 'a', 'm'), eq('1:3', 'B', null)];
    const a = groupEquipmentSpecs(rows);
    const b = groupEquipmentSpecs([...rows].reverse());
    expect(a.groups.map((g) => g.canonicalId)).toEqual(b.groups.map((g) => g.canonicalId));
    expect(a.groups.map((g) => g.representativeSourceId)).toEqual(
      b.groups.map((g) => g.representativeSourceId),
    );
    expect(a.groups[0]!.canonicalId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.groups[0]!.canonicalId).not.toBe(equipmentModelSpecId(1, 1));
  });

  it('não colapsa modelo vazio e ordena ids numericamente', () => {
    const index = groupEquipmentSpecs([eq('1:1', '', null), eq('1:2', '', null)]);
    expect(index.groups).toHaveLength(2);
    expect(compareSourceIds('2', '10')).toBeLessThan(0);
    expect(compareSourceIds(9, '9:1')).toBeLessThan(0);
  });

  it('nomeia homônimos pela variante funcional, sem expor o id de catálogo', () => {
    const equipment = groupEquipmentSpecs([
      {
        ...eq('1:1', 'FibreGuard 650 Dome', 'Corning', 'category:CDOE'),
        modelCode: '8-48FS',
        sapMaterialCode: '319942',
        row: { TIPO_SIGLA: 'CDOE', TIPO_NOME: 'CDOE' },
      },
      {
        ...eq('1:2', 'FibreGuard 650 Dome', 'Corning', 'category:CDOE'),
        modelCode: '8-72FS',
        sapMaterialCode: '319944',
        row: { TIPO_SIGLA: 'CDOE', TIPO_NOME: 'CDOE' },
      },
    ]);
    const names = distinctGroupNames(
      equipment.groups,
      (group) => `${group.representative.row.TIPO_SIGLA} ${group.representative.model}`,
      [
        (group) => group.representative.modelCode ?? null,
        (group) => group.representative.manufacturer ?? null,
        (group) =>
          group.representative.sapMaterialCode
            ? `SAP ${group.representative.sapMaterialCode}`
            : null,
      ],
      () => 'variante de catálogo',
    );
    expect([...names.values()].sort()).toEqual([
      'CDOE FibreGuard 650 Dome (8-48FS · SAP 319942)',
      'CDOE FibreGuard 650 Dome (8-72FS · SAP 319944)',
    ]);
  });

  it('colapsa splitters por modelo + sigla + fabricante + razão', () => {
    const sp = (sourceId: number, model: string, code: string | null, ratio: number | null) => ({
      sourceId,
      model,
      modelCode: code,
      manufacturer: null,
      ratio,
    });
    const index = groupSplitterSpecs([
      sp(30, 'Splitter 1:8', 'SPL-8', 8),
      sp(7, 'SPLITTER 1:8', 'spl 8', 8),
      sp(8, 'Splitter 1:8', 'SPL-8B', 8),
      sp(9, 'Splitter 1:8', 'SPL-8', 16),
    ]);
    expect(index.groups).toHaveLength(3);
    expect(index.canonicalIdBySourceId.get('30')).toBe(index.canonicalIdBySourceId.get('7'));
    const group = index.byCanonicalId.get(index.canonicalIdBySourceId.get('30')!)!;
    expect(group.representativeSourceId).toBe('7');
    expect(group.originAliases).toEqual(['ISP_CAT_CARTA:7', 'ISP_CAT_CARTA:30']);
  });

  it('bastidores: mesmo modelo/fabricante/dimensões colapsam; dimensão ou fabricante distinto não', () => {
    const rk = (sourceId: number, manufacturer: string, height: number | null) => ({
      sourceId,
      kind: 'rack' as const,
      model: 'BASTIDOR-19-44U',
      modelCode: 'BASTIDOR 19" 44U',
      manufacturer,
      height,
      width: 600,
      depth: 930,
    });
    const index = groupRackSpecs(
      [
        rk(2307, 'INDEFINIDO', 2000),
        rk(2308, 'indefinido', 2000),
        rk(2306, 'INDEFINIDO', 2009),
        rk(2304, 'ALCATEL', 2000),
      ],
      'ISP_CAT_BASTIDOR',
      'rack',
    );
    expect(index.groups).toHaveLength(3);
    expect(index.canonicalIdBySourceId.get('2307')).toBe(index.canonicalIdBySourceId.get('2308'));
    expect(index.canonicalIdBySourceId.get('2306')).not.toBe(
      index.canonicalIdBySourceId.get('2307'),
    );
    const group = index.byCanonicalId.get(index.canonicalIdBySourceId.get('2308')!)!;
    expect(group.originAliases).toEqual(['ISP_CAT_BASTIDOR:2307', 'ISP_CAT_BASTIDOR:2308']);
  });
});
