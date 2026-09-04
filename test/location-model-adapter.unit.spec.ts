import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { LocationModelStudioAdapter } from '../src/modules/studio/adapters/location-model-adapter.js';
import type { GeoService } from '../src/modules/geo/service.js';
import type { GeographicSiteSpecification } from '../src/modules/geo/domain.js';

test('LocationModelStudioAdapter validates valid specifications snapshot', async () => {
  const geoService = {} as unknown as GeoService;
  const adapter = new LocationModelStudioAdapter(geoService);

  const validSnapshot = {
    specifications: [
      {
        code: 'REGION',
        name: 'Região',
        category: 'Region',
        siteRole: 'grouping',
        allowedChildCodes: ['CO', 'POP'],
      },
      {
        code: 'CO',
        name: 'Central Office',
        category: 'Site',
        siteRole: 'network',
        allowedParentCodes: ['REGION'],
        allowedChildCodes: ['FLOOR', 'ROOM'],
      },
      {
        code: 'POP',
        name: 'Point of Presence',
        category: 'Site',
        siteRole: 'network',
        allowedParentCodes: ['REGION'],
      },
      {
        code: 'FLOOR',
        name: 'Pavimento',
        category: 'SubSite',
        siteRole: 'network',
        allowedParentCodes: ['CO'],
      },
      {
        code: 'ROOM',
        name: 'Sala Técnica',
        category: 'SubSite',
        siteRole: 'network',
        allowedParentCodes: ['CO'],
      },
    ],
  };

  const result = await adapter.validate(validSnapshot);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test('LocationModelStudioAdapter rejects duplicate codes, invalid categories and self references', async () => {
  const geoService = {} as unknown as GeoService;
  const adapter = new LocationModelStudioAdapter(geoService);

  const invalidSnapshot = {
    specifications: [
      {
        code: 'REGION',
        name: 'Região A',
        category: 'Region',
        siteRole: 'grouping',
        allowedParentCodes: ['REGION'], // Auto-referência
      },
      {
        code: 'REGION', // Código duplicado
        name: 'Região B',
        category: 'InvalidCategory', // Categoria inválida
        siteRole: 'invalid-role', // Papel inválido
      },
      {
        code: 'CO',
        name: 'Central Office',
        category: 'Site',
        allowedParentCodes: ['NON_EXISTENT_PARENT'], // Pai inexistente
        allowedChildCodes: ['NON_EXISTENT_CHILD'], // Filho inexistente
      },
    ],
  };

  const result = await adapter.validate(invalidSnapshot as Record<string, unknown>);
  assert.equal(result.valid, false);
  const codes = result.issues.map((i) => i.code);
  assert.equal(codes.includes('SPEC_CODE_DUPLICATE'), true);
  assert.equal(codes.includes('SPEC_CATEGORY_INVALID'), true);
  assert.equal(codes.includes('SPEC_ROLE_INVALID'), true);
  assert.equal(codes.includes('CONTAINMENT_PARENT_NOT_FOUND'), true);
  assert.equal(codes.includes('CONTAINMENT_CHILD_NOT_FOUND'), true);
  assert.equal(codes.includes('CONTAINMENT_SELF_REFERENCE'), true);
});

test('LocationModelStudioAdapter materializes specifications and containment rules into GeoService', async () => {
  const existingSpecs: GeographicSiteSpecification[] = [
    {
      '@type': 'GeographicSiteSpecification',
      id: 'spec-region-id',
      href: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/spec-region-id',
      code: 'REGION',
      name: 'Região Antiga',
      category: 'Region',
      siteRole: 'grouping',
      lifecycleStatus: 'Active',
      specCharacteristic: [],
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: [],
      allowedChildSpecIds: [],
    },
  ];

  const updateSpecMock = vi.fn();
  const createSpecMock = vi.fn(async (input) => ({
    id: `new-${input.code.toLowerCase()}-id`,
    code: input.code,
    name: input.name,
  }));

  const geoService = {
    listSpecs: vi.fn(async () => existingSpecs),
    createSpec: createSpecMock,
    updateSpec: updateSpecMock,
  } as unknown as GeoService;

  const adapter = new LocationModelStudioAdapter(geoService);

  const snapshot = {
    specifications: [
      {
        code: 'REGION',
        name: 'Região Atualizada',
        category: 'Region',
        siteRole: 'grouping',
        allowedChildCodes: ['CO'],
      },
      {
        code: 'CO',
        name: 'Central Office',
        category: 'Site',
        siteRole: 'network',
        allowedParentCodes: ['REGION'],
      },
    ],
  };

  await adapter.materialize(snapshot as Record<string, unknown>, { tenantId: 'vtal' });

  // REGION existente atualizado + CO criado
  assert.equal(updateSpecMock.mock.calls.length >= 2, true);
  assert.equal(createSpecMock.mock.calls.length, 1);
});
