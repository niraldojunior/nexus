import { AppError } from '../../shared/errors/app-error.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import type {
  InternalPlantLocationChildrenPage,
  InternalPlantLocationRootNode,
  InternalPlantResourcePage,
} from './internal-plant-domain.js';
import type { IInternalPlantRepository } from './internal-plant-repository-interface.js';

export const INTERNAL_PLANT_DEFAULT_PAGE_SIZE = 50;
export const INTERNAL_PLANT_MAX_PAGE_SIZE = 200;
export const INTERNAL_PLANT_MIN_SEARCH_LENGTH = 3;

const normalizePage = (options: { limit?: number; offset?: number }) => ({
  limit: Math.min(
    Math.max(Math.trunc(options.limit ?? INTERNAL_PLANT_DEFAULT_PAGE_SIZE), 1),
    INTERNAL_PLANT_MAX_PAGE_SIZE,
  ),
  offset: Math.max(Math.trunc(options.offset ?? 0), 0),
});

export class InternalPlantService {
  public constructor(private readonly repository: IInternalPlantRepository) {}

  public async roots(context: RequestContext): Promise<InternalPlantLocationRootNode[]> {
    return await this.repository.roots(context.tenantId);
  }

  public async children(
    nodeId: string,
    options: { limit?: number; offset?: number },
    context: RequestContext,
  ): Promise<InternalPlantLocationChildrenPage> {
    const normalizedNodeId = nodeId.trim();
    if (!normalizedNodeId) {
      throw new AppError('nodeId is required', {
        code: 'INTERNAL_PLANT_NODE_ID_REQUIRED',
        statusCode: 400,
      });
    }

    return await this.repository.children(normalizedNodeId, {
      tenantId: context.tenantId,
      ...normalizePage(options),
    });
  }

  public async listResources(
    options: {
      q?: string;
      siteId?: string;
      resourceTypeIdIn?: string[];
      limit?: number;
      offset?: number;
    },
    context: RequestContext,
  ): Promise<InternalPlantResourcePage> {
    const q = options.q?.trim();
    const siteId = options.siteId?.trim();
    const resourceTypeIdIn = [
      ...new Set(options.resourceTypeIdIn?.map((id) => id.trim()) ?? []),
    ].filter(Boolean);

    if (q && q.length < INTERNAL_PLANT_MIN_SEARCH_LENGTH) {
      throw new AppError(`q must have at least ${INTERNAL_PLANT_MIN_SEARCH_LENGTH} characters`, {
        code: 'INTERNAL_PLANT_QUERY_TOO_SHORT',
        statusCode: 400,
      });
    }
    if (!q && !siteId && resourceTypeIdIn.length === 0) {
      throw new AppError('q, siteId or resourceTypeId is required', {
        code: 'INTERNAL_PLANT_FILTER_REQUIRED',
        statusCode: 400,
      });
    }

    return await this.repository.listResources({
      ...(q ? { q } : {}),
      ...(siteId ? { siteId } : {}),
      ...(resourceTypeIdIn.length > 0 ? { resourceTypeIdIn } : {}),
      ...normalizePage(options),
      tenantId: context.tenantId,
    });
  }
}
