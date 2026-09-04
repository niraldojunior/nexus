import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { StudioRepository } from '../src/modules/studio/repository.js';
import type { IStudioRepository } from '../src/modules/studio/studio-repository-interface.js';
import type { StudioDomainAdapter } from '../src/modules/studio/domain.js';
import { StudioService } from '../src/modules/studio/service.js';

const context = {
  actorSub: 'user-1',
  tenantId: 'tenant-a',
  roles: ['studio.admin'],
  traceId: 'trace-1',
};

const createService = (repository: IStudioRepository = new StudioRepository()) => {
  const eventService = {
    appendEvent: vi.fn(async () => ({ id: 'event-1', eventTime: '2026-09-04T10:00:00.000Z' })),
  };
  return { repository, eventService, service: new StudioService(repository, eventService as never) };
};

test('StudioService creates, validates and publishes an adapter-backed draft', async () => {
  const { service, eventService } = createService();
  const materialize = vi.fn();
  const adapter: StudioDomainAdapter = {
    domain: 'resource-model',
    validate: () => ({ valid: true, issues: [], validatedAt: '2026-09-04T10:00:00.000Z' }),
    materialize,
  };
  service.registerAdapter(adapter);

  const initial = await service.getStatus('resource-model', context);
  assert.equal(initial.workspace.draftVersionId, undefined);
  assert.equal(initial.workspace.href.endsWith(`/studio/workspaces/${initial.workspace.id}`), true);

  const draft = await service.saveDraft('resource-model', { catalogId: 'fiber' }, context);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.versionNumber, 1);
  assert.equal(draft.href.endsWith(`/studio/versions/${draft.id}`), true);

  const validation = await service.validateDraft('resource-model', context);
  assert.equal(validation.valid, true);

  const published = await service.publish('resource-model', context, draft.checksum);
  assert.equal(published.status, 'published');
  assert.equal(materialize.mock.calls.length, 1);
  assert.deepEqual(materialize.mock.calls[0]?.[0], { catalogId: 'fiber' });
  assert.deepEqual(materialize.mock.calls[0]?.[1], { tenantId: 'tenant-a' });

  const status = await service.getStatus('resource-model', context);
  assert.equal(status.draftVersion, undefined);
  assert.equal(status.publishedVersion?.id, draft.id);
  assert.equal(eventService.appendEvent.mock.calls.length, 3);
  assert.equal((await service.listAudit('resource-model', context)).map((entry) => entry.action).join(','), 'published,draft-validated,draft-created');
});

test('StudioService requires an unchanged If-Match to update or discard a draft', async () => {
  const { service } = createService();
  service.registerAdapter({
    domain: 'parties',
    validate: () => ({ valid: true, issues: [], validatedAt: '2026-09-04T10:00:00.000Z' }),
    materialize: () => undefined,
  });

  const draft = await service.saveDraft('parties', { party: 'ISP Alfa' }, context);
  await assert.rejects(
    () => service.saveDraft('parties', { party: 'ISP Beta' }, context),
    (error: { code?: string }) => error.code === 'STUDIO_PRECONDITION_REQUIRED',
  );
  await assert.rejects(
    () => service.discardDraft('parties', context, 'stale-checksum'),
    (error: { code?: string }) => error.code === 'STUDIO_PRECONDITION_FAILED',
  );

  const discarded = await service.discardDraft('parties', context, draft.checksum);
  assert.equal(discarded.status, 'discarded');
  assert.equal((await service.getStatus('parties', context)).draftVersion, undefined);
});

test('StudioService isolates workspaces by tenant and blocks publication for pending adapters', async () => {
  const { service } = createService();
  const otherContext = { ...context, tenantId: 'tenant-b' };
  const draft = await service.saveDraft('templates', { name: 'Template GPON' }, context);

  assert.equal((await service.getStatus('templates', otherContext)).draftVersion, undefined);
  await assert.rejects(
    () => service.publish('templates', context, draft.checksum),
    (error: { code?: string }) => error.code === 'STUDIO_DRAFT_INVALID',
  );
});

test('StudioService rejects a stale write after the precondition passed', async () => {
  class ConcurrentStudioRepository extends StudioRepository {
    private replacement?: Promise<void>;

    public armReplacement(): void {
      this.replacement = Promise.resolve().then(async () => {
        const draft = (await this.getWorkspace('tenant-a', 'parties'))?.draftVersionId;
        if (!draft) throw new Error('draft missing');
        const current = await this.getVersion(draft, { tenantId: 'tenant-a' });
        if (!current) throw new Error('version missing');
        await super.updateVersion({ ...current, checksum: 'written-by-another-editor' });
      });
    }

    public override updateVersion(
      version: Parameters<IStudioRepository['updateVersion']>[0],
      expectedChecksum?: string,
    ) {
      if (expectedChecksum && this.replacement) {
        return this.replacement.then(() => super.updateVersion(version, expectedChecksum));
      }
      return super.updateVersion(version, expectedChecksum);
    }
  }

  const repository = new ConcurrentStudioRepository();
  const { service } = createService(repository);
  service.registerAdapter({
    domain: 'parties',
    validate: () => ({ valid: true, issues: [], validatedAt: '2026-09-04T10:00:00.000Z' }),
    materialize: () => undefined,
  });
  const draft = await service.saveDraft('parties', { party: 'ISP Alfa' }, context);
  repository.armReplacement();

  await assert.rejects(
    () => service.saveDraft('parties', { party: 'ISP Beta' }, context, draft.checksum),
    (error: { code?: string }) => error.code === 'STUDIO_PRECONDITION_FAILED',
  );
});
