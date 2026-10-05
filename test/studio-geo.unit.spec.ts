import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { StudioAssetRepository } from '../src/modules/studio/asset-repository.js';
import {
  STUDIO_ASSET_MIME_TYPE,
  StudioAssetService,
  sanitizeStudioSvg,
} from '../src/modules/studio/asset-service.js';
import {
  CANONICAL_STUDIO_GEO_SNAPSHOT,
  normalizeStudioGeoSnapshot,
  resolveStudioGeoLineLods,
  StudioGeoAdapter,
} from '../src/modules/studio/adapters/studio-geo-adapter.js';
import { StudioRepository } from '../src/modules/studio/repository.js';
import { StudioService } from '../src/modules/studio/service.js';

const context = {
  actorSub: 'studio-admin',
  tenantId: 'vtal',
  roles: ['studio.admin', 'platform.admin'],
  traceId: 'studio-geo-test',
};

const eventService = {
  appendEvent: vi.fn(async () => ({ id: 'event-1', eventTime: '2026-09-10T12:00:00.000Z' })),
};

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>';
const noResourceTypes = async () => [];
const noRegionSpecs = async () => [];

test('Studio SVG sanitizer accepts a self-contained SVG and rejects active content', () => {
  assert.equal(sanitizeStudioSvg(svg), svg);
  assert.throws(
    () => sanitizeStudioSvg('<svg><script>alert(1)</script></svg>'),
    (error: { code?: string }) => error.code === 'STUDIO_ASSET_SVG_UNSAFE',
  );
  assert.throws(
    () => sanitizeStudioSvg('<svg><use href="https://example.test/icon.svg"/></svg>'),
    (error: { code?: string }) => error.code === 'STUDIO_ASSET_SVG_UNSAFE',
  );
  assert.throws(
    () => sanitizeStudioSvg('<svg onload="alert(1)"></svg>'),
    (error: { code?: string }) => error.code === 'STUDIO_ASSET_SVG_UNSAFE',
  );
});

test('Studio assets are tenant-scoped and soft-retired', async () => {
  const service = new StudioAssetService(new StudioAssetRepository());
  const created = await service.create(
    { name: 'Ícone CDO', mimeType: STUDIO_ASSET_MIME_TYPE, content: svg },
    context,
  );
  assert.equal((await service.list(context)).length, 1);
  assert.equal(await service.get(created.id, { tenantId: 'other' }), undefined);
  const retired = await service.retire(created.id, context);
  assert.equal(retired.active, false);
  assert.equal((await service.list(context)).length, 0);
});

test('Studio GEO adapter validates canonical hierarchy and rejects duplicate entity references', async () => {
  const adapter = new StudioGeoAdapter(noResourceTypes, noRegionSpecs);
  const valid = await adapter.validate(CANONICAL_STUDIO_GEO_SNAPSHOT);
  assert.equal(valid.valid, true);

  const firstEntity = CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.find((node) => node.kind === 'ENTITY');
  assert.ok(firstEntity);
  const invalid = await adapter.validate({
    ...CANONICAL_STUDIO_GEO_SNAPSHOT,
    nodes: [
      ...CANONICAL_STUDIO_GEO_SNAPSHOT.nodes,
      { ...firstEntity, id: 'duplicate-entity', sortOrder: 999 },
    ],
  });
  assert.equal(invalid.valid, false);
  assert.equal(
    invalid.issues.some((issue) => issue.code === 'STUDIO_GEO_ENTITY_REFERENCE_DUPLICATE'),
    true,
  );
});

