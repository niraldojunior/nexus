import { AppError } from '../../shared/errors/app-error.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { EventService } from '../../shared/tmf/index.js';
import type { ResourceService } from '../resource/service.js';
import type { StudioService } from '../studio/service.js';
import type { Project, ProjectRepository } from './project-repository.js';
import {
  CANONICAL_PROJECT_WORKFLOW_SNAPSHOT,
  PROJECT_WORKFLOW_ID,
  PROJECT_WORKFLOW_SCHEMA_VERSION,
  projectStatusOperationalStatus,
  type ProjectWorkflowReadModel,
  type ProjectWorkflowState,
  type ProjectWorkflowTransition,
  type ProjectWorkflowTransitionResult,
} from './project-workflow.js';
import type { GeoService } from '../geo/service.js';

export type ExecuteProjectTransitionInput = {
  transitionId?: string | undefined;
  targetStateCode?: string | undefined;
};

const DEFAULT_TENANT_ID = 'default';
const tenantOf = (context?: RequestContext): string => context?.tenantId ?? DEFAULT_TENANT_ID;

const emptyWorkflow = (fallbackChecksum?: string): ProjectWorkflowReadModel => ({
  schemaVersion: PROJECT_WORKFLOW_SCHEMA_VERSION,
  workflowId: PROJECT_WORKFLOW_ID,
  initialStateCode: '',
  states: [],
  transitions: [],
  fallback: false,
  ...(fallbackChecksum ? { publicationChecksum: fallbackChecksum } : {}),
});

const normalizeWorkflow = (
  raw: Record<string, unknown> | undefined,
  fallbackChecksum?: string,
  fallbackToCanonical = true,
): ProjectWorkflowReadModel => {
  if (
    !raw ||
    raw.workflowId !== PROJECT_WORKFLOW_ID ||
    raw.schemaVersion !== PROJECT_WORKFLOW_SCHEMA_VERSION ||
    !Array.isArray(raw.states) ||
    !Array.isArray(raw.transitions)
  ) {
    return fallbackToCanonical
      ? {
          ...CANONICAL_PROJECT_WORKFLOW_SNAPSHOT,
          fallback: true,
          ...(fallbackChecksum ? { publicationChecksum: fallbackChecksum } : {}),
        }
      : emptyWorkflow(fallbackChecksum);
  }
  return {
    schemaVersion: PROJECT_WORKFLOW_SCHEMA_VERSION,
    workflowId: PROJECT_WORKFLOW_ID,
    initialStateCode: String(raw.initialStateCode ?? '1'),
    states: raw.states as ProjectWorkflowState[],
    transitions: raw.transitions as ProjectWorkflowTransition[],
    fallback: false,
    ...(fallbackChecksum ? { publicationChecksum: fallbackChecksum } : {}),
  };
};

