import { describe, expect, it } from 'vitest';
import { selectionPinDataUrl } from './siteIcon';
import {
  addressStreetViewMarker,
  resourceStreetViewMarker,
  siteStreetViewMarker,
} from './streetViewMarker';

describe('siteStreetViewMarker', () => {
  it('usa fallback neutro quando a Specification não tem identidade', () => {
    const point: [number, number] = [-43.11, -22.91];
    const marker = siteStreetViewMarker(
      { name: 'Local de Cliente', status: 'active' },
      { category: 'Site', name: 'Local de Cliente' },
      point,
    );

    expect(marker).toMatchObject({ point, title: 'Local de Cliente' });
    expect(decodeURIComponent(marker.iconUrl)).not.toContain('m3 9 9-7 9 7');
  });
});

describe('resourceStreetViewMarker', () => {
  it('usa fallback neutro, sem inferir o tipo do Resource', () => {
    const point: [number, number] = [-43.12, -22.92];
    const marker = resourceStreetViewMarker({ label: 'CTO 101', resourceType: 'CTO' }, point);

    expect(marker).toMatchObject({ point, title: 'CTO 101' });
    expect(decodeURIComponent(marker.iconUrl)).not.toContain('m7.5 4.27 9 5.15');
  });
});

describe('addressStreetViewMarker', () => {
  it('usa o alfinete de seleção do mapa como ícone', () => {
    const coordinates: [number, number] = [-43.1079841, -22.8985597];

    expect(
      addressStreetViewMarker({
        label: 'R. Dr. Paulo César, 155 - Santa Rosa, Niterói - RJ, 24220-400, Brasil',
        coordinates,
      }),
    ).toEqual({
      point: coordinates,
      title: 'R. Dr. Paulo César, 155 - Santa Rosa, Niterói - RJ, 24220-400, Brasil',
      iconUrl: selectionPinDataUrl(40),
    });
  });
});
