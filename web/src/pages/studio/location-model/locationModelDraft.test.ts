import { describe, expect, it } from 'vitest';
import {
  buildLocationModelSnapshot,
  createLocationDraftSpec,
  draftSpecsFromGeoSpecs,
  draftSpecsFromSnapshot,
} from './locationModelDraft';
import type { LocationModelDraftSpec } from './locationModelDraft';

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
    const drafts = draftSpecsFromGeoSpecs([
      {
        '@type': 'GeographicSiteSpecification',
        id: 'region-1',
        href: '/v1/geo/site-specifications/region-1',
        code: 'REGION',
        name: 'Região',
        category: 'Region',
        siteRole: 'grouping',
        lifecycleStatus: 'Active',
        allowedParentSpecIds: [],
        allowedChildSpecIds: ['site-1'],
      },
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
    const draft = drafts.find((spec) => spec.localId === 'site-1');

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
          '@type': 'GeographicSiteSpecification',
          id: 'region-id',
          href: '',
          code: 'REGION',
          name: 'Região',
          category: 'Region',
          siteRole: 'grouping',
          lifecycleStatus: 'Active',
          allowedParentSpecIds: [],
          allowedChildSpecIds: [],
        },
        {
          '@type': 'GeographicSiteSpecification',
          id: 'site-id',
          href: '',
          code: 'SITE',
          name: 'Local',
          category: 'Site',
          siteRole: 'network',
          lifecycleStatus: 'Active',
          allowedParentSpecIds: [],
          allowedChildSpecIds: [],
        },
      ],
    );

    expect(drafts?.[0]?.allowedChildLocalIds).toEqual(['site-id']);
    expect(drafts?.[1]?.allowedParentLocalIds).toEqual(['region-id']);
  });

  it('requests a migration only for a mandatory transition on a persisted spec', () => {
    const persisted: LocationModelDraftSpec = {
      ...createLocationDraftSpec(),
      localId: 'site-id',
      persistedId: 'site-id',
      code: 'SITE',
      specCharacteristic: [
        { name: 'capacidade', valueType: 'integer', mandatory: true, defaultValue: 12 },
      ],
      baselineSpecCharacteristic: [{ name: 'capacidade', valueType: 'integer', mandatory: false }],
    };
    const untouched: LocationModelDraftSpec = {
      ...createLocationDraftSpec(),
      localId: 'region-id',
      persistedId: 'region-id',
      code: 'REGION',
      specCharacteristic: [{ name: 'uf', valueType: 'string', mandatory: true }],
      baselineSpecCharacteristic: [{ name: 'uf', valueType: 'string', mandatory: true }],
    };
    // Tipo novo: nunca há instância para migrar, mesmo com característica obrigatória.
    const brandNew: LocationModelDraftSpec = {
      ...createLocationDraftSpec(),
      code: 'NEW',
      specCharacteristic: [{ name: 'altura', valueType: 'decimal', mandatory: true }],
    };

    const snapshot = buildLocationModelSnapshot([persisted, untouched, brandNew]) as {
      specifications: Array<{ code: string; migrationStrategy?: { type: string } }>;
    };
    const byCode = new Map(snapshot.specifications.map((spec) => [spec.code, spec]));

    expect(byCode.get('SITE')?.migrationStrategy).toEqual({ type: 'fillMissingWithDefault' });
    expect(byCode.get('REGION')?.migrationStrategy).toBeUndefined();
    expect(byCode.get('NEW')?.migrationStrategy).toBeUndefined();
  });

  it('restores the canonical baseline instead of the saved snapshot characteristics', () => {
    // O draft salvo já marcou a característica como obrigatória; a baseline tem de vir da spec
    // canônica, senão reabrir o editor apagaria a transição e a migração nunca seria pedida.
    const drafts = draftSpecsFromSnapshot(
      {
        specifications: [
          {
            code: 'SITE',
            name: 'Local',
            category: 'Site',
            specCharacteristic: [
              { name: 'capacidade', valueType: 'integer', mandatory: true, defaultValue: 12 },
            ],
          },
        ],
      },
      [
        {
          '@type': 'GeographicSiteSpecification',
          id: 'site-id',
          href: '',
          code: 'SITE',
          name: 'Local',
          category: 'Site',
          siteRole: 'network',
          lifecycleStatus: 'Active',
          specCharacteristic: [{ name: 'capacidade', valueType: 'integer', mandatory: false }],
          allowedParentSpecIds: [],
          allowedChildSpecIds: [],
        },
      ],
    );

    expect(drafts?.[0]?.baselineSpecCharacteristic).toEqual([
      { name: 'capacidade', valueType: 'integer', mandatory: false },
    ]);

    const snapshot = buildLocationModelSnapshot(drafts ?? []) as {
      specifications: Array<{ category: string; migrationStrategy?: { type: string } }>;
    };
    expect(snapshot.specifications[0]?.migrationStrategy).toEqual({
      type: 'fillMissingWithDefault',
    });
    // Rótulos de UI mudaram; o valor canônico da categoria no snapshot não.
    expect(snapshot.specifications[0]?.category).toBe('Site');
  });
});
