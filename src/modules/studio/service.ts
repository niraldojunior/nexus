import { createHash } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { recordMutation } from '../../shared/persistence/audit-outbox.js';
import { buildHref, type EventService } from '../../shared/tmf/index.js';
import {
  createNoopStudioDomainAdapter,
  type StudioAuditEntry,
  type StudioDomain,
  type StudioDomainAdapter,
  type StudioValidationResult,
  type StudioVersion,
  type StudioWorkspace,
  STUDIO_DOMAINS,
} from './domain.js';
import { createCanonicalId } from './ids.js';
import type { IStudioRepository } from './studio-repository-interface.js';

const DEFAULT_TENANT_ID = 'default';
const tenantOf = (context?: RequestContext): string => context?.tenantId ?? DEFAULT_TENANT_ID;

const checksumOf = (snapshot: Record<string, unknown>): string =>
  createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

// `exactOptionalPropertyTypes` proíbe atribuir `draftVersionId: undefined` — omitir a chave é o
// jeito de "limpar" um campo opcional sem violar o tipo.
const withoutDraft = (workspace: StudioWorkspace): StudioWorkspace => {
  const { draftVersionId: _draftVersionId, ...rest } = workspace;
  return rest;
};

export type StudioStatus = {
  workspace: StudioWorkspace;
  publishedVersion?: StudioVersion;
  draftVersion?: StudioVersion;
};

export class StudioService {
  private readonly adapters = new Map<StudioDomain, StudioDomainAdapter>();

  constructor(
    private readonly repository: IStudioRepository,
    private readonly eventService: EventService,
    private readonly dependencies: { db?: DatabaseClient } = {},
  ) {
    // Todo domínio tem um adapter registrado desde o boot — não-implementados (PR3+) entram como
    // no-op, para que status/draft/publish já funcionem uniformemente para os 8 domínios.
    for (const domain of STUDIO_DOMAINS) {
      this.adapters.set(domain, createNoopStudioDomainAdapter(domain));
    }
  }

  /** Substitui o adapter no-op de um domínio pela implementação real, quando seu PR aterrissa. */
  public registerAdapter(adapter: StudioDomainAdapter): void {
    this.adapters.set(adapter.domain, adapter);
  }

  public async getStatus(domain: StudioDomain, context: RequestContext): Promise<StudioStatus> {
    // Consulta de reader não pode criar estado. O workspace só é persistido ao primeiro draft.
    const tenantId = tenantOf(context);
    const workspace =
      (await this.repository.getWorkspace(tenantId, domain)) ?? this.newWorkspace(domain, tenantId);
    const [publishedVersion, draftVersion] = await Promise.all([
      workspace.publishedVersionId
        ? this.repository.getVersion(workspace.publishedVersionId, { tenantId: workspace.tenantId })
        : undefined,
      workspace.draftVersionId
        ? this.repository.getVersion(workspace.draftVersionId, { tenantId: workspace.tenantId })
        : undefined,
    ]);
    return {
      workspace,
      ...(publishedVersion ? { publishedVersion } : {}),
      ...(draftVersion ? { draftVersion } : {}),
    };
  }

  public async listVersions(
    domain: StudioDomain,
    context: RequestContext,
    query?: { limit?: number; offset?: number },
  ): Promise<StudioVersion[]> {
    return await this.repository.listVersions(tenantOf(context), domain, query);
  }

  public async listAudit(
    domain: StudioDomain,
    context: RequestContext,
    query?: { limit?: number; offset?: number },
  ): Promise<StudioAuditEntry[]> {
    return await this.repository.listAudit(tenantOf(context), domain, query);
  }