test('Studio GEO normalizes v2 point identity away while preserving contextual style', async () => {
  const adapter = new StudioGeoAdapter(noResourceTypes, noRegionSpecs);
  const base = CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.find((node) => node.kind === 'ENTITY');
  assert.ok(base);
  const snapshot = {
    schemaVersion: 2 as const,
    nodes: CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.map((node) =>
      node.id === base.id
        ? {
            ...node,
            assetId: 'asset-at-node',
            visualConfig: {
              geometryKind: 'POINT' as const,
              iconCode: 'CO',
              assetId: 'asset-in-style',
              color: {
                mode: 'fixed' as const,
                defaultColor: '#10b981',
                statusColors: {
                  Planned: '#f59e0b',
                  InConstruction: '#2563eb',
                  Active: '#047857',
                  InDeactivation: '#ef4444',
                  Retired: '#64748b',
                },
              },
              opacity: 1,
              scaleBands: {
                le5m: { visible: true, sizePx: 24 },
                le10m: { visible: true, sizePx: 24 },
                le20m: { visible: true, sizePx: 24 },
                le50m: { visible: true, sizePx: 20 },
                le100m: { visible: true, sizePx: 18 },
                le500m: { visible: true, sizePx: 16 },
                le1km: { visible: true, sizePx: 14 },
                gt1km: { visible: false, sizePx: 12 },
              },
            },
          }
        : node,
    ),
  };

  const normalized = normalizeStudioGeoSnapshot(snapshot);
  assert.equal(normalized.schemaVersion, 3);
  assert.equal(normalized.nodes.length, snapshot.nodes.length);
  const normalizedBase = normalized.nodes.find((node) => node.id === base.id);
  assert.ok(normalizedBase?.kind === 'ENTITY');
  assert.equal('assetId' in normalizedBase, false);
  assert.equal(normalizedBase.visualConfig?.geometryKind, 'POINT');
  assert.equal('iconCode' in (normalizedBase.visualConfig ?? {}), false);
  assert.equal('assetId' in (normalizedBase.visualConfig ?? {}), false);
  assert.equal((await adapter.validate(normalized)).valid, true);

  const invalid = await adapter.validate({
    ...normalized,
    nodes: normalized.nodes.map((node) => {
      if (node.kind !== 'ENTITY' || node.id !== base.id) return node;
      const visualConfig = node.visualConfig;
      if (!visualConfig || visualConfig.geometryKind !== 'POINT') return node;
      return { ...node, visualConfig: { ...visualConfig, scaleBands: {} } };
    }),
  });
  assert.equal(invalid.valid, false);
  assert.equal(
    invalid.issues.some((issue) => issue.code === 'STUDIO_GEO_POINT_SCALE_BAND_INVALID'),
    true,
  );
});

test('Studio GEO bootstrap publishes only once and keeps the published snapshot isolated from draft', async () => {
  const studio = new StudioService(new StudioRepository(), eventService as never);
  studio.registerAdapter(new StudioGeoAdapter(noResourceTypes, noRegionSpecs));
  const first = await studio.ensurePublishedBootstrap(
    'studio-geo',
    CANONICAL_STUDIO_GEO_SNAPSHOT,
    context,
  );
  const second = await studio.ensurePublishedBootstrap(
    'studio-geo',
    { groups: [], layers: [] },
    context,
  );
  assert.equal(first.id, second.id);

  const draft = await studio.saveDraft('studio-geo', { groups: [], layers: [] }, context);
  assert.equal((await studio.getPublishedVersion('studio-geo', context))?.id, first.id);
  assert.equal(draft.status, 'draft');
  assert.deepEqual(draft.snapshot, { schemaVersion: 3, nodes: [] });
  assert.deepEqual(draft.baselineSnapshot, { schemaVersion: 3, nodes: [] });
});

test('Studio GEO materialize rejects a COVERAGE node whose sourceId is not a Region spec', async () => {
  const regionSpec = { id: 'spec-region-1', code: 'GPON_COVERAGE', category: 'Region' } as never;
  const adapterWithRegion = new StudioGeoAdapter(noResourceTypes, async () => [regionSpec]);
  const adapterWithoutRegion = new StudioGeoAdapter(noResourceTypes, noRegionSpecs);

  const coverageNode = {
    id: 'coverage-region',
    kind: 'ENTITY' as const,
    parentNodeId: 'coverage',
    label: 'Cobertura por Região',
    sortOrder: 20,
    active: true,
    defaultVisible: true,
    entity: {
      category: 'COVERAGE' as const,
      sourceDomain: 'location-model' as const,
      sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION' as const,
      sourceId: 'GPON_COVERAGE',
    },
  };
  const snapshot = {
    ...CANONICAL_STUDIO_GEO_SNAPSHOT,
    nodes: [...CANONICAL_STUDIO_GEO_SNAPSHOT.nodes, coverageNode],
  };

  // Spec existe no catálogo: materializa sem erro.
  await adapterWithRegion.materialize(snapshot, { tenantId: context.tenantId });

  // Spec não existe: rejeitado com o código dedicado, não publica silenciosamente.
  await assert.rejects(
    adapterWithoutRegion.materialize(snapshot, { tenantId: context.tenantId }),
    (error: { code?: string }) => error.code === 'STUDIO_GEO_COVERAGE_SOURCE_INVALID',
  );

  // O nó canônico GPON_AGGREGATE do bootstrap não referencia spec — segue sem checagem.
  await adapterWithoutRegion.materialize(CANONICAL_STUDIO_GEO_SNAPSHOT, {
    tenantId: context.tenantId,
  });
});

