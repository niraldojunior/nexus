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

test('LocationModelStudioAdapter rejects duplicate codes, invalid categories and dangling containment refs', async () => {
  const geoService = {} as unknown as GeoService;
  const adapter = new LocationModelStudioAdapter(geoService);

  const invalidSnapshot = {
    specifications: [
      {
        code: 'REGION',
        name: 'Região A',
        category: 'Region',
        siteRole: 'grouping',
        // Region→Region é o modelo canônico (RF-004: Continente > País > Estado > ... > Bairro),
        // não deve ser rejeitado como auto-referência inválida.
        allowedParentCodes: ['REGION'],
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
  assert.equal(codes.includes('CONTAINMENT_SELF_REFERENCE'), false);
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

test('LocationModelStudioAdapter does not update specifications when the snapshot is unchanged', async () => {
  const existingSpecs: GeographicSiteSpecification[] = [
    {
      '@type': 'GeographicSiteSpecification',
      id: 'region-id',
      href: '/v1/geo/site-specifications/region-id',
      code: 'REGION',
      name: 'Região',
      category: 'Region',
      siteRole: 'grouping',
      lifecycleStatus: 'Active',
      specCharacteristic: [],
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: [],
      allowedChildSpecIds: ['site-id'],
    },
    {
      '@type': 'GeographicSiteSpecification',
      id: 'site-id',
      href: '/v1/geo/site-specifications/site-id',
      code: 'SITE',
      name: 'Local',
      category: 'Site',
      siteRole: 'network',
      lifecycleStatus: 'Active',
      specCharacteristic: [],
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: ['region-id'],
      allowedChildSpecIds: [],
    },
  ];
  const geoService = {
    listSpecs: vi.fn(async () => existingSpecs),
    createSpec: vi.fn(),
    updateSpec: vi.fn(),
  } as unknown as GeoService;

  await new LocationModelStudioAdapter(geoService).materialize(
    {
      specifications: [
        {
          code: 'REGION',
          name: 'Região',
          category: 'Region',
          siteRole: 'grouping',
          allowedChildCodes: ['SITE'],
        },
        {
          code: 'SITE',
          name: 'Local',
          category: 'Site',
          siteRole: 'network',
          allowedParentCodes: ['REGION'],
        },
      ],
    },
    { tenantId: 'vtal' },
  );

  assert.equal(vi.mocked(geoService.createSpec).mock.calls.length, 0);
  assert.equal(vi.mocked(geoService.updateSpec).mock.calls.length, 0);
});

test('LocationModelStudioAdapter permite remover containment que o snapshot não declara', async () => {
  // O snapshot publicado é a fonte de verdade do catálogo. Regras históricas de bootstrap não
  // podem ser reintroduzidas automaticamente quando foram removidas pelo editor governado.
  const existingSpecs: GeographicSiteSpecification[] = [
    {
      '@type': 'GeographicSiteSpecification',
      id: 'spec-region-id',
      href: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/spec-region-id',
      code: 'REGION',
      name: 'Região',
      category: 'Region',
      siteRole: 'grouping',
      lifecycleStatus: 'Active',
      specCharacteristic: [],
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: ['spec-region-id'],
      allowedChildSpecIds: ['spec-region-id', 'spec-co-id'],
      // Bootstrap protege tanto o auto-containment (Region→Region) quanto Region→CO.
      _protectedAllowedParentSpecIds: ['spec-region-id'],
      _protectedAllowedChildSpecIds: ['spec-region-id', 'spec-co-id'],
    },
    {
      '@type': 'GeographicSiteSpecification',
      id: 'spec-co-id',
      href: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/spec-co-id',
      code: 'CO',
      name: 'Central Office',
      category: 'Site',
      siteRole: 'network',
      lifecycleStatus: 'Active',
      specCharacteristic: [],
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: ['spec-region-id'],
      allowedChildSpecIds: [],
      _protectedAllowedParentSpecIds: ['spec-region-id'],
      _protectedAllowedChildSpecIds: [],
    },
  ];

  const updateSpecCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const geoService = {
    listSpecs: vi.fn(async () => existingSpecs),
    createSpec: vi.fn(),
    updateSpec: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      updateSpecCalls.push({ id, patch });
      return existingSpecs.find((s) => s.id === id);
    }),
  } as unknown as GeoService;

  const adapter = new LocationModelStudioAdapter(geoService);

  // O snapshot remove explicitamente o containment REGION → CO.
  const incompleteSnapshot = {
    specifications: [
      {
        code: 'REGION',
        name: 'Região',
        category: 'Region',
        siteRole: 'grouping',
        allowedParentCodes: [],
        allowedChildCodes: [],
      },
      {
        code: 'CO',
        name: 'Central Office',
        category: 'Site',
        siteRole: 'network',
        allowedParentCodes: [],
      },
    ],
  };

  await adapter.materialize(incompleteSnapshot as Record<string, unknown>, { tenantId: 'vtal' });

  const regionUpdate = updateSpecCalls.find(
    (c) => c.id === 'spec-region-id' && 'allowedChildSpecIds' in c.patch,
  );
  assert.ok(regionUpdate, 'REGION deveria receber update de containment');
  assert.deepEqual(new Set(regionUpdate!.patch.allowedChildSpecIds as string[]), new Set());

  const coUpdate = updateSpecCalls.find(
    (c) => c.id === 'spec-co-id' && 'allowedParentSpecIds' in c.patch,
  );
  assert.ok(coUpdate, 'CO deveria receber update de containment');
  assert.deepEqual(new Set(coUpdate!.patch.allowedParentSpecIds as string[]), new Set());
});

test('LocationModelStudioAdapter rejeita estratégia de migração desconhecida antes de materializar', async () => {
  const geoService = {
    listSpecs: vi.fn(),
    createSpec: vi.fn(),
    updateSpec: vi.fn(),
  } as unknown as GeoService;
  const adapter = new LocationModelStudioAdapter(geoService);

  const snapshot = {
    specifications: [
      {
        code: 'CO',
        name: 'Central Office',
        category: 'Site',
        siteRole: 'network',
        migrationStrategy: { type: 'dropExistingSites' },
      },
    ],
  };

  const result = await adapter.validate(snapshot as Record<string, unknown>);
  assert.equal(result.valid, false);
  assert.equal(
    result.issues.some((issue) => issue.code === 'SPEC_MIGRATION_STRATEGY_INVALID'),
    true,
  );

  await assert.rejects(
    () => adapter.materialize(snapshot as Record<string, unknown>, { tenantId: 'vtal' }),
    /STUDIO_MATERIALIZE_INVALID|inválido para publicação/,
  );
  // Nada é tocado: a publicação falha antes de qualquer escrita parcial.
  assert.equal(vi.mocked(geoService.listSpecs).mock.calls.length, 0);
  assert.equal(vi.mocked(geoService.createSpec).mock.calls.length, 0);
  assert.equal(vi.mocked(geoService.updateSpec).mock.calls.length, 0);
});

test('LocationModelStudioAdapter encaminha a estratégia de migração ao atualizar spec existente', async () => {
  const existingSpecs: GeographicSiteSpecification[] = [
    {
      '@type': 'GeographicSiteSpecification',
      id: 'spec-co-id',
      href: '/v1/geo/site-specifications/spec-co-id',
      code: 'CO',
      name: 'Central Office',
      category: 'Site',
      siteRole: 'network',
      lifecycleStatus: 'Active',
      specCharacteristic: [],
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: [],
      allowedChildSpecIds: [],
    },
  ];

  const updateSpecCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const geoService = {
    listSpecs: vi.fn(async () => existingSpecs),
    createSpec: vi.fn(),
    updateSpec: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      updateSpecCalls.push({ id, patch });
      return existingSpecs.find((s) => s.id === id);
    }),
  } as unknown as GeoService;

  const adapter = new LocationModelStudioAdapter(geoService);

  await adapter.materialize(
    {
      specifications: [
        {
          code: 'CO',
          name: 'Central Office',
          category: 'Site',
          siteRole: 'network',
          specCharacteristic: [
            { name: 'capacidade', valueType: 'integer', mandatory: true, defaultValue: 12 },
          ],
          migrationStrategy: { type: 'fillMissingWithDefault' },
        },
      ],
    } as Record<string, unknown>,
    { tenantId: 'vtal' },
  );

  const metadataUpdate = updateSpecCalls.find(
    (call) => call.id === 'spec-co-id' && 'specCharacteristic' in call.patch,
  );
  assert.ok(metadataUpdate, 'CO deveria receber update de metadados');
  assert.deepEqual(metadataUpdate!.patch.migrationStrategy, { type: 'fillMissingWithDefault' });
});

test('LocationModelStudioAdapter não encaminha estratégia de migração ao criar spec nova', async () => {
  const createSpecCalls: Array<Record<string, unknown>> = [];
  const geoService = {
    listSpecs: vi.fn(async () => [] as GeographicSiteSpecification[]),
    createSpec: vi.fn(async (input: Record<string, unknown>) => {
      createSpecCalls.push(input);
      return { id: 'new-co-id', code: input.code, name: input.name };
    }),
    updateSpec: vi.fn(),
  } as unknown as GeoService;

  const adapter = new LocationModelStudioAdapter(geoService);

  await adapter.materialize(
    {
      specifications: [
        {
          code: 'CO',
          name: 'Central Office',
          category: 'Site',
          siteRole: 'network',
          specCharacteristic: [{ name: 'capacidade', valueType: 'integer', mandatory: true }],
          migrationStrategy: { type: 'fillMissingWithDefault' },
        },
      ],
    } as Record<string, unknown>,
    { tenantId: 'vtal' },
  );

  assert.equal(createSpecCalls.length, 1);
  assert.equal('migrationStrategy' in createSpecCalls[0]!, false);
  assert.equal(vi.mocked(geoService.updateSpec).mock.calls.length, 0);
});

test('LocationModelStudioAdapter encaminha mudança de categoria de uma spec existente ao materializar', async () => {
  const existingSpecs: GeographicSiteSpecification[] = [
    {
      '@type': 'GeographicSiteSpecification',
      id: 'spec-co-id',
      href: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/spec-co-id',
      code: 'CO',
      name: 'Central Office',
      category: 'Site',
      siteRole: 'network',
      lifecycleStatus: 'Active',
      specCharacteristic: [],
      allowedParentSpec: [],
      allowedChildSpec: [],
      allowedParentSpecIds: [],
      allowedChildSpecIds: [],
    },
  ];

  const updateSpecCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const geoService = {
    listSpecs: vi.fn(async () => existingSpecs),
    createSpec: vi.fn(),
    updateSpec: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      updateSpecCalls.push({ id, patch });
      return existingSpecs.find((s) => s.id === id);
    }),
  } as unknown as GeoService;

  const adapter = new LocationModelStudioAdapter(geoService);

  // O draft recategoriza CO de Site para Region antes de publicar.
  const snapshot = {
    specifications: [
      {
        code: 'CO',
        name: 'Central Office',
        category: 'Region',
        siteRole: 'network',
      },
    ],
  };

  await adapter.materialize(snapshot as Record<string, unknown>, { tenantId: 'vtal' });

  const metadataUpdate = updateSpecCalls.find(
    (c) => c.id === 'spec-co-id' && 'category' in c.patch,
  );
  assert.ok(metadataUpdate, 'CO deveria receber update com a nova categoria');
  assert.equal(metadataUpdate!.patch.category, 'Region');
});