export class ProjectWorkflowService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly projectRepository: ProjectRepository,
    private readonly geoService: GeoService,
    private readonly resourceService: ResourceService,
    private readonly studioService: StudioService,
    private readonly _eventService?: EventService,
    private readonly options: { fallbackToCanonical?: boolean } = {},
  ) {}

  public async getWorkflow(context?: RequestContext): Promise<ProjectWorkflowReadModel> {
    const ctx: RequestContext = context ?? {
      actorSub: 'anonymous',
      tenantId: DEFAULT_TENANT_ID,
      roles: [],
      traceId: 'trace-workflow',
    };
    try {
      const published = await this.studioService.getPublishedVersion('rules-workflows', ctx);
      if (published) {
        return normalizeWorkflow(
          published.snapshot,
          published.checksum,
          this.options.fallbackToCanonical !== false,
        );
      }
    } catch {
      // Fallback operacional resiliente quando o Studio ainda não foi publicado
    }
    return this.options.fallbackToCanonical === false
      ? emptyWorkflow()
      : {
          ...CANONICAL_PROJECT_WORKFLOW_SNAPSHOT,
          fallback: true,
        };
  }

  public async getProjectTransitions(
    projectId: string,
    context: RequestContext,
  ): Promise<{
    project: Project;
    allowedTransitions: ProjectWorkflowTransition[];
    workflow: ProjectWorkflowReadModel;
  }> {
    const tenantId = tenantOf(context);
    const project = await this.projectRepository.get(tenantId, projectId);
    if (!project) {
      throw new AppError('project not found', { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
    }

    const workflow = await this.getWorkflow(context);
    if (workflow.states.length === 0) {
      throw new AppError('project workflow is not configured', {
        code: 'PROJECT_WORKFLOW_NOT_CONFIGURED',
        statusCode: 409,
      });
    }
    const actorRoles = new Set(context.roles ?? []);
    const isPlatformAdmin = actorRoles.has('platform.admin');

    // Se o projeto já estiver em estado terminal (behavior close-release), não há transições permitidas
    if (
      project.status === 'terminated' ||
      project.status === 'cancelled' ||
      project.statusBehavior === 'close-release'
    ) {
      return { project, allowedTransitions: [], workflow };
    }

    const allowedTransitions = workflow.transitions.filter((transition) => {
      if (!transition.fromStateCodes.includes(project.statusCode)) return false;
      if (isPlatformAdmin) return true;
      return transition.allowedRoles.some((role) => actorRoles.has(role));
    });

    return { project, allowedTransitions, workflow };
  }

  public async executeTransition(
    projectId: string,
    input: ExecuteProjectTransitionInput,
    context: RequestContext,
  ): Promise<ProjectWorkflowTransitionResult> {
    const tenantId = tenantOf(context);
    const project = await this.projectRepository.get(tenantId, projectId);
    if (!project) {
      throw new AppError('project not found', { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
    }

    if (
      project.status === 'terminated' ||
      project.status === 'cancelled' ||
      project.statusBehavior === 'close-release'
    ) {
      throw new AppError('terminated project status is immutable', {
        code: 'PROJECT_TERMINATED_IMMUTABLE',
        statusCode: 409,
      });
    }

    const workflow = await this.getWorkflow(context);
    if (workflow.states.length === 0) {
      throw new AppError('project workflow is not configured', {
        code: 'PROJECT_WORKFLOW_NOT_CONFIGURED',
        statusCode: 409,
      });
    }
    const actorRoles = new Set(context.roles ?? []);
    const isPlatformAdmin = actorRoles.has('platform.admin');

    // Resolução da transição
    let transition: ProjectWorkflowTransition | undefined;
    if (input.transitionId) {
      transition = workflow.transitions.find((t) => t.id === input.transitionId);
      if (!transition || !transition.fromStateCodes.includes(project.statusCode)) {
        throw new AppError('workflow transition not applicable to current project state', {
          code: 'PROJECT_WORKFLOW_TRANSITION_INVALID',
          statusCode: 422,
        });
      }
    } else if (input.targetStateCode) {
      const candidates = workflow.transitions.filter(
        (t) =>
          t.fromStateCodes.includes(project.statusCode) && t.toStateCode === input.targetStateCode,
      );
      if (candidates.length === 0) {
        throw new AppError('no workflow transition found for target state', {
          code: 'PROJECT_WORKFLOW_TRANSITION_NOT_FOUND',
          statusCode: 422,
        });
      }
      if (candidates.length > 1) {
        throw new AppError('multiple transitions match target state; specify transitionId', {
          code: 'PROJECT_WORKFLOW_TRANSITION_AMBIGUOUS',
          statusCode: 422,
        });
      }
      transition = candidates[0];
    } else {
      throw new AppError('transitionId or targetStateCode is required', {
        code: 'PROJECT_WORKFLOW_TARGET_REQUIRED',
        statusCode: 400,
      });
    }

    if (!transition) {
      throw new AppError('workflow transition not found', {
        code: 'PROJECT_WORKFLOW_TRANSITION_NOT_FOUND',
        statusCode: 404,
      });
    }

    // Autorização por papel
    if (!isPlatformAdmin) {
      const hasAuthorizedRole = transition.allowedRoles.some((role) => actorRoles.has(role));
      if (!hasAuthorizedRole) {
        throw new AppError('actor does not possess an authorized role for this transition', {
          code: 'PROJECT_WORKFLOW_ROLE_FORBIDDEN',
          statusCode: 403,
        });
      }
    }

    const targetState = workflow.states.find((s) => s.code === transition.toStateCode);
    if (!targetState) {
      throw new AppError('target state does not exist in workflow', {
        code: 'PROJECT_WORKFLOW_STATE_NOT_FOUND',
        statusCode: 422,
      });
    }

    const nextOperationalStatus = projectStatusOperationalStatus(targetState.behavior);

    return await this.db.transaction(async () => {
      // 1. Atualiza o Projeto
      const updatedProject = await this.projectRepository.update(tenantId, projectId, {
        status: nextOperationalStatus,
        statusCode: targetState.code,
      });
      if (!updatedProject) {
        throw new AppError('failed to update project state', {
          code: 'PROJECT_NOT_FOUND',
          statusCode: 404,
        });
      }

      // 2. Cascateia para Sites
      const siteIds = await this.projectRepository.listSiteIds(tenantId, projectId);
      let siteCascade: { updated: number; skipped: number; blocked?: number } = {
        updated: 0,
        skipped: 0,
      };

      const siteCascadeStatus =
        targetState.behavior === 'close-release'
          ? 'active'
          : nextOperationalStatus === 'suspended'
            ? 'suspended'
            : nextOperationalStatus === 'active'
              ? 'active'
              : 'planned';

      const siteStatusReason =
        targetState.behavior === 'close-release'
          ? 'Projeto de origem concluído — local liberado para o inventário'
          : `Status do projeto alterado para ${targetState.name} (${targetState.code})`;

      if (siteIds.length > 0) {
        const cascadeResult = await this.geoService.transitionProjectSites(
          projectId,
          siteIds,
          siteCascadeStatus,
          siteStatusReason,
          context,
        );
        siteCascade = {
          updated: cascadeResult.updated,
          skipped: cascadeResult.skipped,
          ...(cascadeResult.blocked.length > 0 ? { blocked: cascadeResult.blocked.length } : {}),
        };
      }

      // 3. Cascateia para Recursos
      const resourceLinks = await this.projectRepository.listResourceLinks(tenantId, projectId, {
        limit: 100_000,
      });
      let resourcesUpdated = 0;

      const resourcePatch =
        targetState.behavior === 'close-release'
          ? { status: 'active', administrativeState: 'unlocked', operationalState: 'enabled' }
          : nextOperationalStatus === 'active'
            ? { status: 'active', administrativeState: 'unlocked', operationalState: 'enabled' }
            : nextOperationalStatus === 'suspended'
              ? { status: 'suspended', administrativeState: 'locked', operationalState: 'disabled' }
              : { status: 'inactive', administrativeState: 'locked', operationalState: 'disabled' };

      for (const link of resourceLinks) {
        const resource = await this.resourceService.getResource(link.resourceId, context);
        if (!resource) continue;

        if (resource['@type'] === 'LogicalResource') {
          await this.resourceService.updateLogicalResource(
            link.resourceId,
            resourcePatch as Parameters<typeof this.resourceService.updateLogicalResource>[1],
            context,
          );
        } else {
          await this.resourceService.updatePhysicalResource(
            link.resourceId,
            resourcePatch as Parameters<typeof this.resourceService.updatePhysicalResource>[1],
            context,
          );
        }
        resourcesUpdated += 1;
      }

      const resourceCascade = {
        updated: resourcesUpdated,
        skipped: resourceLinks.length - resourcesUpdated,
      };

      return {
        project: updatedProject,
        transitionId: transition.id,
        siteCascade,
        resourceCascade,
      };
    });
  }
}
