import { describe, expect, it } from 'vitest';

import {
  enrichGasPipelines,
  normalizeKey,
  parseAnpGasAuthorizations,
  parseCsv,
} from '../scripts/seed-demo-infrastructure/anp.js';
import type { MappedLine } from '../scripts/seed-demo-infrastructure/mapper.js';

const HEADER =
  'Empresa,TipoDaAutorizacao,TipoDeInstalacao,NomeDaInstalacao,Gasoduto,Trecho,Extensao,Diametro,Capacidade,TipoDoAto,NumeroDoAto,DataDaOutorga,DataDePublicacaoDOU,Observacao';

const CSV = [
  HEADER,
  'TBG,Operação,Gasoduto de Transporte,Gasoduto Bolívia - Brasil,Gasoduto Bolívia - Brasil (GASBOL),,,,,Autorização,13,1999-02-03,1999-02-04,',
  'Dois,Operação,Gasoduto de Transporte;,Gasoduto Duplicado,,,,,,Autorização,1,1999-01-01,1999-01-02,',
  'Outra,Operação,Gasoduto de Transporte,Gasoduto Duplicado,,,,,,Autorização,2,1999-01-01,1999-01-02,',
  'Estação,Operação,Estação de Compressão,Gasoduto Bolívia - Brasil,,,,,,Autorização,3,1999-01-01,1999-01-02,',
  'X,Construção,Gasoduto de Transporte,Gasoduto Lateral,,"Trecho com ""aspas""\ne quebra",,,,Autorização,4,1999-01-01,1999-01-02,',
].join('\n');

const line = (name: string): MappedLine => ({
  sourceId: '1',
  originId: '1',
  locationId: 'loc',
  resourceId: 'res',
  name,
  line: {
    type: 'LineString',
    coordinates: [
      [-43, -22],
      [-42, -21],
    ],
  },
  originSystem: 'IBGE_BC250',
  characteristics: [{ name: '_origin.system', value: 'IBGE_BC250', valueType: 'string' }],
});

describe('ANP: CSV', () => {
  it('lê aspas escapadas e quebra de linha dentro de campo', () => {
    const rows = parseCsv('a,b\n"x ""y""\nz",2\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x "y"\nz', '2'],
    ]);
  });

  it('rejeita CSV sem as colunas esperadas', () => {
    expect(() => parseAnpGasAuthorizations('foo,bar\n1,2')).toThrow(/colunas/);
  });

  it('normaliza chave sem acento nem pontuação', () => {
    expect(normalizeKey('Gasoduto Bolívia - Brasil')).toBe('gasoduto bolivia brasil');
  });
});

describe('ANP: enriquecimento de gasodutos', () => {
  const authorizations = parseAnpGasAuthorizations(CSV);

  it('enriquece por nome exato sem alterar identidade', () => {
    const { lines, report } = enrichGasPipelines([line('Gasoduto Bolívia-Brasil')], authorizations);
    const [enriched] = lines;
    expect(enriched?.resourceId).toBe('res');
    expect(enriched?.locationId).toBe('loc');
    expect(enriched?.characteristics).toContainEqual({
      name: 'operador',
      value: 'TBG',
      valueType: 'string',
    });
    expect(enriched?.characteristics.some((c) => c.name === '_origin.extra')).toBe(true);
    expect(report.enriched).toBe(1);
  });

  it('ignora instalação que não é duto (compressão com mesmo nome)', () => {
    const { lines } = enrichGasPipelines([line('Gasoduto Bolívia-Brasil')], authorizations);
    const tipos = lines[0]?.characteristics.filter((c) => c.name === 'tipoInstalacao');
    expect(tipos).toEqual([
      { name: 'tipoInstalacao', value: 'Gasoduto de Transporte', valueType: 'string' },
    ]);
  });

  it('não aplica quando o nome casa com mais de uma instalação ou operador em conflito', () => {
    const { lines, report } = enrichGasPipelines([line('Gasoduto Duplicado')], authorizations);
    expect(lines[0]?.characteristics.some((c) => c.name === 'operador')).toBe(false);
    expect(report.conflictingFields).toBeGreaterThan(0);
  });

  it('conta sem correspondência e não inventa atributo', () => {
    const input = line('Cemig');
    const { lines, report } = enrichGasPipelines([input], authorizations);
    expect(lines[0]).toBe(input);
    expect(report.noMatch).toBe(1);
  });

  it('é idempotente: reaplicar não duplica characteristics', () => {
    const once = enrichGasPipelines([line('Gasoduto Bolívia-Brasil')], authorizations).lines;
    const twice = enrichGasPipelines(once, authorizations).lines[0];
    const names = (twice?.characteristics ?? []).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
