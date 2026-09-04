import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { GeoRepository, GeoService } from '../src/modules/geo/index.js';
import { StudioRepository } from '../src/modules/studio/repository.js';
import { StudioService } from '../src/modules/studio/service.js';
import {
  isStudioSpatialCoverage,
  SpatialStudioAdapter,
  type SpatialStudioSnapshot,
} from '../src/modules/studio/adapters/spatial-studio-adapter.js';

const context = {
  actorSub: 'studio-admin',
  tenantId: 'vtal',
  roles: ['studio.admin', 'inventory.reader', 'inventory.editor', 'geo.admin'],
  traceId: 'trace-spatial-studio',
};

const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-43.2, -22.9],
      [-43.19, -22.9],
      [-43.19, -22.89],
      [-43.2, -22.9],
    ],
  ],
} satisfies { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };

const createServices = () => {
  const geoService = new GeoService(new GeoRepository());
  const eventService = {
    appendEvent: vi.fn(async () => ({ id: 'event-1', eventTime: '2026-09-04T12:00:00.000Z' })),
  };
  const studioService = new StudioService(new StudioRepository(), eventService as never);
  const adapter = new SpatialStudioAdapter(geoService);
  studioService.registerAdapter(adapter);
  return { geoService, studioService, adapter };
};

test('SpatialStudioAdapter validates coverage snapshots', async () => {
  const { adapter } = createServices();
  const valid = await adapter.validate({
    coverages: [{ key: 'niteroi-norte', name: 'Niterói Norte', coverageType: 'operational', geometry: polygon }],
  });
  assert.equal(valid.valid, true);

  const invalid = await adapter.validate({
    coverages: [
      { key: 'dup', name: 'Duplicada', coverageType: '', geometry: polygon },
      {
        key: 'DUP',
        name: 'duplicada',
        coverageType: 'operational',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
      },
    ],
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.issues.some((issue) => issue.code === 'SPATIAL_KEY_DUPLICATE'), true);
  assert.equal(invalid.issues.some((issue) => issue.code === 'SPATIAL_NAME_DUPLICATE'), true);
  assert.equal(invalid.issues.some((issue) => issue.code === 'SPATIAL_TYPE_REQUIRED'), true);
  assert.equal(invalid.issues.some((issue) => issue.code === 'SPATIAL_POLYGON_INVALID'), true);
});

test('SpatialStudioAdapter publishes TMF675 manual coverage and preserves derived locations', async () => {
  const { geoService, studioService } = createServices();
  const derived = await geoService.createLocation(
    {
      geometryType: 'Polygon',
      geometry: polygon,
      referencePoint: 'GPON:RJ|Niterói|Icaraí',
      characteristic: [{ group: '_coverage', name: 'kind', value: 'GponCoverage', valueType: 'string' }],
    },
    context,
  );
  const snapshot: SpatialStudioSnapshot = {
    coverages: [
      { key: 'niteroi-norte', name: 'Niterói Norte', coverageType: 'operational', geometry: polygon },
    ],
  };

  const draft = await studioService.saveDraft('spatial', snapshot as unknown as Record<string, unknown>, context);
  assert.equal((await studioService.validateDraft('spatial', context)).valid, true);
  await studioService.publish('spatial', context, draft.checksum);

  const locations = await geoService.listLocations(undefined, context);
  const coverage = locations.find(isStudioSpatialCoverage);
  assert.ok(coverage);
  assert.equal(coverage.geometryType, 'Polygon');
  assert.equal(coverage.sourceSystem, 'MANUAL');
  assert.equal(coverage.characteristic.some((item) => item.name === 'coverageType' && item.value === 'operational'), true);
  assert.equal((await geoService.getLocation(derived.id, context))?.referencePoint, derived.referencePoint);
});

test('SpatialStudioAdapter updates and soft-terminates managed coverages only', async () => {
  const { geoService, adapter } = createServices();
  const initial: SpatialStudioSnapshot = {
    coverages: [{ key: 'centro', name: 'Centro', coverageType: 'operational', geometry: polygon }],
  };
  await adapter.materialize(initial as unknown as Record<string, unknown>, context);
  const created = (await geoService.listLocations(undefined, context)).find(isStudioSpatialCoverage);
  assert.ok(created);

  await adapter.materialize(
    {
      coverages: [
        {
          id: created.id,
          key: 'centro',
          name: 'Centro Expandido',
          coverageType: 'expansion',
          geometry: polygon,
        },
      ],
    },
    context,
  );
  const updated = await geoService.getLocation(created.id, context);
  assert.equal(updated?.characteristic.some((item) => item.name === 'name' && item.value === 'Centro Expandido'), true);

  await adapter.materialize({ coverages: [] }, context);
  assert.ok((await geoService.getLocation(created.id, context))?.validFor?.endDateTime);
});