test('Studio GEO adapter valida tileZoom e simplifyToleranceMeters das camadas LINE', async () => {
  const adapter = new StudioGeoAdapter(noResourceTypes, noRegionSpecs);
  const base = CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.find(
    (node) => node.kind === 'ENTITY' && node.entity.category === 'RESOURCE',
  );
  assert.ok(base?.kind === 'ENTITY');
  const bands = Object.fromEntries(
    ['le5m', 'le10m', 'le20m', 'le50m', 'le100m', 'le500m', 'le1km', 'gt1km'].map((key) => [
      key,
      { visible: true, strokeWidth: 2 },
    ]),
  );
  const withConfig = (extra: Record<string, unknown>) => ({
    ...CANONICAL_STUDIO_GEO_SNAPSHOT,
    nodes: CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.map((node) =>
      node.id === base.id
        ? {
            ...node,
            visualConfig: {
              geometryKind: 'LINE',
              stroke: { mode: 'fixed', defaultColor: '#123456', statusColors: {} },
              strokeStyle: 'solid',
              opacity: 1,
              scaleBands: bands,
              ...extra,
            },
          }
        : node,
    ),
  });
  const codes = async (extra: Record<string, unknown>) =>
    (await adapter.validate(withConfig(extra) as never)).issues.map((issue) => issue.code);

  assert.deepEqual(await codes({}), []);
  assert.deepEqual(await codes({ tileZoom: 10, simplifyToleranceMeters: 20 }), []);
  assert.ok((await codes({ tileZoom: 5 })).includes('STUDIO_GEO_LINE_TILE_ZOOM_INVALID'));
  assert.ok((await codes({ tileZoom: 10.5 })).includes('STUDIO_GEO_LINE_TILE_ZOOM_INVALID'));
  assert.ok(
    (await codes({ simplifyToleranceMeters: 501 })).includes(
      'STUDIO_GEO_LINE_SIMPLIFY_TOLERANCE_INVALID',
    ),
  );
  const normalized = normalizeStudioGeoSnapshot(
    withConfig({ tileZoom: 10, simplifyToleranceMeters: 20 }) as never,
  );
  const kept = normalized.nodes.find((node) => node.id === base.id);
  assert.ok(kept?.kind === 'ENTITY' && kept.visualConfig?.geometryKind === 'LINE');
  assert.equal(kept.visualConfig.tileZoom, 10);
  assert.equal(kept.visualConfig.simplifyToleranceMeters, 20);
});

