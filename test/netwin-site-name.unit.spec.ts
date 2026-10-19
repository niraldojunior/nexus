import { describe, expect, it } from 'vitest';
import { composeNetwinSiteName } from '../src/scripts/netwin-migration/site-name.js';
import { CANONICAL_SITE_SPECS } from '../src/scripts/netwin-migration/phase1-site-specs.js';
import { municipalityFromInfranodeRow } from '../src/scripts/netwin-migration/phase2-locations.js';

describe('composeNetwinSiteName', () => {
  it('combina sigla e descrição', () => {
    expect(composeNetwinSiteName(1, 'AFC', 'AFONSO CLAUDIO   LC')).toBe('AFC - AFONSO CLAUDIO LC');
    expect(composeNetwinSiteName(2, 'ECAC', 'ERB PCS AFONSO CLAUDIO')).toBe(
      'ECAC - ERB PCS AFONSO CLAUDIO',
    );
  });
  it('não duplica quando a descrição já contém o nome', () => {
    expect(composeNetwinSiteName(1, 'AFC', 'afc - Afonso')).toBe('afc - Afonso');
    expect(composeNetwinSiteName(1, 'AFC', 'AFC')).toBe('AFC');
  });
  it('trata campos ausentes', () => {
    expect(composeNetwinSiteName(9, null, null)).toBe('Local 9');
    expect(composeNetwinSiteName(9, ' ', ' x ')).toBe('x');
    expect(composeNetwinSiteName(9, 'A', '')).toBe('A');
  });
  it('limita a 255 caracteres', () => {
    expect(composeNetwinSiteName(1, 'A', 'B'.repeat(400)).length).toBeLessThanOrEqual(255);
  });
});

describe('CANONICAL_SITE_SPECS', () => {
  it('usa vocabulário Netwin sem alterar codes', () => {
    const byCode = new Map(CANONICAL_SITE_SPECS.map((s) => [s.code, s.name]));
    expect(byCode.get('BUILDING')).toBe('Edifício');
    expect(byCode.get('CENTRAL_OFFICE')).toBe('Estação Predial');
    expect(byCode.size).toBe(14);
  });
});

describe('municipalityFromInfranodeRow', () => {
  it('normaliza município e UF', () => {
    const m = municipalityFromInfranodeRow({
      PI_ID: 1,
      MUNICIPIO_ID: 1849932,
      MUNICIPIO: 'AFONSO CLAUDIO',
      UF_ABRV: 'ES',
    });
    expect(m?.sourceRef).toBe('1849932');
    expect(m?.tuple).toBeTruthy();
  });
  it('rejeita UF inválida ou ausente', () => {
    expect(
      municipalityFromInfranodeRow({ PI_ID: 1, MUNICIPIO_ID: 1, MUNICIPIO: 'X', UF_ABRV: 'ZZZZ' }),
    ).toBeNull();
    expect(
      municipalityFromInfranodeRow({
        PI_ID: 1,
        MUNICIPIO_ID: null,
        MUNICIPIO: null,
        UF_ABRV: null,
      }),
    ).toBeNull();
  });
});
