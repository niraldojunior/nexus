import { AppError } from '../../shared/errors/app-error.js';
import {
  PROJECT_READ_ROLES,
  PROJECT_WRITE_ROLES,
  USER_ADMIN_ROLES,
} from '../../shared/http/roles.js';
import { requireRoles, type RequestContext } from '../../shared/http/request-context.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { recordMutation, type AuditAction } from '../../shared/persistence/audit-outbox.js';
import type { EventService } from '../../shared/tmf/index.js';
import type { Resource } from '../resource/domain.js';
import type { ResourceService } from '../resource/service.js';
import type {
  Project,
  ProjectRepository,
  ProjectStatus,
  ProjectStatusBehavior,
  ProjectStatusCatalogItem,
} from './project-repository.js';
import type { ProjectWorkflowService } from './project-workflow-service.js';
import type { ProjectWorkflowTransitionResult } from './project-workflow.js';
import type { GeoService } from '../geo/service.js';
import type { GeoTreeService } from '../geo/tree-service.js';
import { isProjectInfrastructureResourceType } from './project-resource-classification.js';
import { assertProjectStatusChange, assertProjectStatusCreate } from './project-status-rules.js';

// Recusa um ícone de projeto (REQ-MOD01-015) maior que este limite antes de gravar — a validação
// do cliente (web/src/utils/projectIconImage.ts) não pode ser a única barreira contra um upload
// não processado.
export const PROJECT_ICON_MAX_CHARS = 120_000;

// Mapeia o `status` legado do corpo de PATCH para o código de estado do workflow.
const LEGACY_STATUS_TO_STATE_CODE: Record<string, string> = {
  active: '22',
  suspended: '23',
  terminated: '17',
  cancelled: 'legacy-cancelled',
};
const LEGACY_DEFAULT_STATE_CODE = '11';

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'planned',
  'active',
  'suspended',
  'terminated',
  'cancelled',
];

export type CreateProjectCommand = {
  name?: unknown;
  description?: unknown;
  iconDataUrl?: unknown;
  statusCode?: unknown;
  status?: unknown;
};

export type UpdateProjectCommand = {
  name?: unknown;
  description?: unknown;
  iconDataUrl?: unknown;
  statusCode?: unknown;
  status?: unknown;
};

export type UpdateProjectResult = Project & {
  siteCascade?: ProjectWorkflowTransitionResult['siteCascade'];
  resourceCascade?: ProjectWorkflowTransitionResult['resourceCascade'];
};

type SiteAtAddressInput = Parameters<GeoService['createSiteAtAddress']>[0];

const parseLegacyStatus = (value: unknown): ProjectStatus | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value)) {
    return value as ProjectStatus;
  }
  throw new AppError('invalid project status', {
    code: 'PROJECT_STATUS_INVALID',
    statusCode: 400,
  });
};

const operationalStatusOf = (
  behavior: ProjectStatusBehavior | undefined,
): ProjectStatus | undefined => {
  if (!behavior) return undefined;
  if (behavior === 'execution') return 'active';
  if (behavior === 'suspended') return 'suspended';
  if (behavior === 'close-release') return 'terminated';
  return 'planned';
};

const isTerminal = (project: Project): boolean =>
  project.status === 'terminated' || project.status === 'cancelled';