test('Studio GEO adapter valida e resolve perfis de LOD das camadas LINE', async () => {
  const adapter = new StudioGeoAdapter(noResourceTypes, noRegionSpecs);
  const base = CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.find(
    (node) => node.kind === 'ENTITY' && node.entity.category === 'RESOURCE',
  );
  assert.ok(base?.kind === 'ENTITY');
  const keys = ['le5m', 'le10m', 'le20m', 'le50m', 'le100m', 'le500m', 'le1km', 'gt1km'] as const;
  const bandsWith = (lodByBand: Record<string, string | undefined> = {}) =>
    Object.fromEntries(
      keys.map((key) => [
        key,
        {
          visible: true,
          strokeWidth: 2,
          ...(lodByBand[key] ? { lodProfileId: lodByBand[key] } : {}),
        },
      ]),
    );
  const withConfig = (extra: Record<string, unknown>, bands = bandsWith()) => ({
    ...CANONICAL_STUDIO_GEO_SNAPSHOT,
    nodes: CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.map((node) =>
      node.id === base.id
        ? {
            ...node,
            visualConfig: {
              geometryKind: 'LINE',
              stroke: { mode: 'fixed', defaultColor: '#123456', statusColors: {} },
              strokeStyle: 'solid',
              opacity: 1,
              scaleBands: bands,
              ...extra,
            },
          }
        : node,
    ),
  });
  const codes = async (extra: Record<string, unknown>, bands = bandsWith()) =>
    (await adapter.validate(withConfig(extra, bands) as never)).issues.map((issue) => issue.code);
  const profiles = [
    { id: 'overview', tileZoom: 6, simplifyToleranceMeters: 500 },
    { id: 'detail', tileZoom: 12, simplifyToleranceMeters: 5 },
  ];

  assert.deepEqual(
    await codes({ lodProfiles: profiles }, bandsWith({ gt1km: 'overview', le5m: 'detail' })),
    [],
  );
  assert.ok((await codes({ lodProfiles: [] })).includes('STUDIO_GEO_LINE_LOD_PROFILES_INVALID'));
  assert.ok(
    (await codes({ lodProfiles: [profiles[0], profiles[0]] })).includes(
      'STUDIO_GEO_LINE_LOD_ID_DUPLICATE',
    ),
  );
  assert.ok(
    (await codes({ lodProfiles: [{ ...profiles[0], id: 'Bad Id' }] })).includes(
      'STUDIO_GEO_LINE_LOD_ID_INVALID',
    ),
  );
  assert.ok(
    (await codes({ lodProfiles: [{ ...profiles[0], tileZoom: 17 }] })).includes(
      'STUDIO_GEO_LINE_TILE_ZOOM_INVALID',
    ),
  );
  assert.ok(
    (await codes({ lodProfiles: [{ ...profiles[0], simplifyToleranceMeters: 501 }] })).includes(
      'STUDIO_GEO_LINE_SIMPLIFY_TOLERANCE_INVALID',
    ),
  );
  assert.ok(
    (await codes({ lodProfiles: profiles }, bandsWith({ gt1km: 'missing' }))).includes(
      'STUDIO_GEO_LINE_LOD_PROFILE_UNKNOWN',
    ),
  );
  // Sem lodProfiles só o perfil legado implícito é referenciável.
  assert.deepEqual(await codes({}, bandsWith({ gt1km: 'legacy' })), []);
  assert.ok(
    (await codes({}, bandsWith({ gt1km: 'overview' }))).includes(
      'STUDIO_GEO_LINE_LOD_PROFILE_UNKNOWN',
    ),
  );

  const normalized = normalizeStudioGeoSnapshot(
    withConfig({ lodProfiles: profiles }, bandsWith({ gt1km: 'overview' })) as never,
  );
  const kept = normalized.nodes.find((node) => node.id === base.id);
  assert.ok(kept?.kind === 'ENTITY' && kept.visualConfig?.geometryKind === 'LINE');
  assert.deepEqual(kept.visualConfig.lodProfiles, profiles);
  assert.equal(kept.visualConfig.scaleBands.gt1km.lodProfileId, 'overview');
  assert.equal(kept.visualConfig.scaleBands.le5m.lodProfileId, undefined);
});

test('resolveStudioGeoLineLods normaliza o legado para o perfil único e escolhe por faixa', () => {
  const bands = Object.fromEntries(
    ['le5m', 'le10m', 'le20m', 'le50m', 'le100m', 'le500m', 'le1km', 'gt1km'].map((key) => [
      key,
      { visible: true, strokeWidth: 2 },
    ]),
  ) as never;

  const legacy = resolveStudioGeoLineLods({
    tileZoom: 10,
    simplifyToleranceMeters: 20,
    scaleBands: bands,
  });
  assert.deepEqual(legacy.profiles, [{ id: 'legacy', tileZoom: 10, simplifyToleranceMeters: 20 }]);
  assert.equal(legacy.profileByBand.gt1km, legacy.profiles[0]);
  assert.equal(legacy.profileByBand.le5m, legacy.profiles[0]);

  const defaults = resolveStudioGeoLineLods({ scaleBands: bands });
  assert.deepEqual(defaults.profiles, [{ id: 'legacy', tileZoom: 16, simplifyToleranceMeters: 0 }]);

  const overview = { id: 'overview', tileZoom: 6, simplifyToleranceMeters: 500 };
  const detail = { id: 'detail', tileZoom: 12, simplifyToleranceMeters: 5 };
  const multi = resolveStudioGeoLineLods({
    lodProfiles: [overview, detail],
    scaleBands: {
      ...(bands as object),
      gt1km: { visible: true, strokeWidth: 1, lodProfileId: 'overview' },
      le5m: { visible: true, strokeWidth: 2, lodProfileId: 'detail' },
    } as never,
  });
  assert.equal(multi.profileByBand.gt1km, overview);
  assert.equal(multi.profileByBand.le5m, detail);
  // Faixa sem lodProfileId usa o primeiro perfil.
  assert.equal(multi.profileByBand.le50m, overview);
});
