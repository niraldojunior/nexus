import { describe, expect, it } from 'vitest';
import {
  NATIVE_MAP_ICON_INDUSTRIES,
  NATIVE_MAP_ICON_INDUSTRY_LABEL,
  NATIVE_MAP_ICONS,
  filterNativeMapIcons,
  nativeMapIconDataUrl,
  nativeMapIconForCode,
  nativeMapIconsForIndustry,
} from './nativeMapIcons';

// Códigos Telecom persistidos antes do registry único — quebrar qualquer um deles significa
// que um `visualConfig.iconCode` já publicado passaria a cair em fallback silencioso.
const LEGACY_TELECOM_CODES = [
  'CO',
  'POP',
  'CTO',
  'PI',
  'cdoe',
  'cdoi',
  'ceo',
  'OLT',
  'Card',
  'Port',
  'ONT',
  'CPE',
  'Router',
  'Switch',
  'Rack',
  'PowerSupply',
  'Splitter',
  'DIO',
  'Pole',
  'Manhole',
  'Duct',
  'Tower',
];

describe('NATIVE_MAP_ICON_INDUSTRIES', () => {
  it('define exatamente as cinco indústrias esperadas', () => {
    expect(NATIVE_MAP_ICON_INDUSTRIES).toEqual([
      'TELECOM',
      'DATA_CENTER',
      'ENERGY',
      'OIL_GAS',
      'LOGISTICS',
    ]);
  });

  it('tem rótulo pt-BR para cada indústria', () => {
    for (const industry of NATIVE_MAP_ICON_INDUSTRIES) {
      expect(NATIVE_MAP_ICON_INDUSTRY_LABEL[industry]).toBeTruthy();
    }
  });
});

describe('nativeMapIconsForIndustry', () => {
  it('tem pelo menos 20 ícones em cada indústria', () => {
    for (const industry of NATIVE_MAP_ICON_INDUSTRIES) {
      expect(nativeMapIconsForIndustry(industry).length).toBeGreaterThanOrEqual(20);
    }
  });

  it('só retorna ícones da indústria pedida', () => {
    for (const industry of NATIVE_MAP_ICON_INDUSTRIES) {
      for (const entry of nativeMapIconsForIndustry(industry)) {
        expect(entry.industry).toBe(industry);
      }
    }
  });
});

describe('códigos', () => {
  it('são globalmente únicos em todo o catálogo', () => {
    const codes = NATIVE_MAP_ICONS.map((entry) => entry.code.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('famílias novas são namespaced por indústria', () => {
    for (const entry of NATIVE_MAP_ICONS) {
      if (entry.industry === 'TELECOM') continue;
      const prefix = entry.industry.toLowerCase().replace(/_/g, '-');
      expect(entry.code.startsWith(`${prefix}.`)).toBe(true);
    }
  });
});

describe('nativeMapIconForCode', () => {
  it('resolve todo código Telecom historicamente persistido', () => {
    for (const code of LEGACY_TELECOM_CODES) {
      expect(nativeMapIconForCode(code)).toBeDefined();
    }
  });

  it('é case-insensitive', () => {
    expect(nativeMapIconForCode('co')).toBe(nativeMapIconForCode('CO'));
  });

  it('retorna undefined para código desconhecido ou vazio', () => {
    expect(nativeMapIconForCode('not-a-real-code')).toBeUndefined();
    expect(nativeMapIconForCode(undefined)).toBeUndefined();
  });

  it('não reaproveita o mesmo glifo entre conceitos Telecom distintos com desenho próprio', () => {
    // CO (estação), POP, CTO, cdoe e cdoi são conceitos semanticamente diferentes e precisam
    // de glifos distintos entre si — reuso aqui é exatamente o bug que motivou o registry.
    const distinctConceptCodes = ['CO', 'POP', 'CTO', 'cdoe', 'cdoi', 'ceo'];
    const glyphs = distinctConceptCodes.map((code) => nativeMapIconForCode(code)!.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe('filterNativeMapIcons', () => {
  it('sem termo de busca retorna todos os ícones da indústria', () => {
    expect(filterNativeMapIcons('DATA_CENTER', '').length).toBe(
      nativeMapIconsForIndustry('DATA_CENTER').length,
    );
  });

  it('filtra por nome', () => {
    const results = filterNativeMapIcons('ENERGY', 'subestação');
    expect(results.some((entry) => entry.code === 'energy.substation')).toBe(true);
  });

  it('filtra por código', () => {
    const results = filterNativeMapIcons('TELECOM', 'CTO');
    expect(results.some((entry) => entry.code === 'CTO')).toBe(true);
  });

  it('filtra por tag, é acento-insensível a caixa e ignora indústrias diferentes', () => {
    const results = filterNativeMapIcons('LOGISTICS', 'FERROVIA');
    expect(results.every((entry) => entry.industry === 'LOGISTICS')).toBe(true);
    expect(results.some((entry) => entry.code === 'logistics.rail-terminal')).toBe(true);
  });

  it('retorna vazio quando nada corresponde', () => {
    expect(filterNativeMapIcons('OIL_GAS', 'xyz-nao-existe')).toEqual([]);
  });
});

describe('nativeMapIconDataUrl', () => {
  it('gera um data URL SVG válido', () => {
    const entry = nativeMapIconForCode('CO')!;
    const dataUrl = nativeMapIconDataUrl(entry, { size: 24, shape: 'squircle' });
    expect(dataUrl.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('cacheia por code+glyph+color+size+shape — mesma chamada retorna o mesmo valor', () => {
    const entry = nativeMapIconForCode('POP')!;
    const first = nativeMapIconDataUrl(entry, { size: 32, shape: 'circle' });
    const second = nativeMapIconDataUrl(entry, { size: 32, shape: 'circle' });
    expect(first).toBe(second);
  });

  it('tamanhos diferentes produzem data URLs diferentes', () => {
    const entry = nativeMapIconForCode('CTO')!;
    const small = nativeMapIconDataUrl(entry, { size: 16 });
    const large = nativeMapIconDataUrl(entry, { size: 40 });
    expect(small).not.toBe(large);
  });
});
