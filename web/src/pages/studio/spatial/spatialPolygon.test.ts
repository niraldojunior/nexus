import { describe, expect, it } from 'vitest';
import {
  closePolygonRing,
  polygonFromVertices,
  polygonIsReady,
  polygonVertices,
} from './spatialPolygon';

describe('spatialPolygon', () => {
  const vertices: Array<[number, number]> = [
    [-43.2, -22.9],
    [-43.19, -22.9],
    [-43.19, -22.89],
  ];

  it('fecha o anel e preserva a ordem GeoJSON [longitude, latitude]', () => {
    const polygon = polygonFromVertices(vertices);

    expect(closePolygonRing(vertices)).toEqual([...vertices, vertices[0]]);
    expect(polygon).toEqual({
      type: 'Polygon',
      coordinates: [[...vertices, vertices[0]]],
    });
    expect(polygonVertices(polygon)).toEqual(vertices);
  });

  it('exige três vértices antes de permitir salvar o polígono', () => {
    expect(polygonIsReady(vertices)).toBe(true);
    expect(polygonIsReady(vertices.slice(0, 2))).toBe(false);
  });
});
