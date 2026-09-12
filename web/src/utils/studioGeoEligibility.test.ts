import { describe, expect, it } from 'vitest';
import type { GeoSpec } from '../services/geoApi';
import type { ResourceType } from '../services/resourceApi';
import {
  buildEligibleCoverages,
  buildEligibleResources,
  buildEligibleSites,
} from './studioGeoEligibility';

const resourceType = (overrides: Partial<ResourceType> = {}): ResourceType => ({
  '@type': 'ResourceType',
  id: 'rt-pole',
  href: '/v1/resource-types/rt-pole',
  code: 'Pole',
  name: 'Poste',
  categoryCode: 'OutsidePlant',
  status: 'active',
  nature: 'PhysicalResource',
  mapPresence: true,
  ...overrides,
});

const geoSpec = (overrides: Partial<GeoSpec> = {}): GeoSpec => ({
  '@type': 'GeographicSiteSpecification',
  id: 'site-co',
  href: '/v1/geo/site-specifications/site-co',
  code: 'CentralOffice',
  name: 'Central Office',
  category: 'Site',
  siteRole: 'network',
  lifecycleStatus: 'Active',
  allowedParentSpecIds: [],
  allowedChildSpecIds: [],
  ...overrides,
});

describe('studioGeoEligibility', () => {
  it('keeps only active physical ResourceTypes explicitly visible on the map', () => {
    const eligible = buildEligibleResources([
      resourceType(),
      resourceType({ id: 'rt-hidden', code: 'Hidden', mapPresence: false }),
      resourceType({ id: 'rt-legacy', code: 'Legacy', mapPresence: undefined }),
      resourceType({ id: 'rt-inactive', code: 'Inactive', status: 'inactive' }),
      resourceType({ id: 'rt-logical', code: 'VLAN', nature: 'LogicalResource' }),
      resourceType({ id: 'rt-port', code: 'Port' }),
    ]);

    expect(eligible.map((option) => option.sourceId)).toEqual(['Pole']);
  });

  it('deduplicates ResourceTypes by the canonical sourceId used by the selector', () => {
    const eligible = buildEligibleResources([
      resourceType({ id: 'rt-default', name: 'Poste canônico' }),
      resourceType({ id: 'rt-tenant', name: 'Poste do tenant' }),
    ]);

    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.sourceId).toBe('Pole');
  });

  it('deduplicates eligible Sites and Coverages by sourceId', () => {
    const sites = buildEligibleSites([
      geoSpec({ id: 'site-default' }),
      geoSpec({ id: 'site-tenant' }),
    ]);
    const coverages = buildEligibleCoverages([
      geoSpec({ id: 'region-default', code: 'Region', category: 'Region' }),
      geoSpec({ id: 'region-tenant', code: 'Region', category: 'Region' }),
    ]);

    expect(sites.map((option) => option.sourceId)).toEqual(['CentralOffice']);
    expect(coverages.map((option) => option.sourceId)).toEqual(['Region']);
  });
});
