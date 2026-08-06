import { describe, expect, it } from 'vitest';
import { headingFromPanoramaToTarget } from './streetViewPanorama';

describe('headingFromPanoramaToTarget', () => {
  it.each([
    ['norte', { lat: 0, lng: 0 }, [0, 1] as [number, number], 0],
    ['leste', { lat: 0, lng: 0 }, [1, 0] as [number, number], 90],
    ['sul', { lat: 0, lng: 0 }, [0, -1] as [number, number], 180],
    ['oeste', { lat: 0, lng: 0 }, [-1, 0] as [number, number], 270],
  ])('aponta para %s e normaliza o heading', (_direction, panorama, target, expected) => {
    expect(headingFromPanoramaToTarget(panorama, target)).toBeCloseTo(expected, 5);
  });

  it('usa heading zero quando panorama e alvo coincidem', () => {
    expect(headingFromPanoramaToTarget({ lat: -22.9, lng: -43.2 }, [-43.2, -22.9])).toBe(0);
  });
});