// Casos de uso de Projeto de trabalho (REQ-MOD01-015). Estas regras viviam nas rotas de `app.ts`;
// aqui rota HTTP e tool MCP chamam o mesmo código, com a mesma checagem de papel, auditoria e
// evento TMF688. Projeto é entidade própria (não pertence a Geo; o prefixo "Geo" restante em repositório, tabelas e rotas é legado), então o evento é
// `tmf688.project` com source `project.Project`.
export class ProjectService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly repository: ProjectRepository,
    private readonly workflowService: ProjectWorkflowService,
    private readonly geoService: GeoService,
    private readonly resourceService: ResourceService,
    private readonly eventService: EventService,
    private readonly geoTreeService: GeoTreeService,
  ) {}

  public async list(context: RequestContext): Promise<Project[]> {
    requireRoles(context, PROJECT_READ_ROLES);
    return await this.repository.list(context.tenantId);
  }

  public async get(id: string, context: RequestContext): Promise<Project | undefined> {
    requireRoles(context, PROJECT_READ_ROLES);
    return (await this.repository.get(context.tenantId, id)) ?? undefined;
  }

  public async create(command: CreateProjectCommand, context: RequestContext): Promise<Project> {
    requireRoles(context, PROJECT_WRITE_ROLES);
    this.assertIconSize(command.iconDataUrl);
    const workflow = await this.workflowService.getWorkflow(context);
    if (workflow.states.length === 0 || !workflow.initialStateCode) {
      throw new AppError('project workflow is not configured', {
        code: 'PROJECT_WORKFLOW_NOT_CONFIGURED',
        statusCode: 409,
      });
    }
    const requestedStatusCode =
      command.statusCode === undefined ? workflow.initialStateCode : String(command.statusCode);
    const catalogItem = await this.repository.getStatusCatalogItem(
      context.tenantId,
      requestedStatusCode,
    );
    if (!catalogItem || !catalogItem.active) {
      throw new AppError('project status is not available', {
        code: 'PROJECT_STATUS_UNAVAILABLE',
        statusCode: 409,
      });
    }
    const workflowState = workflow.states.find((state) => state.code === requestedStatusCode);
    if (!workflowState?.active) {
      throw new AppError('project workflow state is not available', {
        code: 'PROJECT_WORKFLOW_STATE_NOT_FOUND',
        statusCode: 409,
      });
    }
    const project = await this.repository.create(context.tenantId, context.actorSub, {
      name: String(command.name ?? '').trim() || 'Projeto sem título',
      description: command.description ? String(command.description) : null,
      iconDataUrl: command.iconDataUrl ? String(command.iconDataUrl) : null,
      status:
        operationalStatusOf(catalogItem.behavior) ??
        operationalStatusOf(workflowState.behavior) ??
        parseLegacyStatus(command.status) ??
        'planned',
      statusCode: requestedStatusCode,
    });
    await this.record('create', project, context, { after: project });
    return project;
  }

  public async update(
    id: string,
    command: UpdateProjectCommand,
    context: RequestContext,
  ): Promise<UpdateProjectResult> {
    requireRoles(context, PROJECT_WRITE_ROLES);
    this.assertIconSize(command.iconDataUrl);
    const current = await this.requireProject(id, context);

    const hasMetadataUpdate =
      command.name !== undefined ||
      command.description !== undefined ||
      command.iconDataUrl !== undefined;
    let updated = current;
    if (hasMetadataUpdate) {
      const afterMeta = await this.repository.update(context.tenantId, id, {
        ...(command.name !== undefined ? { name: String(command.name).trim() } : {}),
        ...(command.description !== undefined
          ? { description: command.description ? String(command.description) : null }
          : {}),
        ...(command.iconDataUrl !== undefined
          ? { iconDataUrl: command.iconDataUrl ? String(command.iconDataUrl) : null }
          : {}),
      });
      if (!afterMeta) throw this.notFound();
      updated = afterMeta;
      await this.record('update', afterMeta, context, { before: current, after: afterMeta });
    }

    const requestedStatusCode =
      command.statusCode !== undefined
        ? String(command.statusCode)
        : command.status !== undefined
          ? (LEGACY_STATUS_TO_STATE_CODE[String(command.status)] ?? LEGACY_DEFAULT_STATE_CODE)
          : undefined;

    if (requestedStatusCode !== undefined && requestedStatusCode !== current.statusCode) {
      const transition = await this.workflowService.executeTransition(
        id,
        { targetStateCode: requestedStatusCode },
        context,
      );
      return {
        ...transition.project,
        siteCascade: transition.siteCascade,
        resourceCascade: transition.resourceCascade,
      };
    }
    return updated;
  }

  // Arquivamento é administrativo: preserva Sites, Resources e todos os vínculos históricos.
  // O ciclo de vida já deve ter chegado a um estado terminal.
  public async archive(
    id: string,
    context: RequestContext,
  ): Promise<{ archived: boolean; project: Project | null }> {
    requireRoles(context, PROJECT_WRITE_ROLES);
    const current = await this.requireProject(id, context);
    if (!isTerminal(current)) {
      throw new AppError('only terminal projects can be archived', {
        code: 'PROJECT_ARCHIVE_REQUIRES_TERMINAL_STATUS',
        statusCode: 409,
      });
    }
    const archived = await this.repository.archive(context.tenantId, id, context.actorSub);
    if (archived) {
      await this.record('delete', archived, context, { before: current, after: archived });
    }
    return { archived: Boolean(archived), project: archived ?? null };
  }

  // O local nasce com o status do projeto (herança, não escolha do formulário) — o que o cliente
  // mandar em `site.status` é ignorado de propósito.
  public async createSite(
    projectId: string,
    body: Record<string, unknown>,
    context: RequestContext,
  ) {
    requireRoles(context, PROJECT_WRITE_ROLES);
    const project = await this.requireProject(projectId, context);
    const geonetAddressId =
      typeof body.geonetAddressId === 'string' ? body.geonetAddressId.trim() : '';
    if (!geonetAddressId) {
      throw new AppError('geonet address id required to create a project site', {
        code: 'PROJECT_SITE_GEONET_ADDRESS_REQUIRED',
        statusCode: 400,
      });
    }
    const siteInput =
      body.site && typeof body.site === 'object' ? (body.site as Record<string, unknown>) : {};
    const created = await this.geoService.createSiteAtAddress(
      {
        ...(body as SiteAtAddressInput),
        site: { ...siteInput, status: project.status } as SiteAtAddressInput['site'],
      },
      context,
    );
    await this.repository.linkSite(projectId, created.site.id, { geonetAddressId });
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    if (note) await this.repository.updateSiteLink(projectId, created.site.id, { note });
    await this.record('update', project, context, {
      before: project,
      after: { projectId, linkedSiteId: created.site.id },
    });
    return created;
  }

  // Nunca aceita `status`: o local herda o do projeto; mudar isoladamente quebraria a herança.
  public async updateSite(
    projectId: string,
    siteId: string,
    body: Record<string, unknown>,
    context: RequestContext,
  ) {
    requireRoles(context, PROJECT_WRITE_ROLES);
    await this.requireSiteLink(projectId, siteId, context);
    const site = await this.geoService.updateSite(
      siteId,
      {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.siteSpecificationId !== undefined
          ? { siteSpecificationId: String(body.siteSpecificationId) }
          : {}),
      },
      context,
    );
    const note =
      body.note === null
        ? null
        : typeof body.note === 'string'
          ? body.note.trim() || null
          : undefined;
    if (note !== undefined) await this.repository.updateSiteLink(projectId, siteId, { note });
    return { site, note };
  }

  // Soft-terminate (C6) antes de desvincular, para uma falha na transição não deixar o local
  // órfão e visível.
  public async removeSite(
    projectId: string,
    siteId: string,
    context: RequestContext,
  ): Promise<void> {
    requireRoles(context, PROJECT_WRITE_ROLES);
    await this.requireSiteLink(projectId, siteId, context);
    await this.geoService.transitionSite(
      siteId,
      { status: 'Retired', statusReason: 'Local removido do projeto' },
      context,
    );
    await this.repository.unlinkSite(projectId, siteId);
  }

  public async createResource(
    projectId: string,
    body: Record<string, unknown>,
    context: RequestContext,
  ): Promise<Resource> {
    requireRoles(context, PROJECT_WRITE_ROLES);
    const project = await this.requireOpenProject(projectId, context);
    const kind =
      body['@type'] === 'LogicalResource' || body.supportingPhysicalResourceId
        ? 'LogicalResource'
        : 'PhysicalResource';
    // O recurso nasce com o estado herdado do projeto.
    const state =
      project.status === 'active'
        ? { status: 'active', administrativeState: 'unlocked', operationalState: 'enabled' }
        : project.status === 'suspended'
          ? { status: 'suspended', administrativeState: 'locked', operationalState: 'disabled' }
          : { status: 'inactive', administrativeState: 'locked', operationalState: 'disabled' };
    const created =
      kind === 'LogicalResource'
        ? await this.resourceService.createLogicalResource(
            { ...body, ...state } as Parameters<ResourceService['createLogicalResource']>[0],
            context,
          )
        : await this.resourceService.createPhysicalResource(
            { ...body, ...state } as Parameters<ResourceService['createPhysicalResource']>[0],
            context,
          );
    await this.repository.linkResource(projectId, created.id, kind, 'created', context.actorSub);
    return created;
  }

  public async linkResource(
    projectId: string,
    resourceId: string,
    context: RequestContext,
  ): Promise<Resource> {
    requireRoles(context, PROJECT_WRITE_ROLES);
    await this.requireOpenProject(projectId, context);
    const occupied = await this.repository.findOpenProjectByResourceId(
      context.tenantId,
      resourceId,
    );
    if (occupied && occupied.projectId !== projectId) {
      throw new AppError('resource already belongs to an open project', {
        code: 'PROJECT_RESOURCE_CONFLICT',
        statusCode: 409,
      });
    }
    const resource = await this.resourceService.getResource(resourceId, context);
    if (!resource) {
      throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    }
    await this.repository.linkResource(
      projectId,
      resourceId,
      resource['@type'],
      'linked',
      context.actorSub,
    );
    return resource;
  }

  public async detachResource(
    projectId: string,
    resourceId: string,
    context: RequestContext,
  ): Promise<void> {
    requireRoles(context, PROJECT_WRITE_ROLES);
    const detached = await this.repository.detachResource(
      projectId,
      resourceId,
      context.actorSub,
      'Desvinculado manualmente do projeto',
    );
    if (!detached) {
      throw new AppError('project resource link not found', {
        code: 'PROJECT_RESOURCE_NOT_FOUND',
        statusCode: 404,
      });
    }
    const resource = await this.resourceService.getResource(resourceId, context);
    if (resource?.['@type'] === 'LogicalResource') {
      await this.resourceService.deleteLogicalResource(resourceId, context);
    }
    if (resource?.['@type'] === 'PhysicalResource') {
      await this.resourceService.deletePhysicalResource(resourceId, context);
    }
  }

  private assertIconSize(value: unknown): void {
    if (typeof value !== 'string' || value.length <= PROJECT_ICON_MAX_CHARS) return;
    throw new AppError('project icon too large', {
      code: 'PROJECT_ICON_TOO_LARGE',
      statusCode: 413,
    });
  }

  // ── Catálogo de status (USER_ADMIN_ROLES) ────────────────────────────────────────────────────

  public async listStatuses(context: RequestContext): Promise<ProjectStatusCatalogItem[]> {
    requireRoles(context, USER_ADMIN_ROLES);
    return await this.repository.listStatusCatalog(context.tenantId);
  }

  public async createStatus(
    command: { name?: unknown; behavior?: unknown; sortOrder?: unknown; active?: unknown },
    context: RequestContext,
  ): Promise<ProjectStatusCatalogItem> {
    requireRoles(context, USER_ADMIN_ROLES);
    const { name, behavior } = assertProjectStatusCreate(command.name, command.behavior);
    return await this.repository.createStatusCatalogItem(context.tenantId, {
      name,
      sortOrder: Number(command.sortOrder ?? 1000),
      active: command.active !== false,
      behavior,
    });
  }

  /** PATCH (campos do corpo) ou, com deleting, a desativação soft-delete do status. */
  public async updateStatus(
    code: string,
    command: { name?: unknown; behavior?: unknown; sortOrder?: unknown; active?: unknown },
    context: RequestContext,
    deleting = false,
  ): Promise<ProjectStatusCatalogItem> {
    requireRoles(context, USER_ADMIN_ROLES);
    const behavior = assertProjectStatusChange(code, deleting ? {} : command, deleting);
    const updated = await this.repository.updateStatusCatalogItem(
      context.tenantId,
      code,
      deleting
        ? { active: false }
        : {
            ...(command.name !== undefined ? { name: String(command.name).trim() } : {}),
            ...(command.sortOrder !== undefined ? { sortOrder: Number(command.sortOrder) } : {}),
            ...(command.active !== undefined ? { active: Boolean(command.active) } : {}),
            ...(behavior !== undefined ? { behavior } : {}),
          },
    );
    if (!updated) {
      throw new AppError('project status not found', {
        code: 'PROJECT_STATUS_NOT_FOUND',
        statusCode: 404,
      });
    }
    return updated;
  }

  // ── Leituras do workspace de Projetos (PROJECT_READ_ROLES) ───────────────────────────────────

  public async listAreas(id: string, context: RequestContext) {
    requireRoles(context, PROJECT_READ_ROLES);
    return await this.repository.listAreas(context.tenantId, id);
  }

  public async listProjectResources(
    id: string,
    options: { limit: number; offset: number; view: 'all' | 'infrastructure' },
    context: RequestContext,
  ) {
    requireRoles(context, PROJECT_READ_ROLES);
    const links = await this.repository.listResourceLinks(context.tenantId, id, options);
    const items = await this.geoTreeService.resourcesByIds(links.map((link) => link.resourceId));
    return {
      items,
      offset: options.offset,
      limit: options.limit,
      hasMore: links.length === options.limit,
    };
  }

  public async listProjectSites(
    id: string,
    options: { limit: number; offset: number },
    context: RequestContext,
  ) {
    requireRoles(context, PROJECT_READ_ROLES);
    const page = await this.geoTreeService.projectSitePage(
      context.tenantId,
      id,
      options.limit,
      options.offset,
    );
    return {
      items: page.items,
      offset: options.offset,
      limit: options.limit,
      total: page.total,
      hasMore: options.offset + page.items.length < page.total,
    };
  }

  /** Busca por texto (mín. 2 caracteres) em locais/recursos do projeto. */
  public async searchItems(
    id: string,
    options: { q: string; scope?: string | null; limit: number; offset: number },
    context: RequestContext,
  ) {
    requireRoles(context, PROJECT_READ_ROLES);
    const { limit, offset } = options;
    const query = options.q.trim().toLocaleLowerCase();
    if (query.length < 2) return { items: [], offset, limit, hasMore: false };
    const scope =
      options.scope === 'sites' ||
      options.scope === 'infrastructure' ||
      options.scope === 'resources'
        ? options.scope
        : 'all';
    const matches = await this.repository.searchItems(
      context.tenantId,
      id,
      query,
      limit + 1,
      scope,
    );
    const page = matches.slice(offset, offset + limit);
    const [sites, resources] = await Promise.all([
      this.geoTreeService.sitesByIds(
        page.filter((item) => item.kind === 'site').map((item) => item.id),
      ),
      this.geoTreeService.resourcesByIds(
        page.filter((item) => item.kind === 'resource').map((item) => item.id),
      ),
    ]);
    const byKey = new Map(
      [...sites, ...resources].map((item) => [`${item.kind}:${item.refId ?? item.id}`, item]),
    );
    const items = page
      .map((item) => byKey.get(`${item.kind}:${item.id}`))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return { items, offset, limit, hasMore: matches.length > offset + limit };
  }

  /** Recursos livres ou já vinculados a este projeto. */
  public async listResourceCandidates(
    id: string,
    query: string,
    context: RequestContext,
  ): Promise<Resource[]> {
    requireRoles(context, PROJECT_READ_ROLES);
    const name = query.trim();
    const resources = await this.resourceService.listResources(
      { ...(name ? { name } : {}), limit: 50 },
      context,
    );
    const available: Resource[] = [];
    for (const resource of resources) {
      const linked = await this.repository.findOpenProjectByResourceId(
        context.tenantId,
        resource.id,
      );
      if (!linked || linked.projectId === id) available.push(resource);
    }
    return available;
  }

  /** Tipos e specifications do catálogo ativo que o Projeto pode criar. */
  public async getResourceCreationOptions(id: string, context: RequestContext) {
    requireRoles(context, PROJECT_READ_ROLES);
    const project = await this.repository.get(context.tenantId, id);
    if (!project || project.archivedAt) throw this.notFound();
    const catalogs = await this.resourceService.listResourceCatalogs({ status: 'active' }, context);
    const catalog = catalogs.find((item) => item.isDefault) ?? catalogs[0];
    if (!catalog) return { catalog: null, resourceTypes: [], resourceSpecifications: [] };
    const source = await this.resourceService.getResourceModelSnapshotSource(catalog.id, context);
    const modeledTypeIds = new Set(
      source.nodes.flatMap((node) =>
        node.kind === 'RESOURCE_TYPE' && node.status === 'active' && node.resourceTypeId
          ? [node.resourceTypeId]
          : [],
      ),
    );
    const resourceTypes = source.resourceTypes
      .filter((item) => item.status === 'active' && modeledTypeIds.has(item.id))
      .map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        nature: item.nature,
        infrastructureEligible: isProjectInfrastructureResourceType(item.code),
      }));
    const typeIds = new Set(resourceTypes.map((item) => item.id));
    const pageSize = 100;
    const resourceSpecifications: Array<{ id: string; name: string; resourceTypeId: string }> = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await this.resourceService.listResourceSpecifications(
        { limit: pageSize, offset },
        context,
      );
      for (const item of page) {
        if (typeIds.has(item.resourceTypeId)) {
          resourceSpecifications.push({
            id: item.id,
            name: item.name,
            resourceTypeId: item.resourceTypeId,
          });
        }
      }
      if (page.length < pageSize) break;
    }
    return {
      catalog: { id: catalog.id, code: catalog.code, name: catalog.name },
      resourceTypes,
      resourceSpecifications,
    };
  }

  private notFound(): AppError {
    return new AppError('project not found', { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
  }

  private async requireProject(id: string, context: RequestContext): Promise<Project> {
    const project = await this.repository.get(context.tenantId, id);
    if (!project) throw this.notFound();
    return project;
  }

  private async requireOpenProject(id: string, context: RequestContext): Promise<Project> {
    const project = await this.repository.get(context.tenantId, id);
    if (!project || project.archivedAt) throw this.notFound();
    if (isTerminal(project)) {
      throw new AppError('terminal project cannot receive resources', {
        code: 'PROJECT_TERMINAL',
        statusCode: 409,
      });
    }
    return project;
  }

  private async requireSiteLink(
    projectId: string,
    siteId: string,
    context: RequestContext,
  ): Promise<void> {
    const linked = await this.repository.hasSiteLink(context.tenantId, projectId, siteId);
    if (!linked) {
      throw new AppError('project site not found', {
        code: 'PROJECT_SITE_NOT_FOUND',
        statusCode: 404,
      });
    }
  }

  private async record(
    action: AuditAction,
    project: Project,
    context: RequestContext,
    states: { before?: unknown; after?: unknown },
  ): Promise<void> {
    const event = await this.eventService.appendEvent({
      eventType: `Project${action === 'create' ? 'Create' : action === 'delete' ? 'Delete' : 'AttributeValueChange'}Event`,
      source: 'project.Project',
      correlationId: project.id,
      eventData: {
        entityId: project.id,
        entityType: 'Project',
        payload: states.after ?? project,
      },
    });
    await recordMutation(this.db, context, {
      action,
      entityType: 'Project',
      entityId: project.id,
      ...(states.before !== undefined ? { before: states.before } : {}),
      ...(states.after !== undefined ? { after: states.after } : {}),
      event,
      topic: 'tmf688.project',
    });
  }
}
