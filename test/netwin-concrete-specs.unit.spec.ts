import { describe, expect, it } from 'vitest';
import {
  netwinEquipmentFolder,
  resolveEquipmentTypeCode,
  cardTypeSpecId,
  rackTypeSpecId,
  subrackTypeSpecId,
  equipmentModelSpecId,
  genericSpecId,
  parseSplitterRatioStrict,
  pickSpecification,
  portTypeSpecId,
  SpecCoverage,
  uniqueSpecNames,
} from '../src/scripts/netwin-migration/concrete-specs.js';

describe('concrete-specs', () => {
  it('gera ids determinísticos sem colidir com os genéricos', () => {
    expect(equipmentModelSpecId(1, 2)).toBe(equipmentModelSpecId(1, 2));
    const ids = new Set([
      equipmentModelSpecId(1, 2),
      equipmentModelSpecId(2, 1),
      cardTypeSpecId(1),
      portTypeSpecId('FO.I', 'BI'),
      genericSpecId('Netwin Port'),
    ]);
    expect(ids.size).toBe(5);
  });

  it('reconhece razão apenas quando o catálogo a declara', () => {
    expect(parseSplitterRatioStrict('Splitter 1:16', null, null)).toBe(16);
    expect(parseSplitterRatioStrict('Splitter', 'SPL', 'sem razão')).toBeNull();
    expect(parseSplitterRatioStrict('1:5', null, null)).toBeNull();
  });

  it('usa a concreta só se existir e contabiliza o fallback', () => {
    const coverage = new SpecCoverage();
    const generic = genericSpecId('Netwin CDOE');
    const concrete = equipmentModelSpecId(1, 2);
    expect(pickSpecification(concrete, new Set([concrete]), generic, coverage)).toBe(concrete);
    expect(pickSpecification(concrete, new Set(), generic, coverage)).toBe(generic);
    expect(pickSpecification(null, new Set([concrete]), generic, coverage)).toBe(generic);
    expect(coverage.get('concrete')).toBe(1);
    expect(coverage.get('genericFallback')).toBe(2);
  });

  it('amostra subtipos não mapeados no relatório', () => {
    const coverage = new SpecCoverage();
    coverage.record('unmapped', 999);
    expect(coverage.format('x')).toContain('999×1');
  });

  it('desambigua nomes homônimos pela chave do catálogo', () => {
    const names = uniqueSpecNames(
      [{ k: 1 }, { k: 2 }, { k: 3 }],
      (i) => (i.k === 3 ? 'B' : 'A'),
      (i) => i.k,
    );
    expect(names.get(1)).toBe('A #1');
    expect(names.get(2)).toBe('A #2');
    expect(names.get(3)).toBe('B');
  });

  it('mantém CDO/CDOI canônicos e deriva o tipo dos demais equipamentos em uso', () => {
    const idx = new Map([['router', 'Router']]);
    expect(resolveEquipmentTypeCode(271, 'x', null, idx).code).toBe('category:CDOE');
    expect(resolveEquipmentTypeCode(270, 'x', null, idx).code).toBe('category:CDOI');
    expect(resolveEquipmentTypeCode(5, 'Router', null, idx)).toEqual({
      code: 'Router',
      existing: true,
    });
    expect(resolveEquipmentTypeCode(6, 'Bateria', null, idx)).toEqual({
      code: 'netwin-bateria',
      existing: false,
    });
    expect(resolveEquipmentTypeCode(7, 'Bateria', null, idx).code).toBe('netwin-bateria');
    expect(resolveEquipmentTypeCode(999, null, null, idx).code).toBe('netwin-equipment-999');
  });
});

describe('specs de bastidor e subbastidor', () => {
  it('são determinísticas e isoladas entre si e de outros catálogos', () => {
    expect(rackTypeSpecId(2312)).toBe(rackTypeSpecId(2312));
    const ids = new Set([
      rackTypeSpecId(1),
      subrackTypeSpecId(1),
      cardTypeSpecId(1),
      genericSpecId('Netwin Rack'),
      genericSpecId('Netwin Shelf'),
    ]);
    expect(ids.size).toBe(5);
  });

  it('cai na spec genérica quando o modelo não existe ou o tipo é nulo', () => {
    const coverage = new SpecCoverage();
    const generic = genericSpecId('Netwin Rack');
    const available = new Set([rackTypeSpecId(2312)]);
    expect(pickSpecification(rackTypeSpecId(2312), available, generic, coverage)).toBe(
      rackTypeSpecId(2312),
    );
    expect(pickSpecification(rackTypeSpecId(9), available, generic, coverage)).toBe(generic);
    expect(pickSpecification(null, available, generic, coverage)).toBe(generic);
    expect(coverage.get('concrete')).toBe(1);
    expect(coverage.get('genericFallback')).toBe(2);
  });
});

describe('netwinEquipmentFolder', () => {
  it('usa a tecnologia predominante do Netwin', () => {
    const folder = netwinEquipmentFolder([
      { sigla: 'CLIMATIZACOES', nome: 'CLIMATIZACOES', count: 80 },
      { sigla: 'ENERGIAS', nome: 'ENERGIAS', count: 1373 },
    ]);
    expect(folder).toEqual({ code: 'grp-netwin-tec-energias', name: 'ENERGIAS' });
  });
  it('sem tecnologia cai em Outros equipamentos', () => {
    expect(netwinEquipmentFolder([{ sigla: null, nome: null, count: 3 }]).code).toBe(
      'grp-netwin-outros',
    );
    expect(netwinEquipmentFolder([]).code).toBe('grp-netwin-outros');
  });
});
