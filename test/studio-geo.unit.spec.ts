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
  const created = await service.create({ name: 'Ícone CDO', mimeType: STUDIO_ASSET_MIME_TYPE, content: svg }, context);
  assert.equal((await service.list(context)).length, 1);
  assert.equal(await service.get(created.id, { tenantId: 'other' }), undefined);
  const retired = await service.retire(created.id, context);
  assert.equal(retired.active, false);
  assert.equal((await service.list(context)).length, 0);
});

test('Studio GEO adapter validates canonical hierarchy and rejects duplicate entity references', async () => {
  const adapter = new StudioGeoAdapter(async () => true);
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
  assert.equal(invalid.issues.some((issue) => issue.code === 'STUDIO_GEO_ENTITY_REFERENCE_DUPLICATE'), true);
});

test('Studio GEO validates visual point configuration and its published asset reference', async () => {
  const adapter = new StudioGeoAdapter(async (tenantId, assetId) => tenantId === 'vtal' && assetId === 'asset-ok');
  const base = CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.find((node) => node.kind === 'ENTITY');
  assert.ok(base);
  const snapshot = {
    schemaVersion: 2 as const,
    nodes: CANONICAL_STUDIO_GEO_SNAPSHOT.nodes.map((node) =>
      node.id === base.id
        ? {
            ...node,
            visualConfig: {
              geometryKind: 'POINT' as const,
              iconCode: 'CO',
              assetId: 'asset-missing',
              scaleBands: {
                le5m: { visible: true, sizePx: 24 }, le10m: { visible: true, sizePx: 24 },
                le20m: { visible: true, sizePx: 24 }, le50m: { visible: true, sizePx: 20 },
                le100m: { visible: true, sizePx: 18 }, le500m: { visible: true, sizePx: 16 },
                le1km: { visible: true, sizePx: 14 }, gt1km: { visible: false, sizePx: 12 },
              },
            },
          }
        : node,
    ),
  };
  assert.equal((await adapter.validate(snapshot)).valid, true);
  await assert.rejects(adapter.materialize(snapshot, { tenantId: 'vtal' }), (error: { code?: string }) => error.code === 'STUDIO_GEO_ASSET_UNAVAILABLE');

  const invalid = await adapter.validate({
    ...snapshot,
    nodes: snapshot.nodes.map((node) => {
      if (node.kind !== 'ENTITY' || node.id !== base.id) return node;
      const visualConfig = node.visualConfig;
      if (!visualConfig || visualConfig.geometryKind !== 'POINT') return node;
      return { ...node, visualConfig: { ...visualConfig, scaleBands: {} } };
    }),
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.issues.some((issue) => issue.code === 'STUDIO_GEO_POINT_SCALE_BAND_INVALID'), true);
});

test('Studio GEO bootstrap publishes only once and keeps the published snapshot isolated from draft', async () => {
  const studio = new StudioService(new StudioRepository(), eventService as never);
  studio.registerAdapter(new StudioGeoAdapter(async () => true));
  const first = await studio.ensurePublishedBootstrap('studio-geo', CANONICAL_STUDIO_GEO_SNAPSHOT, context);
  const second = await studio.ensurePublishedBootstrap('studio-geo', { groups: [], layers: [] }, context);
  assert.equal(first.id, second.id);

  const draft = await studio.saveDraft('studio-geo', { groups: [], layers: [] }, context);
  assert.equal((await studio.getPublishedVersion('studio-geo', context))?.id, first.id);
  assert.equal(draft.status, 'draft');
});