  /**
   * Cria o draft (se não houver um) ou atualiza o existente. `ifMatch` é obrigatório para
   * atualizar um draft já existente — controle otimista contra duas edições concorrentes
   * sobrescreverem uma à outra silenciosamente.
   */
  public async saveDraft(
    domain: StudioDomain,
    snapshot: Record<string, unknown>,
    context: RequestContext,
    ifMatch?: string,
  ): Promise<StudioVersion> {
    return await this.repository.transaction(async () => {
      const workspace = await this.getOrCreateWorkspace(domain, context);
      const existingDraft = workspace.draftVersionId
        ? await this.repository.getVersion(workspace.draftVersionId, { tenantId: workspace.tenantId })
        : undefined;

      const now = new Date().toISOString();
      const checksum = checksumOf(snapshot);

      if (existingDraft) {
        this.assertPrecondition(existingDraft.checksum, ifMatch);
        // Snapshot mudou — a validação anterior não vale mais para o novo conteúdo.
        const { validation: _staleValidation, ...draftWithoutValidation } = existingDraft;
        const updated = await this.repository.updateVersion(
          {
            ...draftWithoutValidation,
            snapshot,
            checksum,
          },
          existingDraft.checksum,
        );
        if (!updated) this.throwPreconditionFailed();
        await this.emit('draft-updated', updated, context);
        return updated;
      }

      const versionNumber = (await this.repository.getMaxVersionNumber(workspace.tenantId, domain)) + 1;
      const id = createCanonicalId();
      const created = await this.repository.insertVersion({
        '@type': 'StudioVersion',
        id,
        href: buildHref('studioVersion', id),
        tenantId: workspace.tenantId,
        domain,
        versionNumber,
        status: 'draft',
        snapshot,
        checksum,
        ...(workspace.publishedVersionId ? { baseVersionId: workspace.publishedVersionId } : {}),
        createdAt: now,
        createdBy: context.actorSub,
      });
      try {
        await this.repository.upsertWorkspace({
          ...workspace,
          draftVersionId: created.id,
          updatedAt: now,
        });
      } catch (error) {
        // A constraint tenant+domain permite que um escritor concorrente vença sem transformar
        // a criação do primeiro draft em dois ponteiros ativos. O chamador recebe 412 e recarrega.
        if (await this.repository.getWorkspace(workspace.tenantId, domain)) {
          this.throwPreconditionFailed();
        }
        throw error;
      }
      await this.emit('draft-created', created, context);
      return created;
    });
  }

  public async validateDraft(
    domain: StudioDomain,
    context: RequestContext,
  ): Promise<StudioValidationResult> {
    return await this.repository.transaction(async () => {
      const draft = await this.requireDraft(domain, context);
      const adapter = this.adapterFor(domain);
      const validation = await adapter.validate(draft.snapshot);
      const updated = await this.repository.updateVersion({ ...draft, validation }, draft.checksum);
      if (!updated) this.throwPreconditionFailed();
      await this.emit('draft-validated', updated, context);
      return validation;
    });
  }

  public async publish(
    domain: StudioDomain,
    context: RequestContext,
    ifMatch: string,
  ): Promise<StudioVersion> {
    return await this.repository.transaction(async () => {
      const workspace = await this.getOrCreateWorkspace(domain, context);
      const draft = await this.requireDraft(domain, context);
      this.assertPrecondition(draft.checksum, ifMatch);

      const adapter = this.adapterFor(domain);
      const validation = await adapter.validate(draft.snapshot);
      if (!validation.valid) {
        const messages = validation.issues.map((issue) => issue.message).join('; ');
        throw new AppError(`studio draft has validation errors: ${messages}`, {
          code: 'STUDIO_DRAFT_INVALID',
          statusCode: 422,
        });
      }

      const now = new Date().toISOString();
      const published = await this.repository.updateVersion(
        {
          ...draft,
          status: 'published',
          validation,
          publishedAt: now,
          publishedBy: context.actorSub,
        },
        draft.checksum,
      );
      if (!published) this.throwPreconditionFailed();
      await adapter.materialize(published.snapshot, { tenantId: workspace.tenantId });
      await this.repository.upsertWorkspace({
        ...withoutDraft(workspace),
        publishedVersionId: published.id,
        updatedAt: now,
      });
      await this.emit('published', published, context);
      return published;
    });
  }

