import { describe, expect, it } from 'vitest';
import {
  buildLocationModelSnapshot,
  createLocationDraftSpec,
  draftSpecsFromGeoSpecs,
  draftSpecsFromSnapshot,
} from './locationModelDraft';

describe('locationModelDraft', () => {
  it('generates distinct hidden technical codes for multiple placeholders', () => {
    const first = createLocationDraftSpec();
    const second = createLocationDraftSpec();

    expect(first.name).toBe('Novo item');
    expect(second.name).toBe('Novo item');
    expect(first.code).toMatch(/^STUDIO_LOCATION_[A-F0-9]+$/);
    expect(second.code).toMatch(/^STUDIO_LOCATION_[A-F0-9]+$/);
    expect(first.code).not.toBe(second.code);
  });

  it('serializes local relations using internal codes', () => {
    const parent = createLocationDraftSpec();
    const child = { ...createLocationDraftSpec(), allowedParentLocalIds: [parent.localId] };
    const snapshot = buildLocationModelSnapshot([parent, child]) as {
      specifications: Array<{ code: string; allowedParentCodes: string[] }>;
    };

    expect(snapshot.specifications[1]?.allowedParentCodes).toEqual([parent.code]);
  });

  it('keeps canonical metadata and containment when loading specs', () => {
    const [draft] = draftSpecsFromGeoSpecs([
      {
        '@type': 'GeographicSiteSpecification',
        id: 'site-1',
        href: '/v1/geo/site-specifications/site-1',
        code: 'SITE',
        name: 'Local',
        category: 'Site',
        siteRole: 'network',
        lifecycleStatus: 'Active',
        allowedParentSpecIds: ['region-1'],
        allowedChildSpecIds: [],
      },
    ]);

    expect(draft).toMatchObject({
      localId: 'site-1',
      persistedId: 'site-1',
      code: 'SITE',
      allowedParentLocalIds: ['region-1'],
    });
  });

  it('reconciles restored snapshot relations with canonical item IDs', () => {
    const drafts = draftSpecsFromSnapshot(
      {
        specifications: [
          { code: 'REGION', name: 'Região', category: 'Region', allowedChildCodes: ['SITE'] },
          { code: 'SITE', name: 'Local', category: 'Site', allowedParentCodes: ['REGION'] },
        ],
      },
      [
        {
          '@type': 'GeographicSiteSpecification', id: 'region-id', href: '', code: 'REGION', name: 'Região', category: 'Region', siteRole: 'grouping', lifecycleStatus: 'Active', allowedParentSpecIds: [], allowedChildSpecIds: [],
        },
        {
          '@type': 'GeographicSiteSpecification', id: 'site-id', href: '', code: 'SITE', name: 'Local', category: 'Site', siteRole: 'network', lifecycleStatus: 'Active', allowedParentSpecIds: [], allowedChildSpecIds: [],
        },
      ],
    );

    expect(drafts?.[0]?.allowedChildLocalIds).toEqual(['site-id']);
    expect(drafts?.[1]?.allowedParentLocalIds).toEqual(['region-id']);
  });
});
