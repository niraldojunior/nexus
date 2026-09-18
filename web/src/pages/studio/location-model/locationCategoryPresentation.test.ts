import { describe, expect, it } from 'vitest';
import { LOCATION_CATEGORY_LABELS, locationCategoryLabel } from './locationCategoryPresentation';

describe('locationCategoryPresentation', () => {
  it('presents the canonical categories with the operational vocabulary', () => {
    // Os rótulos mudaram; as chaves canônicas (persistidas e trafegadas na API) não.
    expect(LOCATION_CATEGORY_LABELS).toEqual({
      Region: 'Região',
      Site: 'Externo',
      SubSite: 'Interno',
    });
    expect(locationCategoryLabel('Region')).toBe('Região');
    expect(locationCategoryLabel('Site')).toBe('Externo');
    expect(locationCategoryLabel('SubSite')).toBe('Interno');
  });

  it('falls back to the raw value for a category outside the canonical set', () => {
    expect(locationCategoryLabel('FunctionalGroup')).toBe('FunctionalGroup');
  });
});
