import { describe, expect, it } from 'vitest';
import { routeOrthogonalPath } from './internalResourceLayout';

describe('routeOrthogonalPath', () => {
  it('routes to a target below the source', () => {
    expect(routeOrthogonalPath({ x: 0, y: 0, width: 20, height: 10 }, { x: 40, y: 40, width: 20, height: 10 })).toBe(
      'M 10 10 L 10 25 L 50 25 L 50 40',
    );
  });

  it('routes to a target above the source', () => {
    expect(routeOrthogonalPath({ x: 40, y: 40, width: 20, height: 10 }, { x: 0, y: 0, width: 20, height: 10 })).toBe(
      'M 50 40 L 50 25 L 10 25 L 10 10',
    );
  });

  it('uses a lower detour for overlapping vertical bands', () => {
    expect(routeOrthogonalPath({ x: 0, y: 0, width: 20, height: 20 }, { x: 40, y: 10, width: 20, height: 20 })).toBe(
      'M 10 20 L 10 40 L 50 40 L 50 30',
    );
  });
});
