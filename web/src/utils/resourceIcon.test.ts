import { describe, expect, it } from 'vitest';
import {
  familyColor,
  isOutdoorResource,
  resourceIconDataUrl,
  resourceIconFor,
  resourceIconSvg,
  resourcePlant,
  resourceTypeCode,
} from './resourceIcon';

describe('resourceTypeCode', () => {
  it('usa o code do catálogo quando o recurso já vem tipado', () => {
    expect(resourceTypeCode({ resourceType: 'ONT' })).toBe('ONT');
    expect(resourceTypeCode({ resourceType: 'Port' })).toBe('Port');
    expect(resourceTypeCode({ resourceType: 'DistributionCable' })).toBe('DistributionCable');
  });

  it('cai para nome e spec quando o tipo não está no catálogo', () => {
    expect(resourceTypeCode({ resourceType: 'Equipamento', name: 'ONT-TIM-0001' })).toBe('ONT');
    expect(resourceTypeCode({ resourceSpecification: { name: 'Splitter 1:8' } })).toBe('Splitter');
  });

  it('prefere o alias mais específico', () => {
    // "PatchCord" contém "cord" e "patch"; o alias longo tem de vencer.
    expect(resourceTypeCode({ name: 'PatchCord LC-LC 3m' })).toBe('PatchCord');
  });

  it('devolve o fallback quando não há nada para classificar', () => {
    expect(resourceTypeCode(undefined)).toBe('__fallback');
    expect(resourceTypeCode({ name: 'Coisa sem tipo' })).toBe('__fallback');
  });
});

describe('resourceIconFor', () => {
  it('dá a mesma cor para tipos da mesma família e cores distintas entre famílias', () => {
    const port = resourceIconFor({ resourceType: 'Port' });
    const olt = resourceIconFor({ resourceType: 'OLT' });
    const ont = resourceIconFor({ resourceType: 'ONT' });

    expect(port.color).toBe(olt.color);
    expect(port.color).toBe(familyColor.access);
    expect(ont.color).toBe(familyColor.cpe);
    expect(ont.color).not.toBe(olt.color);
  });

  it('dá glifos distintos para tipos distintos da mesma família', () => {
    expect(resourceIconFor({ resourceType: 'Port' }).glyph).not.toBe(
      resourceIconFor({ resourceType: 'OLT' }).glyph,
    );
  });

  it('rotula em português', () => {
    expect(resourceIconFor({ resourceType: 'Port' }).label).toBe('Porta');
    expect(resourceIconFor({ resourceType: 'DropCable' }).label).toBe('Cabo drop');
  });
});

describe('resourceIconSvg', () => {
  it('serializa um SVG válido com a cor da família', () => {
    const svg = resourceIconSvg(resourceIconFor({ resourceType: 'ONT' }));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(familyColor.cpe);
    // Toda tag aberta do glifo é auto-fechada — SVG malformado quebra o marker.
    expect(svg).not.toMatch(/<(path|circle|rect|line)[^>]*[^/]>/);
  });

  it('omite o disco quando ring=false', () => {
    const semDisco = resourceIconSvg(resourceIconFor({ resourceType: 'ONT' }), { ring: false });
    expect(semDisco).not.toContain('<circle cx="16" cy="16"');
  });

  it('produz um data-URL consumível pelo Google Maps', () => {
    const url = resourceIconDataUrl(resourceIconFor({ resourceType: 'Splitter' }));
    expect(url.startsWith('data:image/svg+xml;charset=UTF-8,')).toBe(true);
    expect(decodeURIComponent(url.split(',')[1])).toContain('<svg');
  });
});

describe('resourcePlant', () => {
  it('classifica a planta externa — o que existe na rua e tem coordenada própria', () => {
    for (const code of ['CTO', 'Pole', 'Manhole', 'Duct', 'Splitter', 'BackboneCable', 'DropCable', 'Fiber']) {
      expect(resourcePlant({ resourceType: code })).toBe('outdoor');
    }
  });

  it('classifica a planta interna — o que mora no rack da estação', () => {
    for (const code of ['OLT', 'Card', 'Port', 'Rack', 'Switch', 'Router', 'PowerSupply', 'Jumper', 'PatchCord']) {
      expect(resourcePlant({ resourceType: code })).toBe('indoor');
    }
  });

  it('trata o DIO como planta interna, apesar de passivo', () => {
    expect(resourceIconFor({ resourceType: 'DIO' }).family).toBe('passive');
    expect(resourcePlant({ resourceType: 'DIO' })).toBe('indoor');
  });

  it('separa equipamento de cliente e recurso lógico', () => {
    expect(resourcePlant({ resourceType: 'ONT' })).toBe('customer');
    expect(resourcePlant({ resourceType: 'CPE' })).toBe('customer');
    expect(resourcePlant({ resourceType: 'VLAN' })).toBe('logical');
  });

  it('mantém o tipo desconhecido visível no mapa', () => {
    expect(resourcePlant({ name: 'Coisa nova sem catálogo' })).toBe('outdoor');
    expect(isOutdoorResource({ name: 'Coisa nova sem catálogo' })).toBe(true);
    expect(isOutdoorResource({ resourceType: 'ONT' })).toBe(false);
  });
});