  public async discardDraft(
    domain: StudioDomain,
    context: RequestContext,
    ifMatch: string,
  ): Promise<StudioVersion> {
    return await this.repository.transaction(async () => {
      const workspace = await this.getOrCreateWorkspace(domain, context);
      const draft = await this.requireDraft(domain, context);
      this.assertPrecondition(draft.checksum, ifMatch);

      const now = new Date().toISOString();
      const discarded = await this.repository.updateVersion(
        {
          ...draft,
          status: 'discarded',
          discardedAt: now,
          discardedBy: context.actorSub,
        },
        draft.checksum,
      );
      if (!discarded) this.throwPreconditionFailed();
      await this.repository.upsertWorkspace({
        ...withoutDraft(workspace),
        updatedAt: now,
      });
      await this.emit('discarded', discarded, context);
      return discarded;
    });
  }

  private adapterFor(domain: StudioDomain): StudioDomainAdapter {
    const adapter = this.adapters.get(domain);
    if (!adapter) {
      throw new AppError('studio domain not registered', {
        code: 'STUDIO_DOMAIN_NOT_REGISTERED',
        statusCode: 500,
      });
    }
    return adapter;
  }

  private async requireDraft(domain: StudioDomain, context: RequestContext): Promise<StudioVersion> {
    const workspace = await this.getOrCreateWorkspace(domain, context);
    const draft = workspace.draftVersionId
      ? await this.repository.getVersion(workspace.draftVersionId, { tenantId: workspace.tenantId })
      : undefined;
    if (!draft) {
      throw new AppError('no draft to act on', { code: 'STUDIO_NO_DRAFT', statusCode: 404 });
    }
    return draft;
  }

  private assertPrecondition(currentChecksum: string, ifMatch: string | undefined): void {
    if (!ifMatch) {
      throw new AppError('If-Match precondition required', {
        code: 'STUDIO_PRECONDITION_REQUIRED',
        statusCode: 428,
      });
    }
    if (ifMatch !== currentChecksum) this.throwPreconditionFailed();
  }

  private throwPreconditionFailed(): never {
    throw new AppError('draft was changed by someone else — reload and try again', {
      code: 'STUDIO_PRECONDITION_FAILED',
      statusCode: 412,
    });
  }

  private async getOrCreateWorkspace(
    domain: StudioDomain,
    context: RequestContext,
  ): Promise<StudioWorkspace> {
    const tenantId = tenantOf(context);
    const existing = await this.repository.getWorkspace(tenantId, domain);
    if (existing) return existing;
    return await this.repository.upsertWorkspace(this.newWorkspace(domain, tenantId));
  }

  private newWorkspace(domain: StudioDomain, tenantId: string): StudioWorkspace {
    const id = createCanonicalId();
    return {
      '@type': 'StudioWorkspace',
      id,
      href: buildHref('studioWorkspace', id),
      tenantId,
      domain,
      updatedAt: new Date().toISOString(),
    };
  }

  private async emit(
    action: StudioAuditEntry['action'],
    version: StudioVersion,
    context: RequestContext,
  ): Promise<void> {
    const eventTypeByAction: Record<StudioAuditEntry['action'], string> = {
      'draft-created': 'StudioDraftCreatedEvent',
      'draft-updated': 'StudioDraftUpdatedEvent',
      'draft-validated': 'StudioDraftValidatedEvent',
      published: 'StudioVersionPublishedEvent',
      discarded: 'StudioVersionDiscardedEvent',
    };

    const event = await this.eventService.appendEvent({
      eventType: eventTypeByAction[action],
      source: `studio.${version.domain}`,
      correlationId: version.id,
      eventData: {
        entityId: version.id,
        entityType: 'StudioVersion',
        payload: { domain: version.domain, versionNumber: version.versionNumber, status: version.status },
      },
    });

    await this.repository.appendAudit({
      '@type': 'StudioAuditEntry',
      id: createCanonicalId(),
      tenantId: version.tenantId,
      domain: version.domain,
      action,
      versionId: version.id,
      versionNumber: version.versionNumber,
      actorSub: context.actorSub,
      eventTime: event.eventTime,
    });

    if (this.dependencies.db) {
      await recordMutation(this.dependencies.db, context, {
        action: action === 'draft-created' ? 'create' : 'update',
        entityType: 'StudioVersion',
        entityId: version.id,
        after: { domain: version.domain, versionNumber: version.versionNumber, status: version.status },
        event,
        topic: 'tmf688.studio',
      });
    }
  }
}
