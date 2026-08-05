import { describe, expect, it } from 'vitest';
import { buildGoogleMapsStreetViewUrl, streetViewTargetsForGeometry } from './googleMapsLink';

describe('buildGoogleMapsStreetViewUrl', () => {
  it('abre o panorama do Google Maps no ponto informado', () => {
    const href = buildGoogleMapsStreetViewUrl([-43.1108, -22.9108]);

    expect(href).not.toBeNull();
    const url = new URL(href!);
    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/maps/@');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('map_action')).toBe('pano');
    expect(url.searchParams.get('viewpoint')).toBe('-22.9108,-43.1108');
  });

  it('não cria link quando a coordenada é inválida', () => {
    expect(buildGoogleMapsStreetViewUrl(null)).toBeNull();
    expect(buildGoogleMapsStreetViewUrl([Number.NaN, -22.9])).toBeNull();
    expect(buildGoogleMapsStreetViewUrl([-43.1, Number.POSITIVE_INFINITY])).toBeNull();
    expect(buildGoogleMapsStreetViewUrl([181, 0])).toBeNull();
    expect(buildGoogleMapsStreetViewUrl([0, 91])).toBeNull();
  });
});

describe('streetViewTargetsForGeometry', () => {
  it('retorna um único alvo para geometria pontual', () => {
    expect(
      streetViewTargetsForGeometry({ type: 'Point', coordinates: [-43.1108, -22.9108] }),
    ).toEqual([{ point: [-43.1108, -22.9108] }]);
  });

  it('retorna início e fim para um recurso linear', () => {
    expect(
      streetViewTargetsForGeometry({
        type: 'LineString',
        coordinates: [
          [-43.11, -22.91],
          [-43.12, -22.92],
          [-43.13, -22.93],
        ],
      }),
    ).toEqual([
      { label: 'Início', point: [-43.11, -22.91] },
      { label: 'Fim', point: [-43.13, -22.93] },
    ]);
  });

  it('não oferece Street View para geometria sem ponto utilizável', () => {
    expect(streetViewTargetsForGeometry(undefined)).toEqual([]);
    expect(
      streetViewTargetsForGeometry({ type: 'LineString', coordinates: [[-43.11, -22.91]] }),
    ).toEqual([]);
    expect(
      streetViewTargetsForGeometry({
        type: 'Polygon',
        coordinates: [
          [
            [-43.11, -22.91],
            [-43.12, -22.92],
            [-43.11, -22.91],
          ],
        ],
      }),
    ).toEqual([]);
  });
});
