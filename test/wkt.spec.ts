import { describe, expect, it } from 'vitest';
import { parseWktLineString, parseWktPoint } from '../src/shared/utils/wkt.js';

describe('parseWktLineString', () => {
  it('parses a LINESTRING WKT into GeoJSON coordinates (lng, lat order preserved)', () => {
    const geometry = parseWktLineString(
      'LINESTRING (-43.1078376 -22.8990688, -43.1078350922156 -22.8991629041945, -43.1077304203562 -22.8992034267328)',
    );
    expect(geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [-43.1078376, -22.8990688],
        [-43.1078350922156, -22.8991629041945],
        [-43.1077304203562, -22.8992034267328],
      ],
    });
  });

  it('rejects WKT with fewer than 2 points', () => {
    expect(() => parseWktLineString('LINESTRING (-43.1 -22.9)')).toThrow();
  });

  it('rejects non-LINESTRING WKT', () => {
    expect(() => parseWktLineString('POINT (-43.1 -22.9)')).toThrow();
  });

  it('rejects malformed coordinates', () => {
    expect(() => parseWktLineString('LINESTRING (abc def, 1 2)')).toThrow();
  });
});

describe('parseWktPoint', () => {
  it('parses a POINT WKT into GeoJSON coordinates', () => {
    expect(parseWktPoint('POINT (-43.1078376 -22.8990688)')).toEqual({
      type: 'Point',
      coordinates: [-43.1078376, -22.8990688],
    });
  });

  it('rejects non-POINT WKT', () => {
    expect(() => parseWktPoint('LINESTRING (-43.1 -22.9, -43.2 -22.8)')).toThrow();
  });
});
