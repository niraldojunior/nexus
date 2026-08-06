import { describe, expect, it } from 'vitest';
import { resourceIconDataUrl, resourceIconFor } from './resourceIcon';
import { siteIconDataUrl, siteIconFor } from './siteIcon';
import { resourceStreetViewMarker, siteStreetViewMarker } from './streetViewMarker';

describe('siteStreetViewMarker', () => {
  it('reutiliza o ícone, status e nome do Site selecionado', () => {
    const point: [number, number] = [-43.11, -22.91];

    expect(
      siteStreetViewMarker(
        { name: 'POP Centro', status: 'active' },
        { category: 'Site', name: 'POP' },
        point,
      ),
    ).toEqual({
      point,
      title: 'POP Centro',
      iconUrl: siteIconDataUrl(siteIconFor('POP', 'active'), { size: 40 }),
    });
  });
});

describe('resourceStreetViewMarker', () => {
  it('reutiliza o ícone e nome do Resource selecionado', () => {
    const point: [number, number] = [-43.12, -22.92];

    expect(resourceStreetViewMarker({ label: 'CTO 101', resourceType: 'CTO' }, point)).toEqual({
      point,
      title: 'CTO 101',
      iconUrl: resourceIconDataUrl(resourceIconFor('CTO'), { size: 40 }),
    });
  });

  it('usa a mesma resolução por resourceType aplicada pelo mapa Geo', () => {
    const point: [number, number] = [-43.12, -22.92];

    expect(
      resourceStreetViewMarker(
        {
          label: 'Resource legado',
          resourceType: 'TIPO_DESCONHECIDO',
          resourceSpecification: { name: 'CTO' },
        },
        point,
      ).iconUrl,
    ).toBe(resourceIconDataUrl(resourceIconFor('TIPO_DESCONHECIDO'), { size: 40 }));
  });
});
